"""
MAGIAS (camada C). Cada classe conjuradora tem 1 truque (nivel 0, sem espaco) +
2 magias de nivel. Foco no que e usavel em combate; o resto vem na Fase 4.

Cada magia: name, level (0 = truque), kind, range, e os dados do efeito.
  kind:
    'attack'  rolagem de ataque magico (d20 + bonus) vs CA; no acerto, dano.
    'save'    o alvo faz um teste de resistencia vs a CD; falhou sofre dano
              (save_effect 'half' = metade no sucesso, 'none' = nada no sucesso).
    'auto'    acerta automatico (ex.: Misseis Magicos), 'darts' dardos de dano.
    'heal'    cura o proprio conjurador.
    'mark'    concentra: marca um alvo; +mark_die de dano nos ataques contra ele.
    'buff'    concentra em si: +buff_die nas jogadas de ataque.
  range: 'melee' (alcance 1), 'ranged' (qualquer alvo do confronto) ou 'self'.
"""

SPELLS = {
    # ---------- truques (nivel 0, a vontade) ----------
    "raio_de_fogo":      {"name": "Raio de Fogo",      "level": 0, "kind": "attack", "range": "ranged", "dmg": {"n": 1, "d": 10}, "dtype": "fogo",
                          "desc": "Ataque mágico à distância. 1d10 de fogo."},
    "rajada_mistica":    {"name": "Rajada Mística",    "level": 0, "kind": "attack", "range": "ranged", "dmg": {"n": 1, "d": 10}, "dtype": "energia",
                          "desc": "Ataque mágico à distância. 1d10 de energia."},
    "chama_sagrada":     {"name": "Chama Sagrada",     "level": 0, "kind": "save", "save": "DES", "save_effect": "none", "range": "ranged", "dmg": {"n": 1, "d": 8}, "dtype": "radiante",
                          "desc": "O alvo testa Destreza ou sofre 1d8 radiante."},
    "chicote_espinhos":  {"name": "Chicote de Espinhos", "level": 0, "kind": "attack", "range": "ranged", "dmg": {"n": 1, "d": 6}, "dtype": "perfurante",
                          "desc": "Ataque mágico à distância. 1d6 perfurante."},
    "zombaria_viciosa":  {"name": "Zombaria Viciosa",  "level": 0, "kind": "save", "save": "SAB", "save_effect": "none", "range": "ranged", "dmg": {"n": 1, "d": 4}, "dtype": "psíquico",
                          "desc": "O alvo testa Sabedoria ou sofre 1d4 psíquico."},

    # ---------- magias de nivel 1 ----------
    "misseis_magicos":   {"name": "Mísseis Mágicos",   "level": 1, "kind": "auto", "range": "ranged", "darts": 3, "dmg": {"n": 1, "d": 4, "flat": 1}, "dtype": "energia",
                          "desc": "3 dardos automáticos de 1d4+1 de energia."},
    "maos_flamejantes":  {"name": "Mãos Flamejantes",  "level": 1, "kind": "save", "save": "DES", "save_effect": "half", "range": "ranged", "dmg": {"n": 3, "d": 6}, "dtype": "fogo",
                          "desc": "O alvo testa Destreza; 3d6 de fogo (metade no sucesso)."},
    "clarao_direcionador": {"name": "Clarão Direcionador", "level": 1, "kind": "attack", "range": "ranged", "dmg": {"n": 4, "d": 6}, "dtype": "radiante",
                          "desc": "Ataque mágico à distância. 4d6 radiante."},
    "curar_ferimentos":  {"name": "Curar Ferimentos",  "level": 1, "kind": "heal", "range": "self", "heal": {"n": 1, "d": 8, "mod": True},
                          "desc": "Cura 1d8 + modificador de conjuração."},
    "maldicao":          {"name": "Maldição",          "level": 1, "kind": "mark", "range": "ranged", "mark_die": {"n": 1, "d": 6}, "dtype": "necrótico",
                          "desc": "Marca o alvo: +1d6 necrótico nos seus ataques contra ele."},
    "raio_bruxas":       {"name": "Raio das Bruxas",   "level": 1, "kind": "attack", "range": "ranged", "dmg": {"n": 1, "d": 12}, "dtype": "energia",
                          "desc": "Ataque mágico à distância. 1d12 de energia."},
    "investida_trovejante": {"name": "Investida Trovejante", "level": 1, "kind": "save", "save": "CON", "save_effect": "half", "range": "ranged", "dmg": {"n": 2, "d": 8}, "dtype": "trovão",
                          "desc": "O alvo testa Constituição; 2d8 de trovão (metade no sucesso)."},
    "sussurros_dissonantes": {"name": "Sussurros Dissonantes", "level": 1, "kind": "save", "save": "SAB", "save_effect": "half", "range": "ranged", "dmg": {"n": 3, "d": 6}, "dtype": "psíquico",
                          "desc": "O alvo testa Sabedoria; 3d6 psíquico (metade no sucesso)."},
    "marca_cacador":     {"name": "Marca do Caçador",  "level": 1, "kind": "mark", "range": "ranged", "mark_die": {"n": 1, "d": 6}, "dtype": "perfurante",
                          "desc": "Marca o alvo: +1d6 nos seus ataques contra ele."},
    "bencao":            {"name": "Bênção",            "level": 1, "kind": "buff", "range": "self", "buff_die": {"n": 1, "d": 4},
                          "desc": "+1d4 nas suas jogadas de ataque (concentração)."},
}

# atributo de conjuracao por classe
CASTING = {
    "mago": "INT", "clerigo": "SAB", "druida": "SAB", "patrulheiro": "SAB",
    "feiticeiro": "CAR", "bruxo": "CAR", "bardo": "CAR", "paladino": "CAR",
}

# 1 truque + 2 magias por conjurador (paladino usa habilidades + 1 magia)
CLASS_SPELLS = {
    "mago":        {"cantrips": ["raio_de_fogo"],     "spells": ["misseis_magicos", "maos_flamejantes"]},
    "feiticeiro":  {"cantrips": ["raio_de_fogo"],     "spells": ["misseis_magicos", "maos_flamejantes"]},
    "bruxo":       {"cantrips": ["rajada_mistica"],   "spells": ["maldicao", "raio_bruxas"]},
    "clerigo":     {"cantrips": ["chama_sagrada"],    "spells": ["curar_ferimentos", "clarao_direcionador"]},
    "druida":      {"cantrips": ["chicote_espinhos"], "spells": ["curar_ferimentos", "investida_trovejante"]},
    "bardo":       {"cantrips": ["zombaria_viciosa"], "spells": ["curar_ferimentos", "sussurros_dissonantes"]},
    "paladino":    {"cantrips": [],                   "spells": ["bencao"]},
    "patrulheiro": {"cantrips": [],                   "spells": ["marca_cacador", "curar_ferimentos"]},
}


def get(spell_id):
    return SPELLS.get(spell_id)


def for_class(class_id):
    return CLASS_SPELLS.get(class_id, {"cantrips": [], "spells": []})


def catalog():
    return SPELLS
