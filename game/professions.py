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
    # ---- FERREIRO: minério -> barra -> arma (cabo vem do coureiro) ----
    "ferreiro": [
        {"out": "barra_de_ferro",       "need": {"minerio_ferro": 3},                              "lvl": 1, "xp": 10},
        {"out": "espada_de_ferro",      "need": {"barra_de_ferro": 2, "cabo_de_couro": 1},         "lvl": 1, "xp": 20},
        {"out": "armadura_de_ferro",    "need": {"barra_de_ferro": 4, "couro_curtido": 1},         "lvl": 2, "xp": 35},
        {"out": "barra_de_prata",       "need": {"minerio_prata": 3},                              "lvl": 2, "xp": 14},
        {"out": "lamina_de_prata",      "need": {"barra_de_prata": 2, "barra_de_ferro": 1, "cabo_de_couro": 1}, "lvl": 3, "xp": 55},
        {"out": "barra_umbria",         "need": {"minerio_umbrio": 2, "barra_de_prata": 1},        "lvl": 3, "xp": 22},
        {"out": "espada_umbria",        "need": {"barra_umbria": 2, "cabo_de_couro": 1},           "lvl": 4, "xp": 80},
        {"out": "lamina_do_crepusculo", "need": {"barra_umbria": 4, "gema_lapidada": 1, "cabo_de_couro": 2}, "lvl": 4, "xp": 140},
        {"out": "elmo_do_crepusculo",     "need": {"barra_umbria": 2, "couro_curtido": 1},                    "lvl": 4, "xp": 110},
        {"out": "pauldron_do_crepusculo", "need": {"barra_umbria": 2, "couro_curtido": 1},                    "lvl": 4, "xp": 110},
        {"out": "peitoral_do_crepusculo", "need": {"barra_umbria": 4, "gema_lapidada": 1, "couro_curtido": 2},"lvl": 4, "xp": 140},
        {"out": "grevas_do_crepusculo",   "need": {"barra_umbria": 3, "couro_curtido": 1},                    "lvl": 4, "xp": 120},
        {"out": "botas_do_crepusculo",    "need": {"barra_umbria": 2, "couro_reforcado": 1},                  "lvl": 4, "xp": 110},
    ],
    # ---- COUREIRO: pele -> curtido -> reforçado (+ cabo e botão pros vizinhos) ----
    "coureiro": [
        {"out": "couro_curtido",        "need": {"couro_selvagem": 2, "pele_macia": 1},            "lvl": 1, "xp": 10},
        {"out": "cabo_de_couro",        "need": {"couro_curtido": 1},                              "lvl": 1, "xp": 8},
        {"out": "botao_de_osso",        "need": {"presa_lobo": 1},                                 "lvl": 1, "xp": 8},
        {"out": "couraca_de_couro",     "need": {"couro_curtido": 3},                              "lvl": 1, "xp": 20},
        {"out": "botas_do_cacador",     "need": {"couro_curtido": 2, "couro_javali": 1},           "lvl": 2, "xp": 35},
        {"out": "couro_reforcado",      "need": {"couro_curtido": 2, "couro_de_leao": 1},          "lvl": 2, "xp": 16},
        {"out": "calcas_de_couro",      "need": {"couro_reforcado": 2, "fio_rustico": 2},          "lvl": 3, "xp": 55},
        {"out": "armadura_lupina",      "need": {"pelagem_lupina": 3, "couro_reforcado": 2},       "lvl": 4, "xp": 80},
        {"out": "couraca_da_alcateia",  "need": {"pelagem_lupina": 5, "couro_reforcado": 3, "barra_de_prata": 1}, "lvl": 4, "xp": 140},
        {"out": "capuz_da_alcateia",     "need": {"pelagem_lupina": 2, "couro_reforcado": 1},                 "lvl": 4, "xp": 110},
        {"out": "ombreiras_da_alcateia", "need": {"pelagem_lupina": 2, "couro_reforcado": 1},                 "lvl": 4, "xp": 110},
        {"out": "calcas_da_alcateia",    "need": {"pelagem_lupina": 3, "couro_reforcado": 2, "fio_rustico": 2},"lvl": 4, "xp": 120},
        {"out": "botas_da_alcateia",     "need": {"pelagem_lupina": 2, "couro_reforcado": 1, "fio_rustico": 1},"lvl": 4, "xp": 110},
    ],
    # ---- COSTUREIRO: fibra -> fio -> pano -> veste (botão vem do coureiro) ----
    "costureiro": [
        {"out": "fio_rustico",          "need": {"fibra_capim": 2},                                "lvl": 1, "xp": 8},
        {"out": "pano_cru",             "need": {"fio_rustico": 3},                                "lvl": 1, "xp": 12},
        {"out": "capa_de_fibra",        "need": {"pano_cru": 2},                                   "lvl": 1, "xp": 20},
        {"out": "tunica_de_viagem",     "need": {"pano_cru": 3, "botao_de_osso": 2},               "lvl": 2, "xp": 35},
        {"out": "pano_nobre",           "need": {"pano_cru": 2, "tecido_nobre": 1},                "lvl": 3, "xp": 18},
        {"out": "traje_nobre",          "need": {"pano_nobre": 2, "botao_de_osso": 3},             "lvl": 3, "xp": 55},
        {"out": "manto_lupino",         "need": {"pelagem_lupina": 3, "pano_nobre": 2},            "lvl": 4, "xp": 80},
        {"out": "manto_da_meia_noite",  "need": {"pano_nobre": 4, "pelagem_lupina": 3, "essencia_lunar": 1}, "lvl": 4, "xp": 140},
        {"out": "chapeu_da_meia_noite",  "need": {"pano_nobre": 2, "essencia_lunar": 1, "botao_de_osso": 1},  "lvl": 4, "xp": 110},
        {"out": "ombros_da_meia_noite",  "need": {"pano_nobre": 2, "botao_de_osso": 2},                       "lvl": 4, "xp": 110},
        {"out": "tunica_da_meia_noite",  "need": {"pano_nobre": 3, "essencia_lunar": 2, "gema_lapidada": 1},  "lvl": 4, "xp": 140},
        {"out": "calcas_da_meia_noite",  "need": {"pano_nobre": 2, "essencia_lunar": 1, "fio_rustico": 2},    "lvl": 4, "xp": 120},
        {"out": "sapatos_da_meia_noite", "need": {"pano_nobre": 2, "botao_de_osso": 2, "fio_rustico": 1},     "lvl": 4, "xp": 110},
    ],
    # ---- CARPINTEIRO: tora -> tábua -> verga -> cerne (corda vem do costureiro) ----
    "carpinteiro": [
        {"out": "tabua_polida",         "need": {"madeira_carvalho": 2},                           "lvl": 1, "xp": 8},
        {"out": "arco_de_carvalho",     "need": {"tabua_polida": 2, "fio_rustico": 2},             "lvl": 1, "xp": 20},
        {"out": "verga_rubra",          "need": {"madeira_rubra": 2, "tabua_polida": 1},           "lvl": 2, "xp": 14},
        {"out": "cajado_rubro",         "need": {"verga_rubra": 2},                                "lvl": 2, "xp": 35},
        {"out": "arco_rubro",           "need": {"verga_rubra": 2, "fio_rustico": 3},              "lvl": 3, "xp": 55},
        {"out": "cerne_umbrio",         "need": {"madeira_umbria": 2, "verga_rubra": 1},           "lvl": 3, "xp": 22},
        {"out": "cajado_umbrio",        "need": {"cerne_umbrio": 2, "gema_bruta": 1},              "lvl": 4, "xp": 80},
        {"out": "cerne_do_mundo",       "need": {"cerne_umbrio": 4, "gema_lapidada": 1, "fio_rustico": 2}, "lvl": 4, "xp": 140},
    ],
    # ---- ALQUIMISTA: erva -> essência -> extrato -> elixir ----
    "alquimista": [
        {"out": "essencia_solar",       "need": {"erva_solar": 2},                                 "lvl": 1, "xp": 8},
        {"out": "pocao_leve",           "need": {"essencia_solar": 1},                             "lvl": 1, "xp": 20},
        {"out": "essencia_lunar",       "need": {"erva_lunar": 2, "erva_solar": 1},                "lvl": 2, "xp": 14},
        {"out": "elixir_lunar",         "need": {"essencia_lunar": 1},                             "lvl": 2, "xp": 35},
        {"out": "tonico_umbrio",        "need": {"essencia_lunar": 2, "minerio_umbrio": 1},        "lvl": 3, "xp": 55},
        {"out": "panaceia",             "need": {"essencia_lunar": 2, "essencia_solar": 2, "presa_vampirica": 1}, "lvl": 3, "xp": 70},
        {"out": "lagrima_de_atalech",   "need": {"essencia_lunar": 3, "essencia_solar": 2, "presa_vampirica": 2, "gema_lapidada": 1}, "lvl": 4, "xp": 140},
    ],
    # ---- JOALHEIRO: gema/prata -> lapidada/engaste -> joia (barra vem do ferreiro) ----
    "joalheiro": [
        {"out": "anel_de_prata",        "need": {"barra_de_prata": 1},                             "lvl": 1, "xp": 20},
        {"out": "gema_lapidada",        "need": {"gema_bruta": 1},                                 "lvl": 2, "xp": 18},
        {"out": "colar_de_gema",        "need": {"gema_lapidada": 1, "barra_de_prata": 1},         "lvl": 2, "xp": 35},
        {"out": "anel_lunar",           "need": {"barra_umbria": 1, "perola": 1},                  "lvl": 3, "xp": 55},
        {"out": "chave_da_fenda",       "need": {"gema_lapidada": 1, "barra_umbria": 1, "essencia_lunar": 1}, "lvl": 3, "xp": 60},
        {"out": "diadema_umbrio",       "need": {"gema_lapidada": 2, "barra_umbria": 2},           "lvl": 4, "xp": 80},
        {"out": "coroa_do_alvorecer",   "need": {"gema_lapidada": 3, "barra_de_prata": 3, "perola": 2}, "lvl": 4, "xp": 140},
    ],
    # ---- COZINHEIRO: caça -> prato -> banquete ----
    "cozinheiro": [
        {"out": "espeto_do_cacador",    "need": {"carne_caca": 2},                                 "lvl": 1, "xp": 20},
        {"out": "ensopado_da_vila",     "need": {"carne_caca": 2, "erva_solar": 1},                "lvl": 2, "xp": 35},
        {"out": "banquete_do_maraja",   "need": {"carne_caca": 4, "chifre_de_bufalo": 1},          "lvl": 3, "xp": 55},
        {"out": "festim_umbrio",        "need": {"carne_caca": 3, "presa_vampirica": 1},           "lvl": 3, "xp": 70},
        {"out": "banquete_dos_reis",    "need": {"carne_caca": 5, "presa_vampirica": 2, "peixe_dourado": 1, "essencia_solar": 1}, "lvl": 4, "xp": 140},
    ],
}


