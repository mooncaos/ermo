"""
OS ITENS — catalogo do que existe no mundo.

Fonte unica da verdade sobre cada item: nome, tipo, se empilha, e a cor que
o cliente usa pra desenhar. Adicionar item novo e somar UMA entrada em ITEMS.

Tambem mora aqui:
  - GROUND_SPAWNS: o que fica largado no chao pra pegar (e em quanto tempo
    reaparece depois de pego, pra dar pra testar a vontade).
  - starting_inventory(): o gancho pros itens iniciais. Por enquanto devolve
    mochila vazia; quando voce quiser dar itens de largada, e so preencher.
  - operacoes sobre uma "bag" (lista de pilhas {item, qty}).
"""

ITEMS = {
    "coin_bronze":  {"name": "Moeda de Bronze", "kind": "currency", "stackable": True,  "color": "#cd7f32", "value": 1},
    "coin_silver":  {"name": "Moeda de Prata",  "kind": "currency", "stackable": True,  "color": "#cbd2d9", "value": 100},
    "coin_gold":    {"name": "Moeda de Ouro",   "kind": "currency", "stackable": True,  "color": "#f4b860", "value": 10000},
    "pocao_vida":   {"name": "Poção de Vida",   "kind": "consumivel", "stackable": True, "color": "#d6314a", "visual": "potion", "heal": 1.0, "value": 400},
    "staff_portuz": {"name": "Cajado do Portuz", "kind": "weapon",   "stackable": False, "color": "#9b6dff",
                     "slot": "hand", "visual": "staff", "rarity": "raro", "dmg": {"n": 1, "d": 6}, "atk": 1},
    "cajado_magico": {"name": "Cajado Mágico", "kind": "weapon", "stackable": False, "color": "#7ad6ff",
                      "slot": "hand", "visual": "staff_magic", "rarity": "lendario",
                      "dmg": {"n": 1, "d": 10}, "atk": 3, "armor": 2, "value": 2000},

    # --- equipamento inicial (o kit simples da Robetina, assistente social) ---
    "touca_la":         {"name": "Touca de Lã",      "kind": "armor",   "stackable": False, "color": "#8a7d63", "slot": "head",     "visual": "helmet",   "rarity": "comum", "ac": 0, "value": 4},
    "camiseta_surrada": {"name": "Camiseta Surrada", "kind": "armor",   "stackable": False, "color": "#b6532f", "slot": "chest",    "visual": "shirt",    "rarity": "comum", "armor": 1, "value": 6},
    "ombreira_couro":   {"name": "Ombreira de Couro","kind": "armor",   "stackable": False, "color": "#6e573e", "slot": "shoulder", "visual": "pauldron", "rarity": "comum", "ac": 0, "value": 5},
    "capa_puida":       {"name": "Capa Puída",       "kind": "armor",   "stackable": False, "color": "#5a5a6a", "slot": "back",     "visual": "cloak",    "rarity": "comum", "ac": 0, "value": 5},
    "calca_jeans":      {"name": "Calça Jeans",      "kind": "armor",   "stackable": False, "color": "#3a5a86", "slot": "legs",     "visual": "pants",    "rarity": "comum", "armor": 1, "value": 6},
    "chinelo":          {"name": "Chinelo de Dedo",  "kind": "armor",   "stackable": False, "color": "#3a8a6a", "slot": "feet",     "visual": "sandal",   "rarity": "comum", "ac": 0, "value": 3},
    "faca_cozinha":     {"name": "Faca de Cozinha",  "kind": "weapon",  "stackable": False, "color": "#cbd2d9", "slot": "hand_r",   "visual": "knife",    "rarity": "comum", "dmg": {"n": 1, "d": 4}, "value": 6},
    "tampa_panela":     {"name": "Tampa de Panela",  "kind": "armor",   "stackable": False, "color": "#9aa0aa", "slot": "hand_l",   "visual": "lid",      "rarity": "comum", "block": 1, "value": 5},
    "anel_lata":        {"name": "Anel de Lata",     "kind": "trinket", "stackable": False, "color": "#b9b2a0", "slot": "ring",     "visual": "ring",     "rarity": "comum", "atk": 0, "value": 4},
    "anel_varth":       {"name": "Anel do Lorde Varth", "kind": "trinket", "stackable": False, "color": "#7a4ad0", "slot": "ring", "visual": "ring", "rarity": "lendario", "armor": 10, "atk": 4, "value": 2000, "desc": "O selo de Lorde Varth, pulsando com energia necromântica. Mitiga até 10 de dano por golpe e +4 para acertar, o melhor anel que existe."},
    "moeda_avhur":      {"name": "Moeda de Avhur", "kind": "trofeu", "stackable": True, "color": "#d8b24a", "value": 500, "sell_value": 500, "rarity": "raro", "desc": "Moeda antiga cunhada nas profundezas da Mina de Avhur. Os mercadores pagam 500 de bronze por ela. Dizem que ainda guarda outro proposito."},
    "mascara_faraonica":{"name": "Máscara Faraônica", "kind": "tesouro", "stackable": False, "color": "#f4d06a", "slot": "head", "visual": "helmet", "rarity": "lendario", "armor": 14, "atk": 3, "value": 4000, "desc": "A máscara funerária de ouro do Faraó de Avhur, fria e pesada nas mãos. Mitiga até 14 de dano por golpe e +3 para acertar, o melhor elmo que existe (mais que o dobro de qualquer peça de cabeça do Goblin). Os mortos ainda obedecem a quem a porta."},
    "fagulha_divindade":{"name": "Fagulha de Divindade", "kind": "tesouro", "stackable": True, "color": "#ffffff", "rarity": "divino", "value": 30000, "sell_value": 30000, "desc": "Um fragmento puro de poder divino arrancado de Avhur, o Maldito. Pulsa com todas as cores que existem e algumas que não deviam existir. Dizem que os deuses do Ermo trocariam quase tudo por uma destas. Por ora, vale 30.000 de bronze pra quem não tem coragem de guardá-la."},
    "bola_la_pofnir":   {"name": "Bola de Lã do Pofnir", "kind": "tesouro", "stackable": False, "color": "#f7d6ff", "slot": "neck", "visual": "divine_orb", "rarity": "divino", "ac": 0, "value": 30000, "sell_value": 0, "desc": "Uma bola de lã que o próprio Pofnir amassou com as patas, encharcada do mesmo brilho multicolorido da Fagulha de Divindade. Pulsa com todas as cores e ronrona baixinho quando ninguém está olhando. Não faz nada (ainda), mas é a prova de que o gato branco te aceitou. Não tem preço, e por isso não se vende."},
    "pocao_divina":     {"name": "Poção Divina", "kind": "consumivel", "stackable": True, "color": "#f7d6ff", "visual": "potion", "rarity": "divino", "heal": 100, "double_next": True, "value": 0, "sell_value": 0, "desc": "Um néctar multicolorido que um deus destilou da própria Fagulha que você ofereceu. Restaura 100 de vida na hora e faz o seu PRÓXIMO golpe valer pelo dobro. Brilha com cores que não deviam existir. Vale mais que ouro, e por isso nenhum mercador ousa comprá-la."},
    "botas_vargo":      {"name": "Botas de Vargo", "kind": "armor", "stackable": False, "color": "#f7d6ff", "slot": "feet", "visual": "divine_boot", "rarity": "divino", "armor": 14, "speed": 2, "attr": {"FOR": 3, "DES": 3, "CON": 3, "INT": 3, "SAB": 3, "CAR": 3}, "immune": ["poison", "bleeding", "veneno_varth"], "smoke": True, "value": 0, "sell_value": 0, "desc": "As botas que Vargo, o primeiro lich, calçou ao renunciar à própria carne. Tecidas com a mesma luz multicolorida da Fagulha de Divindade e encharcadas de necromancia, exalam uma fumaça preta que nunca se dissipa. Mitigam até 14 de dano por golpe (a melhor bota que existe), dão +3 em TODOS os seis atributos, deixam quem as veste imune a veneno e a sangramento, e leves como uma sombra. Nenhum mercador ousa tocá-las."},
    "simbolo_varth":{"name": "Símbolo de Varth", "kind": "tesouro", "stackable": True, "color": "#7a4ad0", "rarity": "epico", "value": 2500, "sell_value": 2500, "desc": "Um sigilo de osso e obsidiana gravado com a marca de Lorde Varth, ainda quente de necromancia. Os comerciantes pagam 2.500 de bronze por um troféu desses arrancado da Torre do Lorde Necrótico."},
    "correntes_colosso":{"name": "Correntes do Colosso", "kind": "tesouro", "stackable": False, "color": "#9a8a6a", "slot": "neck", "visual": "amulet", "rarity": "lendario", "armor": 14, "atk": 3, "value": 4000, "desc": "As correntes de pedra e bronze que prendiam o Colosso de Avasham, pesadas como a própria montanha. Mitigam até 14 de dano por golpe e +3 para acertar, o melhor colar que existe."},
    "pelo_chacal_avhur":{"name": "Pelo de Chacal de Avhur", "kind": "trofeu", "stackable": True, "color": "#2e2820", "value": 500, "animal": True, "couraria_only": True, "rarity": "raro", "desc": "A pelagem negra e densa de um chacal de Avhur, impregnada da poeira da tumba. So o coureiro Valdir sabe o que vale: 1000 de bronze por peca."},
    "cordao_fake":      {"name": "Cordão Banhado",   "kind": "trinket", "stackable": False, "color": "#d9c27a", "slot": "neck",     "visual": "amulet",   "rarity": "comum", "ac": 0, "value": 5},

    # --- trofeus de caca (bichos do Descampado) ---
    "rabo_rato":     {"name": "Rabo de Rato",     "kind": "trofeu", "stackable": True, "color": "#8a857d", "value": 2, "animal": True},
    "presa_lobo":    {"name": "Presa de Lobo",    "kind": "trofeu", "stackable": True, "color": "#e8e2d0", "value": 6, "animal": True},
    "pelego_lobo":   {"name": "Pele de Lobo",     "kind": "trofeu", "stackable": True, "color": "#7a7d86", "value": 9, "animal": True},
    "presa_javali":  {"name": "Presa de Javali",  "kind": "trofeu", "stackable": True, "color": "#efe6cf", "value": 6, "animal": True},
    "couro_javali":  {"name": "Couro de Javali",  "kind": "trofeu", "stackable": True, "color": "#6e573e", "value": 8, "animal": True},
    # --- espolio dos capangas ---
    "bornal_cria":   {"name": "Bornal da Cria",   "kind": "trofeu", "stackable": True, "color": "#6b5a3a", "value": 5},
    "marreta_velha": {"name": "Marreta Enferrujada", "kind": "trofeu", "stackable": True, "color": "#6b6256", "value": 14},
    # --- drops unicos de chefe ---
    "correntao_ouro":  {"name": "Correntão de Ouro",    "kind": "tesouro", "stackable": False, "color": "#f4d06a", "value": 250,
                        "slot": "neck", "visual": "chain", "rarity": "raro", "armor": 1, "atk": 1},
    "microfone_patrao":{"name": "Microfone do Patrão",  "kind": "tesouro", "stackable": True, "color": "#c9c2cc", "value": 120, "protect": 15},
    "presa_velho_bob": {"name": "Dente Quebrado do Velho Bob", "kind": "tesouro", "stackable": True, "color": "#d9cba0", "value": 180, "protect": 10},
    "couro_velho_bob": {"name": "Couro do Velho Bob",   "kind": "tesouro", "stackable": True,  "color": "#5a5048", "value": 20},

    # trofeus do Repouso da Dama (todos vendiveis na Armas Peteco)
    "couro_lobo_negro":    {"name": "Couro de Lobo Negro",   "kind": "trofeu", "stackable": True, "color": "#26242e", "value": 14, "animal": True},
    "pena_harpia":         {"name": "Pena de Harpia",        "kind": "trofeu", "stackable": True, "color": "#4a3d57", "value": 18},
    "dedo_bruxa":          {"name": "Dedo Mirrado de Bruxa", "kind": "trofeu", "stackable": True, "color": "#9bbf8a", "value": 24},
    "ectoplasma":          {"name": "Ectoplasma",            "kind": "trofeu", "stackable": True, "color": "#cdd8ff", "value": 20},
    "veu_assombracao":     {"name": "Véu de Assombração",    "kind": "trofeu", "stackable": True, "color": "#9fd8b0", "value": 24},
    "cinza_espectral":     {"name": "Cinza Espectral",       "kind": "trofeu", "stackable": True, "color": "#c9ccd6", "value": 28},
    "essencia_sombria":    {"name": "Essência Sombria",      "kind": "trofeu", "stackable": True, "color": "#1b1a26", "value": 32},
    "lamento_petrificado": {"name": "Lamento Petrificado",   "kind": "trofeu", "stackable": True, "color": "#c8a6e0", "value": 36},
    "lagrima_da_dama":     {"name": "Lágrima da Dama",       "kind": "tesouro", "stackable": True, "color": "#bcd0ff", "value": 500, "protect": 20},

    # trofeus do Deserto de Avasham (vendiveis na Armas Peteco)
    "presa_lacraia":       {"name": "Presa de Lacraia",      "kind": "trofeu", "stackable": True, "color": "#caa46a", "value": 40, "animal": True},
    "couro_hiena":         {"name": "Couro de Hiena",        "kind": "trofeu", "stackable": True, "color": "#b08d5a", "value": 44, "animal": True},
    "pena_abutre":         {"name": "Pena de Abutre",        "kind": "trofeu", "stackable": True, "color": "#6a5a4a", "value": 46, "animal": True},
    "veneno_naja":         {"name": "Veneno de Naja",        "kind": "trofeu", "stackable": True, "color": "#9bd06a", "value": 52},
    "ferrao_escorpiao":    {"name": "Ferrão de Escorpião",   "kind": "trofeu", "stackable": True, "color": "#caa05a", "value": 64},
    "placa_verme":         {"name": "Placa de Verme",        "kind": "trofeu", "stackable": True, "color": "#c08a5a", "value": 72},
    "nucleo_areia":        {"name": "Núcleo de Areia",       "kind": "trofeu", "stackable": True, "color": "#e8cf8a", "value": 82},
    "olho_basilisco":      {"name": "Olho de Basilisco",     "kind": "trofeu", "stackable": True, "color": "#d6b84a", "value": 120},

    # trofeus do Cemitério Antigo de Valdarkram (vendiveis na Armas Peteco)
    "osso_amaldicoado":    {"name": "Osso Amaldiçoado",      "kind": "trofeu", "stackable": True, "color": "#d8d2c0", "value": 100},
    "carne_putrida":       {"name": "Carne Pútrida",         "kind": "trofeu", "stackable": True, "color": "#7a8a5a", "value": 110},
    "garra_ghoul":         {"name": "Garra de Ghoul",        "kind": "trofeu", "stackable": True, "color": "#9a8a7a", "value": 120},
    "mortalha_espectral":  {"name": "Mortalha Espectral",    "kind": "trofeu", "stackable": True, "color": "#c4ccd8", "value": 130},
    "lingua_carnical":     {"name": "Língua de Carniçal",    "kind": "trofeu", "stackable": True, "color": "#b06a6a", "value": 150},
    "elmo_cavaleiro_morte":{"name": "Elmo do Cavaleiro da Morte", "kind": "trofeu", "stackable": True, "color": "#3a4048", "value": 190},
    "grimorio_negro":      {"name": "Grimório Negro",        "kind": "trofeu", "stackable": True, "color": "#2a2233", "value": 200},
    "coracao_abominacao":  {"name": "Coração da Abominação", "kind": "tesouro", "stackable": True, "color": "#8a2a3a", "value": 400, "protect": 2},
}


