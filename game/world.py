"""
O ESTADO DO MUNDO — quem esta dentro AGORA, onde, com que cara, e o que ha
largado pelo chao.

Guarda os jogadores CONECTADOS no momento (memoria), separado do banco, que
guarda o estado PERSISTENTE (conta, posicao, mochila). Quando alguem entra, a
rede carrega a conta do banco e chama add_player com esses dados; quando o
jogador anda, ele e marcado como "sujo" pra um salvador periodico gravar a
posicao; quando pisa sobre um item, o mundo passa ele pra mochila.

Os itens no chao tambem moram aqui: onde estao, e quando um item pego deve
reaparecer (pra dar pra testar e, depois, pra virar mecanica de mundo).

Nao conhece socket nem desenha nada. So estado vivo + operacoes, delegando as
regras de movimento pra rules.py e a definicao dos itens pra items.py.
"""

import random
import time

from . import rules
from . import items
from . import npcs
from .world_map import MAP_ROWS, TILE_SIZE, SPAWN_POINTS

# Paletas de customizacao (o cliente desenha a partir destes mesmos valores).
CLOAKS = [
    "#9b6dff",  # violeta arcano
    "#f4b860",  # ambar
    "#5fd0c5",  # turquesa
    "#e85d75",  # rubi
    "#7cc4f4",  # ceu
    "#b6e36a",  # limo
    "#f49ad0",  # rosa
    "#c9a0ff",  # lavanda
]
SKINS = ["#f1c9a5", "#e8b58c", "#c68642", "#8d5524", "#ffe0bd"]
HAIRS = ["#2a2233", "#5a3f28", "#8a6a3a", "#d8b25a", "#b6b0be", "#9c3b2e"]
HATS = ("none", "wizard", "cap")
HOODS = ("up", "down")

PLAYER_COLORS = CLOAKS  # compat


def default_look(i=0):
    return {
        "skin": SKINS[0],
        "cloak": CLOAKS[i % len(CLOAKS)],
        "hood": "up",
        "hat": "none",
        "hair": HAIRS[0],
        "staff": False,
    }


def sanitize_look(raw, i=0):
    """Garante um look valido a partir do que veio (cliente ou banco)."""
    look = default_look(i)
    if isinstance(raw, dict):
        if raw.get("skin") in SKINS:
            look["skin"] = raw["skin"]
        if raw.get("cloak") in CLOAKS:
            look["cloak"] = raw["cloak"]
        if raw.get("hair") in HAIRS:
            look["hair"] = raw["hair"]
        if raw.get("hood") in HOODS:
            look["hood"] = raw["hood"]
        if raw.get("hat") in HATS:
            look["hat"] = raw["hat"]
        look["staff"] = bool(raw.get("staff", False))
    return look


def sanitize_equipment(raw):
    """Mantem so equipamentos validos: item existe e cabe naquele espaco."""
    eq = {}
    if isinstance(raw, dict):
        for slot in items.EQUIP_SLOTS:
            it = raw.get(slot)
            if it and items.exists(it) and items.slot_of(it) == slot:
                eq[slot] = it
    return eq


def public(p):
    """Versao do jogador segura pra enviar (sem campos internos com _)."""
    out = {
        "id": p["id"],
        "x": p["x"],
        "y": p["y"],
        "facing": p["facing"],
        "name": p["name"],
        "look": p["look"],
    }
    if p.get("is_npc"):
        out["npc"] = True
        out["kind"] = p.get("kind", "person")    # "person" ou "bird"
        out["solid"] = p.get("solid", True)       # corvo = False (da pra atravessar)
    return out


def _walkable_near(px, py):
    """Acha um tile passavel perto de (px, py). Robusto a edicoes do mapa."""
    if rules.is_walkable(px, py):
        return (px, py)
    for r in range(1, 10):
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                x, y = px + dx, py + dy
                if rules.is_walkable(x, y):
                    return (x, y)
    return SPAWN_POINTS[0]


