# ===========================================================================
#  SISTEMA DE SKILLS DO ERMO: fiel às fórmulas do Tibia (TFS 1.x).
#
#  DANO MELEE:    max = 0.085 * D * Atk * Skill + (Level / 5)
#  DANO DISTANCE: max = 0.09  * D * Atk * Skill + (Level / 5)
#     D = modo de luta: 1.0 ofensivo | 0.75 equilibrado | 0.5 defensivo
#     dano do golpe = aleatório entre ~15% e 100% do máximo (0 = errou)
#  DEFESA (block): valor = DefTotal * fatorD * ((Shielding / 4) + 2.23) * 0.15
#     bloqueio por golpe = aleatório(valor/2 .. valor)
#     fatorD (invertido): 0.5 ofensivo | 0.75 equilibrado | 1.0 defensivo
#  ARMADURA: redução física por golpe = aleatório(Arm/2 .. Arm)
#  MAGIA:    min = Lvl/5 + ML*a1 + b1   |   max = Lvl/5 + ML*a2 + b2
#  AVANÇO:   tries(nv) = base * mult^(nv - 10)  (magia: mana gasta conta)
# ===========================================================================
import math
import random

SKILLS = ("fist", "sword", "axe", "club", "distance", "shielding")
SKILL_NAMES = {"fist": "Punhos", "sword": "Espada", "axe": "Machado",
               "club": "Maça", "distance": "Distância", "shielding": "Escudo",
               "magic": "Nível Mágico"}

# base de tries por skill (padrão TFS)
SKILL_BASE = {"fist": 50, "sword": 50, "axe": 50, "club": 50,
              "distance": 30, "shielding": 100}
MAGIC_BASE = 1600            # mana gasta pra subir o Nível Mágico

# multiplicadores por classe (quanto MENOR, mais rápido treina: estilo vocação)
CLASS_MULT = {
    "guerreiro":  {"melee": 1.1, "distance": 1.4, "shielding": 1.1, "magic": 3.0},
    "barbaro":    {"melee": 1.1, "distance": 1.4, "shielding": 1.2, "magic": 3.0},
    "paladino":   {"melee": 1.2, "distance": 1.2, "shielding": 1.1, "magic": 1.6},
    "cacador":    {"melee": 1.3, "distance": 1.1, "shielding": 1.25, "magic": 2.0},
    "ladino":     {"melee": 1.2, "distance": 1.15, "shielding": 1.25, "magic": 2.5},
    "mago":       {"melee": 1.6, "distance": 1.5, "shielding": 1.5, "magic": 1.1},
    "feiticeiro": {"melee": 1.6, "distance": 1.5, "shielding": 1.5, "magic": 1.1},
    "bruxo":      {"melee": 1.5, "distance": 1.5, "shielding": 1.4, "magic": 1.1},
    "clerigo":    {"melee": 1.35, "distance": 1.5, "shielding": 1.2, "magic": 1.2},
    "druida":     {"melee": 1.4, "distance": 1.4, "shielding": 1.35, "magic": 1.1},
    "bardo":      {"melee": 1.35, "distance": 1.25, "shielding": 1.3, "magic": 1.4},
    "monge":      {"melee": 1.1, "distance": 1.4, "shielding": 1.2, "magic": 2.0},
}
_DEF_MULT = {"melee": 1.3, "distance": 1.3, "shielding": 1.3, "magic": 1.8}


def _mult_for(class_id, skill):
    grupo = "magic" if skill == "magic" else (
        "distance" if skill == "distance" else (
            "shielding" if skill == "shielding" else "melee"))
    return (CLASS_MULT.get(class_id) or _DEF_MULT).get(grupo, 1.4)


def tries_needed(class_id, skill, level):
    """Quantas tentativas pra IR do nível `level` pro seguinte (padrão TFS)."""
    if skill == "magic":
        return int(MAGIC_BASE * (_mult_for(class_id, "magic") ** level))
    base = SKILL_BASE.get(skill, 50)
    return int(base * (_mult_for(class_id, skill) ** max(0, level - 10)))


