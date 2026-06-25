"""
O ESTADO DO MUNDO — quem está dentro, onde, e com que cara.

Guarda os jogadores conectados e sabe se serializar pra mandar pro
cliente. Não conhece a rede (não importa socket nenhum) nem desenha
nada. Só estado + operações sobre ele, delegando as regras pra rules.py.

A APARÊNCIA ("look") de cada jogador é só um dicionário de campos. Ele
viaja sozinho pela rede até todo mundo, então adicionar customização
nova no futuro (vida, equipamento, etc.) é só somar campo aqui e saber
desenhar no cliente. Tudo que vem do cliente passa por sanitize_look,
pra um cliente malicioso não conseguir injetar valor fora da lista.
"""

from . import rules
from .world_map import MAP_ROWS, TILE_SIZE

# Paletas de customização (o cliente desenha a partir destes mesmos valores).
CLOAKS = [
    "#9b6dff",  # violeta arcano
    "#f4b860",  # âmbar
    "#5fd0c5",  # turquesa
    "#e85d75",  # rubi
    "#7cc4f4",  # céu
    "#b6e36a",  # limo
    "#f49ad0",  # rosa
    "#c9a0ff",  # lavanda
]
SKINS = ["#f1c9a5", "#e8b58c", "#c68642", "#8d5524", "#ffe0bd"]
HAIRS = ["#2a2233", "#5a3f28", "#8a6a3a", "#d8b25a", "#b6b0be", "#9c3b2e"]
HATS = ("none", "wizard", "cap")
HOODS = ("up", "down")

# Compat: nome antigo ainda usado em algum lugar do código/leitura.
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
    """Garante um look válido a partir do que o cliente mandou."""
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
    """Versão do jogador segura pra enviar (sem campos internos com _)."""
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
        self.players = {}          # sid -> dict do jogador
        self._join_index = 0

    def map_payload(self):
        """O mapa que vai pro cliente no 'init' (fonte única da verdade)."""
        return {
            "rows": MAP_ROWS,
            "tilesize": TILE_SIZE,
            "width": len(MAP_ROWS[0]),
            "height": len(MAP_ROWS),
        }

    def add_player(self, sid, name, look=None):
        x, y = rules.pick_spawn(self)
        clean_name = (name or "").strip()[:16] or "Viajante"
        player = {
            "id": sid,
            "x": x,
            "y": y,
            "facing": "down",
            "name": clean_name,
            "look": sanitize_look(look, self._join_index),
            "_last_move": 0.0,
        }
        self._join_index += 1
        self.players[sid] = player
        return player

    def remove_player(self, sid):
        return self.players.pop(sid, None)

    def try_move(self, sid, direction):
        player = self.players.get(sid)
        if not player:
            return None
        return rules.apply_move(self, player, direction)

    def snapshot(self):
        """Todos os jogadores em formato público (pra mandar no 'init')."""
        return [public(p) for p in self.players.values()]
