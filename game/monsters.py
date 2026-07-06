"""
MONSTROS do Ermo: bichos e capangas. Stat blocks no estilo D&D 5e (simplificados
pro combate por turnos que vem no passo B2). Os primeiros vivem em O Descampado.

Campos de cada tipo:
  name   nome exibido
  hp     pontos de vida
  ac     classe de armadura
  atk    bonus de ataque (d20 + atk vs CA)
  dmg    dano no acerto: {n dados, d faces, flat fixo}  (ex.: 2d4+2)
  reach  alcance do ataque em tiles (1 = corpo a corpo)
  speed  deslocamento em tiles por turno (6 = 9m)
  xp     XP concedido ao ser derrotado
  dex    modificador de Destreza (pra iniciativa)
  glyph  emoji desenhado no tile
  kind   "bicho" ou "capanga"
  atk_name  nome do ataque (pro log de combate)
"""
import random as _rnd

MONSTERS = {
    "rato_gigante": {
        "name": "Rato Gigante", "hp": 7, "ac": 12, "atk": 4,
        "dmg": {"n": 1, "d": 4, "flat": 2}, "reach": 1, "speed": 6,
        "xp": 5, "dex": 2, "glyph": "🐀", "kind": "bicho", "atk_name": "mordida",
        "drops": [("rabo_rato", 0.6, 1, 1)], "bronze": (1, 3),
    },
    "lobo": {
        "name": "Lobo", "hp": 11, "ac": 13, "atk": 4,
        "dmg": {"n": 2, "d": 4, "flat": 2}, "reach": 1, "speed": 8,
        "xp": 8, "dex": 2, "glyph": "🐺", "kind": "bicho", "atk_name": "mordida",
        "drops": [("presa_lobo", 0.5, 1, 2), ("pelego_lobo", 0.3, 1, 1)], "bronze": (2, 5),
    },
    "javali": {
        "name": "Javali", "hp": 13, "ac": 11, "atk": 3,
        "dmg": {"n": 1, "d": 6, "flat": 1}, "reach": 1, "speed": 7,
        "xp": 8, "dex": 0, "glyph": "🐗", "kind": "bicho", "atk_name": "presada",
        "drops": [("presa_javali", 0.5, 1, 2), ("couro_javali", 0.35, 1, 1)], "bronze": (2, 5),
    },
    "capanga": {
        "name": "Cria de Sapopemba", "hp": 13, "ac": 12, "atk": 3,
        "dmg": {"n": 1, "d": 6, "flat": 1}, "reach": 1, "speed": 6,
        "xp": 6, "dex": 1, "glyph": "🔪", "kind": "capanga", "atk_name": "facão",
        "drops": [("bornal_cria", 0.4, 1, 1)], "bronze": (4, 9),
    },
    "capanga_brutamontes": {
        "name": "Traficante de Sapopemba", "hp": 36, "ac": 13, "atk": 6,
        "dmg": {"n": 2, "d": 6, "flat": 3}, "reach": 1, "speed": 6,
        "xp": 20, "dex": 1, "glyph": "🪓", "kind": "capanga", "atk_name": "marreta",
        "drops": [("marreta_velha", 0.4, 1, 1)], "bronze": (10, 18),
    },
    "maurao": {
        "name": "Maurão da Sapo", "hp": 140, "ac": 16, "atk": 8,
        "dmg": {"n": 3, "d": 6, "flat": 5}, "reach": 1, "speed": 6,
        "xp": 150, "dex": 1, "glyph": "👑", "kind": "capanga",
        "atk_name": "marretada", "boss": True, "summon_type": "capanga_brutamontes", "summons": 5,
        "drops": [("correntao_ouro", 1.0, 1, 1), ("microfone_patrao", 1.0, 1, 1),
                  ("coin_gold", 1.0, 1, 1)], "bronze": (60, 90),
    },
    "velho_bob": {
        "name": "O Velho Bob", "hp": 120, "ac": 14, "atk": 8,
        "dmg": {"n": 2, "d": 8, "flat": 6}, "reach": 1, "speed": 8,
        "xp": 120, "dex": 2, "glyph": "🐗", "kind": "bicho",
        "atk_name": "investida", "boss": True, "summon_type": "javali", "summons": 3,
        "drops": [("presa_velho_bob", 1.0, 1, 1), ("couro_velho_bob", 1.0, 1, 2)],
        "bronze": (45, 70),
    },

    # ===================================================================
    #  REPOUSO DA DAMA — a floresta escura ao leste (zona de nivel alto)
    # ===================================================================
    # borda (rala): lobos negros. mata (densa): harpias e bruxas.
    # fundo (breu): 5 tipos de espirito. clareira: a Dama da Noite (banshee).
    "lobo_negro": {
        "name": "Lobo Negro", "hp": 38, "ac": 15, "atk": 6,
        "dmg": {"n": 2, "d": 6, "flat": 4}, "reach": 1, "speed": 9,
        "xp": 14, "dex": 3, "glyph": "🐺", "kind": "bicho", "atk_name": "dentada",
        "drops": [("couro_lobo_negro", 0.7, 1, 2), ("presa_lobo", 0.4, 1, 1)], "bronze": (8, 16),
    },
    "harpia": {
        "name": "Harpia", "hp": 44, "ac": 15, "atk": 7,
        "dmg": {"n": 2, "d": 6, "flat": 3}, "reach": 1, "speed": 8,
        "xp": 16, "dex": 4, "glyph": "🦅", "kind": "bicho", "atk_name": "garras",
        "drops": [("pena_harpia", 0.7, 1, 2), ("coin_silver", 0.3, 1, 1)], "bronze": (10, 20),
    },
    "bruxa_louca": {
        "name": "Bruxa Enlouquecida", "hp": 48, "ac": 14, "atk": 7,
        "dmg": {"n": 2, "d": 6, "flat": 4}, "reach": 4, "speed": 6,
        "xp": 20, "dex": 2, "glyph": "🧙", "kind": "bruxa", "atk_name": "praga",
        "drops": [("dedo_bruxa", 0.7, 1, 1), ("coin_silver", 0.4, 1, 1)], "bronze": (14, 26),
    },
    "alma_errante": {
        "name": "Alma Errante", "hp": 32, "ac": 16, "atk": 7,
        "dmg": {"n": 2, "d": 6, "flat": 4}, "reach": 1, "speed": 7,
        "xp": 15, "dex": 4, "glyph": "👻", "kind": "espirito", "atk_name": "toque gelido",
        "drops": [("ectoplasma", 0.7, 1, 2)], "bronze": (10, 20),
    },
    "assombracao": {
        "name": "Assombracao", "hp": 42, "ac": 15, "atk": 7,
        "dmg": {"n": 3, "d": 4, "flat": 4}, "reach": 1, "speed": 6,
        "xp": 18, "dex": 3, "glyph": "👻", "kind": "espirito", "atk_name": "lamento",
        "drops": [("veu_assombracao", 0.7, 1, 1)], "bronze": (12, 22),
    },
    "espectro": {
        "name": "Espectro", "hp": 36, "ac": 17, "atk": 8,
        "dmg": {"n": 2, "d": 8, "flat": 3}, "reach": 1, "speed": 8,
        "xp": 22, "dex": 5, "glyph": "💀", "kind": "espirito", "atk_name": "garra eterea",
        "drops": [("cinza_espectral", 0.7, 1, 1), ("coin_silver", 0.3, 1, 1)], "bronze": (14, 24),
    },
    "vulto": {
        "name": "Vulto Sombrio", "hp": 48, "ac": 16, "atk": 8,
        "dmg": {"n": 2, "d": 6, "flat": 6}, "reach": 1, "speed": 7,
        "xp": 24, "dex": 4, "glyph": "🌑", "kind": "espirito", "atk_name": "sombra",
        "drops": [("essencia_sombria", 0.7, 1, 1)], "bronze": (16, 28),
    },
    "alma_penada": {
        "name": "Alma Penada", "hp": 54, "ac": 16, "atk": 8,
        "dmg": {"n": 3, "d": 6, "flat": 4}, "reach": 1, "speed": 6,
        "xp": 28, "dex": 3, "glyph": "😱", "kind": "espirito", "atk_name": "grito sufocado",
        "drops": [("lamento_petrificado", 0.7, 1, 1), ("coin_silver", 0.35, 1, 1)], "bronze": (18, 32),
    },
    "dama_noite": {
        "name": "A Dama da Noite", "hp": 520, "ac": 19, "atk": 12,
        "dmg": {"n": 4, "d": 10, "flat": 8}, "reach": 2, "speed": 7,
        "xp": 600, "dex": 5, "glyph": "💀", "kind": "espirito",
        "atk_name": "lamento mortal", "boss": True, "summon_type": "alma_errante", "summons": 3,
        "drops": [("cajado_magico", 1.0, 1, 1), ("lagrima_da_dama", 1.0, 1, 1),
                  ("coin_gold", 1.0, 1, 1)], "bronze": (100, 150),
    },
    "colosso_avasham": {
        "name": "O Colosso de Avasham", "hp": 1520, "ac": 21, "atk": 16,
        "dmg": {"n": 6, "d": 10, "flat": 14}, "reach": 2, "speed": 6,
        "xp": 1500, "dex": 3, "glyph": "🗿", "kind": "golem", "size": 4,
        "atk_name": "punho de pedra", "boss": True, "summon_type": "elemental_areia", "summons": 4,
        "drops": [("correntes_colosso", 1.0, 1, 1), ("coin_gold", 1.0, 3, 5)], "bronze": (400, 650),
    },
    "lorde_varth": {
        "name": "Lorde Varth", "hp": 8000, "ac": 23, "atk": 24,
        "dmg": {"n": 8, "d": 12, "flat": 28}, "reach": 3, "speed": 5,
        "xp": 4200, "dex": 4, "glyph": "\U0001f9d9", "kind": "necromante", "size": 5,
        "atk_name": "raio necromântico", "boss": True,
        "summon_type": ["tumular_torre", "carniceiro_torre", "cavaleiro_torre",
                        "algoz_torre", "necromante_torre", "profanador_torre"],
        "summons": 16,
        "drops": [("botas_vargo", 1.0, 1, 1), ("anel_atalech", 1.0, 1, 1), ("simbolo_varth", 1.0, 1, 2), ("anel_varth", 1.0, 1, 1), ("coin_gold", 1.0, 4, 6)], "bronze": (1500, 2500),
    },

    # ===================== TORRE DO LORDE NECROTICO =====================
    # ANDAR 1 - mortos-vivos (~500 hp)
    "tumular_torre": {
        "name": "Tumular da Torre", "hp": 500, "ac": 16, "atk": 13,
        "dmg": {"n": 3, "d": 10, "flat": 7}, "reach": 1, "speed": 5,
        "xp": 800, "dex": 1, "glyph": "🧟", "kind": "undead",
        "atk_name": "garras pútridas",
        "drops": [("coin_gold", 1.0, 1, 2)], "bronze": (500, 850),
    },
    "carniceiro_torre": {
        "name": "Carniceiro da Torre", "hp": 470, "ac": 15, "atk": 14,
        "dmg": {"n": 4, "d": 8, "flat": 6}, "reach": 1, "speed": 6,
        "xp": 870, "dex": 2, "glyph": "🪓", "kind": "undead",
        "atk_name": "cutelo enferrujado",
        "drops": [("coin_gold", 1.0, 1, 2)], "bronze": (650, 1000),
    },
    # ANDAR 2 - cavaleiros da morte (300-700 hp)
    "cavaleiro_torre": {
        "name": "Cavaleiro Profano", "hp": 650, "ac": 19, "atk": 16,
        "dmg": {"n": 4, "d": 10, "flat": 9}, "reach": 1, "speed": 6,
        "xp": 2000, "dex": 2, "glyph": "⚔️", "kind": "death_knight",
        "atk_name": "lâmina profana",
        "drops": [("simbolo_varth", 0.15, 1, 1), ("coin_gold", 1.0, 2, 3)], "bronze": (1800, 2800),
    },
    "algoz_torre": {
        "name": "Algoz da Torre", "hp": 560, "ac": 18, "atk": 17,
        "dmg": {"n": 5, "d": 8, "flat": 9}, "reach": 2, "speed": 6,
        "xp": 2150, "dex": 3, "glyph": "🗡️", "kind": "death_knight",
        "atk_name": "machado do carrasco",
        "drops": [("simbolo_varth", 0.15, 1, 1), ("coin_gold", 1.0, 2, 4)], "bronze": (2000, 3000),
    },
    # ANDAR 3 - necromantes profanos (650 hp, MUITA armadura)
    "necromante_torre": {
        "name": "Necromante Profano", "hp": 650, "ac": 22, "atk": 16,
        "dmg": {"n": 4, "d": 10, "flat": 9}, "reach": 5, "speed": 6,
        "xp": 3500, "dex": 4, "glyph": "🔮", "kind": "necromante",
        "atk_name": "raio profano", "summon_type": "esqueleto_guerreiro", "summons": 4,
        "drops": [("simbolo_varth", 0.3, 1, 1), ("coin_gold", 1.0, 3, 5)], "bronze": (3000, 4500),
    },
    "profanador_torre": {
        "name": "Profanador de Almas", "hp": 620, "ac": 23, "atk": 17,
        "dmg": {"n": 5, "d": 8, "flat": 10}, "reach": 5, "speed": 6,
        "xp": 3800, "dex": 4, "glyph": "💀", "kind": "necromante",
        "atk_name": "toque dilacerador",
        "drops": [("simbolo_varth", 0.3, 1, 1), ("coin_gold", 1.0, 3, 6)], "bronze": (3500, 5000),
    },

    # ===================== DESERTO DE AVASHAM (mais forte que a floresta) =====================
    "lacraia_gigante": {
        "name": "Lacraia Gigante", "hp": 100, "ac": 15, "atk": 8,
        "dmg": {"n": 3, "d": 6, "flat": 4}, "reach": 1, "speed": 11,
        "xp": 35, "dex": 5, "glyph": "🐛", "kind": "inseto", "atk_name": "ferroada",
        "drops": [("presa_lacraia", 0.7, 1, 2), ("coin_bronze", 0.3, 1, 1)], "bronze": (20, 36),
    },
    "hiena_ermo": {
        "name": "Hiena do Ermo", "hp": 110, "ac": 15, "atk": 8,
        "dmg": {"n": 3, "d": 6, "flat": 5}, "reach": 1, "speed": 9,
        "xp": 38, "dex": 3, "glyph": "🐕", "kind": "bicho", "atk_name": "mordida",
        "drops": [("couro_hiena", 0.7, 1, 2), ("presa_lobo", 0.3, 1, 1)], "bronze": (22, 40),
    },
    "abutre_carniceiro": {
        "name": "Abutre Carniceiro", "hp": 105, "ac": 16, "atk": 9,
        "dmg": {"n": 3, "d": 6, "flat": 4}, "reach": 1, "speed": 8,
        "xp": 40, "dex": 4, "glyph": "🦅", "kind": "bicho", "atk_name": "bicada",
        "drops": [("pena_abutre", 0.7, 1, 2), ("coin_silver", 0.3, 1, 1)], "bronze": (24, 42),
    },
    "naja_dunas": {
        "name": "Naja das Dunas", "hp": 120, "ac": 16, "atk": 9,
        "dmg": {"n": 3, "d": 8, "flat": 4}, "reach": 1, "speed": 9,
        "xp": 45, "dex": 5, "glyph": "🐍", "kind": "bicho", "atk_name": "bote venenoso",
        "drops": [("veneno_naja", 0.7, 1, 1), ("coin_silver", 0.3, 1, 1)], "bronze": (26, 46),
    },
    "escorpiao_gigante": {
        "name": "Escorpião Gigante", "hp": 150, "ac": 17, "atk": 10,
        "dmg": {"n": 3, "d": 8, "flat": 5}, "reach": 1, "speed": 7,
        "xp": 55, "dex": 3, "glyph": "🦂", "kind": "inseto", "atk_name": "ferrão",
        "drops": [("ferrao_escorpiao", 0.7, 1, 1), ("coin_silver", 0.35, 1, 1)], "bronze": (30, 52),
    },
    "verme_areias": {
        "name": "Verme das Areias", "hp": 175, "ac": 16, "atk": 10,
        "dmg": {"n": 4, "d": 6, "flat": 5}, "reach": 2, "speed": 6,
        "xp": 60, "dex": 2, "glyph": "🪱", "kind": "bicho", "atk_name": "abocanhada",
        "drops": [("placa_verme", 0.7, 1, 2)], "bronze": (32, 56),
    },
    "elemental_areia": {
        "name": "Elemental de Areia", "hp": 165, "ac": 18, "atk": 10,
        "dmg": {"n": 3, "d": 8, "flat": 6}, "reach": 1, "speed": 7,
        "xp": 65, "dex": 3, "glyph": "🌪️", "kind": "elemental", "atk_name": "vendaval",
        "drops": [("nucleo_areia", 0.7, 1, 1)], "bronze": (34, 58),
    },
    "basilisco_deserto": {
        "name": "Basilisco do Deserto", "hp": 210, "ac": 18, "atk": 11,
        "dmg": {"n": 4, "d": 8, "flat": 6}, "reach": 1, "speed": 6,
        "xp": 80, "dex": 3, "glyph": "🦎", "kind": "bicho", "atk_name": "olhar petrificante",
        "drops": [("olho_basilisco", 0.8, 1, 1), ("coin_gold", 0.3, 1, 1)], "bronze": (40, 70),
    },

    # ============= CEMITÉRIO ANTIGO DE VALDARKRAM (mais forte que o deserto) =============
    "esqueleto_guerreiro": {
        "name": "Esqueleto Guerreiro", "hp": 190, "ac": 17, "atk": 9,
        "dmg": {"n": 4, "d": 6, "flat": 6}, "reach": 1, "speed": 7,
        "xp": 173, "dex": 3, "glyph": "💀", "kind": "morto-vivo", "atk_name": "espadada",
        "drops": [("osso_amaldicoado", 0.7, 1, 2), ("coin_silver", 0.3, 1, 1)], "bronze": (30, 52),
    },
    "zumbi_putrido": {
        "name": "Zumbi Pútrido", "hp": 240, "ac": 16, "atk": 9,
        "dmg": {"n": 4, "d": 6, "flat": 7}, "reach": 1, "speed": 4,
        "xp": 192, "dex": 1, "glyph": "🧟", "kind": "morto-vivo", "atk_name": "garras podres",
        "drops": [("carne_putrida", 0.7, 1, 2)], "bronze": (32, 54),
    },
    "ghoul_faminto": {
        "name": "Ghoul Faminto", "hp": 210, "ac": 17, "atk": 10,
        "dmg": {"n": 4, "d": 6, "flat": 6}, "reach": 1, "speed": 9,
        "xp": 211, "dex": 4, "glyph": "👹", "kind": "morto-vivo", "atk_name": "dilacerar",
        "drops": [("garra_ghoul", 0.7, 1, 1), ("coin_silver", 0.3, 1, 1)], "bronze": (34, 56),
    },
    "aparicao_sepulcral": {
        "name": "Aparição Sepulcral", "hp": 200, "ac": 18, "atk": 10,
        "dmg": {"n": 4, "d": 8, "flat": 5}, "reach": 1, "speed": 8,
        "xp": 230, "dex": 5, "glyph": "👻", "kind": "espirito", "atk_name": "toque sepulcral",
        "drops": [("mortalha_espectral", 0.7, 1, 1)], "bronze": (36, 60),
    },
    "carnical_profanador": {
        "name": "Carniçal Profanador", "hp": 260, "ac": 18, "atk": 11,
        "dmg": {"n": 4, "d": 8, "flat": 6}, "reach": 1, "speed": 7,
        "xp": 269, "dex": 3, "glyph": "🧟", "kind": "morto-vivo", "atk_name": "presas",
        "drops": [("lingua_carnical", 0.7, 1, 1), ("coin_silver", 0.35, 1, 1)], "bronze": (40, 66),
    },
    "cavaleiro_morte": {
        "name": "Cavaleiro da Morte", "hp": 310, "ac": 19, "atk": 12,
        "dmg": {"n": 5, "d": 6, "flat": 7}, "reach": 1, "speed": 6,
        "xp": 326, "dex": 3, "glyph": "⚔️", "kind": "morto-vivo", "atk_name": "lâmina negra",
        "drops": [("elmo_cavaleiro_morte", 0.7, 1, 1), ("coin_gold", 0.3, 1, 1)], "bronze": (50, 84),
    },
    "necromante_caido": {
        "name": "Necromante Caído", "hp": 280, "ac": 18, "atk": 11,
        "dmg": {"n": 4, "d": 8, "flat": 7}, "reach": 5, "speed": 6,
        "xp": 304, "dex": 4, "glyph": "🧙", "kind": "morto-vivo", "atk_name": "raio sombrio",
        "summon_type": "esqueleto_guerreiro", "summons": 2,
        "drops": [("grimorio_negro", 0.8, 1, 1), ("coin_gold", 0.3, 1, 1)], "bronze": (54, 90),
    },
    "abominacao_ossea": {
        "name": "Abominação Óssea", "hp": 440, "ac": 20, "atk": 14,
        "dmg": {"n": 5, "d": 8, "flat": 10}, "reach": 2, "speed": 5,
        "xp": 461, "dex": 2, "glyph": "☠️", "kind": "morto-vivo", "atk_name": "esmagar ósseo",
        "drops": [("coracao_abominacao", 0.9, 1, 1), ("coin_gold", 0.4, 1, 1)], "bronze": (70, 120),
    },

    # ===================== MINA FECHADA DE AVHUR (tumba egipcia, pela piramide) =====================
    # Mortos-vivos e escravos amaldicoados sob o deserto. Zona de GRANA: ~3x o bronze
    # do cemiterio, ~0.8x o xp. TODOS largam a Moeda de Avhur (vale 500 nos mercadores).
    "escaravelho_praga": {
        "name": "Escaravelho da Praga", "hp": 30, "ac": 13, "atk": 4,
        "dmg": {"n": 1, "d": 6, "flat": 1}, "reach": 1, "speed": 8,
        "xp": 86, "dex": 4, "glyph": "🪲", "kind": "inseto", "atk_name": "ferroada",
        "drops": [("moeda_avhur", 1.0, 1, 1)], "bronze": (90, 150),
    },
    "servo_envolto": {
        "name": "Servo Envolto", "hp": 44, "ac": 13, "atk": 5,
        "dmg": {"n": 1, "d": 8, "flat": 1}, "reach": 1, "speed": 4,
        "xp": 95, "dex": 1, "glyph": "🧟", "kind": "morto-vivo", "atk_name": "garra enfaixada",
        "drops": [("moeda_avhur", 1.0, 1, 1)], "bronze": (96, 156),
    },
    "escravo_amaldicoado": {
        "name": "Escravo Amaldiçoado", "hp": 50, "ac": 12, "atk": 5,
        "dmg": {"n": 1, "d": 8, "flat": 2}, "reach": 1, "speed": 5,
        "xp": 100, "dex": 2, "glyph": "⛓️", "kind": "morto-vivo", "atk_name": "corrente",
        "drops": [("moeda_avhur", 1.0, 1, 1)], "bronze": (102, 162),
    },
    "naja_tumular": {
        "name": "Naja Tumular", "hp": 38, "ac": 14, "atk": 6,
        "dmg": {"n": 1, "d": 6, "flat": 2}, "reach": 1, "speed": 6,
        "xp": 110, "dex": 4, "glyph": "🐍", "kind": "serpente", "atk_name": "bote venenoso",
        "drops": [("moeda_avhur", 1.0, 1, 1)], "bronze": (108, 168),
    },
    "chacal_anubita": {
        "name": "Chacal Anubita", "hp": 52, "ac": 14, "atk": 6,
        "dmg": {"n": 1, "d": 8, "flat": 3}, "reach": 1, "speed": 7,
        "xp": 120, "dex": 3, "glyph": "🐺", "kind": "besta", "atk_name": "dentada",
        "drops": [("moeda_avhur", 1.0, 1, 1), ("pelo_chacal_avhur", 0.6, 1, 1)], "bronze": (114, 180),
    },
    "mumia_guerreira": {
        "name": "Múmia Guerreira", "hp": 66, "ac": 15, "atk": 7,
        "dmg": {"n": 1, "d": 10, "flat": 3}, "reach": 1, "speed": 4,
        "xp": 140, "dex": 1, "glyph": "🧟", "kind": "morto-vivo", "atk_name": "machado ritual",
        "drops": [("moeda_avhur", 1.0, 1, 1), ("coin_gold", 0.15, 1, 1)], "bronze": (126, 198),
    },
    "sacerdote_sombrio": {
        "name": "Sacerdote Sombrio", "hp": 54, "ac": 13, "atk": 6,
        "dmg": {"n": 1, "d": 8, "flat": 2}, "reach": 2, "speed": 5,
        "xp": 150, "dex": 2, "glyph": "🧙", "kind": "morto-vivo", "atk_name": "praga sussurrada",
        "drops": [("moeda_avhur", 1.0, 1, 1)], "bronze": (138, 210),
    },
    "guardiao_arenito": {
        "name": "Guardião de Arenito", "hp": 84, "ac": 16, "atk": 8,
        "dmg": {"n": 1, "d": 12, "flat": 4}, "reach": 1, "speed": 4,
        "xp": 160, "dex": 0, "glyph": "🗿", "kind": "golem", "atk_name": "punho de arenito",
        "drops": [("moeda_avhur", 1.0, 1, 1)], "bronze": (150, 228),
    },
    "espirito_faraonico": {
        "name": "Espírito Faraônico", "hp": 48, "ac": 14, "atk": 7,
        "dmg": {"n": 1, "d": 8, "flat": 3}, "reach": 1, "speed": 6,
        "xp": 165, "dex": 3, "glyph": "👻", "kind": "espirito", "atk_name": "toque gélido",
        "drops": [("moeda_avhur", 1.0, 1, 1)], "bronze": (144, 216),
    },
    "carregador_canopo": {
        "name": "Carregador Canopo", "hp": 72, "ac": 14, "atk": 7,
        "dmg": {"n": 1, "d": 10, "flat": 4}, "reach": 1, "speed": 4,
        "xp": 175, "dex": 1, "glyph": "🏺", "kind": "morto-vivo", "atk_name": "jarra canópica",
        "drops": [("moeda_avhur", 1.0, 1, 1)], "bronze": (156, 240),
    },
    "anubis_guerreiro": {
        "name": "Guerreiro de Anúbis", "hp": 90, "ac": 16, "atk": 9,
        "dmg": {"n": 2, "d": 6, "flat": 4}, "reach": 1, "speed": 6,
        "xp": 200, "dex": 3, "glyph": "🐺", "kind": "besta", "atk_name": "khopesh",
        "drops": [("moeda_avhur", 1.0, 1, 1), ("pelo_chacal_avhur", 0.7, 1, 1), ("coin_gold", 0.2, 1, 1)], "bronze": (168, 258),
    },
    "abominacao_embalsamada": {
        "name": "Abominação Embalsamada", "hp": 150, "ac": 17, "atk": 11,
        "dmg": {"n": 2, "d": 8, "flat": 7}, "reach": 2, "speed": 4,
        "xp": 230, "dex": 1, "glyph": "🧟", "kind": "morto-vivo", "atk_name": "esmagar enfaixado",
        "drops": [("moeda_avhur", 1.0, 1, 2), ("coin_gold", 0.3, 1, 1)], "bronze": (210, 330),
    },
    "farao_avhur": {
        "name": "Avhur, o Maldito", "hp": 1900, "ac": 24, "atk": 16,
        "dmg": {"n": 5, "d": 10, "flat": 15}, "reach": 2, "speed": 5,
        "xp": 2400, "dex": 4, "glyph": "👑", "kind": "morto-vivo",
        "atk_name": "cetro real", "boss": True, "summon_type": "mumia_guerreira", "summons": 4,
        "drops": [("fagulha_divindade", 1.0, 1, 1), ("mascara_faraonica", 1.0, 1, 1), ("moeda_avhur", 1.0, 6, 10), ("coin_gold", 1.0, 3, 6)],
        "bronze": (500, 800),
    },

    # ===================== FLORESTA DO ERMO: SANTUÁRIO SELVAGEM =====================
    # --- FAIXA 1 (sul, entrada): bichos PASSIVOS (caça: carne pra curar + couro pra vender) ---
    "coelho": {
        "name": "Coelho do Ermo", "hp": 6, "ac": 11, "atk": 0,
        "dmg": {"n": 1, "d": 2, "flat": 0}, "reach": 1, "speed": 7,
        "xp": 30, "dex": 4, "glyph": "🐇", "kind": "besta", "size": 1, "passive": True,
        "atk_name": "patada", "drops": [("carne_caca", 1.0, 1, 1), ("pele_macia", 0.6, 1, 1)], "bronze": (5, 15),
    },
    "lebre": {
        "name": "Lebre Veloz", "hp": 9, "ac": 12, "atk": 1,
        "dmg": {"n": 1, "d": 3, "flat": 0}, "reach": 1, "speed": 8,
        "xp": 45, "dex": 5, "glyph": "🐇", "kind": "besta", "size": 1, "passive": True,
        "atk_name": "coice", "drops": [("carne_caca", 1.0, 1, 2), ("pele_macia", 0.6, 1, 1)], "bronze": (8, 20),
    },
    "veado": {
        "name": "Veado dos Ermos", "hp": 18, "ac": 12, "atk": 2,
        "dmg": {"n": 1, "d": 4, "flat": 1}, "reach": 1, "speed": 6,
        "xp": 70, "dex": 3, "glyph": "🦌", "kind": "besta", "size": 1, "passive": True,
        "atk_name": "chifrada", "drops": [("carne_caca", 1.0, 1, 2), ("couro_selvagem", 0.8, 1, 1)], "bronze": (15, 35),
    },
    "cervo": {
        "name": "Cervo de Galhada", "hp": 30, "ac": 13, "atk": 4,
        "dmg": {"n": 2, "d": 4, "flat": 2}, "reach": 2, "speed": 6,
        "xp": 110, "dex": 3, "glyph": "🦌", "kind": "besta", "size": 1, "passive": True,
        "atk_name": "galhada", "drops": [("carne_caca", 1.0, 2, 3), ("couro_selvagem", 0.9, 1, 1), ("galhada", 0.7, 1, 1)], "bronze": (25, 55),
    },

    # --- FAIXA 2 (meio): LOBOS CINZENTOS DOS ERMOS (mais fortes que o 2º andar da Torre) ---
    "lobo_cinzento_ermo": {
        "name": "Lobo Cinzento dos Ermos", "hp": 820, "ac": 17, "atk": 18,
        "dmg": {"n": 5, "d": 10, "flat": 13}, "reach": 1, "speed": 7,
        "xp": 1400, "dex": 4, "glyph": "🐺", "kind": "besta", "size": 2,
        "atk_name": "mordida dilacerante",
        "drops": [("carne_caca", 1.0, 2, 3), ("couro_selvagem", 1.0, 1, 2), ("coin_gold", 0.5, 1, 3)], "bronze": (350, 600),
    },

    # --- FAIXA 3 (norte): URSOS. Pardo 30% > lobo; Negro > pardo. ---
    "urso_pardo": {
        "name": "Urso Pardo", "hp": 1070, "ac": 18, "atk": 19,
        "dmg": {"n": 6, "d": 10, "flat": 17}, "reach": 2, "speed": 5,
        "xp": 2000, "dex": 2, "glyph": "🐻", "kind": "besta", "size": 4,
        "atk_name": "patada brutal",
        "drops": [("carne_caca", 1.0, 3, 4), ("couro_urso", 1.0, 1, 2), ("coin_gold", 0.6, 2, 4)], "bronze": (500, 850),
    },
    "urso_negro": {
        "name": "Urso Negro", "hp": 1380, "ac": 19, "atk": 20,
        "dmg": {"n": 7, "d": 10, "flat": 20}, "reach": 2, "speed": 5,
        "xp": 2600, "dex": 2, "glyph": "🐻", "kind": "besta", "size": 4,
        "atk_name": "esmagamento",
        "drops": [("carne_caca", 1.0, 3, 5), ("couro_urso", 1.0, 1, 2), ("coin_gold", 0.8, 3, 5)], "bronze": (700, 1100),
    },
    "urso_rei": {
        "name": "Urso Rei do Planalto", "hp": 2100, "ac": 24, "atk": 18,
        "dmg": {"n": 6, "d": 12, "flat": 22}, "reach": 2, "speed": 5,
        "xp": 3200, "dex": 3, "glyph": "🐻", "kind": "besta", "size": 5, "boss": True,
        "atk_name": "patada do rei",
        "drops": [("pelego_do_rei", 1.0, 1, 1), ("couro_urso", 1.0, 2, 3), ("galhada", 1.0, 1, 2), ("coin_gold", 1.0, 5, 9)],
        "bronze": (1200, 2000),
    },

    # ===================== BRASAL, A FERIDA DO MUNDO (leste do Descampado) =====================
    # A elite dos ermos: tudo aqui é mais forte que os ursos da Floresta.
    "cinzal": {
        "name": "Espreitador de Cinzas", "hp": 1600, "ac": 19, "atk": 21,
        "dmg": {"n": 6, "d": 10, "flat": 22}, "reach": 1, "speed": 8,
        "xp": 2600, "dex": 5, "glyph": "\U0001f43a", "kind": "besta", "size": 2,
        "atk_name": "garras de cinza",
        "drops": [("escama_obsidiana", 0.5, 1, 1), ("nucleo_magma", 0.35, 1, 1), ("seiva_flamejante", 0.4, 1, 1), ("coin_gold", 0.6, 2, 4)], "bronze": (600, 950),
    },
    "salamandra_brasal": {
        "name": "Salamandra do Brasal", "hp": 1750, "ac": 19, "atk": 21,
        "dmg": {"n": 6, "d": 10, "flat": 24}, "reach": 2, "speed": 6,
        "xp": 2800, "dex": 4, "glyph": "\U0001f98e", "kind": "besta", "size": 2,
        "atk_name": "chicote de fogo",
        "drops": [("nucleo_magma", 0.6, 1, 2), ("seiva_flamejante", 0.5, 1, 1), ("coin_gold", 0.6, 2, 4)], "bronze": (650, 1000),
    },
    "serpe_magma": {
        "name": "Serpe de Magma", "hp": 1950, "ac": 20, "atk": 22,
        "dmg": {"n": 7, "d": 10, "flat": 24}, "reach": 2, "speed": 6,
        "xp": 3200, "dex": 4, "glyph": "\U0001f409", "kind": "draconico", "size": 3,
        "atk_name": "bote incandescente",
        "drops": [("escama_obsidiana", 0.8, 1, 2), ("nucleo_magma", 0.5, 1, 1), ("coin_gold", 0.8, 3, 5)], "bronze": (800, 1200),
    },
    "golem_obsidiana": {
        "name": "Golem de Obsidiana", "hp": 2600, "ac": 22, "atk": 21,
        "dmg": {"n": 7, "d": 10, "flat": 28}, "reach": 2, "speed": 3,
        "xp": 3800, "dex": 1, "glyph": "\U0001f5ff", "kind": "construto", "size": 4,
        "atk_name": "punho de pedra viva",
        "drops": [("escama_obsidiana", 1.0, 2, 3), ("fragmento_forja", 0.7, 1, 2), ("coin_gold", 0.8, 3, 6)], "bronze": (900, 1400),
    },
    "imp_brasal": {
        "name": "Diabrete do Brasal", "hp": 1450, "ac": 20, "atk": 22,
        "dmg": {"n": 5, "d": 10, "flat": 20}, "reach": 1, "speed": 8,
        "xp": 2400, "dex": 5, "glyph": "\U0001f47f", "kind": "infernal", "size": 1,
        "atk_name": "tridente em brasa",
        "drops": [("fragmento_forja", 0.6, 1, 2), ("seiva_flamejante", 0.4, 1, 1), ("coin_gold", 0.5, 2, 4)], "bronze": (550, 900),
    },
    # --- Goela de Krezath (caverna) ---
    "forjado_krezath": {
        "name": "Forjado de Krezath", "hp": 2800, "ac": 22, "atk": 23,
        "dmg": {"n": 8, "d": 10, "flat": 28}, "reach": 1, "speed": 4,
        "xp": 4200, "dex": 2, "glyph": "\u2694\ufe0f", "kind": "construto", "size": 3,
        "atk_name": "lâmina de obsidiana",
        "drops": [("fragmento_forja", 1.0, 1, 3), ("escama_obsidiana", 0.6, 1, 2), ("coin_gold", 0.9, 3, 6)], "bronze": (1000, 1500),
    },
    "templario_magma": {
        "name": "Templário do Magma", "hp": 3100, "ac": 23, "atk": 24,
        "dmg": {"n": 8, "d": 10, "flat": 32}, "reach": 2, "speed": 4,
        "xp": 4600, "dex": 2, "glyph": "\U0001f6e1\ufe0f", "kind": "construto", "size": 3,
        "atk_name": "espadão fundido",
        "drops": [("coracao_brasa", 0.5, 1, 1), ("fragmento_forja", 0.8, 1, 2), ("coin_gold", 1.0, 4, 7)], "bronze": (1200, 1800),
    },
    "devoto_krezath": {
        "name": "Devoto de Krezath", "hp": 2200, "ac": 21, "atk": 23,
        "dmg": {"n": 6, "d": 10, "flat": 24}, "reach": 3, "speed": 5,
        "xp": 3600, "dex": 3, "glyph": "\U0001f9d9", "kind": "infernal", "size": 2,
        "atk_name": "labareda devota",
        "drops": [("coracao_brasa", 0.4, 1, 1), ("seiva_flamejante", 0.6, 1, 2), ("coin_gold", 0.8, 3, 5)], "bronze": (900, 1400),
    },
    "cria_krezath": {
        "name": "Cria de Krezath", "hp": 950, "ac": 19, "atk": 21,
        "dmg": {"n": 5, "d": 10, "flat": 18}, "reach": 1, "speed": 7,
        "xp": 1200, "dex": 4, "glyph": "\U0001f409", "kind": "draconico", "size": 2,
        "atk_name": "mordida em brasa",
        "drops": [("escama_obsidiana", 0.7, 1, 1), ("coin_gold", 0.4, 1, 3)], "bronze": (300, 550),
    },
    "vulkar": {
        "name": "Vulkar, Guardião da Goela", "hp": 5200, "ac": 24, "atk": 24,
        "dmg": {"n": 9, "d": 10, "flat": 34}, "reach": 2, "speed": 4,
        "xp": 6500, "dex": 2, "glyph": "\U0001f5ff", "kind": "construto", "size": 4, "boss": True,
        "atk_name": "martelo da fornalha",
        "drops": [("martelo_do_guardiao", 1.0, 1, 1), ("elmo_da_fornalha", 1.0, 1, 1), ("coracao_brasa", 1.0, 1, 2), ("coin_gold", 1.0, 5, 9)],
        "bronze": (1800, 2800),
    },
    "krezath": {
        "name": "Krezath, o Devorador Soterrado", "hp": 12000, "ac": 26, "atk": 27,
        "dmg": {"n": 10, "d": 12, "flat": 38}, "reach": 3, "speed": 5,
        "xp": 9000, "dex": 3, "glyph": "\U0001f409", "kind": "draconico", "size": 5,
        "atk_name": "garras primordiais", "boss": True,
        "summon_type": ["cria_krezath"],
        "summons": 8,
        "drops": [("presa_do_devorador", 1.0, 1, 1), ("coracao_de_krezath", 1.0, 1, 1), ("manto_de_escamas", 1.0, 1, 1), ("anel_da_fornalha", 1.0, 1, 1), ("garra_krezath", 1.0, 2, 3), ("coin_gold", 1.0, 8, 14)],
        "bronze": (2500, 4000),
    },

    # ===================== COSTA DE MARAVAI (savana + praia) =====================
    "capivara": {
        "name": "Capivara", "hp": 60, "ac": 12, "atk": 3,
        "dmg": {"n": 1, "d": 4}, "reach": 1, "speed": 5, "passive": True,
        "xp": 40, "dex": 2, "glyph": "\U0001f9ab", "kind": "besta", "size": 2,
        "atk_name": "mordidinha",
        "drops": [("pele_macia", 0.9, 1, 2), ("carne_caca", 0.8, 1, 2), ("filhote_capivara", 0.03, 1, 1)], "bronze": (10, 30),
    },
    "antilope": {
        "name": "Antílope da Savana", "hp": 55, "ac": 14, "atk": 3,
        "dmg": {"n": 1, "d": 6}, "reach": 1, "speed": 9, "passive": True,
        "xp": 45, "dex": 5, "glyph": "\U0001f98c", "kind": "besta", "size": 2,
        "atk_name": "coice",
        "drops": [("couro_selvagem", 0.8, 1, 2), ("carne_caca", 0.9, 1, 2), ("galhada", 0.4, 1, 1)], "bronze": (12, 35),
    },
    "avestruz_brava": {
        "name": "Avestruz Brava", "hp": 700, "ac": 17, "atk": 17,
        "dmg": {"n": 4, "d": 8, "flat": 12}, "reach": 1, "speed": 9,
        "xp": 1200, "dex": 6, "glyph": "\U0001f9a4", "kind": "besta", "size": 2,
        "atk_name": "bicada furiosa",
        "drops": [("pluma_vistosa", 0.8, 1, 2), ("carne_caca", 0.6, 1, 2)], "bronze": (250, 450),
    },
    "hiena_rubra": {
        "name": "Hiena Rubra", "hp": 820, "ac": 17, "atk": 18,
        "dmg": {"n": 4, "d": 8, "flat": 14}, "reach": 1, "speed": 8,
        "xp": 1350, "dex": 4, "glyph": "\U0001f436", "kind": "besta", "size": 1,
        "atk_name": "mordida de matilha",
        "drops": [("couro_rubro", 0.7, 1, 2), ("presa_lobo", 0.4, 1, 1)], "bronze": (280, 500),
    },
    "leao_ermal": {
        "name": "Leão Ermal", "hp": 1250, "ac": 19, "atk": 20,
        "dmg": {"n": 5, "d": 10, "flat": 16}, "reach": 1, "speed": 7,
        "xp": 2100, "dex": 4, "glyph": "\U0001f981", "kind": "besta", "size": 2,
        "atk_name": "patada real",
        "drops": [("couro_de_leao", 0.8, 1, 1), ("presa_lobo", 0.5, 1, 2)], "bronze": (450, 800),
    },
    "bufalo_ermal": {
        "name": "Búfalo Ermal", "hp": 1450, "ac": 21, "atk": 19,
        "dmg": {"n": 5, "d": 10, "flat": 20}, "reach": 1, "speed": 5,
        "xp": 2300, "dex": 2, "glyph": "\U0001f403", "kind": "besta", "size": 3,
        "atk_name": "chifrada",
        "drops": [("chifre_de_bufalo", 0.8, 1, 2), ("couro_selvagem", 0.7, 1, 2), ("carne_caca", 0.8, 1, 3)], "bronze": (500, 900),
    },
    "caranguejo_gigante": {
        "name": "Caranguejo Gigante", "hp": 950, "ac": 23, "atk": 18,
        "dmg": {"n": 4, "d": 10, "flat": 14}, "reach": 1, "speed": 3,
        "xp": 1600, "dex": 1, "glyph": "\U0001f980", "kind": "besta", "size": 2,
        "atk_name": "pincada",
        "drops": [("concha_rara", 0.8, 1, 2), ("perola", 0.08, 1, 1), ("carne_caca", 0.5, 1, 1)], "bronze": (320, 600),
    },
    "medusa_de_areia": {
        "name": "Medusa de Areia", "hp": 700, "ac": 15, "atk": 17,
        "dmg": {"n": 3, "d": 8, "flat": 10}, "reach": 2, "speed": 2,
        "xp": 1100, "dex": 1, "glyph": "\U0001fab8", "kind": "besta", "size": 1,
        "atk_name": "tentáculo urticante",
        "drops": [("concha_rara", 0.4, 1, 1)], "bronze": (200, 380),
    },
    "maraja": {
        "name": "Marajá, o Leão Branco", "hp": 3200, "ac": 22, "atk": 22,
        "dmg": {"n": 7, "d": 10, "flat": 26}, "reach": 2, "speed": 7,
        "xp": 5000, "dex": 4, "glyph": "\U0001f981", "kind": "besta", "size": 4, "boss": True,
        "atk_name": "garras do marajá",
        "drops": [("juba_maraja", 1.0, 1, 1), ("manto_do_leao_branco", 1.0, 1, 1), ("couro_de_leao", 1.0, 2, 3), ("coin_gold", 1.0, 5, 9)],
        "bronze": (1400, 2200),
    },

    # ===================== UMBRAVAL, A NOITE ETERNA =====================
    "lobo_umbrio": {
        "name": "Lobo Umbrío", "hp": 1600, "ac": 20, "atk": 21,
        "dmg": {"n": 6, "d": 10, "flat": 20}, "reach": 1, "speed": 8,
        "xp": 2700, "dex": 5, "glyph": "\U0001f43a", "kind": "besta", "size": 2,
        "atk_name": "presas da noite",
        "drops": [("couro_lobo_negro", 0.7, 1, 2), ("presa_lobo", 0.5, 1, 2)], "bronze": (600, 1000),
    },
    "vulto_noturno": {
        "name": "Vulto Noturno", "hp": 2000, "ac": 21, "atk": 22,
        "dmg": {"n": 6, "d": 10, "flat": 24}, "reach": 2, "speed": 6,
        "xp": 3300, "dex": 4, "glyph": "\U0001f47b", "kind": "espectro", "size": 2, "smoke": True,
        "atk_name": "toque gélido",
        "drops": [("essencia_sombria", 0.7, 1, 2), ("ectoplasma", 0.5, 1, 2)], "bronze": (750, 1200),
    },

    # ============ VÉSPERA: os VAMPIROS (o topo da cadeia, hoje) ============
    "enxame_morcegos": {
        "name": "Enxame de Morcegos", "hp": 600, "ac": 17, "atk": 19,
        "dmg": {"n": 3, "d": 8, "flat": 10}, "reach": 1, "speed": 9,
        "xp": 900, "dex": 7, "glyph": "\U0001f987", "kind": "besta", "size": 1, "smoke": True,
        "atk_name": "nuvem de presas",
        "drops": [], "bronze": (120, 260),
    },
    "cria_vampirica": {
        "name": "Cria Vampírica", "hp": 3400, "ac": 22, "atk": 23,
        "dmg": {"n": 7, "d": 10, "flat": 24}, "reach": 1, "speed": 8,
        "xp": 5200, "dex": 6, "glyph": "\U0001f9db", "kind": "morto-vivo", "size": 2,
        "atk_name": "garras famintas",
        "drops": [("presa_vampirica", 0.5, 1, 1), ("tecido_nobre", 0.25, 1, 1)], "bronze": (700, 1200),
    },
    "vampiro_nobre": {
        "name": "Vampiro Nobre", "hp": 4300, "ac": 24, "atk": 24,
        "dmg": {"n": 7, "d": 12, "flat": 28}, "reach": 1, "speed": 8,
        "xp": 6800, "dex": 6, "glyph": "\U0001f9db", "kind": "morto-vivo", "size": 2,
        "atk_name": "estocada carmesim",
        "drops": [("presa_vampirica", 0.7, 1, 1), ("tecido_nobre", 0.8, 1, 2), ("gema_bruta", 0.1, 1, 1)], "bronze": (1000, 1700),
    },
    "vampiro_anciao": {
        "name": "Vampiro Ancião", "hp": 5600, "ac": 25, "atk": 26,
        "dmg": {"n": 8, "d": 12, "flat": 32}, "reach": 2, "speed": 7,
        "xp": 9000, "dex": 5, "glyph": "\U0001f9db", "kind": "morto-vivo", "size": 3,
        "atk_name": "lâmina de sangue",
        "drops": [("presa_vampirica", 1.0, 2, 2), ("tecido_nobre", 1.0, 2, 3), ("gema_bruta", 0.3, 1, 1), ("coin_gold", 0.6, 1, 3)], "bronze": (1500, 2500),
    },

    # ==== UMBRAVAL: os LOBISOMENS (5%% atrás dos vampiros, e com raiva disso) ====
    "lobisomem_ferino": {
        "name": "Lobisomem Ferino", "hp": 3230, "ac": 21, "atk": 22,
        "dmg": {"n": 7, "d": 10, "flat": 22}, "reach": 1, "speed": 9,
        "xp": 4900, "dex": 6, "glyph": "\U0001f43a", "kind": "besta", "size": 2,
        "atk_name": "garras dilacerantes",
        "drops": [("pelagem_lupina", 0.7, 1, 1), ("presa_lobo", 0.5, 1, 2)], "bronze": (650, 1100),
    },
    "lobisomem_uivador": {
        "name": "Lobisomem Uivador", "hp": 4085, "ac": 23, "atk": 23,
        "dmg": {"n": 7, "d": 12, "flat": 26}, "reach": 1, "speed": 8,
        "xp": 6400, "dex": 5, "glyph": "\U0001f43a", "kind": "besta", "size": 2,
        "atk_name": "mordida lupina",
        "drops": [("pelagem_lupina", 0.9, 1, 2), ("couro_lobo_negro", 0.5, 1, 1)], "bronze": (900, 1500),
    },
    "lobisomem_ancestral": {
        "name": "Lobisomem Ancestral", "hp": 5320, "ac": 24, "atk": 25,
        "dmg": {"n": 8, "d": 12, "flat": 30}, "reach": 2, "speed": 8,
        "xp": 8500, "dex": 5, "glyph": "\U0001f43a", "kind": "besta", "size": 3,
        "atk_name": "fúria ancestral",
        "drops": [("pelagem_lupina", 1.0, 2, 2), ("couro_lobo_negro", 1.0, 1, 2), ("presa_lobo", 0.8, 1, 2)], "bronze": (1300, 2200),
    },
}


