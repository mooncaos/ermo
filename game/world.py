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

import time

from . import rules
from . import items
from .world_map import MAP_ROWS, TILE_SIZE

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


def public(p):
    """Versao do jogador segura pra enviar (sem campos internos com _)."""
    return {
        "id": p["id"],
        "x": p["x"],
        "y": p["y"],
        "facing": p["facing"],
        "name": p["name"],
        "look": p["look"],
    }


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
                   inventory=None):
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
            "_last_move": 0.0,
            "_dirty": False,
        }
        self.players[sid] = player
        self.by_player_id[player_id] = sid
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

    def snapshot(self):
        """Todos os jogadores vivos em formato publico (pro 'init')."""
        return [public(p) for p in self.players.values()]

    def pop_dirty(self):
        """Quem se moveu desde o ultimo flush: lista (player_id,x,y,facing)."""
        out = []
        for p in self.players.values():
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
