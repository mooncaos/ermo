"""
O ESTADO DO MUNDO — quem esta dentro AGORA, onde, e com que cara.

Guarda os jogadores CONECTADOS no momento (memoria), separado do banco, que
guarda o estado PERSISTENTE. Quando alguem entra, a rede carrega a conta do
banco e chama add_player com esses dados; quando o jogador anda, ele e
marcado como "sujo" pra um salvador periodico gravar a posicao.

Nao conhece socket nem desenha nada. So estado vivo + operacoes, delegando
as regras pra rules.py. A aparencia ("look") continua sendo so um dicionario
de campos validados, que viaja sozinho pela rede ate todo mundo.
"""

from . import rules
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

# Compat: nome antigo.
PLAYER_COLORS = CLOAKS


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

    def map_payload(self):
        """O mapa que vai pro cliente no 'init' (fonte unica da verdade)."""
        return {
            "rows": MAP_ROWS,
            "tilesize": TILE_SIZE,
            "width": len(MAP_ROWS[0]),
            "height": len(MAP_ROWS),
        }

    def add_player(self, sid, player_id, name, look, x, y, facing="down"):
        """Coloca no mundo um jogador ja carregado do banco."""
        player = {
            "id": sid,                # identidade da conexao (protocolo)
            "player_id": player_id,   # identidade da conta (banco)
            "x": int(x),
            "y": int(y),
            "facing": facing or "down",
            "name": (name or "Viajante")[:16],
            "look": sanitize_look(look),
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
            # so limpa o indice se ele ainda aponta pra este sid
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
