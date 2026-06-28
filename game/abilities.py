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
    "lamina_venenosa": {"name": "Lâmina Venenosa", "slot": "bonus",   "desc": "Unta a lâmina com veneno: por 10 turnos, TODO acerto seu envenena o alvo (dano contínuo que escala com o nível). 1x por combate."},
    "some_sombras": {"name": "Some nas Sombras", "slot": "bonus",     "desc": "Some nas sombras: o próximo ataque inimigo contra você ERRA, e o seu próximo golpe vem da furtividade (acerto e crítico garantidos). 1x por combate."},
    # --- habilidades CONCEDIDAS pelos deuses (via Fagulha de Divindade) ---
    "milesima_saida": {"name": "Milésima Saída",   "slot": "bonus",   "god": "Nhare", "desc": "Dom de Nharé. 1x por combate: some pela milésima saída — cura 2d6 e o PRÓXIMO ataque inimigo contra você erra automaticamente."},
    "aurora_valiria": {"name": "Aurora de Valíria", "slot": "action",  "god": "Valiria", "desc": "Dom de Valíria. 1x por combate: a aurora desce sobre você. Por 6 turnos os inimigos só atacam você e nenhum golpe te tira mais de 1 de vida; em troca, por 9 turnos o seu próprio dano cai pela metade. Você brilha como a deusa."},
    "forma_facalan":  {"name": "Forma de Facalan", "slot": "action",  "god": "Facalan", "desc": "Dom de Facalan. 1x por combate: vira uma pantera dourada por 10 turnos. Cura toda a vida, +15 de vida máxima, +2 dados de dano e +10 de armadura. Se sua vida zerar na forma, você não morre: volta ao normal com a vida cheia e fica 3 turnos sem poder cair abaixo de 1."},
    "golpe_morte_alada": {"name": "Golpe da Morte Alada", "slot": "action", "god": "Nherith", "target": True, "form": "coruja", "desc": "Dom de Nherith (só na forma de Coruja Demoníaca). Garras necróticas que causam dano altíssimo (igual a um paladino de Força 20 com a espada do Coveiro) e curam 30% do dano causado em vida."},
    "cancao_cabare":  {"name": "Canção do Cabaré", "slot": "action", "god": "José", "desc": "Dom de José (só Bardo). 1x por combate: o bardo canta e fica 3 turnos sem poder agir. Em troca, por 10 turnos nenhum inimigo consegue te causar dano em área nem te aplicar qualquer debuff. Pelo contrário: quem tentar leva o próprio dano e a própria maldição de volta. (No futuro, protege o grupo inteiro.)"},
    "luz_criacao":    {"name": "Luz da Criação", "slot": "action", "target": True, "ranged": True, "posture": "martir", "desc": "Postura Mártir de Valíria: um raio radiante à distância que soma TODO o seu potencial de dano. Sempre que acerta, cura o grupo inteiro."},
}

CLASS_ABILITIES = {
    "barbaro":   ["rage"],
    "guerreiro": ["second_wind", "action_surge"],
    "monge":     ["martial_arts", "flurry"],
    "ladino":    ["sneak_attack", "lamina_venenosa", "some_sombras"],
    "paladino":  ["lay_on_hands", "divine_smite"],
    "bardo":     ["bardic"],
}


def get(ability_id):
    return ABILITIES.get(ability_id)


def for_class(class_id):
    return list(CLASS_ABILITIES.get(class_id, []))
