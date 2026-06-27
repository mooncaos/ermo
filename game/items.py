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
    "cordao_fake":      {"name": "Cordão Banhado",   "kind": "trinket", "stackable": False, "color": "#d9c27a", "slot": "neck",     "visual": "amulet",   "rarity": "comum", "ac": 0, "value": 5},

    # --- trofeus de caca (bichos do Descampado) ---
    "rabo_rato":     {"name": "Rabo de Rato",     "kind": "trofeu", "stackable": True, "color": "#8a857d", "value": 2},
    "presa_lobo":    {"name": "Presa de Lobo",    "kind": "trofeu", "stackable": True, "color": "#e8e2d0", "value": 6},
    "pelego_lobo":   {"name": "Pele de Lobo",     "kind": "trofeu", "stackable": True, "color": "#7a7d86", "value": 9},
    "presa_javali":  {"name": "Presa de Javali",  "kind": "trofeu", "stackable": True, "color": "#efe6cf", "value": 6},
    "couro_javali":  {"name": "Couro de Javali",  "kind": "trofeu", "stackable": True, "color": "#6e573e", "value": 8},
    # --- espolio dos capangas ---
    "bornal_cria":   {"name": "Bornal da Cria",   "kind": "trofeu", "stackable": True, "color": "#6b5a3a", "value": 5},
    "marreta_velha": {"name": "Marreta Enferrujada", "kind": "trofeu", "stackable": True, "color": "#6b6256", "value": 14},
    # --- drops unicos de chefe ---
    "correntao_ouro":  {"name": "Correntão de Ouro",    "kind": "tesouro", "stackable": False, "color": "#f4d06a", "value": 250,
                        "slot": "neck", "visual": "chain", "rarity": "raro", "ac": 1, "atk": 1},
    "microfone_patrao":{"name": "Microfone do Patrão",  "kind": "tesouro", "stackable": False, "color": "#c9c2cc", "value": 120},
    "presa_velho_bob": {"name": "Presa Quebrada do Velho Bob", "kind": "tesouro", "stackable": False, "color": "#d9cba0", "value": 180},
    "couro_velho_bob": {"name": "Couro do Velho Bob",   "kind": "tesouro", "stackable": True,  "color": "#5a5048", "value": 20},

    # trofeus do Repouso da Dama (todos vendiveis na Armas Peteco)
    "couro_lobo_negro":    {"name": "Couro de Lobo Negro",   "kind": "trofeu", "stackable": True, "color": "#26242e", "value": 14},
    "pena_harpia":         {"name": "Pena de Harpia",        "kind": "trofeu", "stackable": True, "color": "#4a3d57", "value": 18},
    "dedo_bruxa":          {"name": "Dedo Mirrado de Bruxa", "kind": "trofeu", "stackable": True, "color": "#9bbf8a", "value": 24},
    "ectoplasma":          {"name": "Ectoplasma",            "kind": "trofeu", "stackable": True, "color": "#cdd8ff", "value": 20},
    "veu_assombracao":     {"name": "Véu de Assombração",    "kind": "trofeu", "stackable": True, "color": "#9fd8b0", "value": 24},
    "cinza_espectral":     {"name": "Cinza Espectral",       "kind": "trofeu", "stackable": True, "color": "#c9ccd6", "value": 28},
    "essencia_sombria":    {"name": "Essência Sombria",      "kind": "trofeu", "stackable": True, "color": "#1b1a26", "value": 32},
    "lamento_petrificado": {"name": "Lamento Petrificado",   "kind": "trofeu", "stackable": True, "color": "#c8a6e0", "value": 36},
    "lagrima_da_dama":     {"name": "Lágrima da Dama",       "kind": "tesouro", "stackable": False, "color": "#bcd0ff", "value": 500},
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


def catalog():
    """O que o cliente precisa pra nomear, desenhar, equipar e mostrar cada item."""
    return {
        k: {"name": v["name"], "kind": v["kind"],
            "stackable": v["stackable"], "color": v["color"],
            "equippable": "slot" in v, "slot": v.get("slot"),
            "visual": v.get("visual"), "rarity": v.get("rarity", "comum"),
            "ac": v.get("ac", 0), "atk": v.get("atk", 0), "dmg": v.get("dmg"),
            "value": v.get("value", 1)}
        for k, v in ITEMS.items()
    }


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
        SHOP_SETS.append({"class_id": cid, "items": ids})
        SHOP_ITEMS.update(ids)

_gen_class_sets()