# ===========================================================================
#  O ARSENAL TIBIA: machados e maças na forja, lanças e bestas na marcenaria,
#  munição em lote barato, e as RUNAS gravadas pelo alquimista.
# ===========================================================================
RECIPES["costureiro"].extend([
    {"out": "opulencia_capuz",  "need": {"tecido_prosperiano": 4, "fio_dourado": 2}, "lvl": 9,  "xp": 400},
    {"out": "opulencia_botas",  "need": {"tecido_prosperiano": 4, "fio_dourado": 2}, "lvl": 9,  "xp": 400},
    {"out": "opulencia_calcas", "need": {"tecido_prosperiano": 5, "fio_dourado": 3}, "lvl": 10, "xp": 600},
    {"out": "opulencia_tunica", "need": {"tecido_prosperiano": 7, "fio_dourado": 4}, "lvl": 10, "xp": 900},
])

RECIPES["alquimista"].extend([
    {"out": "elixir_alvorada", "need": {"erva_luminosa": 6, "cogumelo_raro": 3, "cristal_arcano": 1}, "lvl": 8,  "xp": 300},
    {"out": "casca_de_pedra",  "need": {"erva_luminosa": 4, "minerio_ferro": 5, "cogumelo_raro": 2}, "lvl": 8,  "xp": 300},
    {"out": "sangue_de_fenix", "need": {"erva_luminosa": 8, "cogumelo_raro": 4, "cristal_arcano": 2}, "lvl": 10, "xp": 500},
    {"out": "nevoa_de_nhare",  "need": {"erva_luminosa": 5, "cogumelo_raro": 3, "cristal_arcano": 1}, "lvl": 9,  "xp": 400},
])

