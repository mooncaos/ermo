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
        "xp": 25, "dex": 2, "glyph": "🐀", "kind": "bicho", "atk_name": "mordida",
        "drops": [("rabo_rato", 0.6, 1, 1)], "bronze": (1, 3),
    },
    "lobo": {
        "name": "Lobo", "hp": 11, "ac": 13, "atk": 4,
        "dmg": {"n": 2, "d": 4, "flat": 2}, "reach": 1, "speed": 8,
        "xp": 50, "dex": 2, "glyph": "🐺", "kind": "bicho", "atk_name": "mordida",
        "drops": [("presa_lobo", 0.5, 1, 2), ("pelego_lobo", 0.3, 1, 1)], "bronze": (2, 5),
    },
    "javali": {
        "name": "Javali", "hp": 13, "ac": 11, "atk": 3,
        "dmg": {"n": 1, "d": 6, "flat": 1}, "reach": 1, "speed": 7,
        "xp": 50, "dex": 0, "glyph": "🐗", "kind": "bicho", "atk_name": "presada",
        "drops": [("presa_javali", 0.5, 1, 2), ("couro_javali", 0.35, 1, 1)], "bronze": (2, 5),
    },
    "capanga": {
        "name": "Cria de Sapopemba", "hp": 13, "ac": 12, "atk": 3,
        "dmg": {"n": 1, "d": 6, "flat": 1}, "reach": 1, "speed": 6,
        "xp": 30, "dex": 1, "glyph": "🔪", "kind": "capanga", "atk_name": "facão",
        "drops": [("bornal_cria", 0.4, 1, 1)], "bronze": (4, 9),
    },
    "capanga_brutamontes": {
        "name": "Traficante de Sapopemba", "hp": 36, "ac": 13, "atk": 6,
        "dmg": {"n": 2, "d": 6, "flat": 3}, "reach": 1, "speed": 6,
        "xp": 175, "dex": 1, "glyph": "🪓", "kind": "capanga", "atk_name": "marreta",
        "drops": [("marreta_velha", 0.4, 1, 1)], "bronze": (10, 18),
    },
    "maurao": {
        "name": "Maurão da Sapo", "hp": 140, "ac": 16, "atk": 8,
        "dmg": {"n": 3, "d": 6, "flat": 5}, "reach": 1, "speed": 6,
        "xp": 700, "dex": 1, "glyph": "👑", "kind": "capanga",
        "atk_name": "marretada", "boss": True, "summon_type": "capanga_brutamontes", "summons": 5,
        "drops": [("correntao_ouro", 1.0, 1, 1), ("microfone_patrao", 1.0, 1, 1),
                  ("coin_gold", 1.0, 1, 1)], "bronze": (60, 90),
    },
    "velho_bob": {
        "name": "O Velho Bob", "hp": 120, "ac": 14, "atk": 8,
        "dmg": {"n": 2, "d": 8, "flat": 6}, "reach": 1, "speed": 8,
        "xp": 600, "dex": 2, "glyph": "🐗", "kind": "bicho",
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
        "xp": 180, "dex": 3, "glyph": "🐺", "kind": "bicho", "atk_name": "dentada",
        "drops": [("couro_lobo_negro", 0.7, 1, 2), ("presa_lobo", 0.4, 1, 1)], "bronze": (8, 16),
    },
    "harpia": {
        "name": "Harpia", "hp": 44, "ac": 15, "atk": 7,
        "dmg": {"n": 2, "d": 6, "flat": 3}, "reach": 1, "speed": 8,
        "xp": 230, "dex": 4, "glyph": "🦅", "kind": "bicho", "atk_name": "garras",
        "drops": [("pena_harpia", 0.7, 1, 2), ("coin_silver", 0.3, 1, 1)], "bronze": (10, 20),
    },
    "bruxa_louca": {
        "name": "Bruxa Enlouquecida", "hp": 48, "ac": 14, "atk": 7,
        "dmg": {"n": 2, "d": 6, "flat": 4}, "reach": 4, "speed": 6,
        "xp": 280, "dex": 2, "glyph": "🧙", "kind": "bruxa", "atk_name": "praga",
        "drops": [("dedo_bruxa", 0.7, 1, 1), ("coin_silver", 0.4, 1, 1)], "bronze": (14, 26),
    },
    "alma_errante": {
        "name": "Alma Errante", "hp": 32, "ac": 16, "atk": 7,
        "dmg": {"n": 2, "d": 6, "flat": 4}, "reach": 1, "speed": 7,
        "xp": 230, "dex": 4, "glyph": "👻", "kind": "espirito", "atk_name": "toque gelido",
        "drops": [("ectoplasma", 0.7, 1, 2)], "bronze": (10, 20),
    },
    "assombracao": {
        "name": "Assombracao", "hp": 42, "ac": 15, "atk": 7,
        "dmg": {"n": 3, "d": 4, "flat": 4}, "reach": 1, "speed": 6,
        "xp": 270, "dex": 3, "glyph": "👻", "kind": "espirito", "atk_name": "lamento",
        "drops": [("veu_assombracao", 0.7, 1, 1)], "bronze": (12, 22),
    },
    "espectro": {
        "name": "Espectro", "hp": 36, "ac": 17, "atk": 8,
        "dmg": {"n": 2, "d": 8, "flat": 3}, "reach": 1, "speed": 8,
        "xp": 300, "dex": 5, "glyph": "💀", "kind": "espirito", "atk_name": "garra eterea",
        "drops": [("cinza_espectral", 0.7, 1, 1), ("coin_silver", 0.3, 1, 1)], "bronze": (14, 24),
    },
    "vulto": {
        "name": "Vulto Sombrio", "hp": 48, "ac": 16, "atk": 8,
        "dmg": {"n": 2, "d": 6, "flat": 6}, "reach": 1, "speed": 7,
        "xp": 340, "dex": 4, "glyph": "🌑", "kind": "espirito", "atk_name": "sombra",
        "drops": [("essencia_sombria", 0.7, 1, 1)], "bronze": (16, 28),
    },
    "alma_penada": {
        "name": "Alma Penada", "hp": 54, "ac": 16, "atk": 8,
        "dmg": {"n": 3, "d": 6, "flat": 4}, "reach": 1, "speed": 6,
        "xp": 380, "dex": 3, "glyph": "😱", "kind": "espirito", "atk_name": "grito sufocado",
        "drops": [("lamento_petrificado", 0.7, 1, 1), ("coin_silver", 0.35, 1, 1)], "bronze": (18, 32),
    },
    "dama_noite": {
        "name": "A Dama da Noite", "hp": 520, "ac": 19, "atk": 12,
        "dmg": {"n": 4, "d": 10, "flat": 8}, "reach": 2, "speed": 7,
        "xp": 5000, "dex": 5, "glyph": "💀", "kind": "espirito",
        "atk_name": "lamento mortal", "boss": True, "summon_type": "alma_errante", "summons": 3,
        "drops": [("cajado_magico", 1.0, 1, 1), ("lagrima_da_dama", 1.0, 1, 1),
                  ("coin_gold", 1.0, 1, 1)], "bronze": (100, 150),
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


def get(type_id):
    return MONSTERS.get(type_id)


def catalog():
    """Pro cliente, se precisar: id -> {name, glyph, kind}."""
    return {k: {"name": v["name"], "glyph": v["glyph"], "kind": v["kind"]}
            for k, v in MONSTERS.items()}