def exists(item_id):
    return item_id in ITEMS


def get(item_id):
    return ITEMS.get(item_id)


def extract_currency(bag):
    """Tira as moedas da mochila e devolve (total_em_bronze, mochila_sem_moedas).
    Migracao: contas antigas guardavam moeda como item; agora vira saldo."""
    total, rest = 0, []
    for stack in (bag or []):
        cat = ITEMS.get(stack.get("item"))
        if cat and cat.get("kind") == "currency":
            total += int(cat.get("value", 1)) * int(stack.get("qty", 1))
        else:
            rest.append(stack)
    return total, rest


def is_stackable(item_id):
    it = ITEMS.get(item_id)
    return bool(it and it["stackable"])


# Espacos de equipamento (11 no total). Ordem usada como referencia; o cliente
# desenha o boneco com seu proprio arranjo.
EQUIP_SLOTS = ["head", "neck", "shoulder", "back", "chest",
               "hand_r", "hand_l", "ring1", "ring2", "legs", "feet"]

# Familias: um item pode declarar um espaco "generico" que cai no primeiro livre.
_FAMILY = {"hand": ["hand_r", "hand_l"], "ring": ["ring1", "ring2"]}


def slot_of(item_id):
    it = ITEMS.get(item_id)
    return it.get("slot") if it else None