def roll_drops(type_id):
    """Sorteia o espolio de um monstro derrotado. Devolve (lista [(item, qty)], bronze)."""
    spec = MONSTERS.get(type_id) or {}
    out = []
    for (item_id, chance, qmin, qmax) in spec.get("drops", []):
        if _rnd.random() < chance:
            out.append((item_id, _rnd.randint(qmin, qmax)))
    bmin, bmax = spec.get("bronze", (0, 0))
    bronze = _rnd.randint(bmin, bmax) if bmax > 0 else 0
    return out, bronze


# Falas dos chefes (personagens ficticios, paródia). Originais nossas, na vibe.
BOSS_BARKS = {
    "maurao": {
        "intro": [
            "quem foi que abriu o portão? aqui é o QG, mané. Sapopemba é minha!",
            "entrou no baile do Maurão sem ser chamado? vai aprender na marretada.",
        ],
        "taunt": [
            "tá achando que é fácil? a quebrada inteira tá comigo!",
            "pode vir que o bonde não dorme, parça.",
            "ó o grave subindo... e a marreta também!",
            "ninguém invade a Sapo e sai inteiro, confia.",
            "isso aqui é chão de favela, quem manda sou eu.",
        ],
        "summon": [
            "CHAMA O BONDE! desce as cria pra cima dele!",
            "tá sozinho? eu não. Sapopemba é tropa, é exército!",
        ],
        "enrage": [
            "agora ZUOU! larguei o microfone e peguei a marreta com as duas mão!",
            "mexeu com o patrão da Sapo?! agora é só na porrada, sem dó!",
        ],
        "hurt": [
            "isso foi cosquinha, oh. minha corrente pesa mais que teu soco.",
            "tá arranhando meu ouro? vai pagar caro, mané.",
        ],
        "win": [
            "deu ruim, parça. eu avisei que Sapopemba não perdoa.",
            "volta pro Ermo e conta pros outro: o Maurão é o dono da quebrada.",
        ],
    },
    # O Velho Bob: javali patriarca, ranzinza, dono do mato ha 40 invernos.
    "velho_bob": {
        "intro": [
            "FUNF! quem é o pivete que pisou no meu mato?",
            "esse barro aqui é meu há quarenta invernos, mlk. cai fora.",
        ],
        "taunt": [
            "já comi caçador mais durão que você no café da manhã.",
            "GRONF! corre que é tiro, ó a presa vindo!",
            "a manada inteira me chama de pai, pensa bem.",
            "no meu tempo bambi não enfrentava javali, viu.",
        ],
        "summon": [
            "FUNFA! manada, DESCE pra cima dele!",
            "ó os filho chegando... agora tu se ferrou, bambi.",
        ],
        "enrage": [
            "AGORA TU MEXEU COM O VELHO! GRRRONF!",
            "raspei o casco no chão, pivete. é investida até cair!",
        ],
        "hurt": [
            "isso? meu couro é de quarenta invernos, não fura não.",
            "GRUNF... cutucou o velho, agora aguenta.",
        ],
        "win": [
            "volta pro berço, bambi. o mato é meu.",
            "FUNF FUNF. mais um que aprendeu na marra.",
        ],
    },
    # Lorde Varth: o lich, senhor necrótico do topo da Torre. Frio, antigo, cruel.
    "lorde_varth": {
        "intro": [
            "Mais carne para a minha torre. Sejam bem-vindos ao fim de vocês.",
            "Sentem o frio? É a morte, e ela já sabe os seus nomes.",
        ],
        "taunt": [
            "Seus deuses não te ouvem aqui. Só eu te escuto... e eu não tenho piedade.",
            "Cada osso desta torre já foi um herói teimoso como você.",
            "A morte não dói. O que vem depois, comigo, dói para sempre.",
            "Lute. Eu adoro quando a alma se debate antes de eu arrancá-la.",
        ],
        "summon": [
            "Levantem-se, meus mortos. Vamos receber as visitas.",
        ],
        "enrage": [
            "VOCÊ OUSA?! Então vai conhecer o verdadeiro vazio!",
        ],
        "hurt": [
            "Dor? Esqueci o que é isso há mil invernos. Você vai me lembrar... no seu lugar.",
        ],
        "win": [
            "Mais uma alma para a coleção. Descanse... no que sobrou de você.",
        ],
    },
    "urso_rei": {
        "intro": [
            "Um rugido colossal sacode o planalto. O Rei se ergue nas patas traseiras, alto como uma árvore.",
            "O dono da floresta encara você. Aqui, todo galho range em nome dele.",
        ],
        "taunt": [
            "As garras do Rei rasgam o ar a um palmo do seu rosto.",
            "Ele bate o peito num trovão surdo. O chão estremece.",
            "Os olhos do Rei do Planalto não conhecem medo, só fome territorial.",
        ],
        "enrage": [
            "FERIDO, o Rei ENLOUQUECE! Um urro de fúria espanta os pássaros a quilômetros.",
        ],
        "hurt": [
            "O Rei recua um passo, sangrando, e rosna mais alto. Você o irritou de verdade.",
        ],
        "win": [
            "O último rugido ecoa pelo vale. O planalto volta a pertencer só a ele.",
        ],
    },
    "vulkar": {
        "intro": [
            "NENHUM verme passa da Goela. Eu sou a porta, e a porta esmaga.",
            "Vocês pisam na garganta do Devorador. Eu sou o dente que fecha.",
        ],
        "taunt": [
            "O Senhor dorme lá embaixo. O barulho da sua morte não vai acordá-lo.",
            "Minha forja nunca esfria. Seus ossos vão alimentá-la.",
        ],
        "enrage": [
            "A FORJA RUGE EM MIM! Sintam o calor do meu dever!",
        ],
        "hurt": [
            "Rachaduras... não importa. Pedra não sente. Pedra CUMPRE.",
        ],
        "win": [
            "A Goela permanece fechada. Voltem ao pó, intrusos.",
        ],
    },
    "krezath": {
        "intro": [
            "Eu dormia antes dos seus deuses aprenderem a mentir. E vocês... me ACORDARAM.",
            "Este mundo é uma ferida que EU abri. Bem-vindos ao fundo dela.",
        ],
        "taunt": [
            "Varth brinca com ossos na torre dele. Eu devorei impérios antes do primeiro osso.",
            "Seu aço derrete. Sua magia evapora. Sua coragem... essa eu saboreio devagar.",
            "Cada escama minha é o túmulo de um herói melhor que você.",
            "Grite. O magma gosta de companhia.",
        ],
        "summon": [
            "Filhos! Saiam das rachaduras. O jantar chegou andando.",
        ],
        "enrage": [
            "CHEGA. Agora vocês vão conhecer o fogo que EXISTIA ANTES DO SOL.",
        ],
        "hurt": [
            "Isso... arranhou. Há mil anos ninguém me arranhava. Vou guardar seu crânio por isso.",
        ],
        "win": [
            "O Brasal engole mais uma leva de tolos. Voltem quando forem lendas... se conseguirem.",
        ],
    },
    "maraja": {
        "intro": [
            "A savana inteira é meu tapete, forasteiro. E você está pisando nele.",
            "Branco como osso, quieto como o meio-dia. Eu sou o Marajá. Ajoelha ou corre.",
        ],
        "taunt": [
            "O sol nasce quando EU abro os olhos.",
            "Já comi caçadores mais gordos e mais corajosos que você.",
            "Corre pro mar. Talvez os caranguejos tenham pena.",
        ],
        "enrage": [
            "AGORA a juba levanta. Reze pros seus deuses de cidade.",
        ],
        "hurt": [
            "Sangue na juba branca... isso vai custar caro, verme.",
        ],
        "win": [
            "A savana volta ao silêncio. O Marajá volta ao trono de capim.",
        ],
    },
}


