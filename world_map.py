"""
AS REGRAS — lógica que age sobre o mundo.

Aqui mora "o que pode acontecer": colisão, validação de movimento,
escolha de spawn. É de propósito separado de world.py (o estado) e de
app.py (a rede). Quando você for adicionar combate, gatilhos de porta,
empurrar caixa etc., a regra nova entra AQUI e não encosta na rede.
"""

import random
import time

from .world_map import MAP_ROWS, SOLID_CHARS, SPAWN_POINTS, map_rows, map_dims, get_map

WIDTH = len(MAP_ROWS[0])
HEIGHT = len(MAP_ROWS)

# Intervalo mínimo entre passos do mesmo jogador (anti-spam de rede).
MOVE_COOLDOWN = 0.09  # segundos

DELTAS = {
    "up": (0, -1),
    "down": (0, 1),
    "left": (-1, 0),
    "right": (1, 0),
}


def in_bounds(x, y, mp="ermo"):
    w, h = map_dims(mp)
    return 0 <= x < w and 0 <= y < h


def is_walkable(x, y, mp="ermo"):
    """Um tile é passável se está no mapa e não é sólido."""
    if not in_bounds(x, y, mp):
        return False
    return map_rows(mp)[y][x] not in SOLID_CHARS


def pick_spawn(world, mp="ermo"):
    """Escolhe um ponto de nascimento livre (sem outro jogador NO MESMO mapa)."""
    spawns = get_map(mp)["spawns"]
    occupied = {(p["x"], p["y"]) for p in world.players.values()
                if p.get("map", "ermo") == mp}
    free = [s for s in spawns if is_walkable(s[0], s[1], mp) and s not in occupied]
    if not free:
        free = [s for s in spawns if is_walkable(s[0], s[1], mp)]
    if not free:
        free = [spawns[0]] if spawns else [(1, 1)]
    return random.choice(free)


def _occupied_by_other(world, mover, x, y):
    """True se OUTRO jogador (solido) ja esta ocupando o tile (x, y) NO MESMO mapa.
    Entidades nao-solidas (ex.: o corvo) sao transparentes pra colisao."""
    mmap = mover.get("map", "ermo")
    for p in world.players.values():
        if p is mover:
            continue
        if p.get("map", "ermo") != mmap:
            continue  # so colide com quem esta no mesmo mapa
        if not p.get("solid", True):
            continue  # corvo e afins: da pra atravessar
        if p["x"] == x and p["y"] == y:
            return True
    return False


def apply_move(world, player, direction):
    """
    Tenta mover um jogador numa direção.
    Retorna o jogador se a posição mudou, senão None (e nada é transmitido).
    """
    if direction not in DELTAS:
        return None

    now = time.time()
    if now - player.get("_last_move", 0.0) < MOVE_COOLDOWN:
        return None

    mmap = player.get("map", "ermo")
    dx, dy = DELTAS[direction]
    player["facing"] = direction  # vira o personagem na direção tentada
    nx, ny = player["x"] + dx, player["y"] + dy

    if player.get("gm_fly"):                  # GM voando (noclip): atravessa parede, mas fica dentro do mapa
        if not in_bounds(nx, ny, mmap):
            return None
        player["x"], player["y"] = nx, ny
        player["_last_move"] = now
        player["_dirty"] = True
        return player

    if not is_walkable(nx, ny, mmap):
        return None

    # colisão entre jogadores: não pisa em cima de outro viajante (mesmo mapa)
    if _occupied_by_other(world, player, nx, ny):
        return None

    player["x"], player["y"] = nx, ny
    player["_last_move"] = now
    player["_dirty"] = True  # marca pra ser salvo no banco no proximo flush
    return player
