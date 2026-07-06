import sys, random, statistics
sys.path.insert(0,'.')
from game import combat, items, spells, monsters as monsters_lib
from game.leveling import hp_for_level, proficiency_bonus
from game.classes import CLASS_HD
from game import races
random.seed(20260628)
SLOTS=("head","shoulder","back","chest","legs","feet")
ATTRS={"paladino":{"FOR":18,"DES":12,"CON":16,"INT":10,"SAB":12,"CAR":13},
       "guerreiro":{"FOR":18,"DES":14,"CON":16,"INT":10,"SAB":12,"CAR":10},
       "mago":{"FOR":8,"DES":14,"CON":14,"INT":18,"SAB":12,"CAR":10},
       "feiticeiro":{"FOR":8,"DES":14,"CON":14,"INT":10,"SAB":12,"CAR":18}}
def ficha(cid,lvl):
    hd=CLASS_HD[cid];cm=races.attr_mod(ATTRS[cid]["CON"]);hp=hp_for_level(hd,cm,lvl)
    return {"class_id":cid,"level":lvl,"prof":proficiency_bonus(lvl),"attrs":dict(ATTRS[cid]),"attrs_final":dict(ATTRS[cid]),"hp":hp,"hp_max":hp,"feats":[],"saves":{}}
def equip(cid,tier):
    e={"hand_r":"%s_%s_arma"%(tier,cid)}
    for s in SLOTS:
        i="%s_%s_%s"%(tier,cid,s)
        if i in items.ITEMS:e[s]=i
    sh="%s_%s_escudo"%(tier,cid)
    if sh in items.ITEMS:e["hand_l"]=sh
    return e
def comb(cid,tier,lvl):
    return combat.make_player_combatant(cid,{"name":cid,"x":1,"y":0,"equipment":equip(cid,tier)},ficha(cid,lvl))
def mon(mid):
    m=dict(monsters_lib.MONSTERS[mid]);m["id"]=mid;m["hp_max"]=m["hp"];m["x"]=2;m["y"]=0
    return combat.make_monster_combatant(m)
def martial_dpt(maker,mid,turns=40000):
    a=maker();tot=0
    for _ in range(turns):
        t=mon(mid);t["hp"]=t["hp_max"];t["alive"]=True
        enc={"combs":{a["cid"]:a,t["cid"]:t}}
        b=t["hp"];combat.attack(enc,a,t);tot+=b-t["hp"]
    return tot/turns
def spell_dpt(maker,mid,spell_id,turns=40000):
    a=maker();tot=0
    for _ in range(turns):
        t=mon(mid);t["hp"]=t["hp_max"];t["alive"]=True
        enc={"combs":{a["cid"]:a,t["cid"]:t}}
        b=t["hp"];combat.cast_spell(enc,a,spell_id,t);tot+=b-t["hp"]
    return tot/turns

print("="*86)
print("OFENSIVA: dano por turno (já com acerto/save). marcial=espada, caster=truque/magia")
print("="*86)
for tier,lvl in [("t1",8),("necro",12)]:
    pal=comb("paladino",tier,lvl); mg=comb("mago",tier,lvl)
    wpn=items.ITEMS["%s_paladino_arma"%tier]; mwp=items.ITEMS["%s_mago_arma"%tier]
    print("\n### %s, nível %d   (poder mágico do mago = %d)" % (tier.upper(), lvl, mg.get("spell_pow",0)))
    print("  arma paladino: %s  | cajado mago dmg: %s" % (wpn.get("dmg"), mwp.get("dmg")))
    # truque do mago escala: nivel 8 -> x2 dados, nivel 12 -> x3
    for mid,nome in [("lorde_varth","Varth(forte,AC23)"),("farao_avhur","Faraó(médio,AC18)"),("dama_noite","Dama(fraco,AC15)")]:
        mca=monsters_lib.MONSTERS[mid]
        pm=martial_dpt(lambda:comb("paladino",tier,lvl),mid)
        gm=martial_dpt(lambda:comb("mago",tier,lvl),mid)  # mago batendo de cajado (melee fraco)
        truque=spell_dpt(lambda:comb("mago",tier,lvl),mid,"raio_de_fogo")
        # melhor magia de nivel disponivel
        best = "bola_de_fogo" if lvl>=12 else "maos_flamejantes"
        nivelmag=spell_dpt(lambda:comb("mago",tier,lvl),mid,best)
        print("  vs %-20s AC%2d | paladino-espada %5.1f | mago-truque %5.1f | mago-%s %5.1f" % (
            nome, mca["ac"], pm, truque, best, nivelmag))