def bark(category, boss_type="maurao"):
    """Sorteia uma fala do chefe (boss_type) na categoria pedida (ou None)."""
    table = BOSS_BARKS.get(boss_type) or {}
    lines = table.get(category)
    return _rnd.choice(lines) if lines else None

# onde nascem em O Descampado: bichos perto da aguada (centro-sul) e capangas
# em peso perto do acampamento (nordeste). Cada um perambula em volta do ponto.
DESCAMPADO_SPAWNS = [
    # bichos (centro-sul, perto da agua)
    ("rato_gigante", 38, 62), ("rato_gigante", 52, 52), ("rato_gigante", 44, 66),
    ("rato_gigante", 56, 56), ("lobo", 46, 67), ("lobo", 40, 70), ("lobo", 48, 60),
    ("javali", 34, 59), ("javali", 50, 72),
    # bichos espalhados (mais caça pelo mapa)
    ("rato_gigante", 24, 40), ("rato_gigante", 60, 60), ("lobo", 30, 50),
    ("lobo", 80, 60), ("javali", 70, 70), ("javali", 84, 84), ("rato_gigante", 16, 50),
    # capangas (nordeste, o acampamento de Sapopemba)
    ("capanga", 60, 28), ("capanga", 63, 34), ("capanga", 58, 24), ("capanga", 66, 30),
    ("capanga", 70, 26), ("capanga", 62, 38), ("capanga", 74, 33), ("capanga", 67, 37),
    ("capanga", 52, 30), ("capanga", 55, 24),
    ("capanga_brutamontes", 72, 31), ("capanga_brutamontes", 68, 22),
    ("capanga_brutamontes", 76, 29),
    # o patrão do QG
    ("maurao", 62, 28),
    # A MANADA (sul-central): 5 javalis em volta do patriarca, o Velho Bob
    ("javali", 42, 82), ("javali", 46, 82), ("javali", 41, 85),
    ("javali", 47, 85), ("javali", 44, 87),
    ("velho_bob", 44, 84),
]


