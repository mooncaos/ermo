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
                      "dmg": {"n": 1, "d": 10}, "atk": 3, "ac": 2, "value": 2000},

    # --- equipamento inicial (o kit simples da Robetina, assistente social) ---
    "touca_la":         {"name": "Touca de Lã",      "kind": "armor",   "stackable": False, "color": "#8a7d63", "slot": "head",     "visual": "helmet",   "rarity": "comum", "ac": 0, "value": 4},
    "camiseta_surrada": {"name": "Camiseta Surrada", "kind": "armor",   "stackable": False, "color": "#b6532f", "slot": "chest",    "visual": "shirt",    "rarity": "comum", "ac": 1, "value": 6},
    "ombreira_couro":   {"name": "Ombreira de Couro","kind": "armor",   "stackable": False, "color": "#6e573e", "slot": "shoulder", "visual": "pauldron", "rarity": "comum", "ac": 0, "value": 5},
    "capa_puida":       {"name": "Capa Puída",       "kind": "armor",   "stackable": False, "color": "#5a5a6a", "slot": "back",     "visual": "cloak",    "rarity": "comum", "ac": 0, "value": 5},
    "calca_jeans":      {"name": "Calça Jeans",      "kind": "armor",   "stackable": False, "color": "#3a5a86", "slot": "legs",     "visual": "pants",    "rarity": "comum", "ac": 1, "value": 6},
    "chinelo":          {"name": "Chinelo de Dedo",  "kind": "armor",   "stackable": False, "color": "#3a8a6a", "slot": "feet",     "visual": "sandal",   "rarity": "comum", "ac": 0, "value": 3},
    "faca_cozinha":     {"name": "Faca de Cozinha",  "kind": "weapon",  "stackable": False, "color": "#cbd2d9", "slot": "hand_r",   "visual": "knife",    "rarity": "comum", "dmg": {"n": 1, "d": 4}, "value": 6},
    "tampa_panela":     {"name": "Tampa de Panela",  "kind": "armor",   "stackable": False, "color": "#9aa0aa", "slot": "hand_l",   "visual": "lid",      "rarity": "comum", "ac": 1, "value": 5},
    "anel_lata":        {"name": "Anel de Lata",     "kind": "trinket", "stackable": False, "color": "#b9b2a0", "slot": "ring",     "visual": "ring",     "rarity": "comum", "atk": 0, "value": 4},
    "anel_varth":       {"name": "Anel do Lorde Varth", "kind": "trinket", "stackable": False, "color": "#7a4ad0", "slot": "ring", "visual": "ring", "rarity": "lendario", "ac": 4, "atk": 4, "value": 2000, "desc": "O selo de Lorde Varth, pulsando com energia necromântica. +4 de armadura e +4 para acertar."},
    "moeda_avhur":      {"name": "Moeda de Avhur", "kind": "trofeu", "stackable": True, "color": "#d8b24a", "value": 500, "sell_value": 500, "rarity": "raro", "desc": "Moeda antiga cunhada nas profundezas da Mina de Avhur. Os mercadores pagam 500 de bronze por ela. Dizem que ainda guarda outro proposito."},
    "mascara_faraonica":{"name": "Máscara Faraônica", "kind": "tesouro", "stackable": False, "color": "#f4d06a", "slot": "head", "visual": "helmet", "rarity": "lendario", "ac": 5, "atk": 2, "value": 2500, "desc": "A máscara funerária de ouro do Faraó de Avhur, fria e pesada nas mãos. +5 de armadura e +2 para acertar. Os mortos ainda obedecem a quem a porta."},
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
                        "slot": "neck", "visual": "chain", "rarity": "raro", "ac": 1, "atk": 1},
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
    "coracao_abominacao":  {"name": "Coração da Abominação", "kind": "tesouro", "stackable": False, "color": "#8a2a3a", "value": 400},
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
    """Soma os bonus de tudo que esta vestido: CA, acerto e o dano da arma."""
    ac = atk = 0
    dmg = None
    for _slot, iid in (equipment or {}).items():
        it = ITEMS.get(iid)
        if not it:
            continue
        ac += int(it.get("ac", 0))
        atk += int(it.get("atk", 0))
        if it.get("dmg"):          # arma equipada numa das maos define o dano
            dmg = dict(it["dmg"])
    return {"ac": ac, "atk": atk, "dmg": dmg}


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
        if d: bits.append("%dd%d de dano" % (d.get("n", 1), d.get("d", 6)))
        if it.get("atk"): bits.append("+%d para acertar" % it["atk"])
        if it.get("ac"): bits.append("+%d de armadura" % it["ac"])
    elif k == "armor":
        head = "Escudo." if it.get("slot") == "hand" else "Peça de armadura."
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
            "heal": v.get("heal"), "desc": describe(k), "protect": v.get("protect"),
            "animal": v.get("animal"), "value": v.get("value", 1)}
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
    "robe":   {"head": 0, "shoulder": 0, "back": 1, "chest": 1, "legs": 1, "feet": 0, "anome": "Manto"},
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