class World:
    def __init__(self):
        self.players = {}        # sid -> dict do jogador (estado vivo)
        self.by_player_id = {}   # player_id (conta) -> sid

        # itens no chao: (x, y) -> {"item": id, "spawn": indice em GROUND_SPAWNS}
        self.ground = {}
        # reaparecimentos pendentes: lista de (indice_spawn, quando_reaparece)
        self._respawns = []
        for i, (x, y, item_id, _r) in enumerate(items.GROUND_SPAWNS):
            self.ground[(x, y)] = {"item": item_id, "spawn": i}

    def map_payload(self):
        """O mapa que vai pro cliente no 'init' (fonte unica da verdade)."""
        return {
            "rows": MAP_ROWS,
            "tilesize": TILE_SIZE,
            "width": len(MAP_ROWS[0]),
            "height": len(MAP_ROWS),
        }

    # ------------------------------------------------------------ jogadores

    def add_player(self, sid, player_id, name, look, x, y, facing="down",
                   inventory=None, equipment=None):
        """Coloca no mundo um jogador ja carregado do banco."""
        player = {
            "id": sid,                # identidade da conexao (protocolo)
            "player_id": player_id,   # identidade da conta (banco)
            "x": int(x),
            "y": int(y),
            "facing": facing or "down",
            "name": (name or "Viajante")[:16],
            "look": sanitize_look(look),
            "inventory": items.sanitize_bag(inventory or []),
            "equipment": sanitize_equipment(equipment),
            "_last_move": 0.0,
            "_dirty": False,
        }
        # regra do item unico: corrige contas que acumularam copias (Portuz)
        player["inventory"], player["_needs_save"] = items.enforce_uniques(
            player["inventory"], player["equipment"])
        self.players[sid] = player
        self.by_player_id[player_id] = sid
        self._sync_look(player)   # a aparencia reflete o que esta equipado
        return player

    def sid_for_player(self, player_id):
        return self.by_player_id.get(player_id)

    def remove_player(self, sid):
        player = self.players.pop(sid, None)
        if player:
            if self.by_player_id.get(player["player_id"]) == sid:
                self.by_player_id.pop(player["player_id"], None)
        return player

    def try_move(self, sid, direction):
        player = self.players.get(sid)
        if not player:
            return None
        return rules.apply_move(self, player, direction)

    # ----------------------------------------------------------------- NPCs

    def spawn_npcs(self):
        """Coloca todo o elenco no mundo. Cada NPC e so mais uma entidade em
        self.players (reusa render e colisao), marcada is_npc -> nunca e salva no
        banco e nunca desconecta. As propriedades vem do registro em npcs.ROSTER."""
        for spec in npcs.ROSTER:
            home = _walkable_near(*spec["home"])
            self.players[spec["id"]] = {
                "id": spec["id"],
                "player_id": None,
                "x": home[0],
                "y": home[1],
                "facing": "down",
                "name": spec["name"],
                "look": dict(spec["look"]),
                "inventory": [],
                "equipment": {},
                "_last_move": 0.0,
                "_dirty": False,
                "is_npc": True,
                "solid": spec.get("solid", True),
                "kind": spec.get("kind", "person"),
                "_home": home,
                "_radius": spec.get("radius", 4),
                "_wanders": spec.get("wanders", True),
                "_spec": spec,
            }
        return [self.players[s["id"]] for s in npcs.ROSTER]

    def wander_npc(self, npc_id):
        """Da um passo de um NPC: direcao aleatoria, passavel, livre e dentro do
        raio de casa dele. Devolve o NPC se mexeu/virou (pra rede avisar)."""
        npc = self.players.get(npc_id)
        if not npc or not npc.get("_wanders"):
            return None
        hx, hy = npc["_home"]
        rad = npc["_radius"]
        dirs = list(rules.DELTAS.keys())
        random.shuffle(dirs)
        for d in dirs:
            dx, dy = rules.DELTAS[d]
            nx, ny = npc["x"] + dx, npc["y"] + dy
            if max(abs(nx - hx), abs(ny - hy)) > rad:
                continue
            if not rules.is_walkable(nx, ny):
                continue
            if rules._occupied_by_other(self, npc, nx, ny):
                continue
            npc["facing"] = d
            npc["x"], npc["y"] = nx, ny   # move direto: nao marca _dirty (sem banco)
            return npc
        npc["facing"] = random.choice(dirs)   # cercado: so vira pra um lado
        return npc

    def nearest_npc(self, player, radius):
        """O NPC mais proximo do jogador dentro do raio (Chebyshev), ou None.
        Usado pra interacao: voce fala com quem esta colado."""
        best, bestd = None, radius + 1
        for p in self.players.values():
            if not p.get("is_npc"):
                continue
            d = max(abs(player["x"] - p["x"]), abs(player["y"] - p["y"]))
            if d <= radius and d < bestd:
                best, bestd = p, d
        return best

    def nearest_smiter(self, player, radius):
        """O NPC 'justiceiro' mais proximo dentro do raio, ou None. So o Valdris
        e justiceiro; e ele quem ouve o palavrao e frita o engracadinho."""
        best, bestd = None, radius + 1
        for p in self.players.values():
            if not (p.get("is_npc") and p.get("_spec", {}).get("smiter")):
                continue
            d = max(abs(player["x"] - p["x"]), abs(player["y"] - p["y"]))
            if d <= radius and d < bestd:
                best, bestd = p, d
        return best

    def near_entity(self, player, entity_id, radius):
        """True se o jogador esta a ate `radius` tiles da entidade (Chebyshev)."""
        ent = self.players.get(entity_id)
        if not ent or not player:
            return False
        return max(abs(player["x"] - ent["x"]),
                   abs(player["y"] - ent["y"])) <= radius

    def snapshot(self):
        """Todos os jogadores vivos em formato publico (pro 'init')."""
        return [public(p) for p in self.players.values()]

    def pop_dirty(self):
        """Quem se moveu desde o ultimo flush: lista (player_id,x,y,facing)."""
        out = []
        for p in self.players.values():
            if p.get("is_npc"):
                p["_dirty"] = False   # NPC nao tem conta, nunca persiste
                continue
            if p.get("_dirty"):
                out.append((p["player_id"], p["x"], p["y"], p["facing"]))
                p["_dirty"] = False
        return out

    # ----------------------------------------------------------- itens/chao

    def ground_snapshot(self):
        """Itens ativos no chao agora (pra mandar no 'init')."""
        return [{"x": x, "y": y, "item": g["item"]}
                for (x, y), g in self.ground.items()]

    def try_pickup(self, player):
        """Se o jogador esta sobre um item, pega: tira do chao, poe na mochila,
        agenda o reaparecimento. Devolve {item,x,y} se pegou, senao None."""
        tile = (player["x"], player["y"])
        g = self.ground.get(tile)
        if not g:
            return None
        item_id = g["item"]
        del self.ground[tile]

        # agenda o reaparecimento deste ponto
        _x, _y, _id, respawn = items.GROUND_SPAWNS[g["spawn"]]
        self._respawns.append((g["spawn"], time.time() + respawn))

        items.add_to_bag(player["inventory"], item_id, 1)
        return {"item": item_id, "x": tile[0], "y": tile[1]}

    def due_respawns(self, now):
        """Reativa os itens cujo tempo de reaparecer chegou. Devolve a lista
        (x, y, item_id) dos que voltaram, pra rede avisar todo mundo."""
        if not self._respawns:
            return []
        back, keep = [], []
        for spawn_idx, when in self._respawns:
            if when <= now:
                x, y, item_id, _r = items.GROUND_SPAWNS[spawn_idx]
                if (x, y) not in self.ground:  # nao reativa se o tile ja tem algo
                    self.ground[(x, y)] = {"item": item_id, "spawn": spawn_idx}
                    back.append((x, y, item_id))
            else:
                keep.append((spawn_idx, when))
        self._respawns = keep
        return back

    # ----------------------------------------------------------- equipamento

    def _sync_look(self, player):
        """A aparencia segue o equipamento (por ora: cajado na mao)."""
        hand = player["equipment"].get("hand")
        player["look"]["staff"] = items.shows_staff(hand)

    def equip(self, player, item_id):
        """Tira o item da mochila e veste no espaco dele. Se o espaco ja tinha
        algo, o antigo volta pra mochila. Devolve True se equipou."""
        if not items.is_equippable(item_id):
            return False
        if not items.remove_from_bag(player["inventory"], item_id, 1):
            return False  # nao esta na mochila
        slot = items.slot_of(item_id)
        prev = player["equipment"].get(slot)
        if prev:
            items.add_to_bag(player["inventory"], prev, 1)
        player["equipment"][slot] = item_id
        self._sync_look(player)
        return True

    def unequip(self, player, slot):
        """Tira o que esta no espaco e devolve pra mochila. True se tirou."""
        item_id = player["equipment"].get(slot)
        if not item_id:
            return False
        del player["equipment"][slot]
        items.add_to_bag(player["inventory"], item_id, 1)
        self._sync_look(player)
        return True
