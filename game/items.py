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
    "coin_bronze":  {"name": "Moeda de Bronze", "kind": "currency", "stackable": True,  "color": "#cd7f32"},
    "coin_silver":  {"name": "Moeda de Prata",  "kind": "currency", "stackable": True,  "color": "#cbd2d9"},
    "coin_gold":    {"name": "Moeda de Ouro",   "kind": "currency", "stackable": True,  "color": "#f4b860"},
    "staff_portuz": {"name": "Cajado do Portuz", "kind": "weapon",   "stackable": False, "color": "#9b6dff"},
}


def exists(item_id):
    return item_id in ITEMS


def get(item_id):
    return ITEMS.get(item_id)


def is_stackable(item_id):
    it = ITEMS.get(item_id)
    return bool(it and it["stackable"])


def catalog():
    """O que o cliente precisa pra nomear e desenhar cada item."""
    return {
        k: {"name": v["name"], "kind": v["kind"],
            "stackable": v["stackable"], "color": v["color"]}
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
    (24,  9, "staff_portuz", 45),
]


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