def _gen_class_sets():
    for cid, (tema, cor, arq, weap) in _CLASS_GEAR.items():
        wn, wvis, dn, dd, watk, wac = weap
        ids = []
        wid = "set_%s_arma" % cid
        ITEMS[wid] = {"name": wn, "kind": "weapon", "stackable": False, "color": cor,
                      "slot": "hand", "visual": wvis, "rarity": "raro",
                      "dmg": {"n": dn, "d": dd}, "atk": watk, "value": SHOP_PRICE}
        if wac:
            ITEMS[wid]["ac"] = wac
        ids.append(wid)
        a = _ARQ[arq]
        for slot in ("head", "shoulder", "back", "chest", "legs", "feet"):
            vis, slabel = _SLOT_VIS[slot]
            iid = "set_%s_%s" % (cid, slot)
            ITEMS[iid] = {"name": "%s %s" % (slabel, tema), "kind": "armor", "stackable": False,
                          "color": cor, "slot": slot, "visual": vis, "rarity": "raro",
                          "ac": a[slot], "value": SHOP_PRICE}
            ids.append(iid)
        if arq in _SHIELD_AC:
            sidh = "set_%s_escudo" % cid
            ITEMS[sidh] = {"name": "Escudo %s" % tema, "kind": "armor", "stackable": False,
                           "color": cor, "slot": "hand", "visual": "shield", "rarity": "raro",
                           "ac": _SHIELD_AC[arq], "value": SHOP_PRICE}
            ids.append(sidh)
        SHOP_SETS.append({"class_id": cid, "items": ids})
        SHOP_ITEMS.update(ids)

_gen_class_sets()
# ===========================================================================
#  3 MERCADORES PREMIUM (Mascate/Nomade/Coveiro): mesmos sets por classe, mas
#  escalados em forca por mapa. Cada tier 3x mais dados de dano + atk maior,
#  com nome especial. Preco tambem sobe (money sink pesado).
# ===========================================================================
TIER_SETS = {}    # prefixo -> [{"class_id", "items":[ids]}]
TIER_ITEMS = {}   # prefixo -> set(ids vendidos)
TIER_PRICE = {}   # prefixo -> preco por peca
TIER_LABEL = {}   # prefixo -> rotulo da loja
# (prefixo, sufixo_nome, dados_de_dano, bonus_atk, bonus_ca_por_peca, raridade, preco)
_TIERS = [
    ("t1", "do Ermo",   3,  5, 1, "epico",    30000),
    ("t2", "das Dunas", 6, 10, 2, "epico",    90000),
    ("t3", "Sepulcral", 9, 15, 3, "lendario", 270000),
]
def _gen_tier_sets():
    for (pfx, suf, dmult, atkb, acb, rar, price) in _TIERS:
        sets = []; ids_all = set()
        for cid, (tema, cor, arq, weap) in _CLASS_GEAR.items():
            wn, wvis, dn, dd, watk, wac = weap
            ids = []
            wid = "%s_%s_arma" % (pfx, cid)
            ITEMS[wid] = {"name": "%s %s" % (wn, suf), "kind": "weapon", "stackable": False,
                          "color": cor, "slot": "hand", "visual": wvis, "rarity": rar,
                          "dmg": {"n": dmult, "d": dd}, "atk": watk + atkb, "value": price}
            if wac:
                ITEMS[wid]["ac"] = wac + acb
            ids.append(wid)
            a = _ARQ[arq]
            for slot in ("head", "shoulder", "back", "chest", "legs", "feet"):
                vis, slabel = _SLOT_VIS[slot]
                iid = "%s_%s_%s" % (pfx, cid, slot)
                ITEMS[iid] = {"name": "%s %s %s" % (slabel, tema, suf), "kind": "armor",
                              "stackable": False, "color": cor, "slot": slot, "visual": vis,
                              "rarity": rar, "ac": a[slot] + acb, "value": price}
                ids.append(iid)
            if arq in _SHIELD_AC:
                sidh = "%s_%s_escudo" % (pfx, cid)
                ITEMS[sidh] = {"name": "Escudo %s %s" % (tema, suf), "kind": "armor",
                               "stackable": False, "color": cor, "slot": "hand", "visual": "shield",
                               "rarity": rar, "ac": _SHIELD_AC[arq] + acb, "value": price}
                ids.append(sidh)
            sets.append({"class_id": cid, "items": ids}); ids_all.update(ids)
        TIER_SETS[pfx] = sets; TIER_ITEMS[pfx] = ids_all; TIER_PRICE[pfx] = price
_gen_tier_sets()
TIER_LABEL = {"t1": "Mascate Errante", "t2": "Nômade Raiz", "t3": "Coveiro Mórbido"}
# todos os ids vendidos pelos 3 mercadores (pra validar compra)
ALL_TIER_ITEMS = set().union(*TIER_ITEMS.values())