def fits_slot(item_id, slot):
    """True se item_id pode ocupar a CHAVE de espaco 'slot', incluindo familias
    (arma 'hand' cabe em hand_r/hand_l; anel 'ring' cabe em ring1/ring2)."""
    base = slot_of(item_id)
    return base == slot or slot in _FAMILY.get(base, [])


def resolve_slot(item_id, equipment):
    """Espaco real onde o item vai. Familias (hand/ring) caem no primeiro livre;
    se ambos cheios, troca o primeiro. Espacos especificos vao direto."""
    s = slot_of(item_id)
    if s in _FAMILY:
        opts = _FAMILY[s]
        for o in opts:
            if not (equipment or {}).get(o):
                return o
        return opts[0]
    return s


def is_equippable(item_id):
    return slot_of(item_id) is not None


def rarity_of(item_id):
    it = ITEMS.get(item_id)
    return (it.get("rarity") if it else None) or "comum"


def equip_summary(equipment):
    """Soma os bonus de tudo que esta vestido: CA, acerto, dano da arma, poder
    magico (caster), bloqueio (escudo) e o alcance da arma (ranged). A arma da MAO
    DIREITA e a principal; se houver uma segunda arma na MAO ESQUERDA, ela vira a
    'offhand' (duas armas), e quem a usa soma o dano dela no ataque."""
    eq = equipment or {}
    ac = atk = spell_pow = block = 0
    spell_hit = 0          # +acerto/CD mágico do equipamento (rebalance ofensivo do caster)
    armor = ward = 0
    dodge = mres = 0.0
    speed = 0
    immune = []
    smoke = False
    attrs = {}
    shield_ac = 0

    def _wp(iid):
        it = ITEMS.get(iid) or {}
        return it if it.get("dmg") else None
    main = _wp(eq.get("hand_r"))
    off = _wp(eq.get("hand_l"))
    if not main and off:          # so a mao esquerda tem arma -> ela e a principal
        main, off = off, None
    dmg = dict(main["dmg"]) if main else None
    rng = int(main.get("rng", 1)) if main else 1
    offhand = {"n": int(off["dmg"]["n"]), "d": int(off["dmg"]["d"])} if off else None     # 2a arma: so os dados (sem o bonus fixo)

    for _slot, iid in eq.items():                   # CA/atk/poder/bloqueio de TUDO equipado
        it = ITEMS.get(iid)
        if not it:
            continue
        ac += int(it.get("ac", 0))
        atk += int(it.get("atk", 0))
        spell_pow += int(it.get("spell_pow", 0))
        spell_hit += int(it.get("spell_hit", 0))             # +acerto/CD mágico (cajado/chapéu de caster)
        block += int(it.get("block", 0))
        armor += int(it.get("armor", 0))                     # mitigação (reduz dano por golpe)
        dodge += float(it.get("dodge", 0))                   # esquiva (anula o golpe)
        ward += int(it.get("ward", 0))                       # barreira arcana (absorve dano)
        mres += float(it.get("mres", 0))                     # resistência mágica (% no dano de magia)
        speed += int(it.get("speed", 0))                     # +deslocamento (Botas de Vargo)
        for _im in (it.get("immune") or []):                 # imunidade a status (Botas de Vargo)
            if _im not in immune:
                immune.append(_im)
        if it.get("smoke"):
            smoke = True                                     # aura de fumaça preta (Botas de Vargo)
        if it.get("visual") == "shield":                     # CA do escudo (pro Combatente largar)
            shield_ac += int(it.get("ac", 0))
        for _ak, _av in (it.get("attr") or {}).items():      # +atributo (set Necrótico)
            attrs[_ak] = attrs.get(_ak, 0) + int(_av)
    return {"ac": ac, "atk": atk, "dmg": dmg, "spell_pow": spell_pow, "spell_hit": spell_hit,
            "block": block, "rng": rng, "offhand": offhand, "attrs": attrs, "shield_ac": shield_ac,
            "armor": armor, "dodge": round(dodge, 4), "ward": ward, "mres": round(mres, 4),
            "speed": speed, "immune": immune, "smoke": smoke}


