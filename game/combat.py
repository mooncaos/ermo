"""
MOTOR DE COMBATE POR TURNOS (estilo tatico, regras 5e).

Logica pura: monta um confronto (jogador + monstros), rola iniciativa, resolve
movimento/ataque por tiles e decide a IA dos monstros. NAO conhece socket: o
app.py orquestra (manda os eventos, controla o tempo) chamando estas funcoes.

Um "combatente" e um dict com: cid (id unico), kind ('player'|'monster'), name,
hp, hp_max, ac, atk (bonus de ataque), dmg {n,d,flat}, reach (alcance em tiles),
speed (deslocamento em tiles/turno), dex (mod de Destreza), x, y, alive.

O confronto (enc) guarda: map, combs {cid:combatente}, order [cid em iniciativa],
idx (de quem e a vez), round, move_left (passos restantes do atual), action_used.
"""

import random

from . import rules, races


def _d20():
    return random.randint(1, 20)


def _roll_dmg(dmg, crit=False):
    n, d, flat = dmg.get("n", 1), dmg.get("d", 6), dmg.get("flat", 0)
    if crit:
        n *= 2
    return sum(random.randint(1, d) for _ in range(n)) + flat


# ----------------------------------------------------------------- combatentes

def player_stats(ficha):
    """Deriva os numeros de combate da ficha (sem sistema de armas/armadura ainda:
    CA = 10 + DES, com defesa sem armadura de barbaro/monge; arma generica 1d8)."""
    final = ficha.get("attrs_final") or ficha.get("attrs") or {}
    dexm = races.attr_mod(int(final.get("DES", 10)))
    strm = races.attr_mod(int(final.get("FOR", 10)))
    conm = races.attr_mod(int(final.get("CON", 10)))
    wism = races.attr_mod(int(final.get("SAB", 10)))
    cid = ficha.get("class_id")
    ac = 10 + dexm
    if cid == "barbaro":
        ac = 10 + dexm + conm
    elif cid == "monge":
        ac = 10 + dexm + wism
    prof = int(ficha.get("prof", 2))
    hit_mod = max(strm, dexm)
    return {
        "ac": ac, "atk": prof + hit_mod,
        "dmg": {"n": 1, "d": 8, "flat": hit_mod},
        "reach": 1, "speed": 6, "dex": dexm,
    }


def make_player_combatant(sid, player, ficha):
    st = player_stats(ficha)
    return {
        "cid": sid, "kind": "player", "name": player.get("name", "Você"),
        "hp": int(ficha.get("hp", 1)), "hp_max": int(ficha.get("hp_max", 1)),
        "ac": st["ac"], "atk": st["atk"], "dmg": st["dmg"], "reach": st["reach"],
        "speed": st["speed"], "dex": st["dex"],
        "x": player["x"], "y": player["y"], "alive": True,
        "atk_name": "ataque",
    }


def make_monster_combatant(m):
    return {
        "cid": m["id"], "kind": "monster", "mid": m["id"], "name": m["name"],
        "hp": int(m["hp"]), "hp_max": int(m["hp_max"]), "ac": m["ac"], "atk": m["atk"],
        "dmg": dict(m["dmg"]), "reach": m["reach"], "speed": m["speed"], "dex": m["dex"],
        "x": m["x"], "y": m["y"], "glyph": m.get("glyph"), "xp": m.get("xp", 0),
        "alive": True, "atk_name": m.get("atk_name", "ataque"),
    }


# -------------------------------------------------------------------- confronto

def start(player_combatant, monster_combatants, mp):
    combs = {player_combatant["cid"]: player_combatant}
    for mc in monster_combatants:
        combs[mc["cid"]] = mc
    for c in combs.values():
        c["_init"] = _d20() + c.get("dex", 0)
    order = sorted(combs.keys(), key=lambda cid: combs[cid]["_init"], reverse=True)
    enc = {"map": mp, "combs": combs, "order": order, "idx": 0, "round": 1,
           "move_left": 0, "action_used": False}
    _begin_turn(enc)
    return enc


def current(enc):
    return enc["combs"][enc["order"][enc["idx"]]]


def _begin_turn(enc):
    c = current(enc)
    enc["move_left"] = c.get("speed", 6)
    enc["action_used"] = False


def advance(enc):
    """Passa pro proximo combatente VIVO; incrementa o round ao dar a volta."""
    n = len(enc["order"])
    for _ in range(n + 1):
        enc["idx"] += 1
        if enc["idx"] >= n:
            enc["idx"] = 0
            enc["round"] += 1
        if current(enc).get("alive"):
            break
    _begin_turn(enc)
    return current(enc)


def alive_of(enc, kind):
    return [c for c in enc["combs"].values() if c["kind"] == kind and c.get("alive")]


