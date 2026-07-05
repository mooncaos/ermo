"""
PROFISSÕES DO ERMO — o trabalho honesto (e o nem tanto).

Três peças:
  NODES        pontos de coleta espalhados pelo mundo (veios, árvores nobres,
               ervas, moitas). O jogador chega perto, interage, colhe. O node
               esgota e volta depois de um tempo.
  PROFESSIONS  os 7 ofícios: ferreiro, coureiro, costureiro, carpinteiro,
               alquimista, joalheiro e cozinheiro. Cada um tem um MESTRE com
               casa no Ermo. Craftar dá XP de ofício; XP sobe o nível; nível
               destrava receita.
  RECIPES      as receitas de cada ofício: ingredientes (recursos de coleta +
               drops de criatura CORRELACIONADOS) -> produto.

Nível de ofício: 1 + xp // 120 (teto 5). O progresso vive em
ficha["profs"] = {"ferreiro": xp, ...} e persiste com a ficha.
"""

# ----------------------------------------------------------------- NODES DE COLETA
# gather: quantidade (min, max) por colheita; cd: segundos até renascer.
NODES = {
    "veio_ferro":      {"name": "Veio de Ferro",      "item": "minerio_ferro",   "gather": (1, 3), "cd": 90,  "verb": "minerar"},
    "veio_prata":      {"name": "Veio de Prata",      "item": "minerio_prata",   "gather": (1, 2), "cd": 120, "verb": "minerar", "bonus": ("gema_bruta", 0.22)},
    "veio_umbrio":     {"name": "Veio Umbrío",        "item": "minerio_umbrio",  "gather": (1, 2), "cd": 180, "verb": "minerar", "bonus": ("gema_bruta", 0.12)},
    "arvore_carvalho": {"name": "Carvalho Nobre",     "item": "madeira_carvalho","gather": (1, 3), "cd": 90,  "verb": "cortar"},
    "arvore_rubra":    {"name": "Árvore Rubra",       "item": "madeira_rubra",   "gather": (1, 2), "cd": 120, "verb": "cortar"},
    "arvore_umbria":   {"name": "Árvore Umbría",      "item": "madeira_umbria",  "gather": (1, 2), "cd": 150, "verb": "cortar"},
    "erva_solar":      {"name": "Erva Solar",         "item": "erva_solar",      "gather": (1, 2), "cd": 100, "verb": "colher"},
    "erva_lunar":      {"name": "Erva Lunar",         "item": "erva_lunar",      "gather": (1, 2), "cd": 130, "verb": "colher"},
    "moita_fibra":     {"name": "Moita de Fibra",     "item": "fibra_capim",     "gather": (1, 3), "cd": 80,  "verb": "colher"},
}

# onde os nodes nascem (coords aproximadas; o mundo ajusta pro tile andável mais perto)
NODE_SPAWNS = {
    "ermo": [
        ("moita_fibra", 20, 80), ("moita_fibra", 82, 20), ("arvore_carvalho", 88, 84),
    ],
    "descampado": [
        ("veio_ferro", 20, 20), ("veio_ferro", 80, 76), ("moita_fibra", 30, 70),
        ("moita_fibra", 66, 24), ("arvore_carvalho", 14, 52), ("veio_ferro", 52, 84),
    ],
    "planaltos_ermais": [
        ("veio_ferro", 20, 100), ("veio_ferro", 96, 96), ("veio_prata", 30, 44),
        ("veio_prata", 90, 40), ("arvore_carvalho", 50, 100), ("arvore_carvalho", 76, 70),
        ("arvore_carvalho", 24, 72), ("veio_ferro", 60, 44), ("veio_prata", 60, 16),
    ],
    "floresta_ermo": [
        ("arvore_carvalho", 30, 30), ("arvore_carvalho", 100, 40), ("arvore_carvalho", 60, 90),
        ("arvore_carvalho", 130, 110), ("erva_solar", 44, 64), ("moita_fibra", 90, 100),
    ],
    "repouso_dama": [
        ("arvore_carvalho", 30, 30), ("arvore_carvalho", 84, 60), ("erva_lunar", 56, 44),
    ],
    "costa_maravai": [
        ("arvore_rubra", 50, 40), ("arvore_rubra", 120, 80), ("arvore_rubra", 200, 60),
        ("arvore_rubra", 250, 110), ("erva_solar", 90, 60), ("erva_solar", 160, 100),
        ("erva_solar", 230, 40), ("moita_fibra", 60, 120), ("moita_fibra", 140, 30),
        ("moita_fibra", 200, 130), ("moita_fibra", 110, 140), ("erva_solar", 40, 90),
    ],
    "umbraval": [
        ("arvore_umbria", 100, 250), ("arvore_umbria", 150, 200), ("arvore_umbria", 90, 150),
        ("arvore_umbria", 180, 120), ("veio_umbrio", 120, 230), ("veio_umbrio", 160, 90),
        ("erva_lunar", 80, 220), ("erva_lunar", 140, 160), ("erva_lunar", 200, 80),
        ("erva_lunar", 110, 60),
    ],
    "brasal": [
        ("veio_ferro", 30, 30), ("veio_ferro", 120, 40), ("veio_ferro", 40, 110),
        ("veio_ferro", 110, 120),
    ],
    "goela_1": [
        ("veio_ferro", 20, 40), ("veio_prata", 50, 30),
    ],
    "mina_avhur": [
        ("veio_ferro", 20, 20), ("veio_ferro", 50, 40), ("veio_prata", 36, 30),
        ("veio_prata", 60, 16),
    ],
    "vespera": [
        ("veio_prata", 30, 40), ("veio_prata", 110, 100), ("veio_umbrio", 40, 110),
        ("veio_umbrio", 116, 36), ("erva_lunar", 70, 70), ("erva_lunar", 24, 80),
    ],
}