# Kit inicial que a Robetina entrega (um por espaco, bem simples; sobra um anel).
STARTER_SET = ["touca_la", "cordao_fake", "ombreira_couro", "capa_puida",
               "camiseta_surrada", "faca_cozinha", "tampa_panela", "anel_lata",
               "calca_jeans", "chinelo"]


def grant_starter_set(bag):
    """Poe o kit inicial na mochila (lista de pilhas). Devolve a propria bag."""
    for iid in STARTER_SET:
        add_to_bag(bag, iid, 1)
    return bag


def shows_staff(item_id):
    """True se o item equipado deve fazer o personagem segurar um cajado."""
    it = ITEMS.get(item_id)
    return bool(it and it.get("visual") == "staff")


def describe(item_id):
    """Gera uma descricao curta do item a partir dos atributos (ou usa 'desc' fixo)."""
    it = ITEMS.get(item_id) or {}
    if it.get("desc"):
        return it["desc"]
    k = it.get("kind"); d = it.get("dmg") or {}
    bits = []
    if k == "weapon":
        head = "Arma de mão."
        if d:
            base = "%dd%d" % (d.get("n", 1), d.get("d", 6))
            if d.get("flat"): base += "+%d" % d["flat"]
            bits.append("%s de dano" % base)
        if it.get("rng"):
            bits.append("à distância" if it["rng"] >= 50 else ("alcance %d" % it["rng"]))
        if it.get("atk"): bits.append("+%d para acertar" % it["atk"])
        if it.get("spell_pow"): bits.append("+%d de poder mágico" % it["spell_pow"])
        if it.get("spell_hit"): bits.append("+%d de acerto mágico" % it["spell_hit"])
        if it.get("ac"): bits.append("+%d de armadura" % it["ac"])
    elif k == "armor":
        head = "Escudo." if it.get("slot") == "hand" else "Peça de armadura."
        if it.get("armor"): bits.append("mitiga até %d de dano por golpe" % it["armor"])
        if it.get("dodge"): bits.append("%d%% de esquiva" % round(it["dodge"] * 100))
        if it.get("ward"): bits.append("barreira absorve %d" % it["ward"])
        if it.get("mres"): bits.append("%d%% de resistência mágica" % round(it["mres"] * 100))
        if it.get("spell_pow"): bits.append("+%d de poder mágico" % it["spell_pow"])
        if it.get("block"): bits.append("bloqueia %d de dano por golpe" % it["block"])
        if it.get("ac"): bits.append("+%d de armadura" % it["ac"])
    elif k == "consumivel":
        head = "Consumível."
        if it.get("heal"): bits.append("cura %d%% da vida" % int(it["heal"] * 100))
    elif k == "currency":
        return "Moeda do Ermo."
    else:
        head = it.get("name", "Item")
    rare = it.get("rarity")
    tail = (" Raridade: %s." % rare) if rare and rare != "comum" else ""
    return head + ((" " + ", ".join(bits) + ".") if bits else "") + tail


def catalog():
    """O que o cliente precisa pra nomear, desenhar, equipar e mostrar cada item."""
    return {
        k: {"name": v["name"], "kind": v["kind"],
            "stackable": v["stackable"], "color": v["color"],
            "equippable": "slot" in v, "slot": v.get("slot"),
            "visual": v.get("visual"), "rarity": v.get("rarity", "comum"),
            "ac": v.get("ac", 0), "atk": v.get("atk", 0), "dmg": v.get("dmg"),
            "spell_pow": v.get("spell_pow", 0), "spell_hit": v.get("spell_hit", 0), "block": v.get("block", 0), "rng": v.get("rng"),
            "armor": v.get("armor", 0), "dodge": v.get("dodge", 0),       # mitigação / esquiva (defesa Tibia)
            "ward": v.get("ward", 0), "mres": v.get("mres", 0),           # barreira arcana / resistência mágica
            "heal": v.get("heal"), "desc": describe(k), "protect": v.get("protect"),
            "animal": v.get("animal"), "value": v.get("value", 1),
            "sell_value": v.get("sell_value"), "couraria_only": v.get("couraria_only")}
        for k, v in ITEMS.items()
    }


def animal_trophies():
    """Itens vindos de criaturas animais (lobo, javali, etc.) que o Valdir compra na Couraria."""
    return [k for k, v in ITEMS.items() if v.get("animal")]


