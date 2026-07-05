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
from . import monsters as monsters_def
from . import world_map
from .world_map import MAP_ROWS, TILE_SIZE, SPAWN_POINTS, map_rows, map_dims, get_map

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
        "sex": "M",            # M (masculino) ou F (feminino): muda a silhueta do avatar
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
        if raw.get("sex") in ("M", "F"):
            look["sex"] = raw["sex"]
    return look


def sanitize_equipment(raw):
    """Mantem so equipamentos validos: item existe e cabe naquele espaco. Aceita os
    espacos de familia (arma em hand_r/hand_l, anel em ring1/ring2) -> sem isso a
    arma equipada era descartada em todo reload/deploy."""
    eq = {}
    if isinstance(raw, dict):
        for slot in items.EQUIP_SLOTS:
            it = raw.get(slot)
            if it and items.exists(it) and items.fits_slot(it, slot):
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
    if p.get("wild_form"):
        out["wild_form"] = p["wild_form"]              # forma selvagem (lobo/urso/aguia/mainecoon)
    if (p.get("equipment") or {}).get("feet") == "botas_vargo":
        out["smoke"] = True                            # Botas de Vargo: aura de fumaça preta
    if p.get("is_npc"):
        out["npc"] = True
        out["kind"] = p.get("kind", "person")    # "person" ou "bird"
        out["solid"] = p.get("solid", True)       # corvo = False (da pra atravessar)
    if p.get("kind") == "deity":                  # um deus: desenho grande proprio
        out["form"] = p.get("form")               # cat_white, elf, owl, crow...
        out["size"] = p.get("size", 4)            # tiles que ocupa (4 a 6)
        out["accent"] = p.get("accent")           # cor do efeito ao andar
        out["eyes"] = p.get("eyes")
    return out


def monster_public(m):
    """Versao publica de um monstro pro cliente (desenho proprio: glifo + barra de
    vida). So o que o cliente precisa pra desenhar e mostrar a vida."""
    return {
        "size": m.get("size"),
        "id": m["id"],
        "x": m["x"], "y": m["y"], "facing": m.get("facing", "down"),
        "monster": True, "kind": "monster",
        "mtype": m["type"], "name": m["name"], "glyph": m["glyph"],
        "hp": m["hp"], "hp_max": m["hp_max"],
    }