# REPOUSO DA DAMA: zonas por profundidade (oeste raso -> leste/fundo no breu).
REPOUSO_SPAWNS = [
    # borda oeste (rala): lobos negros
    ("lobo_negro", 8, 30), ("lobo_negro", 10, 50), ("lobo_negro", 12, 18),
    ("lobo_negro", 14, 66), ("lobo_negro", 16, 40), ("lobo_negro", 18, 78),
    ("lobo_negro", 20, 24), ("lobo_negro", 22, 58), ("lobo_negro", 24, 12),
    ("lobo_negro", 26, 70), ("lobo_negro", 15, 88), ("lobo_negro", 28, 44),
    ("lobo_negro", 11, 36), ("lobo_negro", 23, 90),
    # mata media (densa): harpias e bruxas
    ("harpia", 32, 20), ("harpia", 36, 60), ("harpia", 30, 40), ("harpia", 40, 14),
    ("harpia", 44, 76), ("harpia", 34, 88), ("harpia", 48, 30), ("harpia", 38, 50),
    ("harpia", 52, 66), ("harpia", 46, 46),
    ("bruxa_louca", 38, 34), ("bruxa_louca", 44, 56), ("bruxa_louca", 50, 22),
    ("bruxa_louca", 42, 70), ("bruxa_louca", 54, 44), ("bruxa_louca", 48, 84),
    ("bruxa_louca", 56, 32), ("bruxa_louca", 52, 58),
    # fundo (breu): os 5 espiritos
    ("alma_errante", 58, 28), ("alma_errante", 62, 60), ("alma_errante", 66, 18),
    ("alma_errante", 70, 72), ("alma_errante", 60, 44),
    ("assombracao", 60, 50), ("assombracao", 64, 34), ("assombracao", 68, 66),
    ("assombracao", 72, 24), ("assombracao", 66, 84),
    ("espectro", 62, 40), ("espectro", 70, 54), ("espectro", 66, 70),
    ("espectro", 74, 38), ("espectro", 72, 88),
    ("vulto", 64, 22), ("vulto", 72, 62), ("vulto", 76, 30),
    ("vulto", 68, 78), ("vulto", 74, 48),
    ("alma_penada", 70, 36), ("alma_penada", 76, 66), ("alma_penada", 78, 44),
    ("alma_penada", 74, 78), ("alma_penada", 80, 24),
    # a clareira da Dama: espiritos de guarda + a banshee
    ("espectro", 82, 42), ("alma_penada", 82, 58), ("vulto", 90, 44),
    ("alma_errante", 90, 56), ("assombracao", 84, 36), ("vulto", 84, 64),
    ("dama_noite", 86, 50),
]


# DESERTO DE AVASHAM: entra pelo NORTE (vindo do Descampado). Fraco no norte,
# forte no fundo sul. Areia aberta, da pra espalhar a vontade.
AVASHAM_SPAWNS = [
    # norte (raso): lacraias e hienas
    ("lacraia_gigante", 30, 12), ("lacraia_gigante", 60, 14), ("lacraia_gigante", 44, 20),
    ("lacraia_gigante", 70, 18), ("lacraia_gigante", 22, 24), ("lacraia_gigante", 54, 26),
    ("lacraia_gigante", 78, 28),
    ("hiena_ermo", 36, 16), ("hiena_ermo", 66, 22), ("hiena_ermo", 28, 30),
    ("hiena_ermo", 50, 32), ("hiena_ermo", 74, 34), ("hiena_ermo", 18, 20),
    ("hiena_ermo", 82, 24),
    # meio: abutres e najas
    ("abutre_carniceiro", 32, 40), ("abutre_carniceiro", 62, 44), ("abutre_carniceiro", 24, 48),
    ("abutre_carniceiro", 72, 50), ("abutre_carniceiro", 46, 52), ("abutre_carniceiro", 84, 42),
    ("abutre_carniceiro", 16, 54),
    ("naja_dunas", 40, 42), ("naja_dunas", 68, 38), ("naja_dunas", 30, 56),
    ("naja_dunas", 56, 48), ("naja_dunas", 78, 54), ("naja_dunas", 50, 44),
    ("naja_dunas", 22, 38),
    # meio-sul: escorpioes
    ("escorpiao_gigante", 34, 64), ("escorpiao_gigante", 60, 60), ("escorpiao_gigante", 46, 68),
    ("escorpiao_gigante", 72, 66), ("escorpiao_gigante", 26, 62), ("escorpiao_gigante", 80, 70),
    ("escorpiao_gigante", 54, 72),
    # fundo sul (mortal): vermes, elementais, basiliscos
    ("verme_areias", 36, 78), ("verme_areias", 64, 76), ("verme_areias", 48, 84),
    ("verme_areias", 72, 82), ("verme_areias", 28, 80), ("verme_areias", 56, 88),
    ("verme_areias", 80, 86),
    ("elemental_areia", 40, 80), ("elemental_areia", 68, 84), ("elemental_areia", 32, 88),
    ("elemental_areia", 60, 78), ("elemental_areia", 76, 88), ("elemental_areia", 50, 90),
    ("elemental_areia", 22, 84),
    ("basilisco_deserto", 44, 86), ("basilisco_deserto", 66, 90), ("basilisco_deserto", 54, 82),
    ("basilisco_deserto", 74, 78), ("basilisco_deserto", 36, 90), ("basilisco_deserto", 60, 88),
]


# COVA DO COLOSSO: arena de chefe, descendo pela boca SUL do deserto. So o Colosso.
COVA_COLOSSO_SPAWNS = [
    ("colosso_avasham", 50, 64),   # CHEFE do deserto, no centro da arena
]