def death_protect_items():
    """Itens que a Xamã Miranda aceita por proteção contra a morte (id, protect%)."""
    return [(k, v["protect"]) for k, v in ITEMS.items() if v.get("protect")]


def starting_inventory():
    """Gancho pros itens iniciais. Por ora, mochila vazia."""
    return []


# Itens largados no chao: (x, y, item_id, segundos_pra_reaparecer).
# Espalhados perto do cruzamento central pra achar facil no teste.
GROUND_SPAWNS = [
    (49, 46, "coin_gold",    30),
    (49, 48, "coin_bronze",  30),
    (49, 54, "coin_silver",  30),
    (45, 50, "coin_bronze",  30),
    (47, 50, "coin_gold",    30),
    (53, 50, "coin_silver",  30),
]
# Nota: o Cajado do Portuz NAO fica mais no chao. Ele e unico do Portuz (1 so),
# nao dropa e nao respawna. Isso mata o farm que enchia a mochila de copias.


# --------------------------------------------------------------- a mochila

def add_to_bag(bag, item_id, qty=1):
    """Adiciona qty de item_id a bag (empilha se for empilhavel). Muta bag."""
    if not exists(item_id):
        return bag
    if is_stackable(item_id):
        for stack in bag:
            if stack.get("item") == item_id:
                stack["qty"] = int(stack.get("qty", 0)) + qty
                return bag
    bag.append({"item": item_id, "qty": qty})
    return bag


def remove_from_bag(bag, item_id, qty=1):
    """Tira qty de item_id da bag. Muta bag. Devolve True se conseguiu."""
    for i, stack in enumerate(bag):
        if stack.get("item") == item_id:
            have = int(stack.get("qty", 0))
            if have <= qty:
                bag.pop(i)
            else:
                stack["qty"] = have - qty
            return True
    return False

def count_in_bag(bag, item_id):
    """Quantos desse item tem na mochila (0 se nenhum)."""
    for st in (bag or []):
        if st.get("item") == item_id:
            return int(st.get("qty", 0))
    return 0



def sanitize_bag(raw):
    """Garante uma bag valida a partir do que veio do banco (JSONB)."""
    out = []
    if isinstance(raw, list):
        for s in raw:
            if not isinstance(s, dict) or not exists(s.get("item")):
                continue
            try:
                q = max(1, int(s.get("qty", 1)))
            except (TypeError, ValueError):
                q = 1
            item_id = s["item"]
            if is_stackable(item_id):
                found = next((t for t in out if t["item"] == item_id), None)
                if found:
                    found["qty"] += q
                    continue
            out.append({"item": item_id, "qty": q})
    return out


# Itens unicos: um jogador so pode ter 1, somando mochila + equipado.
UNIQUE_ITEMS = {"staff_portuz"}


def enforce_uniques(bag, equipment):
    """Garante no maximo 1 de cada item unico por jogador (mochila + equipado).
    Conserta contas que acumularam copias (ex.: o Portuz com 5 cajados).
    Devolve (bag_limpa, mudou)."""
    equipped = {v for v in (equipment or {}).values() if v}
    out, seen, changed = [], set(), False
    for stack in bag:
        item_id = stack.get("item")
        if item_id in UNIQUE_ITEMS:
            if item_id in equipped or item_id in seen:
                changed = True
                continue  # ja tem um (equipado ou na mochila): descarta a sobra
            seen.add(item_id)
            if int(stack.get("qty", 1)) != 1:
                stack = {"item": item_id, "qty": 1}
                changed = True
        out.append(stack)
    return out, changed


# ===========================================================================
#  SETS DE CLASSE — vendidos na Armas Peteco (Sapopemba), 3000 bronze/peca.
#  Cada classe tem arma correspondente + armadura completa (6 pecas). Armas
#  razoaveis (raro), abaixo do Cajado Magico lendario. Gerados por codigo.
# ===========================================================================
SHOP_PRICE = 3000          # preco fixo de qualquer peca da loja (puro money sink)
SHOP_SELL_RATE = 0.4       # o mercador paga 40% do valor ao COMPRAR de voce (lowball RE4)

# id_classe: (tema_do_nome, cor, arquetipo, (arma_nome, visual, dado_n, dado_d, atk, ac_extra))
_CLASS_GEAR = {
    "barbaro":     ("do Bárbaro",     "#9c4a2f", "pesada", ("Machado Brutal",        "sword", 1, 12, 1, 0)),
    "guerreiro":   ("do Guerreiro",   "#8a929c", "pesada", ("Espada Longa de Aço",   "sword", 1, 8,  2, 0)),
    "paladino":    ("do Paladino",    "#e6c66a", "pesada", ("Espada Consagrada",     "sword", 1, 8,  2, 1)),
    "clerigo":     ("do Clérigo",     "#e8e2cf", "pesada", ("Maça Abençoada",        "sword", 1, 8,  1, 1)),
    "patrulheiro": ("do Patrulheiro", "#5e7d4a", "media",  ("Arco Longo",            "bow",   1, 8,  2, 0)),
    "ladino":      ("do Ladino",      "#4a4753", "media",  ("Florete Afiado",        "knife", 1, 8,  2, 0)),
    "monge":       ("do Monge",       "#c8763a", "media",  ("Bastão de Combate",     "staff", 1, 8,  2, 0)),
    "druida":      ("do Druida",      "#6a7d3a", "media",  ("Cimitarra de Espinhos", "knife", 1, 6,  2, 0)),
    "bardo":       ("do Bardo",       "#c45a9c", "media",  ("Florete do Trovador",   "sword", 1, 8,  1, 0)),
    "mago":        ("do Mago",        "#5a7de0", "robe",   ("Cajado Arcano",         "staff", 1, 6,  2, 0)),
    "feiticeiro":  ("do Feiticeiro",  "#d0503a", "robe",   ("Cajado Dracônico",      "staff", 1, 6,  2, 0)),
    "bruxo":       ("do Bruxo",       "#8a4ad0", "robe",   ("Lâmina do Pacto",       "sword", 1, 8,  1, 0)),
}
# AC por peca em cada arquetipo de armadura
_ARQ = {
    "pesada": {"head": 1, "shoulder": 1, "back": 1, "chest": 3, "legs": 2, "feet": 1, "anome": "Placa"},
    "media":  {"head": 1, "shoulder": 1, "back": 0, "chest": 2, "legs": 1, "feet": 1, "anome": "Couro"},
    "robe":   {"head": 1, "shoulder": 1, "back": 1, "chest": 2, "legs": 1, "feet": 1, "anome": "Manto"},
}
_SLOT_VIS = {
    "head":     ("helmet",   "Elmo"),
    "shoulder": ("pauldron", "Ombreira"),
    "back":     ("cloak",    "Capa"),
    "chest":    ("shirt",    "Peitoral"),
    "legs":     ("pants",    "Calça"),
    "feet":     ("sandal",   "Botas"),
}