def _walkable_near(px, py, mp="ermo"):
    """Acha um tile passavel perto de (px, py) NO mapa dado. Robusto a edicoes."""
    if rules.is_walkable(px, py, mp):
        return (px, py)
    for r in range(1, 10):
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                x, y = px + dx, py + dy
                if rules.is_walkable(x, y, mp):
                    return (x, y)
    sp = get_map(mp)["spawns"]
    return sp[0] if sp else (1, 1)


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

        # monstros vivos no mundo: monster_id -> entidade (bichos e capangas).
        self.monsters = {}
        self._monster_seq = 0

    def map_payload(self, mp="ermo"):
        """O mapa que vai pro cliente no 'init'/troca de mapa (fonte da verdade)."""
        rows = map_rows(mp)
        w, h = map_dims(mp)
        return {
            "rows": rows,
            "tilesize": TILE_SIZE,
            "width": w,
            "height": h,
            "map": mp,
        }

    # ------------------------------------------------------------ jogadores

    def add_player(self, sid, player_id, name, look, x, y, facing="down",
                   inventory=None, equipment=None, wallet=0):
        """Coloca no mundo um jogador ja carregado do banco."""
        player = {
            "id": sid,                # identidade da conexao (protocolo)
            "player_id": player_id,   # identidade da conta (banco)
            "x": int(x),
            "y": int(y),
            "facing": facing or "down",
            "name": (name or "Viajante")[:16],
            "look": sanitize_look(look),
            "map": "ermo",            # jogador sempre nasce/reconecta no Ermo
            "inventory": items.sanitize_bag(inventory or []),
            "equipment": sanitize_equipment(equipment),
            "wallet": int(wallet or 0),   # saldo total em bronze (carteira)
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
            if not spec.get("active", True):
                continue   # NPC dormente (ex.: meninas guardadas pra economia)
            mp = spec.get("map", "ermo")
            hx, hy = spec["home"]
            if mp == "ermo":                 # a vila vive no centro do 100x100
                hx, hy = hx + world_map.OX, hy + world_map.OY
            home = _walkable_near(hx, hy, mp)
            _look = dict(spec["look"])
            _look.setdefault("sex", npcs.sex_of(spec))   # gênero do NPC (meninas já trazem F; mestres derivam do título)
            self.players[spec["id"]] = {
                "id": spec["id"],
                "player_id": None,
                "x": home[0],
                "y": home[1],
                "facing": "down",
                "name": spec["name"],
                "look": _look,
                "map": mp,
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
        return [self.players[s["id"]] for s in npcs.ROSTER if s["id"] in self.players]

    def spawn_deities(self):
        """Coloca os deuses nos seus reinos (mapas secretos). Cada deus e uma
        entidade is_npc com kind 'deity' e desenho grande proprio; eles andam e
        soltam efeito. As falas e dados vem de secret_worlds.DEITIES."""
        from game import secret_worlds as sw
        specs = []
        for mp, gods in sw.DEITIES.items():
            for g in gods:
                home = _walkable_near(g["home"][0], g["home"][1], mp)
                self.players[g["id"]] = {
                    "id": g["id"], "player_id": None,
                    "x": home[0], "y": home[1], "facing": "down",
                    "name": g["name"], "look": {}, "map": mp,
                    "inventory": [], "equipment": {},
                    "_last_move": 0.0, "_dirty": False, "is_npc": True,
                    "solid": False,                 # deuses: da pra chegar perto
                    "kind": "deity", "form": g["form"], "size": g.get("size", 4),
                    "accent": g.get("accent"), "eyes": g.get("eyes"),
                    "_home": home, "_radius": g.get("radius", 8), "_wanders": True,
                    "_god": g,
                }
                specs.append({"id": g["id"], "map": mp,
                              "step_every": g.get("step_every", 1.1),
                              "fearless": True, "wanders": True})
        return specs

    def wander_npc(self, npc_id):
        """Da um passo de um NPC: direcao aleatoria, passavel, livre e dentro do
        raio de casa dele. Devolve o NPC se mexeu/virou (pra rede avisar)."""
        npc = self.players.get(npc_id)
        if not npc or not npc.get("_wanders"):
            return None
        if npc.get("_inside") or npc.get("_going_home"):
            return None   # ta dormindo ou indo dormir: quem cuida e o night loop
        mp = npc.get("map", "ermo")
        hx, hy = npc["_home"]
        rad = npc["_radius"]
        dirs = list(rules.DELTAS.keys())
        random.shuffle(dirs)
        for d in dirs:
            dx, dy = rules.DELTAS[d]
            nx, ny = npc["x"] + dx, npc["y"] + dy
            if max(abs(nx - hx), abs(ny - hy)) > rad:
                continue
            if not rules.is_walkable(nx, ny, mp):
                continue
            if rules._occupied_by_other(self, npc, nx, ny):
                continue
            npc["facing"] = d
            npc["x"], npc["y"] = nx, ny   # move direto: nao marca _dirty (sem banco)
            return npc
        npc["facing"] = random.choice(dirs)   # cercado: so vira pra um lado
        return npc

    def step_toward(self, npc_id, tx, ty):
        """Um passo APROXIMANDO o NPC de (tx,ty), pra tile passavel e livre.
        Ignora o raio de casa (precisa atravessar a vila ate a porta). Devolve o
        NPC se mexeu/virou; None se ja chegou ou encurralou. Guloso (sem A*)."""
        npc = self.players.get(npc_id)
        if not npc or (npc["x"] == tx and npc["y"] == ty):
            return None
        mp = npc.get("map", "ermo")
        cur = abs(npc["x"] - tx) + abs(npc["y"] - ty)
        best, bestd = None, cur
        for d, (dx, dy) in rules.DELTAS.items():
            nx, ny = npc["x"] + dx, npc["y"] + dy
            if not rules.is_walkable(nx, ny, mp):
                continue
            if rules._occupied_by_other(self, npc, nx, ny):
                continue
            dist = abs(nx - tx) + abs(ny - ty)
            if dist < bestd:
                best, bestd = (d, nx, ny), dist
        if best:
            npc["facing"], npc["x"], npc["y"] = best[0], best[1], best[2]
            return npc
        return None

    def flee_step(self, npc_id, threat_id):
        """Um passo AFASTANDO o NPC do `threat` (Chebyshev), pra tile passavel e
        livre. Durante a fuga ignora o raio de casa (ele precisa poder recuar).
        Devolve o NPC se mexeu/virou. Usado pro medo do Valdris."""
        npc = self.players.get(npc_id)
        threat = self.players.get(threat_id)
        if not npc or not threat:
            return None
        mp = npc.get("map", "ermo")
        cur = max(abs(npc["x"] - threat["x"]), abs(npc["y"] - threat["y"]))
        best, bestd = None, cur
        for d, (dx, dy) in rules.DELTAS.items():
            nx, ny = npc["x"] + dx, npc["y"] + dy
            if not rules.is_walkable(nx, ny, mp):
                continue
            if rules._occupied_by_other(self, npc, nx, ny):
                continue
            dist = max(abs(nx - threat["x"]), abs(ny - threat["y"]))
            if dist > bestd:
                best, bestd = (d, nx, ny), dist
        if best:
            npc["facing"], npc["x"], npc["y"] = best[0], best[1], best[2]
            return npc
        return None   # encurralado: nao da pra recuar agora

    def nearest_npc(self, player, radius):
        """O NPC mais proximo do jogador dentro do raio (Chebyshev), ou None.
        Usado pra interacao: voce fala com quem esta colado."""
        best, bestd = None, radius + 1
        for p in self.players.values():
            if not p.get("is_npc"):
                continue
            if p.get("map", "ermo") != player.get("map", "ermo"):
                continue
            d = max(abs(player["x"] - p["x"]), abs(player["y"] - p["y"]))
            if d <= radius and d < bestd:
                best, bestd = p, d
        return best

    def nearest_smiter(self, player, radius):
        """O NPC 'justiceiro' mais proximo dentro do raio, ou None. So quem tem
        smiter=True (o Valdris e a Maria Cachorra) ouve o desacato e te frita."""
        best, bestd = None, radius + 1
        for p in self.players.values():
            if not (p.get("is_npc") and p.get("_spec", {}).get("smiter")):
                continue
            if p.get("map", "ermo") != player.get("map", "ermo"):
                continue
            d = max(abs(player["x"] - p["x"]), abs(player["y"] - p["y"]))
            if d <= radius and d < bestd:
                best, bestd = p, d
        return best

    def nearest_player_to(self, npc, radius=None):
        """O jogador humano (nao-NPC) mais proximo de um NPC, ou None. Usado pro
        Guilherme te seguir com o olhar."""
        best, bestd = None, None
        for p in self.players.values():
            if p.get("is_npc"):
                continue
            if p.get("map", "ermo") != npc.get("map", "ermo"):
                continue
            d = max(abs(npc["x"] - p["x"]), abs(npc["y"] - p["y"]))
            if radius is not None and d > radius:
                continue
            if bestd is None or d < bestd:
                best, bestd = p, d
        return best

    def near_entity(self, player, entity_id, radius):
        """True se o jogador esta a ate `radius` tiles da entidade (mesmo mapa)."""
        ent = self.players.get(entity_id)
        if not ent or not player:
            return False
        if ent.get("map", "ermo") != player.get("map", "ermo"):
            return False
        return max(abs(player["x"] - ent["x"]),
                   abs(player["y"] - ent["y"])) <= radius

    def snapshot(self):
        """Todos os jogadores vivos em formato publico (pro 'init')."""
        return [public(p) for p in self.players.values()]

    def entities_in(self, mp):
        """So as entidades (jogadores + NPCs + monstros) que estao NO mapa `mp`, em
        formato publico. Usado no 'init' e na troca de mapa pra mandar so o que importa."""
        ents = [public(p) for p in self.players.values()
                if p.get("map", "ermo") == mp and not p.get("_inside")]
        ents += [monster_public(m) for m in self.monsters.values()
                 if m.get("map") == mp and m.get("alive", True)]
        return ents

    # --------------------------------------------------------------- monstros

    def spawn_one(self, type_id, x, y, mp):
        """Cria UM monstro vivo no mundo e devolve o mid (ou None se o tipo não
        existe). Usado pelo spawn inicial e pelo GM (invocar monstro)."""
        spec = monsters_def.get(type_id)
        if not spec:
            return None
        pos = _walkable_near(x, y, mp)
        self._monster_seq += 1
        mid = "mob:%d" % self._monster_seq
        self.monsters[mid] = {
            "id": mid, "type": type_id, "name": spec["name"],
            "x": pos[0], "y": pos[1], "facing": "down", "map": mp,
            "hp": spec["hp"], "hp_max": spec["hp"], "ac": spec["ac"],
            "atk": spec["atk"], "dmg": dict(spec["dmg"]), "reach": spec["reach"],
            "speed": spec["speed"], "xp": spec["xp"], "dex": spec["dex"],
            "glyph": spec["glyph"], "kind": "monster", "alive": True,
            "atk_name": spec["atk_name"], "boss": spec.get("boss", False),
            "summon_type": spec.get("summon_type"), "summons": spec.get("summons", 0),
            "size": spec.get("size"), "passive": spec.get("passive", False),
            "_spawn": (type_id, pos[0], pos[1]),
        }
        return mid

    def spawn_monsters(self):
        """Coloca os monstros iniciais no mundo (O Descampado e o Repouso da Dama).
        Cada um e uma entidade viva em self.monsters, com o stat block copiado do
        registro. Ficam parados ate o combate chegar; aqui so existem e aparecem."""
        self.monsters.clear()
        _spawn = lambda type_id, x, y, mp: self.spawn_one(type_id, x, y, mp)

        for (type_id, x, y) in monsters_def.DESCAMPADO_SPAWNS:
            _spawn(type_id, x, y, "descampado")
        for (type_id, x, y) in monsters_def.REPOUSO_SPAWNS:
            _spawn(type_id, x, y, "repouso_dama")
        for (type_id, x, y) in monsters_def.AVASHAM_SPAWNS:
            _spawn(type_id, x, y, "avasham")
        for (type_id, x, y) in monsters_def.COVA_COLOSSO_SPAWNS:
            _spawn(type_id, x, y, "cova_colosso")
        for (type_id, x, y) in monsters_def.VALDARKRAM_SPAWNS:
            _spawn(type_id, x, y, "valdarkram")
        for (type_id, x, y) in monsters_def.MINA_AVHUR_SPAWNS:
            _spawn(type_id, x, y, "mina_avhur")
        for (type_id, x, y) in monsters_def.CAMARA_AVHUR_SPAWNS:
            _spawn(type_id, x, y, "camara_avhur")
        for (type_id, x, y) in monsters_def.TORRE_ANDAR1_SPAWNS:
            _spawn(type_id, x, y, "torre_andar1")
        for (type_id, x, y) in monsters_def.TORRE_ANDAR2_SPAWNS:
            _spawn(type_id, x, y, "torre_andar2")
        for (type_id, x, y) in monsters_def.TORRE_ANDAR3_SPAWNS:
            _spawn(type_id, x, y, "torre_andar3")
        for (type_id, x, y) in monsters_def.CAMARA_VARTH_SPAWNS:
            _spawn(type_id, x, y, "camara_varth")
        for (type_id, x, y) in monsters_def.FLORESTA_ERMO_SPAWNS:
            _spawn(type_id, x, y, "floresta_ermo")
        return self.monsters

    def monster_at(self, mp, x, y):
        """O monstro vivo nessa casa (ou None)."""
        for m in self.monsters.values():
            if m.get("alive", True) and m["map"] == mp and m["x"] == x and m["y"] == y:
                return m
        return None

    def monsters_near(self, mp, x, y, radius):
        """Monstros vivos a ate `radius` casas (distancia de Chebyshev) de (x, y)."""
        out = []
        for m in self.monsters.values():
            if m.get("alive", True) and m["map"] == mp:
                if max(abs(m["x"] - x), abs(m["y"] - y)) <= radius:
                    out.append(m)
        return out

    def wander_monsters(self, mp="descampado", chance=0.4, leash=9):
        """Um passo de perambulacao: cada monstro vivo e fora de combate tenta um
        passo aleatorio (4 direcoes) dentro de uma coleira em torno do ponto de
        origem, sem pisar em parede, agua, outro monstro ou jogador. Devolve a lista
        dos que se moveram (id, x, y, facing) pro servidor transmitir."""
        moved = []
        dirs = (("up", 0, -1), ("down", 0, 1), ("left", -1, 0), ("right", 1, 0))
        ptiles = {(p["x"], p["y"]) for p in self.players.values()
                  if p.get("map") == mp and not p.get("_inside")}
        occ = {(m["x"], m["y"]) for m in self.monsters.values()
               if m.get("alive", True) and m.get("map") == mp}
        for m in self.monsters.values():
            if not m.get("alive", True) or m.get("map") != mp or m.get("in_combat") or m.get("boss"):
                continue
            # bicho PASSIVO (caça): foge do jogador mais perto (ignora a coleira pra escapar)
            if m.get("passive"):
                thr = min((p for p in self.players.values()
                           if p.get("map") == mp and not p.get("_inside")
                           and max(abs(p["x"] - m["x"]), abs(p["y"] - m["y"])) <= 6),
                          key=lambda p: abs(p["x"] - m["x"]) + abs(p["y"] - m["y"]), default=None)
                if thr:
                    best = None; bestd = -1
                    for nm, ddx, ddy in dirs:
                        nx2, ny2 = m["x"] + ddx, m["y"] + ddy
                        if (nx2, ny2) in ptiles or (nx2, ny2) in occ:
                            continue
                        if not rules.is_walkable(nx2, ny2, mp):
                            continue
                        dd = abs(thr["x"] - nx2) + abs(thr["y"] - ny2)   # quanto mais longe do jogador, melhor
                        if dd > bestd:
                            bestd = dd; best = (nm, nx2, ny2)
                    if best:
                        nm, nx2, ny2 = best
                        occ.discard((m["x"], m["y"])); occ.add((nx2, ny2))
                        m["facing"] = nm; m["x"], m["y"] = nx2, ny2
                        moved.append({"id": m["id"], "x": nx2, "y": ny2, "facing": nm})
                    continue
            if random.random() > chance:
                continue
            name, dx, dy = random.choice(dirs)
            m["facing"] = name
            nx, ny = m["x"] + dx, m["y"] + dy
            _t, sx, sy = m["_spawn"]
            if max(abs(nx - sx), abs(ny - sy)) > leash:
                continue
            if (nx, ny) in ptiles or (nx, ny) in occ:
                continue
            if not rules.is_walkable(nx, ny, mp):
                continue
            occ.discard((m["x"], m["y"]))
            occ.add((nx, ny))
            m["x"], m["y"] = nx, ny
            moved.append({"id": m["id"], "x": nx, "y": ny, "facing": name})
        return moved

    def set_map(self, sid, mp, x, y):
        """Move um jogador pra outro mapa, numa posicao. Ao SAIR do Ermo, lembra
        onde ele estava pra poder voltar pro mesmo lugar."""
        p = self.players.get(sid)
        if not p:
            return None
        if mp != "ermo" and p.get("map", "ermo") == "ermo":
            p["_ermo_return"] = (p["x"], p["y"])   # guarda o ponto no Ermo
        p["map"] = mp
        p["x"], p["y"] = int(x), int(y)
        p["facing"] = "down"
        return p

    def ermo_return(self, sid):
        """Onde o jogador estava no Ermo antes de ir pro Salao (ou None)."""
        p = self.players.get(sid)
        return p.get("_ermo_return") if p else None

    def pop_dirty(self):
        """Quem se moveu desde o ultimo flush: lista (player_id,x,y,facing).
        So persiste posicao do ERMO (o Salao e transitorio: ao reconectar o
        jogador volta pro Ermo, no ultimo ponto valido de la)."""
        out = []
        for p in self.players.values():
            if p.get("is_npc"):
                p["_dirty"] = False   # NPC nao tem conta, nunca persiste
                continue
            if p.get("map", "ermo") != "ermo":
                p["_dirty"] = False   # nao salva posicao do Salao
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

        # economia: itens do chao NAO reaparecem mais. Pegou, acabou. (Os que ja
        # estao no mapa continuam la ate alguem pegar.)
        cat = items.get(item_id) or {}
        if cat.get("kind") == "currency":
            # moeda vira SALDO na carteira (total em bronze), nao item de mochila.
            player["wallet"] = int(player.get("wallet", 0)) + int(cat.get("value", 1))
            return {"item": item_id, "x": tile[0], "y": tile[1], "currency": True,
                    "wallet": player["wallet"]}
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
        """A aparencia segue o equipamento (por ora: cajado em qualquer das maos)."""
        look = player.get("look")
        if look is None:
            return
        look["staff"] = any(items.shows_staff(player["equipment"].get(h))
                            for h in ("hand_r", "hand_l"))

    def equip(self, player, item_id):
        """Tira o item da mochila e veste no espaco dele. Se o espaco ja tinha
        algo, o antigo volta pra mochila. Devolve True se equipou."""
        if not items.is_equippable(item_id):
            return False
        if not items.remove_from_bag(player["inventory"], item_id, 1):
            return False  # nao esta na mochila
        slot = items.resolve_slot(item_id, player["equipment"])
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
