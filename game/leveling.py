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

# XP ACUMULADO pra atingir cada nivel (index = nivel). XP_TABLE[1]=0 ... [20]=355000.
XP_TABLE = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
            85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000,
            305000, 355000]

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