# ----------------------------------------------------------------- OS 7 OFÍCIOS
PROFESSIONS = {
    "ferreiro":    {"name": "Ferreiro",    "master": "Mestre Bragan",   "icon": "⚒️"},
    "coureiro":    {"name": "Coureiro",    "master": "Mestra Iolanda",  "icon": "🟤"},
    "costureiro":  {"name": "Costureiro",  "master": "Mestra Linah",    "icon": "🧵"},
    "carpinteiro": {"name": "Carpinteiro", "master": "Mestre Justo",    "icon": "🪵"},
    "alquimista":  {"name": "Alquimista",  "master": "Mestre Vidal",    "icon": "⚗️"},
    "joalheiro":   {"name": "Joalheiro",   "master": "Mestra Petra",    "icon": "💎"},
    "cozinheiro":  {"name": "Cozinheiro",  "master": "Mestre Bartolo",  "icon": "🍲"},
}

LEVEL_XP = 120          # xp por nível
LEVEL_CAP = 5

def level_of(xp):
    return 1 + min(LEVEL_CAP - 1, int(xp) // LEVEL_XP)

# ----------------------------------------------------------------- RECEITAS
# need: {item: qtd}; lvl: nível mínimo do ofício; xp: xp de ofício ganho.
RECIPES = {
    "ferreiro": [
        {"out": "espada_de_ferro",   "need": {"minerio_ferro": 4, "madeira_carvalho": 1}, "lvl": 1, "xp": 20},
        {"out": "armadura_de_ferro", "need": {"minerio_ferro": 6},                        "lvl": 2, "xp": 35},
        {"out": "lamina_de_prata",   "need": {"minerio_prata": 4, "minerio_ferro": 2},    "lvl": 3, "xp": 55},
        {"out": "espada_umbria",     "need": {"minerio_umbrio": 3, "minerio_prata": 2},   "lvl": 4, "xp": 80},
    ],
    "coureiro": [
        {"out": "couraca_de_couro",  "need": {"couro_selvagem": 3, "pele_macia": 2},      "lvl": 1, "xp": 20},
        {"out": "botas_do_cacador",  "need": {"couro_selvagem": 2, "couro_javali": 1},    "lvl": 2, "xp": 35},
        {"out": "calcas_de_couro",   "need": {"couro_de_leao": 2, "couro_rubro": 2},      "lvl": 3, "xp": 55},
        {"out": "armadura_lupina",   "need": {"pelagem_lupina": 4, "couro_lobo_negro": 2},"lvl": 4, "xp": 80},
    ],
    "costureiro": [
        {"out": "capa_de_fibra",     "need": {"fibra_capim": 5},                          "lvl": 1, "xp": 20},
        {"out": "tunica_de_viagem",  "need": {"fibra_capim": 4, "pele_macia": 2},         "lvl": 2, "xp": 35},
        {"out": "traje_nobre",       "need": {"tecido_nobre": 3, "fibra_capim": 3},       "lvl": 3, "xp": 55},
        {"out": "manto_lupino",      "need": {"pelagem_lupina": 4, "tecido_nobre": 2},    "lvl": 4, "xp": 80},
    ],
    "carpinteiro": [
        {"out": "arco_de_carvalho",  "need": {"madeira_carvalho": 4, "fibra_capim": 2},   "lvl": 1, "xp": 20},
        {"out": "cajado_rubro",      "need": {"madeira_rubra": 4},                        "lvl": 2, "xp": 35},
        {"out": "arco_rubro",        "need": {"madeira_rubra": 4, "fibra_capim": 2},      "lvl": 3, "xp": 55},
        {"out": "cajado_umbrio",     "need": {"madeira_umbria": 3, "gema_bruta": 1},      "lvl": 4, "xp": 80},
    ],
    "alquimista": [
        {"out": "pocao_leve",        "need": {"erva_solar": 2},                           "lvl": 1, "xp": 20},
        {"out": "elixir_lunar",      "need": {"erva_lunar": 2, "erva_solar": 1},          "lvl": 2, "xp": 35},
        {"out": "tonico_umbrio",     "need": {"erva_lunar": 3, "minerio_umbrio": 1},      "lvl": 3, "xp": 55},
        {"out": "panaceia",          "need": {"erva_lunar": 3, "erva_solar": 3, "presa_vampirica": 1}, "lvl": 4, "xp": 80},
    ],
    "joalheiro": [
        {"out": "anel_de_prata",     "need": {"minerio_prata": 2},                        "lvl": 1, "xp": 20},
        {"out": "colar_de_gema",     "need": {"gema_bruta": 1, "minerio_prata": 2},       "lvl": 2, "xp": 35},
        {"out": "anel_lunar",        "need": {"minerio_umbrio": 2, "perola": 1},          "lvl": 3, "xp": 55},
        {"out": "diadema_umbrio",    "need": {"gema_bruta": 2, "minerio_umbrio": 3},      "lvl": 4, "xp": 80},
    ],
    "cozinheiro": [
        {"out": "espeto_do_cacador", "need": {"carne_caca": 2},                           "lvl": 1, "xp": 20},
        {"out": "ensopado_da_vila",  "need": {"carne_caca": 3},                           "lvl": 2, "xp": 35},
        {"out": "banquete_do_maraja","need": {"carne_caca": 4, "chifre_de_bufalo": 1},    "lvl": 3, "xp": 55},
        {"out": "festim_umbrio",     "need": {"carne_caca": 3, "presa_vampirica": 1},     "lvl": 4, "xp": 80},
    ],
}