# MINA FECHADA DE AVHUR: tumba egipcia sob a piramide do deserto. Camaras cheias
# de mortos-vivos ate a CAMARA DO FARAO no fundo sul. Zona de GRANA (Moeda de Avhur).
MINA_AVHUR_SPAWNS = [
    # camara NO (rasos)
    ("escaravelho_praga", 16, 21), ("escaravelho_praga", 24, 30), ("servo_envolto", 20, 25), ("escravo_amaldicoado", 14, 28),
    # camara N
    ("escaravelho_praga", 46, 22), ("naja_tumular", 54, 20), ("mumia_guerreira", 50, 26),
    # camara NE
    ("naja_tumular", 76, 21), ("chacal_anubita", 82, 25), ("mumia_guerreira", 86, 30),
    # camara O
    ("sacerdote_sombrio", 16, 46), ("espirito_faraonico", 24, 54),
    # camara CENTRAL
    ("mumia_guerreira", 46, 44), ("sacerdote_sombrio", 56, 52), ("naja_tumular", 50, 48),
    # camara E
    ("chacal_anubita", 76, 46), ("carregador_canopo", 86, 54),
    # camara SO
    ("guardiao_arenito", 16, 68), ("espirito_faraonico", 24, 77), ("sacerdote_sombrio", 20, 72),
    # camara SE
    ("carregador_canopo", 76, 68), ("anubis_guerreiro", 84, 74), ("chacal_anubita", 86, 70),
    # ANTECAMARA do trono (a guarda da descida): abominacoes + Anubis + guardiao
    ("abominacao_embalsamada", 44, 84), ("abominacao_embalsamada", 56, 84), ("abominacao_embalsamada", 50, 88),
    ("anubis_guerreiro", 42, 88), ("anubis_guerreiro", 58, 88), ("guardiao_arenito", 50, 82),
]

# CAMARA DE AVHUR: a sala do trono. So o chefe Avhur (invoca mumias em combate).
CAMARA_AVHUR_SPAWNS = [
    ("farao_avhur", 50, 70),
]


# CEMITÉRIO ANTIGO DE VALDARKRAM: entra pelo OESTE (vindo do Repouso). Fraco no
# oeste, forte no fundo leste. Tumulos e criptas espalhados.
VALDARKRAM_SPAWNS = [
    # oeste (raso): esqueletos e zumbis
    ("esqueleto_guerreiro", 12, 30), ("esqueleto_guerreiro", 14, 60), ("esqueleto_guerreiro", 20, 18),
    ("esqueleto_guerreiro", 18, 72), ("esqueleto_guerreiro", 24, 44), ("esqueleto_guerreiro", 22, 86),
    ("esqueleto_guerreiro", 16, 50),
    ("zumbi_putrido", 16, 22), ("zumbi_putrido", 22, 66), ("zumbi_putrido", 30, 36),
    ("zumbi_putrido", 28, 78), ("zumbi_putrido", 20, 40), ("zumbi_putrido", 24, 12),
    ("zumbi_putrido", 30, 56),
    # meio: ghouls e aparicoes
    ("ghoul_faminto", 38, 28), ("ghoul_faminto", 42, 60), ("ghoul_faminto", 34, 48),
    ("ghoul_faminto", 46, 74), ("ghoul_faminto", 40, 18), ("ghoul_faminto", 36, 86),
    ("ghoul_faminto", 48, 40),
    ("aparicao_sepulcral", 44, 34), ("aparicao_sepulcral", 50, 66), ("aparicao_sepulcral", 38, 56),
    ("aparicao_sepulcral", 52, 24), ("aparicao_sepulcral", 46, 84), ("aparicao_sepulcral", 42, 44),
    ("aparicao_sepulcral", 54, 50),
    # meio-leste: carnicais
    ("carnical_profanador", 60, 30), ("carnical_profanador", 64, 62), ("carnical_profanador", 58, 46),
    ("carnical_profanador", 68, 74), ("carnical_profanador", 62, 20), ("carnical_profanador", 56, 84),
    ("carnical_profanador", 70, 40),
    # fundo leste (mortal): cavaleiros, necromantes, abominacoes
    ("cavaleiro_morte", 72, 32), ("cavaleiro_morte", 78, 64), ("cavaleiro_morte", 74, 48),
    ("cavaleiro_morte", 82, 74), ("cavaleiro_morte", 76, 20), ("cavaleiro_morte", 70, 84),
    ("cavaleiro_morte", 84, 40),
    ("necromante_caido", 80, 36), ("necromante_caido", 86, 60), ("necromante_caido", 78, 52),
    ("necromante_caido", 84, 26), ("necromante_caido", 82, 84), ("necromante_caido", 88, 46),
    ("abominacao_ossea", 86, 50), ("abominacao_ossea", 90, 70), ("abominacao_ossea", 84, 58),
    ("abominacao_ossea", 88, 34), ("abominacao_ossea", 82, 78),
]

# ===================== TORRE DO LORDE NECROTICO =====================
TORRE_ANDAR1_SPAWNS = [
    ("tumular_torre", 22, 16), ("carniceiro_torre", 34, 40), ("tumular_torre", 40, 12), ("carniceiro_torre", 14, 44),
    ("tumular_torre", 6, 34), ("carniceiro_torre", 9, 22), ("tumular_torre", 15, 28), ("carniceiro_torre", 15, 31),
    ("tumular_torre", 21, 19), ("carniceiro_torre", 24, 13), ("tumular_torre", 24, 16), ("carniceiro_torre", 24, 28),
    ("tumular_torre", 27, 28), ("carniceiro_torre", 30, 10), ("tumular_torre", 30, 43), ("carniceiro_torre", 33, 28),
    ("tumular_torre", 36, 10), ("carniceiro_torre", 36, 16),
]
TORRE_ANDAR2_SPAWNS = [
    ("cavaleiro_torre", 22, 16), ("algoz_torre", 34, 40), ("cavaleiro_torre", 40, 12), ("algoz_torre", 14, 44),
    ("cavaleiro_torre", 6, 34), ("algoz_torre", 9, 22), ("cavaleiro_torre", 15, 28), ("algoz_torre", 15, 31),
    ("cavaleiro_torre", 21, 19), ("algoz_torre", 24, 13), ("cavaleiro_torre", 24, 16), ("algoz_torre", 24, 28),
    ("cavaleiro_torre", 27, 28), ("algoz_torre", 30, 10), ("cavaleiro_torre", 30, 43), ("algoz_torre", 33, 28),
    ("cavaleiro_torre", 36, 10), ("algoz_torre", 36, 16),
]
TORRE_ANDAR3_SPAWNS = [
    ("necromante_torre", 22, 16), ("profanador_torre", 34, 40), ("necromante_torre", 40, 12), ("profanador_torre", 14, 44),
    ("necromante_torre", 6, 34), ("profanador_torre", 9, 22), ("necromante_torre", 15, 28), ("profanador_torre", 15, 31),
    ("necromante_torre", 21, 19), ("profanador_torre", 24, 13), ("necromante_torre", 24, 16), ("profanador_torre", 24, 28),
    ("necromante_torre", 27, 28), ("profanador_torre", 30, 10), ("necromante_torre", 30, 43), ("profanador_torre", 33, 28),
    ("necromante_torre", 36, 10), ("profanador_torre", 36, 16),
]
CAMARA_VARTH_SPAWNS = [
    ("lorde_varth", 50, 22),       # CHEFE FINAL no topo da Torre (saiu do cemitério)
]


# FLORESTA DO ERMO (150x150): a mata profunda segue quieta... por enquanto.
# A fauna foi realocada pros PLANALTOS ERMAIS (o mapa do Rei do Planalto).
FLORESTA_ERMO_SPAWNS = []


# PLANALTOS ERMAIS (120x120): 3 terraços de muralhas + o TOPO do Rei.
# De baixo pra cima: caça passiva -> lobos cinzentos -> ursos -> REI DO PLANALTO.
PLANALTOS_ERMAIS_SPAWNS = [
    # --- TERRAÇO SUL (entrada, y 92-116): caça passiva ---
    ("coelho", 30, 112), ("coelho", 84, 108), ("coelho", 44, 98), ("coelho", 90, 96),
    ("lebre", 22, 104), ("lebre", 72, 114),
    ("veado", 38, 106), ("veado", 80, 100), ("veado", 50, 92),
    ("cervo", 26, 94), ("cervo", 88, 112),
    # --- TERRAÇO DO MEIO (y 62-85): lobos cinzentos dos ermos ---
    ("lobo_cinzento_ermo", 30, 80), ("lobo_cinzento_ermo", 82, 76), ("lobo_cinzento_ermo", 46, 70),
    ("lobo_cinzento_ermo", 92, 66), ("lobo_cinzento_ermo", 24, 66), ("lobo_cinzento_ermo", 70, 82),
    ("lobo_cinzento_ermo", 54, 63),
    # --- TERRAÇO ALTO (y 32-55): ursos pardos e negros ---
    ("urso_pardo", 31, 53), ("urso_pardo", 86, 46), ("urso_pardo", 44, 38), ("urso_pardo", 93, 32),
    ("urso_negro", 34, 34), ("urso_negro", 76, 52), ("urso_negro", 52, 44),
    # --- O TOPO (y 6-24): o trono a céu aberto do REI, com dois negros de escolta ---
    ("urso_negro", 40, 20), ("urso_negro", 82, 18),
    ("urso_rei", 60, 10),           # REI DO PLANALTO: o senhor do topo
]


# BRASAL, A FERIDA DO MUNDO (150x150, entrada OESTE vindo do Descampado; Goela no LESTE)
BRASAL_SPAWNS = [
    ("cinzal", 24, 44), ("cinzal", 38, 62), ("cinzal", 30, 88), ("cinzal", 52, 34),
    ("cinzal", 60, 100), ("cinzal", 82, 30),
    ("salamandra_brasal", 44, 50), ("salamandra_brasal", 66, 70), ("salamandra_brasal", 58, 118),
    ("salamandra_brasal", 90, 108), ("salamandra_brasal", 100, 48),
    ("imp_brasal", 36, 76), ("imp_brasal", 74, 44), ("imp_brasal", 84, 86), ("imp_brasal", 108, 66),
    ("imp_brasal", 118, 96),
    ("serpe_magma", 70, 90), ("serpe_magma", 96, 60), ("serpe_magma", 112, 110), ("serpe_magma", 124, 52),
    ("golem_obsidiana", 88, 74), ("golem_obsidiana", 116, 80), ("golem_obsidiana", 130, 100),
    ("golem_obsidiana", 134, 62),
    # reforço: a Ferida fervilha
    ("cinzal", 100, 120), ("cinzal", 46, 30), ("salamandra_brasal", 76, 26),
    ("salamandra_brasal", 120, 130), ("imp_brasal", 56, 90), ("imp_brasal", 96, 96),
    ("imp_brasal", 128, 40), ("serpe_magma", 50, 66), ("serpe_magma", 86, 116),
    ("golem_obsidiana", 62, 118), ("cinzal", 138, 86), ("salamandra_brasal", 30, 60),
]

# GOELA DE KREZATH nível 1 (70x70; entrada OESTE, escada NORTE)
GOELA_1_SPAWNS = [
    ("imp_brasal", 16, 36), ("imp_brasal", 30, 48), ("imp_brasal", 44, 22),
    ("forjado_krezath", 24, 30), ("forjado_krezath", 38, 40), ("forjado_krezath", 50, 30),
    ("forjado_krezath", 34, 14), ("serpe_magma", 46, 52), ("serpe_magma", 20, 16),
    ("devoto_krezath", 40, 26), ("devoto_krezath", 28, 56),
    ("imp_brasal", 52, 44), ("forjado_krezath", 18, 48), ("serpe_magma", 36, 30),
    ("devoto_krezath", 48, 14), ("imp_brasal", 26, 20),
]

# GOELA DE KREZATH nível 2 (70x70; entrada SUL, escada NORTE guardada por VULKAR)
GOELA_2_SPAWNS = [
    ("forjado_krezath", 30, 52), ("forjado_krezath", 42, 44),
    ("templario_magma", 24, 40), ("templario_magma", 44, 30), ("templario_magma", 34, 20),
    ("devoto_krezath", 28, 28), ("devoto_krezath", 44, 54), ("devoto_krezath", 38, 12),
    ("serpe_magma", 20, 56),
    ("forjado_krezath", 22, 16), ("templario_magma", 48, 40), ("devoto_krezath", 20, 34),
    ("serpe_magma", 44, 60),
    ("vulkar", 35, 10),             # GUARDIÃO da porta pro covil
]

# COVIL DE KREZATH (60x50; o DEVORADOR no norte, sobre o lago de magma)
COVIL_KREZATH_SPAWNS = [
    ("krezath", 30, 12),
]


# COSTA DE MARAVAI (300x300): savana viva ao norte, praia mansa ao sul
COSTA_MARAVAI_SPAWNS = [
    # capivaras na lagoa + antílopes pastando (passivos)
    ("capivara", 62, 92), ("capivara", 80, 90), ("capivara", 70, 72),
    ("antilope", 40, 60), ("antilope", 110, 48), ("antilope", 150, 90), ("antilope", 220, 70),
    # avestruzes bravas e hienas em matilha
    ("avestruz_brava", 130, 60), ("avestruz_brava", 180, 110), ("avestruz_brava", 90, 130),
    ("hiena_rubra", 160, 40), ("hiena_rubra", 166, 44), ("hiena_rubra", 172, 40),
    ("hiena_rubra", 240, 120), ("hiena_rubra", 246, 124), ("hiena_rubra", 60, 140),
    # leões e búfalos
    ("leao_ermal", 200, 90), ("leao_ermal", 120, 100), ("leao_ermal", 260, 60), ("leao_ermal", 40, 110),
    ("bufalo_ermal", 100, 40), ("bufalo_ermal", 230, 140), ("bufalo_ermal", 170, 140),
    # o TRONO DE CAPIM: Marajá no coração da savana
    ("maraja", 150, 24),
    # praia: caranguejos nas pedras, medusas encalhadas (longe da vila)
    ("caranguejo_gigante", 40, 240), ("caranguejo_gigante", 90, 250), ("caranguejo_gigante", 140, 244),
    ("caranguejo_gigante", 180, 252),
    ("medusa_de_areia", 60, 254), ("medusa_de_areia", 120, 256), ("medusa_de_areia", 160, 250),
]

# VÉSPERA, A CIDADE MORTA (150x150): os vampiros reinam
VESPERA_SPAWNS = [
    # PATRULHA LUPINA: lobisomens invadindo a cidade rival
    ("lobisomem_ferino", 115, 130), ("lobisomem_ferino", 100, 118),
    # a CATEDRAL: o Ancião e sua corte
    ("vampiro_anciao", 75, 20),
    ("vampiro_nobre", 68, 26), ("vampiro_nobre", 82, 26),
    # nobres patrulhando as ruas
    ("vampiro_nobre", 30, 65), ("vampiro_nobre", 90, 90), ("vampiro_nobre", 120, 40),
    # crias famintas pelos quarteirões
    ("cria_vampirica", 30, 40), ("cria_vampirica", 60, 40), ("cria_vampirica", 120, 65),
    ("cria_vampirica", 30, 90), ("cria_vampirica", 60, 90), ("cria_vampirica", 120, 90),
    ("cria_vampirica", 60, 115), ("cria_vampirica", 90, 115), ("cria_vampirica", 30, 115),
    # praça da fonte seca
    ("cria_vampirica", 62, 70), ("vampiro_nobre", 86, 76),
    # enxames nos beirais
    ("enxame_morcegos", 45, 52), ("enxame_morcegos", 100, 78), ("enxame_morcegos", 75, 100),
    ("enxame_morcegos", 110, 120),
]

