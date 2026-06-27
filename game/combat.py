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
import copy

from . import rules, races, spells, abilities as abil, items, monsters as monsters_lib


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
    # equipamento: armadura soma CA, anel/amuleto somam acerto, arma define o dano
    eq = items.equip_summary(player.get("equipment") or {})
    st["ac"] += eq["ac"]
    st["atk"] += eq["atk"]
    if eq["dmg"]:
        st["dmg"] = {"n": eq["dmg"]["n"], "d": eq["dmg"]["d"],
                     "flat": st["dmg"]["flat"] + int(eq["dmg"].get("flat", 0))}
    st["reach"] = int(eq.get("rng", 1)) or 1       # arco/cajado atacam o basico a distancia
    st["spell_pow"] = int(eq.get("spell_pow", 0))  # +poder magico (equip de caster)
    st["block"] = int(eq.get("block", 0))          # bloqueio do escudo (reduz dano por golpe)
    st["offhand"] = eq.get("offhand")              # segunda arma (duas armas; so vale pra classe permitida)
    # TALENTOS de combate que valem agora (os demais sao passivos/situacionais):
    feats = list(ficha.get("feats", []))
    if "movel" in feats:                       # Móvel: +deslocamento
        st["speed"] += 2
    if ("atacante_pesado" in feats) or ("atirador_elite" in feats):   # +dano de arma
        st["dmg"] = dict(st["dmg"]); st["dmg"]["flat"] = st["dmg"].get("flat", 0) + 3
    if "duas_armas" in feats:                   # Duas Armas: dano da mao secundaria
        st["dmg"] = dict(st["dmg"]); st["dmg"]["flat"] = st["dmg"].get("flat", 0) + 3
    if "sentinela" in feats:                    # Sentinela: guarda a posicao (+CA)
        st["ac"] += 2
    init_bonus = 5 if "alerta" in feats else 0  # Alerta: +5 de iniciativa
    fb = ficha.get("form_bonus") or {}           # bonus da forma assumida (transformacao)
    form_regen = int(ficha.get("form_regen", 0))
    if fb:
        st["ac"] += fb.get("ac", 0)
        st["speed"] += fb.get("speed", 0)
        st["atk"] += fb.get("atk", 0)
        if fb.get("dmg_flat"):
            st["dmg"] = dict(st["dmg"]); st["dmg"]["flat"] = st["dmg"].get("flat", 0) + fb["dmg_flat"]
    luck = 3 if "sortudo" in feats else 0       # Sortudo: re-rolagens de ataque ruim
    save_bonus = 1 if "iniciado_magia" in feats else 0      # Iniciado em Magia: +1 resistencias
    spell_bonus = 1 if "conjurador_guerra" in feats else 0  # Conjurador de Guerra: +1 ataque/CD magico
    cid = ficha.get("class_id")
    final = ficha.get("attrs_final") or ficha.get("attrs") or {}
    lvl = int(ficha.get("level", 1))
    prof = int(ficha.get("prof", 2))
    cast_attr = spells.CASTING.get(cid)
    cast_mod = races.attr_mod(int(final.get(cast_attr, 10))) if cast_attr else 0
    cs = spells.loadout_for(ficha)
    sneak = ((lvl + 1) // 2) if cid == "ladino" else 0
    rage_dmg = 2 if lvl < 9 else (3 if lvl < 16 else 4)
    return {
        "cid": sid, "kind": "player", "name": player.get("name", "Você"),
        "hp": int(ficha.get("hp", 1)), "hp_max": int(ficha.get("hp_max", 1)),
        "ac": st["ac"], "atk": st["atk"], "dmg": st["dmg"], "reach": st["reach"],
        "speed": st["speed"], "dex": st["dex"], "spell_pow": st["spell_pow"], "block": st["block"],
        "offhand": (st.get("offhand") if cid in items.DUAL_WIELD_CLASSES else None),
        "x": player["x"], "y": player["y"], "alive": True,
        "atk_name": "ataque", "level": lvl, "class_id": cid,
        "init_bonus": init_bonus, "feats": feats, "luck": luck,
        "regen": form_regen, "_form_bonus": dict(fb),
        "cast_attr": cast_attr, "cast_mod": cast_mod,
        "spell_atk": prof + cast_mod + spell_bonus, "spell_dc": 8 + prof + cast_mod + spell_bonus,
        "cantrips": list(cs.get("cantrips", [])), "spells_known": list(cs.get("spells", [])),
        "abilities": abil.for_class(cid) + list(ficha.get("god_abilities", [])), "sneak": sneak, "rage_dmg": rage_dmg,
        "res": copy.deepcopy(ficha.get("res") or {}),
        "raging": False, "bless_die": None, "smite_armed": False,
        "saves": {
            "FOR": races.attr_mod(int(final.get("FOR", 10))) + save_bonus, "DES": st["dex"] + save_bonus,
            "CON": races.attr_mod(int(final.get("CON", 10))) + save_bonus, "INT": races.attr_mod(int(final.get("INT", 10))) + save_bonus,
            "SAB": races.attr_mod(int(final.get("SAB", 10))) + save_bonus, "CAR": races.attr_mod(int(final.get("CAR", 10))) + save_bonus,
        },
    }


def make_monster_combatant(m):
    dexm = m.get("dex", 0)
    return {
        "cid": m["id"], "kind": "monster", "mid": m["id"], "name": m["name"],
        "mtype": m.get("type"), "boss": bool(m.get("boss")), "size": m.get("size"),
        "summon_type": m.get("summon_type"),
        "hp": int(m["hp"]), "hp_max": int(m["hp_max"]), "ac": m["ac"], "atk": m["atk"],
        "dmg": dict(m["dmg"]), "reach": m["reach"], "speed": m["speed"], "dex": dexm,
        "x": m["x"], "y": m["y"], "glyph": m.get("glyph"), "xp": m.get("xp", 0),
        "alive": True, "atk_name": m.get("atk_name", "ataque"),
        "saves": {"FOR": m.get("str_save", 0), "DES": dexm, "CON": m.get("con_save", 0),
                  "INT": 0, "SAB": m.get("wis_save", 0), "CAR": 0},
        "summons_left": int(m.get("summons") or 0), "enraged": False,
        "abilities": monsters_lib.abilities_for(m.get("type")),
    }


def apply_form(comb, bonus, regen):
    """Troca a forma de um combatente AO VIVO: reverte o bonus anterior e poe o novo.
    Usado quando o jogador se transforma durante o combate."""
    bonus = bonus or {}
    old = comb.get("_form_bonus") or {}
    comb["ac"] = comb.get("ac", 0) - old.get("ac", 0) + bonus.get("ac", 0)
    comb["speed"] = comb.get("speed", 6) - old.get("speed", 0) + bonus.get("speed", 0)
    comb["atk"] = comb.get("atk", 0) - old.get("atk", 0) + bonus.get("atk", 0)
    flat = comb.get("dmg", {}).get("flat", 0) - old.get("dmg_flat", 0) + bonus.get("dmg_flat", 0)
    comb["dmg"] = dict(comb.get("dmg") or {}); comb["dmg"]["flat"] = flat
    comb["_form_bonus"] = dict(bonus)
    comb["regen"] = int(regen or 0)


def make_summon_combatant(spec, mid, x, y):
    """Cria um combatente de reforco (o 'bonde' do chefe) a partir de um stat block,
    ja posicionado. Existe so dentro da luta (nao vira entidade do mundo)."""
    dexm = spec.get("dex", 0)
    return {
        "cid": mid, "kind": "monster", "mid": mid, "name": spec["name"],
        "mtype": spec.get("_type"), "boss": False,
        "hp": int(spec["hp"]), "hp_max": int(spec["hp"]), "ac": spec["ac"], "atk": spec["atk"],
        "dmg": dict(spec["dmg"]), "reach": spec["reach"], "speed": spec["speed"], "dex": dexm,
        "x": x, "y": y, "glyph": spec.get("glyph"), "xp": spec.get("xp", 0),
        "alive": True, "atk_name": spec.get("atk_name", "ataque"),
        "saves": {"FOR": 0, "DES": dexm, "CON": 0, "INT": 0, "SAB": 0, "CAR": 0},
        "summons_left": 0, "enraged": False, "summoned": True,
    }


def add_combatant(enc, comb):
    """Acrescenta um combatente a uma luta em andamento (entra no fim da ordem de
    iniciativa, age no proximo giro)."""
    enc["combs"][comb["cid"]] = comb
    enc["order"].append(comb["cid"])
    return comb


# -------------------------------------------------------------------- confronto

def start(player_combatant, monster_combatants, mp):
    combs = {player_combatant["cid"]: player_combatant}
    for mc in monster_combatants:
        combs[mc["cid"]] = mc
    for c in combs.values():
        c["_init"] = _d20() + c.get("dex", 0) + c.get("init_bonus", 0)
    order = sorted(combs.keys(), key=lambda cid: combs[cid]["_init"], reverse=True)
    enc = {"map": mp, "combs": combs, "order": order, "idx": 0, "round": 1,
           "move_left": 0, "action_used": False}
    _begin_turn(enc)
    return enc


def current(enc):
    return enc["combs"][enc["order"][enc["idx"]]]


def _begin_turn(enc):
    c = current(enc)
    enc["_turn_fx"] = tick_statuses(enc, c)            # DoT + decremento no inicio
    reg = c.get("regen", 0)                            # regeneracao da forma (ex: Maine Coon)
    enc["_regen_heal"] = 0
    if reg and c.get("alive"):
        heal = min(reg, c.get("hp_max", c["hp"]) - c["hp"])
        if heal > 0:
            c["hp"] += heal
            enc["_regen_heal"] = heal
    enc["move_left"] = 0 if is_restrained(c) else c.get("speed", 6)
    enc["action_used"] = False
    enc["bonus_used"] = False
    enc["sneak_used"] = False
    enc["_incap"] = is_incapacitated(c)


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


def _apply_damage(target, dmg):
    """Aplica dano ao alvo: a Furia corta pela metade o dano fisico, e o BLOQUEIO do
    escudo reduz um valor fixo de cada golpe (so quem tem escudo equipado tem block)."""
    if target.get("raging"):
        dmg = dmg // 2
    blk = int(target.get("block", 0))
    if blk and dmg > 0:
        dmg = max(0, dmg - blk)
    if dmg > 1 and has_status(target, "aurora"):      # Aurora de Valíria: no máximo 1 de dano por golpe
        dmg = 1
    if has_status(target, "facalan_folego"):          # 3 turnos pós-renascimento: nunca cai abaixo de 1
        dmg = min(dmg, max(0, target["hp"] - 1))
    target["hp"] = max(0, target["hp"] - dmg)
    if target["hp"] <= 0:
        if has_status(target, "facalan"):             # Forma de Facalan: não morre, volta ao normal com vida cheia
            (target.get("status") or {}).pop("facalan", None)
            bonus = int(target.get("_facalan_hp", 0))
            target["hp_max"] = max(1, target["hp_max"] - bonus)
            target["_facalan_hp"] = 0
            target["hp"] = target["hp_max"]
            apply_status(target, "facalan_folego", 3)
            target["_facalan_revived"] = True
        else:
            target["alive"] = False
    return dmg


def _mark_bonus(enc, attacker, target, crit):
    mk = enc.get("mark")
    if mk and mk.get("by") == attacker["cid"] and mk.get("target") == target["cid"]:
        return _roll_dmg(mk["die"], crit)
    return 0


def _save_mod(target, attr):
    return int((target.get("saves") or {}).get(attr, 0))


def _spend(res, key):
    v = res.get(key)
    if v and v.get("cur", 0) > 0:
        v["cur"] -= 1
        return True
    return False


def _spend_slot(res, min_level=1):
    slots = res.get("slots") or {}
    for lv in sorted(slots.keys(), key=lambda s: int(s)):
        if int(lv) >= min_level and slots[lv].get("cur", 0) > 0:
            slots[lv]["cur"] -= 1
            return int(lv)
    return 0


# ===========================================================================
#  MOTOR DE STATUS (Leva 3): efeitos de controle e dano-ao-longo-do-tempo.
#  c["status"][nome] = {"turns": N, "dmg": {n,d}?}. Tickam no INICIO do turno.
#    controle: stunned (perde o turno), restrained (deslocamento 0 + vantagem
#      contra/desvantagem dele), frightened/blinded (desvantagem), slowed.
#    DoT: poison/burning/bleeding (dano por turno; poison tambem desvantagem).
# ===========================================================================
INCAP_STATUS = ("stunned",)
DOT_STATUS = ("poison", "burning", "bleeding", "maldicao")

def apply_status(c, name, turns, dmg=None):
    """Aplica/renova um status no combatente (fica a maior duracao)."""
    if not c or not c.get("alive"):
        return
    st = c.setdefault("status", {})
    prev = st.get(name) or {}
    eff = {"turns": max(int(turns), int(prev.get("turns", 0)))}
    if dmg:
        eff["dmg"] = dmg
    elif prev.get("dmg"):
        eff["dmg"] = prev["dmg"]
    st[name] = eff

def has_status(c, name):
    return ((c.get("status") or {}).get(name, {}) or {}).get("turns", 0) > 0

def is_incapacitated(c):
    return any(has_status(c, k) for k in INCAP_STATUS)

def is_restrained(c):
    return has_status(c, "restrained")

def status_view(c):
    """Resumo dos status ativos pro cliente: {nome: turnos_restantes}."""
    st = c.get("status") or {}
    return {k: v.get("turns", 0) for k, v in st.items() if v.get("turns", 0) > 0}

def tick_statuses(enc, c):
    """No inicio do turno de c: aplica DoT, decrementa e remove expirados.
    Devolve evento {cid,name,fx:[...],dmg,hp,hp_max,killed} ou None."""
    st = c.get("status")
    if not st:
        return None
    fx = []; total = 0
    for name in list(st.keys()):
        eff = st[name]
        if name in DOT_STATUS and eff.get("dmg"):
            dd = _roll_dmg(eff["dmg"], False)
            total += dd
            fx.append({"type": name, "dmg": dd})
        eff["turns"] = int(eff.get("turns", 0)) - 1
        if eff["turns"] <= 0:
            del st[name]
            fx.append({"type": "expire", "status": name})
            if name == "facalan" and c.get("_facalan_hp"):   # a forma acabou: remove o +15 de vida máxima
                c["hp_max"] = max(1, c["hp_max"] - int(c["_facalan_hp"]))
                c["hp"] = min(c["hp"], c["hp_max"])
                c["_facalan_hp"] = 0
    killed = False
    if total > 0:
        c["hp"] = max(0, c["hp"] - total)      # DoT ignora a resistencia da Furia
        if c["hp"] <= 0:
            c["alive"] = False; killed = True
    if not st:
        c.pop("status", None)
    if not fx:
        return None
    return {"cid": c["cid"], "name": c["name"], "fx": fx, "dmg": total,
            "hp": c["hp"], "hp_max": c["hp_max"], "killed": killed}

def _adv_dis(attacker, target):
    """+1 vantagem, -1 desvantagem, 0 normal, pelos status dos dois lados."""
    adv = 0
    if has_status(target, "restrained") or has_status(target, "stunned") or has_status(target, "blinded"):
        adv += 1
    if (has_status(attacker, "frightened") or has_status(attacker, "poisoned")
            or has_status(attacker, "blinded") or has_status(attacker, "restrained")
            or has_status(attacker, "maldicao")):
        adv -= 1
    return 1 if adv > 0 else (-1 if adv < 0 else 0)


def attack(enc, attacker, target):
    """Resolve um ataque 5e com os extras de classe: Benção na jogada, Furia/Marca/
    Furtivo/Castigo no dano, e resistencia no alvo."""
    ad = _adv_dis(attacker, target)
    d = max(_d20(), _d20()) if ad > 0 else (min(_d20(), _d20()) if ad < 0 else _d20())
    if attacker.get("luck", 0) > 0 and d <= 7:        # Sortudo: re-rola um ataque ruim
        nd = _d20()
        if nd > d:
            d = nd
        attacker["luck"] -= 1
    crit = (d == 20)
    total = d + attacker.get("atk", 0)
    if attacker.get("bless_die"):
        total += _roll_dmg(attacker["bless_die"], False)
        attacker["bless_die"] = None        # Bencao/Inspiracao valem pro proximo ataque
    eff_ac = target["ac"] + (10 if has_status(target, "facalan") else 0)   # Forma de Facalan: +10 de armadura
    hit = crit or (d != 1 and total >= eff_ac)
    evaded = bool(target.get("evade_next"))           # Milésima Saída: o alvo some, este ataque erra
    if evaded:
        target["evade_next"] = False
        hit = crit = False
    res = {"attacker": attacker["cid"], "attacker_name": attacker["name"],
           "target": target["cid"], "target_name": target["name"],
           "d20": d, "total": total, "crit": crit, "hit": hit, "dmg": 0, "adv": ad,
           "atk_name": attacker.get("atk_name", "ataque"), "killed": False, "evaded": evaded,
           "target_hp": target["hp"], "target_hp_max": target["hp_max"]}
    if hit:
        dmg = _roll_dmg(attacker["dmg"], crit)
        if has_status(attacker, "facalan"):               # Forma de Facalan: +2 dados de dano
            dmg += _roll_dmg({"n": 2, "d": attacker["dmg"].get("d", 6)}, crit)
        if attacker.get("offhand"):                       # duas armas: golpe extra da mao secundaria
            od = _roll_dmg(attacker["offhand"], crit)
            dmg += od
            res["offhand_dmg"] = od
        if attacker.get("raging"):
            dmg += attacker.get("rage_dmg", 0)
        dmg += _mark_bonus(enc, attacker, target, crit)
        if attacker.get("class_id") == "ladino" and attacker.get("sneak") and not enc.get("sneak_used"):
            dmg += _roll_dmg({"n": attacker["sneak"], "d": 6}, crit)
            enc["sneak_used"] = True
            res["sneak"] = True
        if attacker.get("smite_armed"):
            lv = _spend_slot(attacker.get("res") or {})
            if lv:
                sd = _roll_dmg({"n": lv + 1, "d": 6}, crit)   # 2d6 no nivel 1, +1d6/nivel acima
                dmg += sd
                res["smite"] = True
                res["smite_dmg"] = sd                          # dano divino separado (pro somatorio)
            attacker["smite_armed"] = False
        if has_status(attacker, "aurora_fraca"):          # Aurora de Valíria: ele causa metade do dano
            dmg = dmg // 2
        if attacker.get("double_next"):                   # Poção Divina: este golpe vale o dobro
            dmg *= 2
            attacker["double_next"] = False
            res["doubled"] = True
        dealt = _apply_damage(target, dmg)
        res["dmg"] = dealt
        res["target_hp"] = target["hp"]
        if not target.get("alive"):
            res["killed"] = True
    return res


def _castmod(c):
    return int(c.get("cast_mod", 0))


def _spow(c):
    """+poder magico do equipamento de caster, somado no dano de cada magia."""
    return int(c.get("spell_pow", 0))


def _scaled_dmg(sp, caster):
    """Truques (nivel 0) ganham mais dados conforme o nivel do conjurador: 1/5/11/17."""
    dmg = sp.get("dmg")
    if not dmg or sp.get("level", 0) != 0:
        return dmg
    lvl = int(caster.get("level", 1))
    tier = 1 + (lvl >= 5) + (lvl >= 11) + (lvl >= 17)
    if tier <= 1:
        return dmg
    out = dict(dmg); out["n"] = int(dmg.get("n", 1)) * tier
    return out


def cast_spell(enc, caster, spell_id, target):
    """Conjura uma magia/truque. Truque nao gasta espaco; magia de nivel gasta um
    espaco daquele nivel (ou maior). Devolve o resultado pro cliente animar."""
    sp = spells.get(spell_id)
    if not sp:
        return {"kind": "spell", "error": True}
    res = {"kind": "spell", "spell": spell_id, "name": sp["name"], "level": sp["level"],
           "caster": caster["cid"], "caster_name": caster["name"]}
    if sp["level"] > 0:
        used = _spend_slot(caster.get("res") or {}, sp["level"])
        if not used:
            return {"kind": "spell", "no_slot": True, "name": sp["name"]}
        res["slot"] = used
    k = sp["kind"]
    if k == "attack":
        d = _d20(); crit = (d == 20)
        total = d + caster.get("spell_atk", 0)
        hit = crit or (d != 1 and total >= target["ac"])
        res.update({"target": target["cid"], "target_name": target["name"], "d20": d,
                    "total": total, "hit": hit, "crit": crit, "dmg": 0})
        if hit:
            dmg = _roll_dmg(_scaled_dmg(sp, caster), crit) + _mark_bonus(enc, caster, target, crit) + _spow(caster)
            res["dmg"] = _apply_damage(target, dmg)
            res["target_hp"] = target["hp"]; res["killed"] = not target.get("alive")
    elif k == "save":
        roll = _d20() + _save_mod(target, sp["save"])
        success = roll >= caster.get("spell_dc", 10)
        dmg = _roll_dmg(_scaled_dmg(sp, caster), False) + _spow(caster)
        if success:
            dmg = dmg // 2 if sp.get("save_effect") == "half" else 0
        res.update({"target": target["cid"], "target_name": target["name"], "save": sp["save"],
                    "save_roll": roll, "dc": caster.get("spell_dc"), "success": success,
                    "dmg": (_apply_damage(target, dmg) if dmg > 0 else 0)})
        res["target_hp"] = target["hp"]; res["killed"] = not target.get("alive")
    elif k == "auto":
        darts = int(sp.get("darts", 1))
        dmg = sum(_roll_dmg(sp["dmg"], False) for _ in range(darts)) + _spow(caster)
        res.update({"target": target["cid"], "target_name": target["name"], "auto": True,
                    "darts": darts, "dmg": _apply_damage(target, dmg)})
        res["target_hp"] = target["hp"]; res["killed"] = not target.get("alive")
    elif k == "heal":
        amt = _roll_dmg(sp["heal"], False) + (_castmod(caster) if sp["heal"].get("mod") else 0)
        before = caster["hp"]; caster["hp"] = min(caster["hp_max"], caster["hp"] + amt)
        res.update({"heal": caster["hp"] - before, "target": caster["cid"], "self": True})
    elif k == "mark":
        enc["mark"] = {"by": caster["cid"], "target": target["cid"], "die": sp["mark_die"], "name": sp["name"]}
        res.update({"mark": True, "target": target["cid"], "target_name": target["name"]})
    elif k == "buff":
        caster["bless_die"] = sp.get("buff_die")
        res.update({"buff": True, "target": caster["cid"], "self": True})
    elif k == "control":
        # magia de controle: o alvo testa resistencia; falhou sofre o status
        # (e dano opcional). 'status' = nome do efeito; 'turns' a duracao; 'dot' o
        # dano por turno (pra veneno/fogo continuo).
        roll = _d20() + _save_mod(target, sp["save"])
        success = roll >= caster.get("spell_dc", 10)
        dmg = 0
        if sp.get("dmg"):
            dmg = _roll_dmg(sp["dmg"], False) + _spow(caster)
            if success:
                dmg = dmg // 2 if sp.get("save_effect") == "half" else 0
        applied = None
        if not success:
            apply_status(target, sp["status"], int(sp.get("turns", 1)), sp.get("dot"))
            applied = sp["status"]
        res.update({"target": target["cid"], "target_name": target["name"], "save": sp["save"],
                    "save_roll": roll, "dc": caster.get("spell_dc"), "success": success,
                    "control": applied, "status": sp.get("status"), "turns": int(sp.get("turns", 1)),
                    "dmg": (_apply_damage(target, dmg) if dmg > 0 else 0)})
        res["target_hp"] = target["hp"]; res["killed"] = not target.get("alive")
    return res


def use_ability(enc, actor, aid, target=None):
    """Usa uma habilidade de classe. Devolve resultado; 'fail' True se faltou recurso
    ou alvo. NAO consome acao/bonus aqui (quem chama controla o turno)."""
    res = {"kind": "ability", "ability": aid, "actor": actor["cid"]}
    meta = abil.get(aid) or {}
    res["name"] = meta.get("name", aid)
    R = actor.get("res") or {}
    if aid == "rage":
        if not _spend(R, "rage"):
            res["fail"] = True; return res
        actor["raging"] = True; res["rage"] = True
    elif aid == "second_wind":
        if not _spend(R, "second_wind"):
            res["fail"] = True; return res
        amt = _roll_dmg({"n": 1, "d": 10, "flat": actor.get("level", 1)}, False)
        before = actor["hp"]; actor["hp"] = min(actor["hp_max"], actor["hp"] + amt)
        res.update({"heal": actor["hp"] - before, "self": True, "target": actor["cid"]})
    elif aid == "action_surge":
        if not _spend(R, "action_surge"):
            res["fail"] = True; return res
        enc["action_used"] = False; res["surge"] = True
    elif aid == "lay_on_hands":
        pool = R.get("lay_on_hands")
        need = actor["hp_max"] - actor["hp"]
        if not pool or pool.get("cur", 0) <= 0 or need <= 0:
            res["fail"] = True; return res
        amt = min(pool["cur"], need)
        pool["cur"] -= amt
        before = actor["hp"]; actor["hp"] = min(actor["hp_max"], actor["hp"] + amt)
        res.update({"heal": actor["hp"] - before, "self": True, "target": actor["cid"]})
    elif aid == "flurry":
        if not target or not _spend(R, "ki"):
            res["fail"] = True; return res
        res["attacks"] = [attack(enc, actor, target), attack(enc, actor, target)]
    elif aid == "martial_arts":
        if not target:
            res["fail"] = True; return res
        res["attacks"] = [attack(enc, actor, target)]
    elif aid == "bardic":
        if not _spend(R, "bardic"):
            res["fail"] = True; return res
        actor["bless_die"] = {"n": 1, "d": 6}; res.update({"buff": True, "self": True})
    elif aid == "divine_smite":
        actor["smite_armed"] = True; res["armed"] = True
    elif aid == "milesima_saida":
        if actor.get("_milesima_used"):
            res["fail"] = True; return res
        actor["_milesima_used"] = True
        actor["evade_next"] = True               # o proximo ataque inimigo erra
        amt = _roll_dmg({"n": 2, "d": 6, "flat": 0}, False)
        before = actor["hp"]; actor["hp"] = min(actor["hp_max"], actor["hp"] + amt)
        res.update({"heal": actor["hp"] - before, "self": True, "target": actor["cid"], "evade": True})
    elif aid == "aurora_valiria":
        if actor.get("_aurora_used"):
            res["fail"] = True; return res
        actor["_aurora_used"] = True
        apply_status(actor, "aurora", 6)             # 6 turnos: teto de 1 de dano + provoca os inimigos
        apply_status(actor, "aurora_fraca", 9)       # 9 turnos: o dano que ELE causa cai pela metade
        res.update({"aura": True, "self": True, "target": actor["cid"]})
    elif aid == "forma_facalan":
        if actor.get("_facalan_used"):
            res["fail"] = True; return res
        actor["_facalan_used"] = True
        actor["_facalan_hp"] = 15
        actor["hp_max"] += 15
        actor["hp"] = actor["hp_max"]                # cura toda a vida (e os +15 novos)
        apply_status(actor, "facalan", 10)           # 10 turnos: +10 AC, +2 dados de dano, pantera dourada
        res.update({"facalan": True, "heal": True, "self": True, "target": actor["cid"]})
    else:
        res["fail"] = True
    return res


def _ability_view(me):
    R = me.get("res") or {}
    out = []
    for aid in me.get("abilities", []):
        meta = abil.get(aid) or {}
        ready = True
        if aid == "rage":
            ready = (R.get("rage", {}).get("cur", 0) > 0)
        elif aid == "second_wind":
            ready = (R.get("second_wind", {}).get("cur", 0) > 0)
        elif aid == "action_surge":
            ready = (R.get("action_surge", {}).get("cur", 0) > 0)
        elif aid == "flurry":
            ready = (R.get("ki", {}).get("cur", 0) > 0)
        elif aid == "lay_on_hands":
            ready = (R.get("lay_on_hands", {}).get("cur", 0) > 0)
        elif aid == "bardic":
            ready = (R.get("bardic", {}).get("cur", 0) > 0)
        out.append({"id": aid, "name": meta.get("name", aid), "slot": meta.get("slot", "action"),
                    "target": bool(meta.get("target")), "desc": meta.get("desc", ""), "ready": ready})
    return out


def _spell_view(me):
    out = []
    slots = (me.get("res") or {}).get("slots", {})
    def slot_for(lvl):                       # menor espaco >= lvl com carga
        for k in sorted(slots.keys(), key=lambda s: int(s)):
            if int(k) >= lvl and slots[k].get("cur", 0) > 0:
                return int(k)
        return None
    for sid in me.get("cantrips", []):
        sp = spells.get(sid)
        if sp:
            out.append({"id": sid, "name": sp["name"], "level": 0, "kind": sp["kind"],
                        "range": sp["range"], "desc": sp["desc"], "castable": True})
    for sid in me.get("spells_known", []):
        sp = spells.get(sid)
        if sp:
            usable = slot_for(sp["level"])
            out.append({"id": sid, "name": sp["name"], "level": sp["level"], "kind": sp["kind"],
                        "range": sp["range"], "desc": sp["desc"],
                        "castable": usable is not None, "slot_used": usable})
    return out


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


def monster_ability(enc, mon, tgt, ab):
    """Resolve uma habilidade especial de monstro. Devolve no formato de um ataque
    (pro cliente animar), com extras: applied(status), self_heal, save/gaze."""
    kind = ab.get("type", "inflict")
    res = {"attacker": mon["cid"], "attacker_name": mon["name"], "target": tgt["cid"],
           "target_name": tgt["name"], "ability": ab.get("name", "habilidade"),
           "mon_ability": True, "dmg": 0, "killed": False, "atk_name": ab.get("name", ""),
           "target_hp": tgt["hp"], "target_hp_max": tgt["hp_max"]}
    # AoE explosivo: a magia estoura e acerta TODOS os jogadores vivos (teste pra metade do dano)
    if ab.get("aoe"):
        save = ab.get("save")
        dc = int(ab.get("dc", 14))
        splash = []
        for pl in alive_of(enc, "player"):
            dd = _roll_dmg(ab.get("dmg_bonus", {"n": 6, "d": 6}), False)
            saved = False
            if save and (_d20() + _save_mod(pl, save)) >= dc:
                saved = True; dd = dd // 2
            _apply_damage(pl, dd)
            if ab.get("status") and pl.get("alive") and not saved:
                apply_status(pl, ab["status"], int(ab.get("turns", 1)), ab.get("dot"))
            splash.append({"cid": pl["cid"], "name": pl["name"], "dmg": dd,
                           "hp": pl["hp"], "hp_max": pl["hp_max"], "killed": not pl.get("alive")})
        res.update({"aoe": True, "splash": splash, "save": save, "dc": dc,
                    "applied": ab.get("status"),
                    "dmg": (splash[0]["dmg"] if splash else 0),
                    "target_hp": tgt["hp"], "killed": not tgt.get("alive")})
        return res
    if kind == "summon":
        have = int(mon.get("summons_left", 0))
        n = min(int(ab.get("count", 2)), have)
        if n > 0:
            mon["summons_left"] = have - n
        res.update({"summon": True, "summon_count": n, "self": True,
                    "atk_name": ab.get("name", ""),
                    "mon_hp": mon["hp"], "mon_hp_max": mon["hp_max"]})
        return res
    if kind == "heal":
        amt = _roll_dmg(ab.get("heal", {"n": 4, "d": 8}), False)
        before = mon["hp"]; mon["hp"] = min(mon["hp_max"], mon["hp"] + amt)
        res.update({"self_heal": mon["hp"] - before, "self": True,
                    "mon_hp": mon["hp"], "mon_hp_max": mon["hp_max"]})
        return res
    if kind in ("gaze", "fear"):
        save = ab.get("save", "CON")
        roll = _d20() + _save_mod(tgt, save)
        dc = int(ab.get("dc", 13))
        success = roll >= dc
        res.update({"save": save, "save_roll": roll, "dc": dc, "success": success, "gaze": True})
        if not success:
            apply_status(tgt, ab["status"], int(ab.get("turns", 1)), ab.get("dot"))
            res["applied"] = ab["status"]
        return res
    # inflict / heavy / drain: rola um ATAQUE e, no acerto, aplica o efeito
    base = attack(enc, mon, tgt)
    res.update({"d20": base["d20"], "total": base["total"], "crit": base["crit"],
                "hit": base["hit"], "adv": base.get("adv", 0)})
    if base["hit"]:
        extra = 0
        if ab.get("dmg_bonus"):
            extra = _roll_dmg(ab["dmg_bonus"], base["crit"])
            _apply_damage(tgt, extra)
        dealt = base["dmg"] + extra
        res["dmg"] = dealt
        if kind == "drain" and dealt > 0:
            before = mon["hp"]; mon["hp"] = min(mon["hp_max"], mon["hp"] + dealt)
            res.update({"self_heal": mon["hp"] - before, "mon_hp": mon["hp"], "mon_hp_max": mon["hp_max"]})
        if ab.get("status") and tgt.get("alive"):
            apply_status(tgt, ab["status"], int(ab.get("turns", 1)), ab.get("dot"))
            res["applied"] = ab["status"]
        res["target_hp"] = tgt["hp"]
        res["killed"] = not tgt.get("alive")
    else:
        res["target_hp"] = tgt["hp"]
    return res


def _pick_monster_ability(enc, mon):
    """Escolhe uma habilidade pronta (fora de cooldown) se a sorte bater."""
    abl = mon.get("abilities")
    if not abl:
        return None
    cds = mon.setdefault("_ab_cd", {})
    rnd = enc.get("round", 1)
    for ab in abl:
        aid = ab.get("id")
        if rnd < cds.get(aid, 0):
            continue
        if random.random() <= ab.get("chance", 0.35):
            cds[aid] = rnd + int(ab.get("cd", 2))
            return ab
    return None


def monster_decide(enc, monster):
    """IA simples: mira o jogador vivo mais perto, anda ate ele (ate o speed) e
    ataca se chegar no alcance. Devolve (passos [(x,y)...], resultado_do_ataque|None)."""
    if is_incapacitated(monster):
        return ([], None)                              # atordoado: perde o turno
    targets = alive_of(enc, "player")
    if not targets:
        return ([], None)
    taunters = [t for t in targets if has_status(t, "aurora")]    # Aurora de Valíria: força o foco
    if taunters:
        targets = taunters
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
    if not in_reach(monster, tgt):
        return (steps, None)
    ab = _pick_monster_ability(enc, monster)
    if ab:
        return (steps, monster_ability(enc, monster, tgt, ab))
    return (steps, attack(enc, monster, tgt))


def boss_turn(enc, boss):
    """Turno do chefe Maurao da Sapo. Pode entrar em furia abaixo de 30% (uma vez),
    invocar o bonde (gasta o turno) e provocar. Devolve um dict; quem chama (app)
    cria os reforcos e escolhe a fala pela categoria 'say_cat'."""
    out = {"steps": [], "atk": None, "summon": False, "summon_count": 0,
           "say_cat": None, "enraged": False}
    if is_incapacitated(boss):
        return out                                     # atordoado: perde o turno
    targets = alive_of(enc, "player")
    if not targets:
        return out
    taunters = [t for t in targets if has_status(t, "aurora")]    # Aurora de Valíria: força o foco
    if taunters:
        targets = taunters
    tgt = min(targets, key=lambda t: abs(t["x"] - boss["x"]) + abs(t["y"] - boss["y"]))
    hpfrac = boss["hp"] / max(1, boss["hp_max"])
    # 1) furia abaixo de 30% (uma vez): dano e ataque sobem, fica mais rapido
    if hpfrac <= 0.30 and not boss.get("enraged"):
        boss["enraged"] = True
        d = boss["dmg"]
        boss["dmg"] = {"n": d.get("n", 1) + 2, "d": d.get("d", 6), "flat": d.get("flat", 0) + 6}
        boss["atk"] = boss.get("atk", 0) + 3
        boss["speed"] = boss.get("speed", 6) + 1
        boss["_ab_cd"] = {}                  # enlouqueceu: zera os cooldowns e despeja habilidades
        out["enraged"] = True
        out["say_cat"] = "enrage"
    # 2) chama o bonde (gasta o turno): tem invocacoes e a vida ja baixou (<=70%)
    alive_mobs = len(alive_of(enc, "monster"))
    if (not out["enraged"] and boss.get("summons_left", 0) > 0
            and alive_mobs < 6 and hpfrac <= 0.70):
        boss["summons_left"] -= 1
        out["summon"] = True
        out["summon_count"] = 2 if hpfrac <= 0.35 else 1
        out["say_cat"] = "summon"
        return out
    # 3) turno normal: anda ate o alvo e ataca
    budget = boss.get("speed", 6)
    while budget > 0 and not in_reach(boss, tgt):
        nx, ny = _step_toward(enc, boss, tgt)
        if nx is None:
            break
        boss["x"], boss["y"] = nx, ny
        out["steps"].append((nx, ny))
        budget -= 1
    if in_reach(boss, tgt):
        ab = _pick_monster_ability(enc, boss)              # chefe tambem usa habilidade
        out["atk"] = monster_ability(enc, boss, tgt, ab) if ab else attack(enc, boss, tgt)
    if not out["say_cat"]:
        out["say_cat"] = "taunt"
    return out


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
            "mtype": c.get("mtype"), "boss": bool(c.get("boss")), "enraged": bool(c.get("enraged")),
            "size": c.get("size"),
            "you": (cid == my_cid), "current": (cid == cur_cid), "ac": c["ac"],
            "status": status_view(c),
        })
    me = enc["combs"].get(my_cid)
    your = None
    if me and me.get("kind") == "player":
        is_my_turn = (cur_cid == my_cid)
        your = {
            "res": me.get("res") or {},
            "raging": me.get("raging", False),
            "smite_armed": me.get("smite_armed", False),
            "cast_attr": me.get("cast_attr"),
            "abilities": _ability_view(me),
            "spells": _spell_view(me),
            "mark": enc.get("mark"),
            "bonus_used": enc.get("bonus_used", False) if is_my_turn else True,
            "action_used": enc.get("action_used", False) if is_my_turn else True,
            "incapacitated": is_incapacitated(me),
            "reach": int(me.get("reach", 1)),
            "block": int(me.get("block", 0)),
            "status": status_view(me),
        }
    return {
        "combatants": combs, "order": list(enc["order"]),
        "turn": cur_cid, "round": enc["round"],
        "your_turn": (cur_cid == my_cid),
        "your_move": enc["move_left"] if cur_cid == my_cid else 0,
        "your_action": (not enc["action_used"]) if cur_cid == my_cid else False,
        "your": your,
    }
