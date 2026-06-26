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
    },
    "lobo": {
        "name": "Lobo", "hp": 11, "ac": 13, "atk": 4,
        "dmg": {"n": 2, "d": 4, "flat": 2}, "reach": 1, "speed": 8,
        "xp": 50, "dex": 2, "glyph": "🐺", "kind": "bicho", "atk_name": "mordida",
    },
    "javali": {
        "name": "Javali", "hp": 13, "ac": 11, "atk": 3,
        "dmg": {"n": 1, "d": 6, "flat": 1}, "reach": 1, "speed": 7,
        "xp": 50, "dex": 0, "glyph": "🐗", "kind": "bicho", "atk_name": "presada",
    },
    "capanga": {
        "name": "Cria de Sapopemba", "hp": 13, "ac": 12, "atk": 3,
        "dmg": {"n": 1, "d": 6, "flat": 1}, "reach": 1, "speed": 6,
        "xp": 30, "dex": 1, "glyph": "🔪", "kind": "capanga", "atk_name": "facão",
    },
    "capanga_brutamontes": {
        "name": "Traficante de Sapopemba", "hp": 36, "ac": 13, "atk": 6,
        "dmg": {"n": 2, "d": 6, "flat": 3}, "reach": 1, "speed": 6,
        "xp": 175, "dex": 1, "glyph": "🪓", "kind": "capanga", "atk_name": "marreta",
    },
    "maurao": {
        "name": "Maurão da Sapo", "hp": 80, "ac": 14, "atk": 6,
        "dmg": {"n": 2, "d": 6, "flat": 4}, "reach": 1, "speed": 6,
        "xp": 400, "dex": 1, "glyph": "👑", "kind": "capanga",
        "atk_name": "marretada", "boss": True,
    },
}

# Falas do Maurao da Sapo (personagem ficticio, paródia de chefao funkeiro). Sao
# originais nossas, na vibe, citando a quebrada de Sapopemba. Nada de pessoa real.
MAURAO_BARKS = {
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
}


def bark(category):
    """Sorteia uma fala do Maurao na categoria pedida (ou None)."""
    lines = MAURAO_BARKS.get(category)
    return _rnd.choice(lines) if lines else None

# onde nascem em O Descampado: bichos perto da aguada (centro-sul) e capangas
# em peso perto do acampamento (nordeste). Cada um perambula em volta do ponto.
DESCAMPADO_SPAWNS = [
    # bichos (centro-sul, perto da agua)
    ("rato_gigante", 38, 62), ("rato_gigante", 52, 52), ("rato_gigante", 44, 66),
    ("rato_gigante", 56, 56), ("lobo", 46, 67), ("lobo", 40, 70), ("lobo", 48, 60),
    ("javali", 34, 59), ("javali", 50, 72),
    # capangas (nordeste, o acampamento de Sapopemba)
    ("capanga", 60, 28), ("capanga", 63, 34), ("capanga", 58, 24), ("capanga", 66, 30),
    ("capanga", 70, 26), ("capanga", 62, 38), ("capanga", 74, 33), ("capanga", 67, 37),
    ("capanga_brutamontes", 72, 31), ("capanga_brutamontes", 68, 22),
    ("capanga_brutamontes", 76, 29),
    # o patrão do QG
    ("maurao", 62, 28),
]


def get(type_id):
    return MONSTERS.get(type_id)


def catalog():
    """Pro cliente, se precisar: id -> {name, glyph, kind}."""
    return {k: {"name": v["name"], "glyph": v["glyph"], "kind": v["kind"]}
            for k, v in MONSTERS.items()}