# UMBRAVAL (300x300): a mata onde o sol nunca entrou
UMBRAVAL_SPAWNS = [
    # os LOBISOMENS: donos da mata, rivais eternos de Véspera
    # PATRULHA VAMPÍRICA: invasores de Véspera caçando na mata rival
    ("cria_vampirica", 118, 30), ("cria_vampirica", 112, 60),
    ("lobisomem_ferino", 76, 270),
    ("lobisomem_ferino", 139, 234),
    ("lobisomem_uivador", 190, 206),
    ("lobisomem_ferino", 267, 169),
    ("lobisomem_uivador", 163, 124),
    ("lobisomem_ferino", 147, 107),
    ("lobisomem_uivador", 125, 75),
    ("lobisomem_ferino", 105, 34),
    ("lobisomem_ancestral", 113, 13),
    ("lobo_umbrio", 145, 272),
    ("vulto_noturno", 188, 271),
    ("vulto_noturno", 110, 222),
    ("lobo_umbrio", 112, 238),
    ("lobo_umbrio", 76, 197),
    ("vulto_noturno", 89, 207),
    ("vulto_noturno", 21, 168),
    ("lobo_umbrio", 239, 174),
    ("lobo_umbrio", 167, 140),
    ("vulto_noturno", 263, 120),
    ("vulto_noturno", 114, 117),
    ("lobo_umbrio", 132, 104),
    ("lobo_umbrio", 113, 77),
    ("vulto_noturno", 122, 76),
    ("vulto_noturno", 108, 51),
    ("lobo_umbrio", 111, 60),
    ("lobo_umbrio", 107, 39),
    ("vulto_noturno", 109, 42),
]


def get(type_id):
    return MONSTERS.get(type_id)


def catalog():
    """Pro cliente, se precisar: id -> {name, glyph, kind}."""
    return {k: {"name": v["name"], "glyph": v["glyph"], "kind": v["kind"]}
            for k, v in MONSTERS.items()}