SHOP_SETS = []          # [{"class_id":..., "items":[ids na ordem arma->botas]}]
SHOP_ITEMS = set()      # todos os ids que a loja vende (pra validar compra)
_SHIELD_AC = {"pesada": 3, "media": 2}   # escudo: arquetipos marciais (robe nao usa)

# === SISTEMA DE DEFESA estilo Tibia (mitigação / esquiva / ward) =============
# Em vez de empilhar CA, cada arquétipo defende do seu jeito:
#   pesada -> ARMADURA alta (cada golpe leva uma mitigação aleatória metade-total) + bloqueio do escudo
#   media  -> ARMADURA baixa + ESQUIVA (chance de ANULAR o golpe)
#   robe   -> WARD (barreira que absorve dano) + RESISTÊNCIA MÁGICA (% no dano de magia)
# Os totais abaixo são do SET COMPLETO (calibrados pra equivaler ao poder de hoje:
# paladino full goblin toma ~4/turno do Varth como antes); distribuídos por peça.
_DEF = {   # tier -> {pa:armadura pesada, ma:armadura media, md:esquiva media,
           #          ra:armadura robe, rw:ward robe, rm:resist. mágica robe}
    "set":   {"pa": 2,  "ma": 1,  "md": 0.05, "ra": 2,  "rw": 4,  "rm": 0.05},
    "t1":    {"pa": 5,  "ma": 3,  "md": 0.12, "ra": 4,  "rw": 9,  "rm": 0.15},
    "t2":    {"pa": 12, "ma": 6,  "md": 0.20, "ra": 7,  "rw": 16, "rm": 0.25},
    "t3":    {"pa": 26, "ma": 13, "md": 0.28, "ra": 13, "rw": 28, "rm": 0.38},
    "necro": {"pa": 58, "ma": 26, "md": 0.38, "ra": 18, "rw": 42, "rm": 0.50},
}
# CHAPÉU do caster (robe): +poder mágico (somado no dano de TODA magia), crescente por tier.
_HEAD_POW = {"set": 1, "t1": 2, "t2": 4, "t3": 8, "necro": 12}
# REBALANCE OFENSIVO DO CASTER: a magia precisa ACERTAR como a espada e BATER forte
# (glass cannon: compensa em dano o que o caster perde em sobrevivência).
# +acerto/CD mágico do equipamento por tier (conserta a mira que não escalava com o gear):
_CASTER_HIT = {"set": 3, "t1": 5, "t2": 9, "t3": 10, "necro": 11}
# poder mágico TOTAL alvo por tier (arma + chapéu). A ARMA carrega o total menos o que o chapéu já dá.
_CASTER_POW_TOTAL = {"set": 3, "t1": 13, "t2": 46, "t3": 84, "necro": 150}
def _caster_weapon_pow(tierkey):
    return max(0, _CASTER_POW_TOTAL.get(tierkey, 0) - _HEAD_POW.get(tierkey, 0))
# DRUIDA: caster de batalha (forma humana = mago). ~85% do poder de um manto puro (ele é
# média/mais tankudo e tem as formas), tudo na arma (druida não usa chapéu de robe).
def _druida_weapon_pow(tierkey):
    return int(round(0.85 * _CASTER_POW_TOTAL.get(tierkey, 0)))
def _split_int(total, arch):
    """Distribui um total inteiro pelas 6 peças conforme o peso do arquétipo (peitoral pega o resto)."""
    w = _ARQ[arch]; slots = ("head", "shoulder", "back", "chest", "legs", "feet")
    sw = sum(w[s] for s in slots) or 1
    out = {s: 0 for s in slots}
    if total <= 0:
        return out
    acc = 0
    for s in slots:
        if s == "chest":
            continue
        out[s] = int(round(total * w[s] / sw)); acc += out[s]
    out["chest"] = max(0, total - acc)
    return out
def _piece_defense(arch, slot, tierkey):
    """Defesa (armadura/esquiva/ward/resist) de UMA peça conforme arquétipo + tier."""
    D = _DEF.get(tierkey, _DEF["set"])
    w = _ARQ[arch]; slots = ("head", "shoulder", "back", "chest", "legs", "feet")
    sw = sum(w[s] for s in slots) or 1
    frac = w[slot] / sw
    out = {}
    if arch == "pesada":
        a = _split_int(D["pa"], arch).get(slot, 0)
        if a: out["armor"] = a
    elif arch == "media":
        a = _split_int(D["ma"], arch).get(slot, 0)
        if a: out["armor"] = a
        dg = D["md"] * frac
        if dg > 0: out["dodge"] = round(dg, 4)
    elif arch == "robe":
        a = _split_int(D["ra"], arch).get(slot, 0)
        if a: out["armor"] = a
        wd = _split_int(D["rw"], arch).get(slot, 0)
        if wd: out["ward"] = wd
        mr = D["rm"] * frac
        if mr > 0: out["mres"] = round(mr, 4)
        if slot == "head":                     # o CHAPÉU do caster reforça a magia (+dano), crescente por tier
            out["spell_pow"] = _HEAD_POW.get(tierkey, _HEAD_POW["set"])
    return out

# Classes que FOCAM EM MAGIA: a arma vira modesta, mas o equipamento da +poder
# magico (somado no dano de TODA magia). As marciais batem forte na arma.
CASTER_CLASSES = {"mago", "feiticeiro", "bruxo", "clerigo", "druida", "bardo"}
# Casters de MANTO (robe): frágeis -> glass cannon (dano mágico ALTO). Os outros casters
# (clérigo pesada, druida/bardo média) são tankudos -> poder mágico MODESTO (princípio: dano compensa fragilidade).
ROBE_CASTERS = {"mago", "feiticeiro", "bruxo"}
# Armas que atacam o ataque basico A DISTANCIA: classe -> alcance em tiles
# (arco = livre/combate todo; cajado de conjurador = medio).
RANGED_RANGE = {"patrulheiro": 99, "mago": 6, "feiticeiro": 6}
# Classes que ganham +poder magico no equipamento (os casters + o paladino hibrido,
# que bate forte na arma E reforca as magias/castigo).
POW_CLASSES = CASTER_CLASSES | {"paladino"}
# Classes que podem usar DUAS ARMAS (uma em cada mao): marciais ageis. Trocam o
# escudo (defesa) por uma segunda arma (mais dano). Casters/paladino/clerigo nao.
DUAL_WIELD_CLASSES = {"guerreiro", "barbaro", "ladino", "patrulheiro", "monge"}