RECIPES["ferreiro"].extend([
    {"out": "machadinha",         "need": {"barra_de_ferro": 1, "madeira_carvalho": 1},  "lvl": 1, "xp": 16},
    {"out": "machado_lenhador",   "need": {"barra_de_ferro": 2, "madeira_carvalho": 1},  "lvl": 2, "xp": 26},
    {"out": "machado_de_batalha", "need": {"barra_de_prata": 2, "couro_curtido": 1},   "lvl": 3, "xp": 44},
    {"out": "machado_umbrio",     "need": {"barra_umbria": 2, "essencia_lunar": 1},  "lvl": 4, "xp": 70},
    {"out": "porrete_de_ipe",     "need": {"madeira_carvalho": 2},                        "lvl": 1, "xp": 14},
    {"out": "maca_cravejada",     "need": {"barra_de_ferro": 1, "madeira_carvalho": 2},  "lvl": 2, "xp": 26},
    {"out": "martelo_de_guerra",  "need": {"barra_de_prata": 2, "madeira_carvalho": 1},    "lvl": 3, "xp": 44},
    {"out": "maca_umbria",        "need": {"barra_umbria": 2, "gema_bruta": 1},      "lvl": 4, "xp": 70},
])
RECIPES["carpinteiro"].extend([
    {"out": "lanca_de_pesca",     "need": {"madeira_carvalho": 2, "fibra_capim": 1},  "lvl": 1, "xp": 16},
    {"out": "azagaia",            "need": {"madeira_carvalho": 2, "barra_de_ferro": 1},  "lvl": 2, "xp": 28},
    {"out": "lanca_serrilhada",   "need": {"madeira_rubra": 2, "barra_de_prata": 1},   "lvl": 3, "xp": 48},
    {"out": "besta_simples",      "need": {"madeira_carvalho": 2, "fibra_capim": 2},  "lvl": 2, "xp": 30},
    {"out": "besta_de_caca",      "need": {"madeira_rubra": 2, "couro_curtido": 1},  "lvl": 3, "xp": 50},
    {"out": "besta_pesada",       "need": {"madeira_rubra": 3, "barra_de_prata": 2},   "lvl": 4, "xp": 76},
    {"out": "flecha",             "need": {"madeira_carvalho": 1},                        "lvl": 1, "xp": 3},
    {"out": "virote",             "need": {"madeira_carvalho": 1},                        "lvl": 1, "xp": 3},
])
RECIPES["alquimista"].extend([
    {"out": "runa_missil_pesado", "need": {"runa_em_branco": 1, "essencia_lunar": 1},               "lvl": 2, "xp": 30},
    {"out": "runa_lanca_gelida",  "need": {"runa_em_branco": 1, "essencia_lunar": 1},                "lvl": 2, "xp": 32},
    {"out": "runa_cura_intensa",  "need": {"runa_em_branco": 1, "erva_solar": 2},                    "lvl": 2, "xp": 30},
    {"out": "runa_bola_de_fogo",  "need": {"runa_em_branco": 1, "essencia_solar": 1},                "lvl": 3, "xp": 46},
    {"out": "runa_explosao",      "need": {"runa_em_branco": 1, "essencia_solar": 2},                "lvl": 3, "xp": 52},
    {"out": "runa_pesadelo",      "need": {"runa_em_branco": 1, "essencia_sombria": 1},              "lvl": 3, "xp": 52},
    {"out": "runa_cura_suprema",  "need": {"runa_em_branco": 1, "erva_solar": 2, "essencia_lunar": 1}, "lvl": 4, "xp": 72},
    {"out": "runa_morte_subita",  "need": {"runa_em_branco": 1, "essencia_sombria": 2, "gema_lapidada": 1}, "lvl": 5, "xp": 110},
])