# ===========================================================================
#  HABILIDADES ESPECIAIS DOS MONSTROS (Leva 3). Dict separado (mtype -> lista)
#  pra nao tocar em cada stat block. O combate usa monster_ability() pra resolver.
#  types:
#    inflict  ataque normal que, no acerto, aplica um status (status/turns/dot)
#    gaze     baseado em resistencia (save/dc), sem rolagem de ataque, aplica status
#    fear     gaze que aplica 'frightened'
#    heavy    ataque mais forte (dmg_bonus dados extras)
#    drain    ataque que cura o monstro pelo dano causado
#    heal     cura o proprio monstro (heal {n,d})
#  cada habilidade: chance (prob. de usar quando pronta) e cd (recarga em rodadas).
# ===========================================================================
MONSTER_ABILITIES = {
    # --- comuns que ganharam habilidade (melhoria geral) ---
    "rato_gigante":  [{"id": "mordida_infecta", "name": "Mordida Infecta", "type": "inflict",
                       "status": "poison", "turns": 2, "dot": {"n": 1, "d": 4}, "chance": 0.35, "cd": 2}],
    "lobo":          [{"id": "dilacerar", "name": "Dilacerar", "type": "inflict",
                       "dmg_bonus": {"n": 1, "d": 6}, "status": "bleeding", "turns": 2, "dot": {"n": 1, "d": 4}, "chance": 0.4, "cd": 2}],
    "javali":        [{"id": "investida", "name": "Investida Selvagem", "type": "heavy",
                       "dmg_bonus": {"n": 2, "d": 6}, "chance": 0.4, "cd": 2}],
    "capanga":       [{"id": "facada_suja", "name": "Facada Suja", "type": "inflict",
                       "dmg_bonus": {"n": 1, "d": 6}, "status": "bleeding", "turns": 2, "dot": {"n": 1, "d": 4}, "chance": 0.4, "cd": 2}],
    "capanga_brutamontes": [{"id": "coronhada", "name": "Coronhada", "type": "heavy",
                       "dmg_bonus": {"n": 2, "d": 8}, "chance": 0.45, "cd": 2},
                      {"id": "intimidacao", "name": "Intimidação", "type": "fear",
                       "save": "SAB", "dc": 12, "status": "frightened", "turns": 2, "chance": 0.3, "cd": 3}],
    "vulto":         [{"id": "toque_gelido", "name": "Toque Gélido", "type": "drain",
                       "dmg_bonus": {"n": 2, "d": 6}, "chance": 0.45, "cd": 2}],
    "escaravelho_praga": [{"id": "praga_rastejante", "name": "Praga Rastejante", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 1, "d": 6}, "chance": 0.4, "cd": 2}],
    "servo_envolto": [{"id": "atadura_sufocante", "name": "Atadura Sufocante", "type": "inflict",
                       "dmg_bonus": {"n": 1, "d": 8}, "status": "bleeding", "turns": 3, "dot": {"n": 1, "d": 6}, "chance": 0.4, "cd": 2}],
    "escravo_amaldicoado": [{"id": "lamento", "name": "Lamento Amaldiçoado", "type": "fear",
                       "save": "SAB", "dc": 12, "status": "frightened", "turns": 2, "chance": 0.35, "cd": 3},
                      {"id": "garras_quebradas", "name": "Garras Quebradas", "type": "heavy",
                       "dmg_bonus": {"n": 1, "d": 8}, "chance": 0.4, "cd": 2}],
    "chacal_anubita": [{"id": "dilacerar_chacal", "name": "Dilacerar", "type": "inflict",
                       "dmg_bonus": {"n": 1, "d": 8}, "status": "bleeding", "turns": 2, "dot": {"n": 1, "d": 6}, "chance": 0.4, "cd": 2},
                      {"id": "uivo_anubis", "name": "Uivo de Anúbis", "type": "fear",
                       "save": "SAB", "dc": 13, "status": "frightened", "turns": 2, "chance": 0.3, "cd": 3}],
    "carregador_canopo": [{"id": "esmagar_canopo", "name": "Esmagamento Canópico", "type": "heavy",
                       "dmg_bonus": {"n": 2, "d": 8}, "chance": 0.45, "cd": 2},
                      {"id": "praga_dos_vasos", "name": "Praga dos Vasos", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 2, "d": 6}, "chance": 0.4, "cd": 2}],

    # --- floresta (Repouso da Dama) ---
    "harpia":        [{"id": "canto", "name": "Canto Hipnótico", "type": "fear",
                       "save": "SAB", "dc": 12, "status": "frightened", "turns": 2, "chance": 0.4, "cd": 3}],
    "bruxa_louca":   [{"id": "praga", "name": "Praga Pútrida", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 1, "d": 6}, "chance": 0.45, "cd": 2}],
    "alma_penada":   [{"id": "grito", "name": "Grito Aterrorizante", "type": "fear",
                       "save": "SAB", "dc": 12, "status": "frightened", "turns": 2, "chance": 0.4, "cd": 3}],
    # --- deserto (Avasham) ---
    "naja_dunas":    [{"id": "bote_venenoso", "name": "Bote Venenoso", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 2, "d": 6}, "chance": 0.5, "cd": 2}],
    "escorpiao_gigante": [{"id": "ferrao", "name": "Ferrão Peçonhento", "type": "inflict",
                       "status": "poison", "turns": 4, "dot": {"n": 2, "d": 8}, "chance": 0.5, "cd": 2}],
    "basilisco_deserto": [{"id": "olhar_petrificante", "name": "Olhar Petrificante", "type": "gaze",
                       "save": "CON", "dc": 15, "status": "stunned", "turns": 2, "chance": 0.35, "cd": 3}],
    "elemental_areia": [{"id": "vendaval", "name": "Vendaval Cortante", "type": "heavy",
                       "dmg_bonus": {"n": 3, "d": 8}, "chance": 0.45, "cd": 2}],
    "verme_areias":  [{"id": "abocanhar", "name": "Abocanhada Brutal", "type": "heavy",
                       "dmg_bonus": {"n": 4, "d": 8}, "chance": 0.4, "cd": 2}],
    # --- cemiterio (Valdarkram) ---
    "esqueleto_guerreiro": [{"id": "golpe_brutal", "name": "Golpe Brutal", "type": "heavy",
                       "dmg_bonus": {"n": 2, "d": 10}, "chance": 0.4, "cd": 2}],
    "zumbi_putrido": [{"id": "vomito", "name": "Vômito Ácido", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 2, "d": 6}, "chance": 0.4, "cd": 2}],
    "ghoul_faminto": [{"id": "paralisia", "name": "Toque Paralisante", "type": "gaze",
                       "save": "CON", "dc": 14, "status": "stunned", "turns": 2, "chance": 0.4, "cd": 3}],
    "aparicao_sepulcral": [{"id": "dreno_vital", "name": "Dreno Vital", "type": "drain",
                       "chance": 0.5, "cd": 2}],
    "carnical_profanador": [{"id": "presas_imundas", "name": "Presas Imundas", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 3, "d": 6}, "chance": 0.45, "cd": 2}],
    "cavaleiro_morte": [{"id": "lamina_negra", "name": "Lâmina Negra", "type": "heavy",
                       "dmg_bonus": {"n": 3, "d": 10}, "chance": 0.4, "cd": 2},
                      {"id": "presenca_terrivel", "name": "Presença Terrível", "type": "fear",
                       "save": "SAB", "dc": 15, "status": "frightened", "turns": 2, "chance": 0.3, "cd": 4}],
    "necromante_caido": [{"id": "raio_sombrio", "name": "Raio Sombrio", "type": "heavy",
                       "dmg_bonus": {"n": 4, "d": 8}, "chance": 0.45, "cd": 2}],
    "abominacao_ossea": [{"id": "esmagar", "name": "Esmagamento Ósseo", "type": "heavy",
                       "dmg_bonus": {"n": 4, "d": 10}, "chance": 0.4, "cd": 2},
                      {"id": "rugido", "name": "Rugido Macabro", "type": "fear",
                       "save": "SAB", "dc": 16, "status": "frightened", "turns": 2, "chance": 0.3, "cd": 4}],

    # --- 8 mobs intermediarios (floresta + deserto) ---
    "lobo_negro":    [{"id": "dilacerar", "name": "Dilacerar", "type": "heavy",
                       "dmg_bonus": {"n": 2, "d": 8}, "chance": 0.4, "cd": 2}],
    "alma_errante":  [{"id": "lamento", "name": "Lamento Errante", "type": "fear",
                       "save": "SAB", "dc": 12, "status": "frightened", "turns": 2, "chance": 0.4, "cd": 3}],
    "assombracao":   [{"id": "assombrar", "name": "Assombrar", "type": "fear",
                       "save": "SAB", "dc": 12, "status": "frightened", "turns": 2, "chance": 0.4, "cd": 3}],
    "espectro":      [{"id": "dreno_espectral", "name": "Dreno Espectral", "type": "drain",
                       "chance": 0.5, "cd": 2}],
    "vulto_sombrio": [{"id": "garras_sombrias", "name": "Garras Sombrias", "type": "heavy",
                       "dmg_bonus": {"n": 2, "d": 8}, "chance": 0.4, "cd": 2}],
    "lacraia_gigante": [{"id": "picada_venenosa", "name": "Picada Venenosa", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 2, "d": 6}, "chance": 0.45, "cd": 2}],
    "hiena_ermo":    [{"id": "dentada", "name": "Dentada Dilacerante", "type": "heavy",
                       "dmg_bonus": {"n": 2, "d": 8}, "chance": 0.4, "cd": 2}],
    "abutre_carniceiro": [{"id": "bicada_imunda", "name": "Bicada Imunda", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 1, "d": 6}, "chance": 0.45, "cd": 2}],

    # --- 3 CHEFES (usados pelo boss_turn) ---
    "maurao":        [{"id": "porrada_brutal", "name": "Porrada Brutal", "type": "heavy",
                       "dmg_bonus": {"n": 3, "d": 10}, "chance": 0.5, "cd": 2},
                      {"id": "berro", "name": "Berro Ensurdecedor", "type": "fear",
                       "save": "SAB", "dc": 14, "status": "frightened", "turns": 2, "chance": 0.35, "cd": 3}],
    "velho_bob":     [{"id": "tiro_certeiro", "name": "Tiro Certeiro", "type": "heavy",
                       "dmg_bonus": {"n": 3, "d": 8}, "chance": 0.5, "cd": 2},
                      {"id": "praga_velha", "name": "Praga do Velho", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 2, "d": 6}, "chance": 0.35, "cd": 3}],
    "dama_noite":    [{"id": "beijo_sombrio", "name": "Beijo Sombrio", "type": "drain",
                       "chance": 0.45, "cd": 2},
                      {"id": "grito_mortal", "name": "Grito Mortal", "type": "fear",
                       "save": "SAB", "dc": 16, "status": "frightened", "turns": 3, "chance": 0.35, "cd": 3},
                      {"id": "maldicao", "name": "Maldição da Dama", "type": "inflict",
                       "status": "poison", "turns": 4, "dot": {"n": 3, "d": 6}, "chance": 0.4, "cd": 3}],

    "colosso_avasham": [{"id": "pisao_sismico", "name": "Pisão Sísmico", "type": "blast", "aoe": True,
                       "dmg_bonus": {"n": 8, "d": 10}, "save": "DES", "dc": 17,
                       "status": "bleeding", "turns": 3, "dot": {"n": 2, "d": 8}, "chance": 0.4, "cd": 3},
                      {"id": "punho_colossal", "name": "Punho Colossal", "type": "heavy",
                       "dmg_bonus": {"n": 4, "d": 12}, "chance": 0.5, "cd": 2},
                      {"id": "rugido_de_pedra", "name": "Rugido de Pedra", "type": "fear",
                       "save": "SAB", "dc": 16, "status": "frightened", "turns": 2, "chance": 0.35, "cd": 3},
                      {"id": "tempestade_de_areia", "name": "Tempestade de Areia", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 2, "d": 8}, "chance": 0.4, "cd": 3}],

    # arsenal do necromante: muitas magias, ele varia a cada turno
    "lorde_varth": [{"id": "chamar_servos", "name": "Chamar os Servos", "type": "summon",
                       "minion": "tumular_torre", "count": 2, "chance": 0.35, "cd": 6},
                      {"id": "praga_de_atalech", "name": "Praga de Atalech", "type": "trueblast", "aoe": True, "ranged": True, "vfx": "atalech",
                       "fixed": 50, "turns": 10, "dot": {"n": 0, "d": 1, "flat": 5}, "chance": 1.0, "cd": 10},
                      {"id": "manto_de_vargo", "name": "Manto de Vargo", "type": "selfbuff", "ranged": True, "vfx": "purpleglow",
                       "status": "couraca_vargo", "turns": 3, "chance": 0.5, "cd": 7},
                      {"id": "cataclisma", "name": "Cataclisma", "type": "blast", "aoe": True, "ranged": True, "vfx": "cataclysm",
                       "dmg_bonus": {"n": 16, "d": 10, "flat": 20}, "save": "CON", "dc": 19,
                       "status": "maldicao", "turns": 3, "dot": {"n": 3, "d": 10}, "chance": 0.6, "cd": 3},
                      {"id": "nova_necrotica", "name": "Nova Necrótica", "type": "blast", "aoe": True, "ranged": True,
                       "dmg_bonus": {"n": 12, "d": 8, "flat": 10}, "save": "CON", "dc": 18,
                       "status": "maldicao", "turns": 3, "dot": {"n": 2, "d": 10}, "chance": 0.5, "cd": 2},
                      {"id": "raio_necrotico", "name": "Raio Necrótico", "type": "heavy",
                       "dmg_bonus": {"n": 6, "d": 12, "flat": 10}, "chance": 0.5, "cd": 1},
                      {"id": "dreno_de_vida", "name": "Dreno de Vida", "type": "drain",
                       "chance": 0.5, "cd": 2},
                      {"id": "praga_mortal", "name": "Praga Mortal", "type": "inflict",
                       "status": "poison", "turns": 4, "dot": {"n": 4, "d": 8}, "chance": 0.45, "cd": 2},
                      {"id": "toque_paralisante", "name": "Toque Paralisante", "type": "gaze",
                       "save": "CON", "dc": 18, "status": "stunned", "turns": 1, "chance": 0.35, "cd": 3},
                      {"id": "terror_da_cripta", "name": "Terror da Cripta", "type": "fear",
                       "save": "SAB", "dc": 18, "status": "frightened", "turns": 2, "chance": 0.35, "cd": 3},
                      {"id": "festim_macabro", "name": "Festim Macabro", "type": "heal",
                       "heal": {"n": 6, "d": 10}, "chance": 0.3, "cd": 4}],

    # --- TORRE DO LORDE NECROTICO ---
    "tumular_torre": [{"id": "garra_putrida", "name": "Garra Pútrida", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 2, "d": 8}, "chance": 0.4, "cd": 2}],
    "carniceiro_torre": [{"id": "talho_sangrento", "name": "Talho Sangrento", "type": "inflict",
                       "dmg_bonus": {"n": 2, "d": 8}, "status": "bleeding", "turns": 3, "dot": {"n": 2, "d": 6}, "chance": 0.45, "cd": 2}],
    "cavaleiro_torre": [{"id": "lamina_profana", "name": "Lâmina Profana", "type": "heavy",
                       "dmg_bonus": {"n": 3, "d": 10}, "status": "maldicao", "turns": 3, "dot": {"n": 1, "d": 10}, "chance": 0.45, "cd": 2},
                      {"id": "brado_de_guerra", "name": "Brado de Guerra", "type": "fear",
                       "save": "SAB", "dc": 16, "status": "frightened", "turns": 2, "chance": 0.3, "cd": 3}],
    "algoz_torre": [{"id": "ceifa_profana", "name": "Ceifa Profana", "type": "blast", "aoe": True,
                       "dmg_bonus": {"n": 5, "d": 8}, "save": "DES", "dc": 16, "status": "bleeding", "turns": 3, "dot": {"n": 2, "d": 6}, "chance": 0.4, "cd": 3},
                      {"id": "golpe_executor", "name": "Golpe do Executor", "type": "heavy",
                       "dmg_bonus": {"n": 4, "d": 8}, "chance": 0.4, "cd": 2}],
    "necromante_torre": [{"id": "praga_necrotica", "name": "Praga Necrótica", "type": "blast", "aoe": True,
                       "dmg_bonus": {"n": 6, "d": 8}, "save": "CON", "dc": 17, "status": "maldicao", "turns": 3, "dot": {"n": 2, "d": 8}, "chance": 0.4, "cd": 3},
                      {"id": "dreno_sombrio", "name": "Dreno Sombrio", "type": "drain", "chance": 0.4, "cd": 2},
                      {"id": "erguer_mortos", "name": "Erguer os Mortos", "type": "summon",
                       "count": 2, "chance": 0.35, "cd": 4}],
    "profanador_torre": [{"id": "explosao_almas", "name": "Explosão de Almas", "type": "blast", "aoe": True,
                       "dmg_bonus": {"n": 7, "d": 8}, "save": "DES", "dc": 17, "status": "burning", "turns": 3, "dot": {"n": 2, "d": 8}, "chance": 0.4, "cd": 3},
                      {"id": "toque_paralisante", "name": "Toque Paralisante", "type": "gaze",
                       "save": "CON", "dc": 17, "status": "stunned", "turns": 1, "chance": 0.3, "cd": 3},
                      {"id": "maldicao_alma", "name": "Maldição da Alma", "type": "inflict",
                       "status": "maldicao", "turns": 3, "dot": {"n": 2, "d": 10}, "chance": 0.4, "cd": 2}],

    # --- MINA DE AVHUR: mortos-vivos egipcios ---
    "naja_tumular":  [{"id": "veneno_naja", "name": "Veneno da Naja", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 2, "d": 6}, "chance": 0.45, "cd": 2}],
    "sacerdote_sombrio": [{"id": "praga_sussurrada", "name": "Praga Sussurrada", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 1, "d": 8}, "chance": 0.4, "cd": 2}],
    "mumia_guerreira": [{"id": "presenca_terrivel", "name": "Presença Terrível", "type": "fear",
                       "save": "SAB", "dc": 13, "status": "frightened", "turns": 2, "chance": 0.3, "cd": 3}],
    "espirito_faraonico": [{"id": "dreno_faraonico", "name": "Dreno Faraônico", "type": "drain",
                       "chance": 0.45, "cd": 2}],
    "guardiao_arenito": [{"id": "punho_arenito", "name": "Punho de Arenito", "type": "heavy",
                       "dmg_bonus": {"n": 2, "d": 10}, "chance": 0.4, "cd": 2}],
    "anubis_guerreiro": [{"id": "golpe_khopesh", "name": "Golpe de Khopesh", "type": "heavy",
                       "dmg_bonus": {"n": 2, "d": 10}, "chance": 0.45, "cd": 2}],
    "abominacao_embalsamada": [{"id": "esmagar_embalsamado", "name": "Esmagamento Embalsamado", "type": "heavy",
                       "dmg_bonus": {"n": 2, "d": 10}, "chance": 0.45, "cd": 2},
                      {"id": "fedor_tumular", "name": "Fedor Tumular", "type": "fear",
                       "save": "SAB", "dc": 14, "status": "frightened", "turns": 2, "chance": 0.3, "cd": 3}],

    # --- O CHEFE: Faraó Amaldiçoado de Avhur (arsenal completo, como o Lorde Varth) ---
    "farao_avhur": [{"id": "cetro_real", "name": "Golpe do Cetro Real", "type": "heavy",
                       "dmg_bonus": {"n": 2, "d": 10}, "chance": 0.5, "cd": 2},
                      {"id": "dreno_real", "name": "Dreno do Faraó", "type": "drain",
                       "chance": 0.5, "cd": 2},
                      {"id": "praga_de_avhur", "name": "Praga de Avhur", "type": "inflict",
                       "status": "poison", "turns": 4, "dot": {"n": 3, "d": 6}, "chance": 0.45, "cd": 2},
                      {"id": "maldicao_escaravelho", "name": "Maldição do Escaravelho", "type": "gaze",
                       "save": "CON", "dc": 18, "status": "stunned", "turns": 1, "chance": 0.35, "cd": 3},
                      {"id": "olhar_do_farao", "name": "Olhar do Faraó", "type": "fear",
                       "save": "SAB", "dc": 18, "status": "frightened", "turns": 3, "chance": 0.35, "cd": 3},
                      {"id": "banquete_dos_mortos", "name": "Banquete dos Mortos", "type": "heal",
                       "heal": {"n": 6, "d": 8}, "chance": 0.3, "cd": 4}],

    # --- FERAS DA FLORESTA DO ERMO ---
    "lobo_cinzento_ermo": [{"id": "dilacerar_ermo", "name": "Dilacerar", "type": "inflict",
                       "dmg_bonus": {"n": 3, "d": 8}, "status": "bleeding", "turns": 3, "dot": {"n": 2, "d": 6}, "chance": 0.45, "cd": 2},
                      {"id": "bote_lupino", "name": "Bote Lupino", "type": "heavy",
                       "dmg_bonus": {"n": 4, "d": 8}, "chance": 0.45, "cd": 2},
                      {"id": "uivo_dos_ermos", "name": "Uivo dos Ermos", "type": "fear",
                       "save": "SAB", "dc": 15, "status": "frightened", "turns": 2, "chance": 0.3, "cd": 3}],
    "urso_pardo": [{"id": "patada_parda", "name": "Patada Brutal", "type": "heavy",
                       "dmg_bonus": {"n": 4, "d": 10}, "chance": 0.5, "cd": 2},
                      {"id": "dilacerar_urso", "name": "Dilacerar Carne", "type": "inflict",
                       "dmg_bonus": {"n": 2, "d": 8}, "status": "bleeding", "turns": 3, "dot": {"n": 2, "d": 8}, "chance": 0.4, "cd": 2},
                      {"id": "rugido_pardo", "name": "Rugido", "type": "fear",
                       "save": "SAB", "dc": 15, "status": "frightened", "turns": 2, "chance": 0.3, "cd": 3}],
    "urso_negro": [{"id": "esmagar_negro", "name": "Esmagamento", "type": "heavy",
                       "dmg_bonus": {"n": 5, "d": 10}, "chance": 0.5, "cd": 2},
                      {"id": "retalhar", "name": "Retalhar", "type": "inflict",
                       "dmg_bonus": {"n": 3, "d": 8}, "status": "bleeding", "turns": 3, "dot": {"n": 3, "d": 8}, "chance": 0.45, "cd": 2},
                      {"id": "rugido_negro", "name": "Rugido Feroz", "type": "fear",
                       "save": "SAB", "dc": 16, "status": "frightened", "turns": 2, "chance": 0.35, "cd": 3}],
    "urso_rei": [{"id": "pisao_sismico", "name": "Pisão Sísmico", "type": "blast", "aoe": True, "ranged": True,
                       "dmg_bonus": {"n": 8, "d": 10, "flat": 10}, "save": "DES", "dc": 18,
                       "status": "bleeding", "turns": 3, "dot": {"n": 2, "d": 8}, "chance": 0.5, "cd": 3},
                      {"id": "patada_real", "name": "Patada do Rei", "type": "heavy",
                       "dmg_bonus": {"n": 5, "d": 12}, "chance": 0.5, "cd": 1},
                      {"id": "rugido_do_rei", "name": "Rugido do Rei", "type": "fear",
                       "save": "SAB", "dc": 17, "status": "frightened", "turns": 3, "chance": 0.4, "cd": 3},
                      {"id": "dilacerar_real", "name": "Dilacerar Real", "type": "inflict",
                       "dmg_bonus": {"n": 3, "d": 10}, "status": "bleeding", "turns": 3, "dot": {"n": 3, "d": 10}, "chance": 0.45, "cd": 2}],

    # --- BRASAL / GOELA DE KREZATH ---
    "cinzal": [{"id": "bote_cinzento", "name": "Bote Cinzento", "type": "heavy",
                       "dmg_bonus": {"n": 4, "d": 10}, "chance": 0.5, "cd": 2},
                      {"id": "garras_em_brasa", "name": "Garras em Brasa", "type": "inflict",
                       "status": "burning", "turns": 3, "dot": {"n": 2, "d": 8}, "chance": 0.4, "cd": 2}],
    "salamandra_brasal": [{"id": "cuspe_de_fogo", "name": "Cuspe de Fogo", "type": "heavy", "ranged": True,
                       "dmg_bonus": {"n": 4, "d": 10}, "chance": 0.5, "cd": 2},
                      {"id": "lingua_flamejante", "name": "Língua Flamejante", "type": "inflict",
                       "status": "burning", "turns": 3, "dot": {"n": 3, "d": 8}, "chance": 0.45, "cd": 2}],
    "serpe_magma": [{"id": "bote_magmatico", "name": "Bote Magmático", "type": "heavy",
                       "dmg_bonus": {"n": 5, "d": 10}, "chance": 0.5, "cd": 2},
                      {"id": "constricao_ardente", "name": "Constrição Ardente", "type": "inflict",
                       "status": "burning", "turns": 3, "dot": {"n": 3, "d": 8}, "chance": 0.4, "cd": 2},
                      {"id": "silvo_primordial", "name": "Silvo Primordial", "type": "fear",
                       "save": "SAB", "dc": 16, "status": "frightened", "turns": 2, "chance": 0.3, "cd": 3}],
    "golem_obsidiana": [{"id": "esmagar_obsidiana", "name": "Esmagar", "type": "heavy",
                       "dmg_bonus": {"n": 6, "d": 10}, "chance": 0.55, "cd": 2},
                      {"id": "tremor_local", "name": "Tremor", "type": "gaze",
                       "save": "DES", "dc": 17, "status": "stunned", "turns": 1, "chance": 0.3, "cd": 3}],
    "imp_brasal": [{"id": "espeto_ardente", "name": "Espeto Ardente", "type": "inflict",
                       "dmg_bonus": {"n": 2, "d": 10}, "status": "burning", "turns": 2, "dot": {"n": 2, "d": 8}, "chance": 0.5, "cd": 2},
                      {"id": "risada_infernal", "name": "Risada Infernal", "type": "fear",
                       "save": "SAB", "dc": 15, "status": "frightened", "turns": 2, "chance": 0.3, "cd": 3}],
    "forjado_krezath": [{"id": "corte_fundido", "name": "Corte Fundido", "type": "heavy",
                       "dmg_bonus": {"n": 5, "d": 12}, "chance": 0.55, "cd": 2},
                      {"id": "lamina_ardente", "name": "Lâmina Ardente", "type": "inflict",
                       "status": "burning", "turns": 3, "dot": {"n": 3, "d": 8}, "chance": 0.4, "cd": 2}],
    "templario_magma": [{"id": "julgamento_igneo", "name": "Julgamento Ígneo", "type": "heavy",
                       "dmg_bonus": {"n": 6, "d": 12}, "chance": 0.55, "cd": 2},
                      {"id": "brasa_sagrada", "name": "Brasa Sagrada", "type": "inflict",
                       "status": "burning", "turns": 3, "dot": {"n": 3, "d": 10}, "chance": 0.4, "cd": 2},
                      {"id": "voto_da_forja", "name": "Voto da Forja", "type": "heal",
                       "heal": {"n": 5, "d": 10}, "chance": 0.3, "cd": 4}],
    "devoto_krezath": [{"id": "prece_incendiaria", "name": "Prece Incendiária", "type": "blast", "aoe": True, "ranged": True,
                       "dmg_bonus": {"n": 10, "d": 8, "flat": 10}, "save": "DES", "dc": 17,
                       "status": "burning", "turns": 3, "dot": {"n": 2, "d": 8}, "chance": 0.5, "cd": 3},
                      {"id": "labareda_dirigida", "name": "Labareda Dirigida", "type": "heavy", "ranged": True,
                       "dmg_bonus": {"n": 4, "d": 10}, "chance": 0.5, "cd": 2}],
    "cria_krezath": [{"id": "sopro_juvenil", "name": "Sopro Juvenil", "type": "inflict",
                       "dmg_bonus": {"n": 2, "d": 10}, "status": "burning", "turns": 2, "dot": {"n": 2, "d": 6}, "chance": 0.45, "cd": 2}],
    "vulkar": [{"id": "martelo_sismico", "name": "Martelo Sísmico", "type": "blast", "aoe": True, "ranged": True, "vfx": "magmastorm",
                       "dmg_bonus": {"n": 10, "d": 10, "flat": 16}, "save": "DES", "dc": 18,
                       "status": "burning", "turns": 3, "dot": {"n": 2, "d": 10}, "chance": 0.5, "cd": 3},
                      {"id": "furia_da_forja", "name": "Fúria da Forja", "type": "selfbuff", "ranged": True, "vfx": "emberglow",
                       "status": "escamas_krezath", "turns": 2, "chance": 0.4, "cd": 6},
                      {"id": "pancada_do_guardiao", "name": "Pancada do Guardião", "type": "heavy",
                       "dmg_bonus": {"n": 6, "d": 12}, "chance": 0.55, "cd": 1},
                      {"id": "brado_da_goela", "name": "Brado da Goela", "type": "fear",
                       "save": "SAB", "dc": 17, "status": "frightened", "turns": 2, "chance": 0.35, "cd": 3}],
    "krezath": [{"id": "ninhada_do_devorador", "name": "Ninhada do Devorador", "type": "summon",
                       "minion": "cria_krezath", "count": 2, "chance": 0.35, "cd": 6},
                      {"id": "halito_do_fim", "name": "Hálito do Fim", "type": "trueblast", "aoe": True, "ranged": True, "vfx": "dragonfire",
                       "fixed": 65, "status": "chama_eterna", "turns": 8, "dot": {"n": 0, "d": 1, "flat": 6}, "chance": 1.0, "cd": 9},
                      {"id": "escamas_de_obsidiana", "name": "Escamas de Obsidiana", "type": "selfbuff", "ranged": True, "vfx": "emberglow",
                       "status": "escamas_krezath", "turns": 3, "chance": 0.5, "cd": 7},
                      {"id": "tempestade_de_magma", "name": "Tempestade de Magma", "type": "blast", "aoe": True, "ranged": True, "vfx": "magmastorm",
                       "dmg_bonus": {"n": 18, "d": 10, "flat": 30}, "save": "DES", "dc": 20,
                       "status": "burning", "turns": 3, "dot": {"n": 3, "d": 10}, "chance": 0.6, "cd": 3},
                      {"id": "rugido_primordial", "name": "Rugido Primordial", "type": "fear",
                       "save": "SAB", "dc": 19, "status": "frightened", "turns": 3, "chance": 0.4, "cd": 3},
                      {"id": "cauda_sismica", "name": "Cauda Sísmica", "type": "heavy",
                       "dmg_bonus": {"n": 8, "d": 12}, "chance": 0.55, "cd": 1},
                      {"id": "garras_do_devorador", "name": "Garras do Devorador", "type": "inflict",
                       "dmg_bonus": {"n": 4, "d": 12}, "status": "bleeding", "turns": 3, "dot": {"n": 4, "d": 10}, "chance": 0.45, "cd": 2}],

    # --- COSTA DE MARAVAI ---
    "avestruz_brava": [{"id": "coice_duplo", "name": "Coice Duplo", "type": "heavy",
                       "dmg_bonus": {"n": 3, "d": 8}, "chance": 0.5, "cd": 2}],
    "hiena_rubra": [{"id": "mordida_rasgante", "name": "Mordida Rasgante", "type": "inflict",
                       "status": "bleeding", "turns": 2, "dot": {"n": 2, "d": 6}, "chance": 0.45, "cd": 2}],
    "leao_ermal": [{"id": "bote_do_leao", "name": "Bote do Leão", "type": "heavy",
                       "dmg_bonus": {"n": 4, "d": 10}, "chance": 0.5, "cd": 2},
                      {"id": "rugido_ermal", "name": "Rugido", "type": "fear",
                       "save": "SAB", "dc": 15, "status": "frightened", "turns": 2, "chance": 0.3, "cd": 3}],
    "bufalo_ermal": [{"id": "investida", "name": "Investida", "type": "heavy",
                       "dmg_bonus": {"n": 5, "d": 10}, "chance": 0.5, "cd": 2}],
    "caranguejo_gigante": [{"id": "pinça_esmagadora", "name": "Pinça Esmagadora", "type": "heavy",
                       "dmg_bonus": {"n": 4, "d": 10}, "chance": 0.5, "cd": 2},
                      {"id": "carapaça", "name": "Carapaça", "type": "selfbuff", "ranged": True, "vfx": "emberglow",
                       "status": "escamas_krezath", "turns": 2, "chance": 0.25, "cd": 6}],
    "medusa_de_areia": [{"id": "ferroada_urticante", "name": "Ferroada Urticante", "type": "inflict",
                       "status": "poison", "turns": 3, "dot": {"n": 2, "d": 8}, "chance": 0.55, "cd": 2}],
    "maraja": [{"id": "bote_real_maraja", "name": "Bote Real", "type": "heavy",
                       "dmg_bonus": {"n": 5, "d": 12}, "chance": 0.55, "cd": 1},
                      {"id": "rugido_do_maraja", "name": "Rugido do Marajá", "type": "fear",
                       "save": "SAB", "dc": 17, "status": "frightened", "turns": 2, "chance": 0.4, "cd": 3},
                      {"id": "sol_da_savana", "name": "Sol da Savana", "type": "heal",
                       "heal": {"n": 6, "d": 10}, "chance": 0.3, "cd": 4},
                      {"id": "dilacerar_alvo", "name": "Dilacerar", "type": "inflict",
                       "dmg_bonus": {"n": 3, "d": 10}, "status": "bleeding", "turns": 3, "dot": {"n": 3, "d": 8}, "chance": 0.4, "cd": 2}],
    # --- UMBRAVAL ---
    "lobo_umbrio": [{"id": "bote_umbrio", "name": "Bote Umbrío", "type": "heavy",
                       "dmg_bonus": {"n": 4, "d": 10}, "chance": 0.5, "cd": 2},
                      {"id": "uivo_da_noite", "name": "Uivo da Noite", "type": "fear",
                       "save": "SAB", "dc": 15, "status": "frightened", "turns": 2, "chance": 0.3, "cd": 3}],
    "vulto_noturno": [{"id": "abraco_gelido", "name": "Abraço Gélido", "type": "inflict",
                       "dmg_bonus": {"n": 3, "d": 10}, "status": "slowed", "turns": 2, "chance": 0.45, "cd": 2},
                      {"id": "sussurro_umbrio", "name": "Sussurro Umbrío", "type": "fear",
                       "save": "SAB", "dc": 16, "status": "frightened", "turns": 2, "chance": 0.35, "cd": 3}],
    # --- VÉSPERA: vampiros ---
    "cria_vampirica": [{"id": "mordida_voraz", "name": "Mordida Voraz", "type": "inflict",
                       "dmg_bonus": {"n": 3, "d": 10}, "status": "bleeding", "turns": 3, "dot": {"n": 3, "d": 8}, "chance": 0.45, "cd": 2},
                      {"id": "sede_de_sangue", "name": "Sede de Sangue", "type": "heal",
                       "heal": {"n": 4, "d": 10}, "chance": 0.35, "cd": 3}],
    "vampiro_nobre": [{"id": "estocada_carmesim", "name": "Estocada Carmesim", "type": "heavy",
                       "dmg_bonus": {"n": 5, "d": 12}, "chance": 0.5, "cd": 2},
                      {"id": "forma_de_nevoa", "name": "Forma de Névoa", "type": "selfbuff", "ranged": True, "vfx": "emberglow",
                       "status": "escamas_krezath", "turns": 2, "chance": 0.3, "cd": 6},
                      {"id": "beber_sangue", "name": "Beber Sangue", "type": "heal",
                       "heal": {"n": 6, "d": 10}, "chance": 0.35, "cd": 3}],
    "vampiro_anciao": [{"id": "olhar_hipnotico", "name": "Olhar Hipnótico", "type": "fear",
                       "save": "SAB", "dc": 18, "status": "frightened", "turns": 2, "chance": 0.4, "cd": 3},
                      {"id": "banquete_de_sangue", "name": "Banquete de Sangue", "type": "heal",
                       "heal": {"n": 8, "d": 10}, "chance": 0.35, "cd": 3},
                      {"id": "convocar_a_noite", "name": "Convocar a Noite", "type": "summon",
                       "minion": "enxame_morcegos", "count": 2, "chance": 0.4, "cd": 5},
                      {"id": "lamina_de_sangue", "name": "Lâmina de Sangue", "type": "heavy",
                       "dmg_bonus": {"n": 6, "d": 12}, "chance": 0.5, "cd": 2}],
    # --- UMBRAVAL: lobisomens ---
    "lobisomem_ferino": [{"id": "garras_dilacerantes", "name": "Garras Dilacerantes", "type": "inflict",
                       "dmg_bonus": {"n": 3, "d": 10}, "status": "bleeding", "turns": 3, "dot": {"n": 3, "d": 8}, "chance": 0.5, "cd": 2},
                      {"id": "bote_lupino", "name": "Bote Lupino", "type": "heavy",
                       "dmg_bonus": {"n": 4, "d": 10}, "chance": 0.45, "cd": 2}],
    "lobisomem_uivador": [{"id": "uivo_aterrador", "name": "Uivo Aterrador", "type": "fear",
                       "save": "SAB", "dc": 17, "status": "frightened", "turns": 2, "chance": 0.4, "cd": 3},
                      {"id": "bote_lupino_u", "name": "Bote Lupino", "type": "heavy",
                       "dmg_bonus": {"n": 5, "d": 12}, "chance": 0.5, "cd": 2},
                      {"id": "frenesi", "name": "Frenesi", "type": "selfbuff", "ranged": True, "vfx": "emberglow",
                       "status": "escamas_krezath", "turns": 2, "chance": 0.25, "cd": 6}],
    "lobisomem_ancestral": [{"id": "uivo_ancestral", "name": "Uivo Ancestral", "type": "fear",
                       "save": "SAB", "dc": 18, "status": "frightened", "turns": 2, "chance": 0.4, "cd": 3},
                      {"id": "furia_da_lua", "name": "Fúria da Lua", "type": "selfbuff", "ranged": True, "vfx": "emberglow",
                       "status": "escamas_krezath", "turns": 3, "chance": 0.3, "cd": 6},
                      {"id": "dilacerar_ancestral", "name": "Dilacerar", "type": "inflict",
                       "dmg_bonus": {"n": 4, "d": 12}, "status": "bleeding", "turns": 3, "dot": {"n": 4, "d": 10}, "chance": 0.45, "cd": 2}],
}