def _gen_class_sets():
    """Set BASE (Armas Peteco), raridade COMUM. Arma = dado da classe. Escudo pros
    arquetipos marciais (com bloqueio). Casters comecam sem +poder magico (vem nos tiers)."""
    for cid, (tema, cor, arq, weap) in _CLASS_GEAR.items():
        wn, wvis, dn, dd, watk, wac = weap
        ids = []
        wid = "set_%s_arma" % cid
        ITEMS[wid] = {"name": wn, "kind": "weapon", "stackable": False, "color": cor,
                      "slot": "hand", "visual": wvis, "rarity": "comum",
                      "dmg": {"n": dn, "d": dd}, "atk": watk, "value": SHOP_PRICE}
        if cid in ROBE_CASTERS:                         # manto (frágil): poder mágico base + acerto
            ITEMS[wid]["spell_pow"] = _caster_weapon_pow("set")
            ITEMS[wid]["spell_hit"] = _CASTER_HIT["set"]
        elif cid == "druida":                           # druida (caster de batalha): poder forte + acerto
            ITEMS[wid]["spell_pow"] = _druida_weapon_pow("set")
            ITEMS[wid]["spell_hit"] = _CASTER_HIT["set"]
        elif cid in CASTER_CLASSES:                     # clérigo/bardo (tankudos): só acerto mágico
            ITEMS[wid]["spell_hit"] = _CASTER_HIT["set"]
        if cid in RANGED_RANGE:
            ITEMS[wid]["rng"] = RANGED_RANGE[cid]
        ids.append(wid)
        a = _ARQ[arq]
        for slot in ("head", "shoulder", "back", "chest", "legs", "feet"):
            vis, slabel = _SLOT_VIS[slot]
            iid = "set_%s_%s" % (cid, slot)
            piece = {"name": "%s %s" % (slabel, tema), "kind": "armor", "stackable": False,
                     "color": cor, "slot": slot, "visual": vis, "rarity": "comum",
                     "value": SHOP_PRICE}
            piece.update(_piece_defense(arq, slot, "set"))
            ITEMS[iid] = piece
            ids.append(iid)
        if arq in _SHIELD_AC:
            sidh = "set_%s_escudo" % cid
            ITEMS[sidh] = {"name": "Escudo %s" % tema, "kind": "armor", "stackable": False,
                           "color": cor, "slot": "hand", "visual": "shield", "rarity": "comum",
                           "block": 2, "value": SHOP_PRICE}
            ids.append(sidh)
        SHOP_SETS.append({"class_id": cid, "items": ids})
        SHOP_ITEMS.update(ids)

_gen_class_sets()
# ===========================================================================
#  3 MERCADORES PREMIUM (Mascate/Nomade/Coveiro): equipamento escalado por mapa
#  E por classe. MARCIAL: a arma multiplica os dados (3/6/9) + dano fixo, e a CA
#  sobe. CASTER: a arma fica modesta (1/2/3 dados) mas o equipamento da +PODER
#  MAGICO, somado no dano de toda magia. Escudo ganha BLOQUEIO (reduz o dano de
#  cada golpe). SEM lendario: o topo (Coveiro) e epico/roxo, drop de chefe que e lendario.
# ===========================================================================
TIER_SETS = {}    # prefixo -> [{"class_id", "items":[ids]}]
TIER_ITEMS = {}   # prefixo -> set(ids vendidos)
TIER_PRICE = {}   # prefixo -> preco por peca
TIER_LABEL = {}   # prefixo -> rotulo da loja
# por tier: (prefixo, sufixo, raridade, preco,
#            MARCIAL: mult_dados, dano_fixo, +atk, +CA/peca,
#            CASTER:  mult_dados, +poder_magico, +atk,
#            ESCUDO:  bloqueio)
_TIERS = [
    ("t1", "do Ermo",   "incomum", 30000,   3,  2,  5,  1,    1,  3,  2,    4),
    ("t2", "das Dunas", "raro",    90000,   6,  5, 10,  2,    2,  6,  4,    6),
    ("t3", "Sepulcral", "epico",   270000,  9, 15, 18,  4,    3, 16,  6,   12),
]
def _gen_tier_sets():
    for (pfx, suf, rar, price, mdice, mflat, matk, acb,
         cdice, cpow, catk, sblock) in _TIERS:
        sets = []; ids_all = set()
        for cid, (tema, cor, arq, weap) in _CLASS_GEAR.items():
            wn, wvis, dn, dd, watk, wac = weap
            caster = cid in CASTER_CLASSES
            ids = []
            wid = "%s_%s_arma" % (pfx, cid)
            wdmg = {"n": (cdice if caster else mdice), "d": dd}
            if (not caster) and mflat:
                wdmg["flat"] = mflat
            W = {"name": "%s %s" % (wn, suf), "kind": "weapon", "stackable": False,
                 "color": cor, "slot": "hand", "visual": wvis, "rarity": rar,
                 "dmg": wdmg, "atk": watk + (catk if caster else matk), "value": price}
            if cid in ROBE_CASTERS:                     # manto (frágil): poder mágico ALTO + acerto (glass cannon)
                W["spell_pow"] = _caster_weapon_pow(pfx)
                W["spell_hit"] = _CASTER_HIT.get(pfx, 0)
            elif cid == "druida":                       # druida (caster de batalha): forte + acerto
                W["spell_pow"] = _druida_weapon_pow(pfx)
                W["spell_hit"] = _CASTER_HIT.get(pfx, 0)
            elif cid in CASTER_CLASSES:                 # clérigo/bardo (tankudos): poder MODESTO + acerto
                W["spell_pow"] = cpow
                W["spell_hit"] = _CASTER_HIT.get(pfx, 0)
            elif (cid in POW_CLASSES) and cpow:          # paladino híbrido: poder mágico modesto (Castigo Divino)
                W["spell_pow"] = cpow
            if cid in RANGED_RANGE:
                W["rng"] = RANGED_RANGE[cid]
            ITEMS[wid] = W
            ids.append(wid)
            a = _ARQ[arq]
            for slot in ("head", "shoulder", "back", "chest", "legs", "feet"):
                vis, slabel = _SLOT_VIS[slot]
                iid = "%s_%s_%s" % (pfx, cid, slot)
                piece = {"name": "%s %s %s" % (slabel, tema, suf), "kind": "armor",
                         "stackable": False, "color": cor, "slot": slot, "visual": vis,
                         "rarity": rar, "value": price}
                piece.update(_piece_defense(arq, slot, pfx))
                ITEMS[iid] = piece
                ids.append(iid)
            if arq in _SHIELD_AC:
                sidh = "%s_%s_escudo" % (pfx, cid)
                ITEMS[sidh] = {"name": "Escudo %s %s" % (tema, suf), "kind": "armor",
                               "stackable": False, "color": cor, "slot": "hand", "visual": "shield",
                               "rarity": rar, "block": sblock, "value": price}
                ids.append(sidh)
            sets.append({"class_id": cid, "items": ids}); ids_all.update(ids)
        TIER_SETS[pfx] = sets; TIER_ITEMS[pfx] = ids_all; TIER_PRICE[pfx] = price