def ensure(ficha):
    """Garante a estrutura de skills na ficha (migra veteranos pelo nível)."""
    if ficha.get("skills") and "magic" in ficha["skills"]:
        return ficha["skills"]
    lvl = int(ficha.get("level", 1))
    base = 10 + max(0, lvl // 2)          # veterano não começa do zero
    sk = {s: {"lvl": base, "t": 0} for s in SKILLS}
    sk["magic"] = {"lvl": ml_floor(ficha.get("class_id"), lvl), "t": 0}
    ficha["skills"] = sk
    return sk


def get_lvl(ficha, skill):
    return int((ensure(ficha).get(skill) or {}).get("lvl", 10 if skill != "magic" else 0))


def add_tries(ficha, skill, n=1):
    """Soma tentativas; devolve o novo nível se SUBIU (senão None)."""
    sk = ensure(ficha)
    s = sk.setdefault(skill, {"lvl": 10 if skill != "magic" else 0, "t": 0})
    s["t"] = int(s.get("t", 0)) + int(n)
    need = tries_needed(ficha.get("class_id"), skill, int(s["lvl"]))
    subiu = None
    while s["t"] >= need:
        s["t"] -= need
        s["lvl"] = int(s["lvl"]) + 1
        subiu = s["lvl"]
        need = tries_needed(ficha.get("class_id"), skill, int(s["lvl"]))
    return subiu


# ---------------------------- COMBATE ----------------------------
FIGHT_ATK = {"off": 1.0, "bal": 0.75, "def": 0.5}
FIGHT_DEF = {"off": 0.5, "bal": 0.75, "def": 1.0}


def melee_max(atk, skill, level, mode="bal"):
    # REBALANCE jul/26: melee subiu de 0.085 pra 0.12 e o nível pesa mais (lvl/3.5).
    return 0.12 * FIGHT_ATK.get(mode, 0.75) * atk * skill + level / 3.5


def dist_max(atk, skill, level, mode="bal"):
    return 0.125 * FIGHT_ATK.get(mode, 0.75) * atk * skill + level / 3.5


def roll_hit(maxdmg):
    """O golpe: 8%% de erro natural; senão, entre 35%% e 100%% do máximo."""
    if maxdmg <= 0 or random.random() < 0.08:
        return 0
    return max(1, int(random.uniform(0.35, 1.0) * maxdmg))


def block_value(def_total, shielding, mode="bal"):
    v = def_total * FIGHT_DEF.get(mode, 0.75) * ((shielding / 4.0) + 2.23) * 0.15
    return int(random.uniform(v / 2.0, v)) if v > 0 else 0


def armor_reduce(armor):
    if armor <= 0:
        return 0
    return int(random.uniform(armor / 2.0, armor))


def magic_range(level, ml, a1, b1, a2, b2):
    mn = level / 5.0 + ml * a1 + b1
    mx = level / 5.0 + ml * a2 + b2
    return int(mn), int(max(mn + 1, mx))


def magic_roll(level, ml, a1, b1, a2, b2):
    mn, mx = magic_range(level, ml, a1, b1, a2, b2)
    return random.randint(mn, mx)


# fórmulas (a1,b1,a2,b2) por nível de magia do grimório (cantrip=0 .. 5)
SPELL_FORMULAS = {
    0: (0.4, 2, 0.8, 6),
    1: (0.8, 6, 1.4, 12),
    2: (1.2, 10, 2.0, 20),
    3: (1.6, 16, 2.6, 30),
    4: (2.2, 24, 3.4, 44),
    5: (3.0, 34, 4.6, 62),
}
HEAL_FORMULAS = {0: (0.6, 4, 1.0, 9), 1: (1.0, 8, 1.6, 16),
                 2: (1.6, 14, 2.4, 26), 3: (2.4, 22, 3.6, 40),
                 4: (3.2, 32, 4.8, 58), 5: (4.4, 46, 6.4, 82)}


def ml_floor(class_id, level):
    m = _mult_for(class_id, "magic")
    if m <= 1.3:
        return max(0, int(level) // 3)
    if m <= 1.7:
        return max(0, int(level) // 4)
    return max(0, int(level) // 8)


def recalibrate(ficha):
    s = ensure(ficha)
    piso = ml_floor(ficha.get("class_id"), int(ficha.get("level", 1)))
    if int(s["magic"].get("lvl", 0)) < piso:
        s["magic"]["lvl"] = piso
        return True
    return False
