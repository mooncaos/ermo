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
        "xp": 90, "dex": 3, "glyph": "💀", "kind": "morto-vivo", "atk_name": "espadada",
        "drops": [("osso_amaldicoado", 0.7, 1, 2), ("coin_silver", 0.3, 1, 1)], "bronze": (30, 52),
    },
    "zumbi_putrido": {
        "name": "Zumbi Pútrido", "hp": 240, "ac": 16, "atk": 9,
        "dmg": {"n": 4, "d": 6, "flat": 7}, "reach": 1, "speed": 4,
        "xp": 100, "dex": 1, "glyph": "🧟", "kind": "morto-vivo", "atk_name": "garras podres",
        "drops": [("carne_putrida", 0.7, 1, 2)], "bronze": (32, 54),
    },
    "ghoul_faminto": {
        "name": "Ghoul Faminto", "hp": 210, "ac": 17, "atk": 10,
        "dmg": {"n": 4, "d": 6, "flat": 6}, "reach": 1, "speed": 9,
        "xp": 110, "dex": 4, "glyph": "👹", "kind": "morto-vivo", "atk_name": "dilacerar",
        "drops": [("garra_ghoul", 0.7, 1, 1), ("coin_silver", 0.3, 1, 1)], "bronze": (34, 56),
    },
    "aparicao_sepulcral": {
        "name": "Aparição Sepulcral", "hp": 200, "ac": 18, "atk": 10,
        "dmg": {"n": 4, "d": 8, "flat": 5}, "reach": 1, "speed": 8,
        "xp": 120, "dex": 5, "glyph": "👻", "kind": "espirito", "atk_name": "toque sepulcral",
        "drops": [("mortalha_espectral", 0.7, 1, 1)], "bronze": (36, 60),
    },
    "carnical_profanador": {
        "name": "Carniçal Profanador", "hp": 260, "ac": 18, "atk": 11,
        "dmg": {"n": 4, "d": 8, "flat": 6}, "reach": 1, "speed": 7,
        "xp": 140, "dex": 3, "glyph": "🧟", "kind": "morto-vivo", "atk_name": "presas",
        "drops": [("lingua_carnical", 0.7, 1, 1), ("coin_silver", 0.35, 1, 1)], "bronze": (40, 66),
    },
    "cavaleiro_morte": {
        "name": "Cavaleiro da Morte", "hp": 310, "ac": 19, "atk": 12,
        "dmg": {"n": 5, "d": 6, "flat": 7}, "reach": 1, "speed": 6,
        "xp": 170, "dex": 3, "glyph": "⚔️", "kind": "morto-vivo", "atk_name": "lâmina negra",
        "drops": [("elmo_cavaleiro_morte", 0.7, 1, 1), ("coin_gold", 0.3, 1, 1)], "bronze": (50, 84),
    },
    "necromante_caido": {
        "name": "Necromante Caído", "hp": 280, "ac": 18, "atk": 11,
        "dmg": {"n": 4, "d": 8, "flat": 7}, "reach": 5, "speed": 6,
        "xp": 190, "dex": 4, "glyph": "🧙", "kind": "morto-vivo", "atk_name": "raio sombrio",
        "summon_type": "esqueleto_guerreiro", "summons": 2,
        "drops": [("grimorio_negro", 0.8, 1, 1), ("coin_gold", 0.3, 1, 1)], "bronze": (54, 90),
    },
    "abominacao_ossea": {
        "name": "Abominação Óssea", "hp": 380, "ac": 20, "atk": 13,
        "dmg": {"n": 5, "d": 8, "flat": 8}, "reach": 2, "speed": 5,
        "xp": 240, "dex": 2, "glyph": "☠️", "kind": "morto-vivo", "atk_name": "esmagar ósseo",
        "drops": [("coracao_abominacao", 0.9, 1, 1), ("coin_gold", 0.4, 1, 1)], "bronze": (70, 120),
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
}


def abilities_for(type_id):
    """Lista de habilidades especiais do tipo de monstro (vazia se nao tiver)."""
    return MONSTER_ABILITIES.get(type_id, [])
