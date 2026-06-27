"""
SISTEMA DE NIVEIS (D&D 5e) — o MOTOR.

Tabela de XP oficial, bonus de proficiencia, vida por nivel e a concessao de XP
por exploracao. As FEATURES e MAGIAS por classe ficam pras fases seguintes; aqui
e so o alicerce: o nivel sobe de verdade, a vida e a proficiencia acompanham.

Regras da casa ja fixadas com o Moon:
- curva de XP: tabela 5e padrao.
- vida por nivel: nivel 1 = MAX do dado + mod CON; cada nivel depois soma a
  MEDIA fixa do dado + mod CON (estilo BG3, justo no multiplayer).
- proficiencia: +2 (1-4), +3 (5-8), +4 (9-12), +5 (13-16), +6 (17-20).
- so vira "aventureiro" (ganha nivel) depois de ter classe; sem classe o XP so
  acumula e e aplicado quando escolhe a classe.
"""
from . import races

MAX_LEVEL = 20

# XP ACUMULADO pra atingir cada nivel (index = nivel). Recalibrado junto com a
# QUEDA DRASTICA do XP dos monstros (esqueleto era 1000, virou 90). Comeco (1-10)
# baixo e gostoso; do 10 ao 20 a curva EXPLODE (1.400x do 10 ao 20) pra fazer o
# nivel 20 ser uma maratona brutal de caca no cemiterio.
XP_TABLE = [0, 0, 50, 150, 350, 700,
            1300, 2300, 4000, 6500, 12000,
            26000, 56000, 120000, 250000, 520000,
            1050000, 2100000, 4200000, 8400000, 16800000]

# XP de DESCOBERTA por mapa (1a visita). Mundos secretos valem mais.
MAP_XP = {
    "salao":            30,
    "rasharan":         150,
    "valoran":          150,
    "fundamento":       200,
    "falanor":          150,
    "fadrakor_litoral": 120,
    "fadrakor_selva":   120,
    "fadrakor_vulcao":  120,
    "repouso_dama":     180,
    "avasham":          250,
    "valdarkram":        350,
}
GOD_XP = 100      # encontrar um deus (1a vez perto dele)
SECRET_XP = 200   # benção / segredo raro (ex.: benção do Pofnir)

_AVG = {6: 4, 8: 5, 10: 6, 12: 7}   # media fixa do dado (die//2 + 1)


def proficiency_bonus(level):
    return 2 + (max(1, min(MAX_LEVEL, level)) - 1) // 4


def map_xp(mp):
    """XP por descobrir um mapa pela 1a vez."""
    if mp == "ermo":
        return 0                       # o lar nao conta
    if mp.startswith("casa_"):
        return 15                      # entrar numa casa
    return MAP_XP.get(mp, 40)          # mapa novo generico


def level_for_xp(xp):
    lvl = 1
    for L in range(2, MAX_LEVEL + 1):
        if xp >= XP_TABLE[L]:
            lvl = L
        else:
            break
    return lvl


def xp_progress(xp):
    """(xp_dentro_do_nivel, xp_total_do_nivel, nivel). No 20: (0, 0, 20)."""
    lvl = level_for_xp(xp)
    if lvl >= MAX_LEVEL:
        return (0, 0, MAX_LEVEL)
    base, nxt = XP_TABLE[lvl], XP_TABLE[lvl + 1]
    return (xp - base, nxt - base, lvl)


def _perm_hp_bonus(ficha, level):
    """Bonus de vida maxima PERMANENTES (fora do nivel): bencao do Pofnir (+5) e
    o talento Robusto (+2/nivel)."""
    from . import feats
    b = 5 if ficha.get("blessing_pofnir") else 0
    for fid in ficha.get("feats", []):
        fd = feats.get(fid)
        if fd and fd.get("hp_per_level"):
            b += int(fd["hp_per_level"]) * max(1, level)
    return b


def asi_levels(class_id):
    from . import class_features
    return class_features.asi_levels(class_id)


def sync_asi(ficha):
    """Enfileira as escolhas de ASI/talento pendentes ao cruzar os niveis certos."""
    cid = ficha.get("class_id")
    if not cid:
        return
    lvl = ficha.get("level", 1)
    seen = ficha.setdefault("asi_seen", [])
    pend = ficha.setdefault("pending_asi", [])
    for L in sorted(asi_levels(cid)):
        if L <= lvl and L not in seen:
            seen.append(L)
            pend.append(L)