# --- arsenal SOMBRIO extra da Torre do Varth: habilidades e magias novas, todas sombrias.
# o campo "vfx" escolhe o efeito visual sombrio no cliente (shadowblast/souldrain/cursesigil/darkbolt/shadow/soul).
_TOWER_EXTRA = {
    "tumular_torre": [
        {"id": "vomito_necrotico", "name": "Vômito Necrótico", "type": "blast", "aoe": True, "vfx": "shadowblast",
         "dmg_bonus": {"n": 3, "d": 8}, "save": "CON", "dc": 15, "status": "poison", "turns": 3, "dot": {"n": 2, "d": 6}, "chance": 0.35, "cd": 3},
        {"id": "agarrar_tumular", "name": "Agarrão Pútrido", "type": "inflict", "vfx": "shadow",
         "dmg_bonus": {"n": 2, "d": 8}, "status": "restrained", "turns": 2, "chance": 0.35, "cd": 3}],
    "carniceiro_torre": [
        {"id": "decepar", "name": "Decepar", "type": "heavy", "vfx": "shadow",
         "dmg_bonus": {"n": 3, "d": 10}, "chance": 0.45, "cd": 2},
        {"id": "banquete_macabro", "name": "Banquete Macabro", "type": "heal", "vfx": "soul",
         "heal": {"n": 4, "d": 10}, "chance": 0.3, "cd": 4}],
    "cavaleiro_torre": [
        {"id": "lamina_da_alma", "name": "Lâmina da Alma", "type": "drain", "vfx": "souldrain",
         "dmg_bonus": {"n": 3, "d": 10}, "chance": 0.4, "cd": 2},
        {"id": "aura_profana", "name": "Aura Profana", "type": "inflict", "vfx": "cursesigil",
         "status": "maldicao", "turns": 3, "dot": {"n": 2, "d": 8}, "chance": 0.4, "cd": 3}],
    "algoz_torre": [
        {"id": "marca_do_carrasco", "name": "Marca do Carrasco", "type": "gaze", "vfx": "cursesigil",
         "save": "SAB", "dc": 16, "status": "maldicao", "turns": 3, "dot": {"n": 3, "d": 8}, "chance": 0.35, "cd": 3},
        {"id": "lamina_sangrenta", "name": "Lâmina Sangrenta", "type": "inflict", "vfx": "shadow",
         "dmg_bonus": {"n": 3, "d": 8}, "status": "bleeding", "turns": 3, "dot": {"n": 2, "d": 8}, "chance": 0.4, "cd": 2}],
    "necromante_torre": [
        {"id": "raio_necrotico", "name": "Raio Necrótico", "type": "heavy", "vfx": "darkbolt",
         "dmg_bonus": {"n": 4, "d": 10}, "chance": 0.45, "cd": 2},
        {"id": "nuvem_de_almas", "name": "Nuvem de Almas", "type": "blast", "aoe": True, "vfx": "shadowblast",
         "dmg_bonus": {"n": 5, "d": 8}, "save": "CON", "dc": 17, "status": "blinded", "turns": 2, "chance": 0.35, "cd": 3}],
    "profanador_torre": [
        {"id": "colher_almas", "name": "Colher Almas", "type": "drain", "vfx": "souldrain",
         "dmg_bonus": {"n": 4, "d": 10}, "chance": 0.45, "cd": 2},
        {"id": "tempestade_profana", "name": "Tempestade Profana", "type": "blast", "aoe": True, "vfx": "shadowblast",
         "dmg_bonus": {"n": 6, "d": 8}, "save": "DES", "dc": 18, "status": "maldicao", "turns": 3, "dot": {"n": 2, "d": 10}, "chance": 0.4, "cd": 3}],
    "lorde_varth": [
        {"id": "chuva_de_caveiras", "name": "Chuva de Caveiras", "type": "blast", "aoe": True, "vfx": "shadowblast",
         "dmg_bonus": {"n": 8, "d": 8}, "save": "DES", "dc": 18, "status": "maldicao", "turns": 3, "dot": {"n": 3, "d": 10}, "chance": 0.4, "cd": 3},
        {"id": "ceifar_alma", "name": "Ceifar a Alma", "type": "drain", "vfx": "souldrain",
         "dmg_bonus": {"n": 6, "d": 10}, "chance": 0.45, "cd": 2},
        # --- 3 habilidades ÚNICAS do Lorde Varth (lich) ---
        {"id": "raio_do_abismo", "name": "Raio do Abismo", "type": "heavy", "vfx": "darkbolt",
         "dmg_bonus": {"n": 8, "d": 12}, "chance": 0.45, "cd": 2},
        {"id": "coro_dos_condenados", "name": "Coro dos Condenados", "type": "fear", "vfx": "cursesigil",
         "save": "SAB", "dc": 19, "status": "frightened", "turns": 3, "chance": 0.4, "cd": 3},
        {"id": "banquete_de_almas", "name": "Banquete de Almas", "type": "drain", "vfx": "souldrain",
         "dmg_bonus": {"n": 8, "d": 10}, "chance": 0.45, "cd": 2},
        # --- HABILIDADE SUPREMA: cataclisma necrótico 10x10 (50 fixo + Veneno de Varth) ---
        {"id": "cataclisma_de_vargo", "name": "Cataclisma de Vargo", "type": "blast", "aoe": True, "vfx": "cataclysm",
         "fixed": 50, "status": "veneno_varth", "turns": 10, "dot": {"n": 0, "d": 1, "flat": 5},
         "chance": 0.45, "cd": 4}],
}
for _mid, _extra in _TOWER_EXTRA.items():
    MONSTER_ABILITIES.setdefault(_mid, [])
    MONSTER_ABILITIES[_mid].extend(_extra)


def abilities_for(type_id):
    """Lista de habilidades especiais do tipo de monstro (vazia se nao tiver)."""
    return MONSTER_ABILITIES.get(type_id, [])


# ---- habilidades pros que ficaram de fora (atribuição temática) ----
for _t in ['coelho', 'lebre', 'veado', 'cervo', 'capivara', 'antilope', 'enxame_morcegos']:
    _n = (MONSTERS.get(_t, {}).get("name", "") + _t).lower()
    if any(w in _n for w in ("lobo", "javali", "urso", "hiena", "onca", "fera", "capivara")):
        _ab = {"id": "investida_%s" % _t, "name": "Investida", "type": "heavy",
               "mult": 2, "chance": 0.3, "cd": 3}
    elif any(w in _n for w in ("fantasma", "espectro", "sombra", "vulto", "alma")):
        _ab = {"id": "uivo_%s" % _t, "name": "Uivo Gélido", "type": "fear",
               "dc": 13, "turns": 2, "chance": 0.25, "cd": 5}
    elif any(w in _n for w in ("aranha", "serpente", "cobra", "escorp", "slime", "gosma")):
        _ab = {"id": "peconha_%s" % _t, "name": "Peçonha", "type": "inflict",
               "status": "poison", "turns": 3, "dot": {"n": 1, "d": 4},
               "chance": 0.35, "cd": 3}
    elif any(w in _n for w in ("mago", "bruxo", "cultista", "xama", "lich", "arcan")):
        _ab = {"id": "raio_%s" % _t, "name": "Raio Arcano", "type": "blast",
               "dmg": {"n": 2, "d": 8}, "chance": 0.3, "cd": 3}
    else:
        _ab = {"id": "golpe_%s" % _t, "name": "Golpe Brutal", "type": "heavy",
               "mult": 2, "chance": 0.25, "cd": 4}
    MONSTER_ABILITIES.setdefault(_t, []).append(_ab)


# a CARCAÇA: o que sobra da caça dos predadores (saqueável... por sua conta e risco)
MONSTERS["carcaca"] = {"name": "Carcaça", "hp": 25, "ac": 5, "atk": 0,
    "dmg": {"n": 0, "d": 1}, "reach": 1, "speed": 1, "xp": 0, "dex": 0,
    "glyph": "🦴", "kind": "bicho", "passive": True,
    "drops": [["carne_caca", 0.9, 1, 2], ["couro_curtido", 0.5, 1, 1]], "bronze": [0, 5]}


# ===========================================================================
#  PROSPERINA: a fauna dos campos e os batedores da Rainha Cinzenta.
# ===========================================================================
TRIGAL_SPAWNS = [("javali", 14, 8), ("javali", 40, 28), ("javali", 24, 30),
                 ("coelho", 10, 25), ("coelho", 30, 6), ("lebre", 46, 10),
                 ("lebre", 18, 24), ("rato_gigante", 50, 30), ("rato_gigante", 6, 6)]
VINHEDO_SPAWNS = [("veado", 10, 4), ("veado", 40, 3), ("coelho", 20, 30),
                  ("coelho", 46, 30), ("javali", 6, 28), ("lobo", 48, 4)]
PASTOS_SPAWNS = [("cervo", 24, 8), ("cervo", 13, 24), ("capivara", 26, 22),
                 ("lobo", 3, 4), ("lobo", 3, 28), ("lobo_negro", 48, 3)]
FAROL_MARGEM_SPAWNS = [("capanga", 6, 20), ("capanga", 14, 20),
                       ("capanga_brutamontes", 30, 8)]
