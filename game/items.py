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
                     "slot": "hand", "visual": "staff"},
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


# Espacos de equipamento (ordem usada na interface). Por ora, so a mao.
EQUIP_SLOTS = ["hand"]


def slot_of(item_id):
    it = ITEMS.get(item_id)
    return it.get("slot") if it else None


def is_equippable(item_id):
    return slot_of(item_id) is not None


def shows_staff(item_id):
    """True se o item equipado deve fazer o personagem segurar um cajado."""
    it = ITEMS.get(item_id)
    return bool(it and it.get("visual") == "staff")


def catalog():
    """O que o cliente precisa pra nomear, desenhar e equipar cada item."""
    return {
        k: {"name": v["name"], "kind": v["kind"],
            "stackable": v["stackable"], "color": v["color"],
            "equippable": "slot" in v, "slot": v.get("slot")}
        for k, v in ITEMS.items()
    }


def starting_inventory():
    """Gancho pros itens iniciais. Por ora, mochila vazia."""
    return []


# Itens largados no chao: (x, y, item_id, segundos_pra_reaparecer).
# Espalhados perto do cruzamento central pra achar facil no teste.
GROUND_SPAWNS = [
    (19, 10, "coin_gold",    30),
    (17, 12, "coin_bronze",  30),
    (23, 12, "coin_silver",  30),
    (16, 16, "coin_bronze",  30),
    (24, 16, "coin_gold",    30),
    (15,  9, "coin_silver",  30),
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