def hp_for_level(hd, con_mod, level):
    """Vida total no nivel: L1 = max do dado + CON; cada nivel a mais soma a media
    do dado + CON (minimo 1 por nivel)."""
    hp = max(1, hd + con_mod)
    per = max(1, _AVG.get(hd, hd // 2 + 1) + con_mod)
    return hp + per * (max(1, level) - 1)


# ===========================================================================
#  RECURSOS DE CLASSE (camada C): espacos de magia, Ki, Furia, etc.
#  Recarga e por andar (temporario), feita em regen_resources().
# ===========================================================================
_FULL_SLOTS = {  # nivel do personagem -> [espacos por nivel de magia 1..9]
    1: [2], 2: [3], 3: [4, 2], 4: [4, 3], 5: [4, 3, 2], 6: [4, 3, 3],
    7: [4, 3, 3, 1], 8: [4, 3, 3, 2], 9: [4, 3, 3, 3, 1], 10: [4, 3, 3, 3, 2],
    11: [4, 3, 3, 3, 2, 1], 12: [4, 3, 3, 3, 2, 1], 13: [4, 3, 3, 3, 2, 1, 1],
    14: [4, 3, 3, 3, 2, 1, 1], 15: [4, 3, 3, 3, 2, 1, 1, 1], 16: [4, 3, 3, 3, 2, 1, 1, 1],
    17: [4, 3, 3, 3, 2, 1, 1, 1, 1], 18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
    19: [4, 3, 3, 3, 3, 2, 1, 1, 1], 20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
}
_HALF_SLOTS = {  # paladino/patrulheiro (comeca no nivel 2)
    1: [], 2: [2], 3: [3], 4: [3], 5: [4, 2], 6: [4, 2], 7: [4, 3], 8: [4, 3],
    9: [4, 3, 2], 10: [4, 3, 2], 11: [4, 3, 3], 12: [4, 3, 3], 13: [4, 3, 3, 1],
    14: [4, 3, 3, 1], 15: [4, 3, 3, 2], 16: [4, 3, 3, 2], 17: [4, 3, 3, 3, 1],
    18: [4, 3, 3, 3, 1], 19: [4, 3, 3, 3, 2], 20: [4, 3, 3, 3, 2],
}
_PACT = {  # bruxo: (qtd de espacos, nivel deles)
    1: (1, 1), 2: (2, 1), 3: (2, 2), 4: (2, 2), 5: (2, 3), 6: (2, 3), 7: (2, 4),
    8: (2, 4), 9: (2, 5), 10: (2, 5), 11: (3, 5), 12: (3, 5), 13: (3, 5), 14: (3, 5),
    15: (3, 5), 16: (3, 5), 17: (4, 5), 18: (4, 5), 19: (4, 5), 20: (4, 5),
}
_RAGE = {1: 2, 2: 2, 3: 3, 4: 3, 5: 3, 6: 4, 7: 4, 8: 4, 9: 4, 10: 4, 11: 4,
         12: 5, 13: 5, 14: 5, 15: 5, 16: 5, 17: 6, 18: 6, 19: 6, 20: 6}

FULL_CASTERS = {"mago", "clerigo", "druida", "bardo", "feiticeiro"}
HALF_CASTERS = {"paladino", "patrulheiro"}


def _slots_for(class_id, level):
    level = max(1, min(MAX_LEVEL, level))
    if class_id in FULL_CASTERS:
        row = _FULL_SLOTS.get(level, [])
    elif class_id in HALF_CASTERS:
        row = _HALF_SLOTS.get(level, [])
    elif class_id == "bruxo":
        qtd, lv = _PACT.get(level, (1, 1))
        return {str(lv): qtd}
    else:
        return {}
    return {str(i + 1): n for i, n in enumerate(row) if n > 0}


def _resource_maxes(ficha):
    cid = ficha.get("class_id")
    lvl = max(1, min(MAX_LEVEL, int(ficha.get("level", 1))))
    final = ficha.get("attrs_final") or ficha.get("attrs") or {}
    res = {}
    if cid == "barbaro":
        res["rage"] = _RAGE.get(lvl, 2)
    elif cid == "guerreiro":
        res["second_wind"] = 1
        if lvl >= 2:
            res["action_surge"] = 2 if lvl >= 17 else 1
    elif cid == "monge" and lvl >= 2:
        res["ki"] = lvl
    elif cid == "paladino":
        res["lay_on_hands"] = 5 * lvl
    elif cid == "feiticeiro" and lvl >= 2:
        res["sorcery"] = lvl
    elif cid == "bardo":
        res["bardic"] = max(1, races.attr_mod(int(final.get("CAR", 10))))
    return res, _slots_for(cid, lvl)


def compute_resources(ficha):
    """Preenche ficha['res'] com os recursos da classe. Recurso novo nasce cheio;
    o existente mantem o gasto atual (a recarga e por andar)."""
    cid = ficha.get("class_id")
    if not cid:
        ficha.pop("res", None)
        return ficha
    maxes, slots = _resource_maxes(ficha)
    old = ficha.get("res") or {}
    res = {}
    for k, mx in maxes.items():
        ocur = (old.get(k) or {}).get("cur")
        res[k] = {"cur": (mx if ocur is None else min(int(ocur), mx)), "max": mx}
    if slots:
        oslots = old.get("slots") or {}
        sres = {}
        for lv, mx in slots.items():
            ocur = (oslots.get(lv) or {}).get("cur")
            sres[lv] = {"cur": (mx if ocur is None else min(int(ocur), mx)), "max": mx}
        res["slots"] = sres
    ficha["res"] = res
    return ficha


def regen_resources(ficha, ticks=1):
    """Recupera 'ticks' de cada recurso (limitado ao maximo). True se algo mudou."""
    res = ficha.get("res")
    if not res:
        return False
    changed = False
    for k, v in res.items():
        if k == "slots":
            for sv in v.values():
                if sv["cur"] < sv["max"]:
                    sv["cur"] = min(sv["max"], sv["cur"] + ticks)
                    changed = True
        elif v["cur"] < v["max"]:
            v["cur"] = min(v["max"], v["cur"] + ticks)
            changed = True
    return changed


def recompute(ficha):
    """Recalcula nivel, vida maxima e proficiencia a partir do XP e dos atributos.
    Sem classe ainda: so guarda o XP (nivel/vida nao mudam). Ao subir de nivel, a
    vida atual ganha o acrescimo (cura o ganho)."""
    if not ficha:
        return ficha
    xp = int(ficha.get("xp", 0))
    if not ficha.get("class_id"):
        ficha.setdefault("level", 1)
        return ficha
    lvl = level_for_xp(xp)
    final = ficha.get("attrs_final") or ficha.get("attrs") or {}
    con_mod = races.attr_mod(int(final.get("CON", 10)))
    hd = int(ficha.get("hd", 8))
    old_max = int(ficha.get("hp_max", 1))
    new_max = hp_for_level(hd, con_mod, lvl) + _perm_hp_bonus(ficha, lvl)
    cur = int(ficha.get("hp", new_max))
    if new_max > old_max:
        cur += (new_max - old_max)
    ficha["level"] = lvl
    ficha["hp_max"] = new_max
    ficha["hp"] = max(0, min(new_max, cur))
    ficha["prof"] = proficiency_bonus(lvl)
    sync_asi(ficha)                 # enfileira escolhas de ASI/talento pendentes
    compute_resources(ficha)        # recursos de classe (magia, Ki, Furia...)
    return ficha


def grant_xp(ficha, amount):
    """Soma XP e recalcula. Devolve (ficha, subiu_de_nivel, novo_nivel, ganho)."""
    ficha = ficha or {}
    amount = int(amount or 0)
    if amount <= 0:
        return ficha, False, ficha.get("level", 1), 0
    before = level_for_xp(int(ficha.get("xp", 0))) if ficha.get("class_id") else None
    ficha["xp"] = int(ficha.get("xp", 0)) + amount
    recompute(ficha)
    after = ficha.get("level", 1)
    leveled = bool(ficha.get("class_id")) and before is not None and after > before
    return ficha, leveled, after, amount
