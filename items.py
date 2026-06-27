"""
HABILIDADES DE CLASSE no combate (camada C). Marciais e de meio-conjurador que
nao dependem do sistema de magia. Cada uma usa um 'slot' de turno:
  'action'  gasta a ação
  'bonus'   gasta a ação bônus
  'special' não gasta ação nem bônus (ex.: Surto de Ação, armar o Castigo)
  'passive' sempre ativa, sem botão (ex.: Ataque Furtivo)
'target': True quando precisa escolher um inimigo (ex.: Rajada de Golpes).
"""

ABILITIES = {
    "rage":         {"name": "Fúria",              "slot": "bonus",   "desc": "+dano corpo a corpo e resistência a dano físico."},
    "second_wind":  {"name": "Retomar o Fôlego",   "slot": "bonus",   "desc": "Cura 1d10 + nível."},
    "action_surge": {"name": "Surto de Ação",      "slot": "special", "desc": "Ganha uma ação extra neste turno."},
    "martial_arts": {"name": "Golpe Bônus",        "slot": "bonus", "target": True, "desc": "Um ataque desarmado bônus."},
    "flurry":       {"name": "Rajada de Golpes",   "slot": "bonus", "target": True, "desc": "Gasta 1 Ki: dois ataques extras."},
    "lay_on_hands": {"name": "Imposição das Mãos", "slot": "action",  "desc": "Cura você de uma reserva sagrada."},
    "divine_smite": {"name": "Castigo Divino",     "slot": "special", "desc": "Arma: o próximo acerto corpo a corpo gasta um espaço e causa +2d6 radiante."},
    "bardic":       {"name": "Inspiração",         "slot": "bonus",   "desc": "+1d6 na sua próxima jogada de ataque."},
    "sneak_attack": {"name": "Ataque Furtivo",     "slot": "passive", "desc": "+Xd6 no primeiro acerto do seu turno."},
}

CLASS_ABILITIES = {
    "barbaro":   ["rage"],
    "guerreiro": ["second_wind", "action_surge"],
    "monge":     ["martial_arts", "flurry"],
    "ladino":    ["sneak_attack"],
    "paladino":  ["lay_on_hands", "divine_smite"],
    "bardo":     ["bardic"],
}


def get(ability_id):
    return ABILITIES.get(ability_id)


def for_class(class_id):
    return list(CLASS_ABILITIES.get(class_id, []))