_gen_tier_sets()
TIER_LABEL = {"t1": "Mascate Errante", "t2": "Nômade Raiz", "t3": "Coveiro Mórbido"}

# atributo principal de cada classe (pro bonus do set Necrótico)
_CLASS_ATTR = {
    "barbaro": "FOR", "guerreiro": "FOR", "paladino": "CON",
    "ladino": "DES", "monge": "DES", "patrulheiro": "DES",
    "mago": "INT", "feiticeiro": "CAR", "bruxo": "CAR", "bardo": "CAR",
    "clerigo": "SAB", "druida": "SAB",
}

def _gen_necrotico_set():
    """O set Necrótico da Goblin do Cofre (escondida na câmara de Varth): armadura/
    escudo UM tier acima do Coveiro (t3), ARMA DOIS tiers acima, e TODA peça soma
    +2 no atributo principal da classe. Continua épico (roxo, igual ao Coveiro).
    Prefixo 'Necrótico' no nome. Custa 800.000 de bronze + 5 Símbolos de Varth a peça."""
    pfx, suf, rar, price = "necro", "Necrótico", "epico", 800000
    # ARMA (2 tiers acima de t3): dano e acerto bem altos
    w_mdice, w_mflat, w_matk = 15, 35, 34      # marcial: dados, dano fixo, +acerto
    w_cdice, w_cpow, w_catk = 5, 40, 14        # caster: dados, +poder mágico, +acerto
    acb, sblock = 6, 16                         # armadura/escudo (1 tier acima)
    attr_bonus = 2                             # +2 no atributo da classe na ARMA e no PEITORAL (+4 total, não em cada peça)
    sets = []; ids_all = set()
    for cid, (tema, cor, arq, weap) in _CLASS_GEAR.items():
        wn, wvis, dn, dd, watk, wac = weap
        caster = cid in CASTER_CLASSES
        attr = _CLASS_ATTR.get(cid, "FOR")
        ids = []
        wid = "necro_%s_arma" % cid
        wdmg = {"n": (w_cdice if caster else w_mdice), "d": dd}
        if (not caster) and w_mflat:
            wdmg["flat"] = w_mflat
        W = {"name": "%s %s" % (suf, wn), "kind": "weapon", "stackable": False,
             "color": cor, "slot": "hand", "visual": wvis, "rarity": rar,
             "dmg": wdmg, "atk": watk + (w_catk if caster else w_matk), "value": price,
             "attr": {attr: attr_bonus}}
        if cid in ROBE_CASTERS:                         # manto (frágil): poder mágico altíssimo + acerto (glass cannon)
            W["spell_pow"] = _caster_weapon_pow("necro")
            W["spell_hit"] = _CASTER_HIT["necro"]
        elif cid == "druida":                           # druida (caster de batalha): forte + acerto
            W["spell_pow"] = _druida_weapon_pow("necro")
            W["spell_hit"] = _CASTER_HIT["necro"]
        elif cid in CASTER_CLASSES:                     # clérigo/bardo (tankudos): poder MODESTO + acerto
            W["spell_pow"] = w_cpow
            W["spell_hit"] = _CASTER_HIT["necro"]
        elif (cid in POW_CLASSES) and w_cpow:            # paladino híbrido: poder mágico modesto (Castigo Divino)
            W["spell_pow"] = w_cpow
        if cid in RANGED_RANGE:
            W["rng"] = RANGED_RANGE[cid]
        ITEMS[wid] = W; ids.append(wid)
        a = _ARQ[arq]
        for slot in ("head", "shoulder", "back", "chest", "legs", "feet"):
            vis, slabel = _SLOT_VIS[slot]
            iid = "necro_%s_%s" % (cid, slot)
            it = {"name": "%s %s %s" % (suf, slabel, tema), "kind": "armor",
                  "stackable": False, "color": cor, "slot": slot, "visual": vis,
                  "rarity": rar, "value": price}
            it.update(_piece_defense(arq, slot, "necro"))
            if slot == "chest":                       # so o peitoral concede atributo (+ a arma) = +4 no total
                it["attr"] = {attr: attr_bonus}
            ITEMS[iid] = it
            ids.append(iid)
        if arq in _SHIELD_AC:
            sidh = "necro_%s_escudo" % cid
            ITEMS[sidh] = {"name": "%s Escudo %s" % (suf, tema), "kind": "armor",
                           "stackable": False, "color": cor, "slot": "hand", "visual": "shield",
                           "rarity": rar, "block": sblock,
                           "value": price}
            ids.append(sidh)
        sets.append({"class_id": cid, "items": ids}); ids_all.update(ids)
    TIER_SETS["necro"] = sets; TIER_ITEMS["necro"] = ids_all; TIER_PRICE["necro"] = price
    TIER_LABEL["necro"] = "Goblin do Cofre"
_gen_necrotico_set()

# todos os ids vendidos pelos mercadores (pra validar compra)
ALL_TIER_ITEMS = set().union(*TIER_ITEMS.values())