def outcome(enc):
    """'victory' (sem monstros vivos), 'defeat' (sem jogador vivo), ou None."""
    if not alive_of(enc, "monster"):
        return "victory"
    if not alive_of(enc, "player"):
        return "defeat"
    return None


# --------------------------------------------------------------- movimento/ataque

def _occupied(enc, c, nx, ny):
    for o in enc["combs"].values():
        if o is not c and o.get("alive") and o["x"] == nx and o["y"] == ny:
            return True
    return False


def can_step(enc, c, nx, ny):
    if enc["move_left"] <= 0:
        return False
    if abs(nx - c["x"]) + abs(ny - c["y"]) != 1:   # 1 passo em 4 direcoes
        return False
    if not rules.is_walkable(nx, ny, enc["map"]):
        return False
    return not _occupied(enc, c, nx, ny)


def step(enc, c, nx, ny):
    c["x"], c["y"] = nx, ny
    enc["move_left"] -= 1


def in_reach(a, b):
    return max(abs(a["x"] - b["x"]), abs(a["y"] - b["y"])) <= a.get("reach", 1)


def attack(enc, attacker, target):
    """Resolve um ataque 5e: d20+bonus vs CA (20 = critico, 1 = erro). No acerto,
    rola o dano (critico dobra os dados). Devolve um dict do resultado."""
    d = _d20()
    crit = (d == 20)
    total = d + attacker.get("atk", 0)
    hit = crit or (d != 1 and total >= target["ac"])
    res = {"attacker": attacker["cid"], "attacker_name": attacker["name"],
           "target": target["cid"], "target_name": target["name"],
           "d20": d, "total": total, "crit": crit, "hit": hit, "dmg": 0,
           "atk_name": attacker.get("atk_name", "ataque"), "killed": False,
           "target_hp": target["hp"], "target_hp_max": target["hp_max"]}
    if hit:
        dmg = _roll_dmg(attacker["dmg"], crit)
        target["hp"] = max(0, target["hp"] - dmg)
        res["dmg"] = dmg
        res["target_hp"] = target["hp"]
        if target["hp"] <= 0:
            target["alive"] = False
            res["killed"] = True
    return res


# ----------------------------------------------------------------------- IA

def _step_toward(enc, c, tgt):
    dx = (tgt["x"] > c["x"]) - (tgt["x"] < c["x"])
    dy = (tgt["y"] > c["y"]) - (tgt["y"] < c["y"])
    cands = []
    if abs(tgt["x"] - c["x"]) >= abs(tgt["y"] - c["y"]):
        if dx: cands.append((c["x"] + dx, c["y"]))
        if dy: cands.append((c["x"], c["y"] + dy))
    else:
        if dy: cands.append((c["x"], c["y"] + dy))
        if dx: cands.append((c["x"] + dx, c["y"]))
    for (nx, ny) in cands:
        if rules.is_walkable(nx, ny, enc["map"]) and not _occupied(enc, c, nx, ny):
            return (nx, ny)
    return (None, None)


def monster_decide(enc, monster):
    """IA simples: mira o jogador vivo mais perto, anda ate ele (ate o speed) e
    ataca se chegar no alcance. Devolve (passos [(x,y)...], resultado_do_ataque|None)."""
    targets = alive_of(enc, "player")
    if not targets:
        return ([], None)
    tgt = min(targets, key=lambda t: abs(t["x"] - monster["x"]) + abs(t["y"] - monster["y"]))
    steps = []
    budget = monster.get("speed", 6)
    while budget > 0 and not in_reach(monster, tgt):
        nx, ny = _step_toward(enc, monster, tgt)
        if nx is None:
            break
        monster["x"], monster["y"] = nx, ny
        steps.append((nx, ny))
        budget -= 1
    atk = attack(enc, monster, tgt) if in_reach(monster, tgt) else None
    return (steps, atk)


# ------------------------------------------------------------------- snapshot

def snapshot(enc, my_cid):
    """Estado do confronto pro cliente desenhar (combatentes, ordem, de quem e a vez)."""
    cur_cid = enc["order"][enc["idx"]]
    combs = []
    for cid in enc["order"]:
        c = enc["combs"][cid]
        combs.append({
            "cid": cid, "kind": c["kind"], "name": c["name"],
            "x": c["x"], "y": c["y"], "hp": c["hp"], "hp_max": c["hp_max"],
            "alive": c.get("alive", True), "glyph": c.get("glyph"),
            "you": (cid == my_cid), "current": (cid == cur_cid), "ac": c["ac"],
        })
    return {
        "combatants": combs, "order": list(enc["order"]),
        "turn": cur_cid, "round": enc["round"],
        "your_turn": (cur_cid == my_cid),
        "your_move": enc["move_left"] if cur_cid == my_cid else 0,
        "your_action": (not enc["action_used"]) if cur_cid == my_cid else False,
    }
