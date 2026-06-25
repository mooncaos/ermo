"""
AS REGRAS — lógica que age sobre o mundo.

Aqui mora "o que pode acontecer": colisão, validação de movimento,
escolha de spawn. É de propósito separado de world.py (o estado) e de
app.py (a rede). Quando você for adicionar combate, gatilhos de porta,
empurrar caixa etc., a regra nova entra AQUI e não encosta na rede.
"""

import random
import time

from .world_map import MAP_ROWS, SOLID_CHARS, SPAWN_POINTS

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


def in_bounds(x, y):
    return 0 <= x < WIDTH and 0 <= y < HEIGHT


def is_walkable(x, y):
    """Um tile é passável se está no mapa e não é sólido."""
    if not in_bounds(x, y):
        return False
    return MAP_ROWS[y][x] not in SOLID_CHARS


def pick_spawn(world):
    """Escolhe um ponto de nascimento livre (sem outro jogador em cima)."""
    occupied = {(p["x"], p["y"]) for p in world.players.values()}
    free = [s for s in SPAWN_POINTS if is_walkable(*s) and s not in occupied]
    if not free:
        free = [s for s in SPAWN_POINTS if is_walkable(*s)] or [(1, 1)]
    return random.choice(free)


def _occupied_by_other(world, mover, x, y):
    """True se OUTRO jogador já está ocupando o tile (x, y)."""
    for p in world.players.values():
        if p is mover:
            continue
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

    dx, dy = DELTAS[direction]
    player["facing"] = direction  # vira o personagem na direção tentada
    nx, ny = player["x"] + dx, player["y"] + dy

    if not is_walkable(nx, ny):
        return None

    # colisão entre jogadores: não pisa em cima de outro viajante
    if _occupied_by_other(world, player, nx, ny):
        return None

    player["x"], player["y"] = nx, ny
    player["_last_move"] = now
    player["_dirty"] = True  # marca pra ser salvo no banco no proximo flush
    return player
