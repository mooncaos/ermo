"""
AS CLASSES — as 12 classes oficiais de D&D 5e.

Cada classe tem um MESTRE no Salao das Classes (mapa "salao") e o DEUS que esse
mestre serve, amarrando o sistema na cosmologia do Ermo. O Mago e o unico SEM
deus: serve ao cosmo e aos livros. (Segredo de mestre: o corvo-guia se chama
Jeans; Vargo, deus da morte, e o corvo nao patrocinam classe.)

Regra de bonus da classe (regra da casa):
    +4 no atributo PRINCIPAL (fixo da classe),
    +2 em 2 atributos a escolha do jogador,
    +1 nos 3 restantes (teto 20).

Atributos: FOR, DES, CON, INT, SAB, CAR.
"""

CLASSES = [
    {"id": "barbaro",     "name": "Bárbaro",     "principal": "FOR", "god": "Korgath",  "master": "Mestre Gorm"},
    {"id": "guerreiro",   "name": "Guerreiro",   "principal": "FOR", "god": "Bragor",   "master": "Mestra Adila"},
    {"id": "paladino",    "name": "Paladino",    "principal": "FOR", "god": "Valiria",  "master": "Mestre Sieg"},
    {"id": "ladino",      "name": "Ladino",      "principal": "DES", "god": "Nharé",    "master": "Mestre Ravi"},
    {"id": "monge",       "name": "Monge",       "principal": "DES", "god": "Martur",   "master": "Mestra Yun"},
    {"id": "patrulheiro", "name": "Patrulheiro", "principal": "DES", "god": "Facalan",  "master": "Mestre Tark"},
    {"id": "mago",        "name": "Mago",        "principal": "INT", "god": None,        "master": "Mestre Alaric"},
    {"id": "feiticeiro",  "name": "Feiticeiro",  "principal": "CAR", "god": "Drazun",   "master": "Mestra Idra"},
    {"id": "bruxo",       "name": "Bruxo",       "principal": "CAR", "god": "Nherith",  "master": "Mestre Mór"},
    {"id": "bardo",       "name": "Bardo",       "principal": "CAR", "god": "José",     "master": "Mestre Lael"},
    {"id": "clerigo",     "name": "Clérigo",     "principal": "SAB", "god": "Valiria",  "master": "Mestra Bena"},
    {"id": "druida",      "name": "Druida",      "principal": "SAB", "god": "Facalan",  "master": "Mestre Sálvio"},
]

CLASS_BY_ID = {c["id"]: c for c in CLASSES}

# Dado de vida (hit die) de cada classe, no padrao 5e. A vida no nivel 1 e o
# MAXIMO do dado + o modificador de Constituicao.
CLASS_HD = {
    "barbaro": 12, "guerreiro": 10, "paladino": 10,
    "ladino": 8,   "monge": 8,     "patrulheiro": 10,
    "mago": 6,     "feiticeiro": 6, "bruxo": 8,
    "bardo": 8,    "clerigo": 8,   "druida": 8,
}


def get_class(cid):
    return CLASS_BY_ID.get(cid)


def class_ids():
    return [c["id"] for c in CLASSES]


def apply_class(ficha, class_id, plus2):
    """Aplica a classe escolhida na ficha (regra da casa):
        +4 no atributo PRINCIPAL da classe (fixo),
        +2 em 2 atributos escolhidos pelo jogador (fora do principal),
        +1 nos 3 restantes (teto 20).
    Calcula a VIDA do nivel 1 (max do dado de vida + mod de Constituicao, min 1)
    e devolve (ficha_atualizada, None) ou (None, "mensagem de erro")."""
    from . import races  # local: evita import circular

    cls = CLASS_BY_ID.get(class_id)
    if not cls:
        return None, "classe invalida"

    base = (ficha or {}).get("attrs") or {}
    if not base:
        return None, "ficha sem atributos base (raca)"

    principal = cls["principal"]
    others = [a for a in races.BASE_ATTR_ORDER if a != principal]
    chosen = [a for a in (plus2 or []) if a in others]
    chosen = list(dict.fromkeys(chosen))   # tira repetidos preservando ordem
    if len(chosen) != 2:
        return None, "escolha exatamente 2 atributos (fora do principal) para +2"

    final = {}
    for a in races.BASE_ATTR_ORDER:
        v = int(base.get(a, 10))
        if a == principal:
            v += 4
        elif a in chosen:
            v += 2
        else:
            v += 1
        final[a] = min(20, v)

    hp = max(1, CLASS_HD[class_id] + races.attr_mod(final["CON"]))

    out = dict(ficha or {})
    out["class_id"] = class_id
    out["class_name"] = cls["name"]
    out["god"] = cls.get("god")          # None no caso do Mago
    out["principal"] = principal
    out["plus2"] = chosen
    out["attrs_final"] = final
    out["hd"] = CLASS_HD[class_id]
    out["level"] = 1
    out["hp_max"] = hp
    out["hp"] = hp
    out.setdefault("xp", 0)
    from . import leveling   # local: evita import circular
    leveling.recompute(out)  # aplica XP ja acumulado (exploracao sem classe)
    return out, None


# ===========================================================================
#  TRANSFORMACOES (menu abaixo da ficha). Classes que podem assumir outra forma.
#  Cada forma da um bonus de combate. Comeca pela Forma Selvagem do Druida; o
#  sistema aceita novas classes/formas so adicionando aqui.
# ===========================================================================
TRANSFORMS = {
    "druida": [
        {"id": "lobo",  "name": "Lobo",  "icon": "🐺",
         "desc": "Forma Selvagem do Lobo: caçador feroz e veloz. Dano MUITO maior (+3 dados e +8 fixo), +3 para acertar e +3 deslocamento, mas a pele fina derruba a defesa (cada golpe físico te machuca bem mais).",
         "bonus": {"dmg_dice": 3, "dmg_flat": 8, "atk": 3, "speed": 3, "armor": -14}},
        {"id": "urso",  "name": "Urso",  "icon": "🐻",
         "desc": "Forma Selvagem do Urso: muralha de músculo e couro. Mitigação altíssima (cada golpe físico tira bem menos vida) e +25 de vida máxima, mas os golpes pesados são lentos (-2 de dano).",
         "bonus": {"armor": 28, "dmg_flat": -2, "hp": 25}},
        {"id": "aguia", "name": "Águia", "icon": "🦅",
         "desc": "Forma Selvagem da Águia: ágil e certeira. +3 deslocamento, +3 para acertar e +1 de dano.",
         "bonus": {"speed": 3, "atk": 3, "dmg_flat": 1}},
        {"id": "mainecoon", "name": "Maine Coon", "icon": "🐈",
         "desc": "A forma abençoada por Pofnir: o grande gato Maine Coon, majestoso e equilibrado. +2 dados e +8 de dano, +5 para acertar, mitigação altíssima, +25 de vida, +4 deslocamento e regenera 6 de vida por turno (o maior sobrevivente do jogo).",
         "requires": "blessing_pofnir",
         "bonus": {"armor": 24, "atk": 5, "dmg_dice": 2, "dmg_flat": 8, "speed": 4, "hp": 25}, "regen": 6},
    ],
    "ladino": [
        {"id": "lebre", "name": "Lebre de Nharé", "icon": "🐇",
         "desc": "O dom de Nharé: vira uma lebre e some do mundo. Nenhum jogador ou monstro te enxerga, e os monstros não te atacam, até você atacar ou desfazer a forma. +3 de deslocamento.",
         "requires": "dom_nhare", "invisible": True,
         "bonus": {"speed": 3}},
    ],
    "bruxo": [
        {"id": "coruja", "name": "Coruja Demoníaca", "icon": "🦉",
         "desc": "O dom de Nherith: vira uma coruja demoníaca envolta na luz roxa do Faraó. +10 de resistência (cada golpe te tira 10 a menos), +10 de vida máxima e libera o Golpe da Morte Alada. Mas você NÃO pode lançar magias nesta forma.",
         "requires": "dom_nherith", "no_spells": True,
         "bonus": {"block": 10, "hp": 10}},
    ],
}


def forms_for(class_id):
    """Todas as formas que a classe pode assumir (sem filtrar requisitos)."""
    return TRANSFORMS.get(class_id, [])


def available_forms(ficha):
    """So as formas que ESTE jogador pode usar (filtra requisitos, ex: a benção do Pof)."""
    ficha = ficha or {}
    out = []
    for fm in forms_for(ficha.get("class_id")):
        req = fm.get("requires")
        if req and not ficha.get(req):
            continue
        out.append(fm)
    return out


def get_form(class_id, form_id):
    for fm in forms_for(class_id):
        if fm["id"] == form_id:
            return fm
    return None


def can_use_form(ficha, form_id):
    """True se o jogador tem direito a essa forma (classe certa + requisito atendido)."""
    ficha = ficha or {}
    fm = get_form(ficha.get("class_id"), form_id)
    if not fm:
        return False
    req = fm.get("requires")
    if req and not ficha.get(req):
        return False
    return True


# ===========================================================================
#  POSTURAS — só do Paladino (devoção a Valíria). É um menu parecido com o de
#  transformação, mas serve pra OUTRA coisa: posturas de combate que mudam o
#  papel do paladino (tanque / suporte / mártir). Trocadas durante a luta.
# ===========================================================================
POSTURES = {
    "paladino": [
        {"id": "soldado", "name": "Soldado de Valíria", "icon": "🛡️",
         "desc": "A fortaleza de Valíria: recebe E causa 75% menos dano, e os debuffs também minguam 75%. Você vira um muro."},
        {"id": "mao", "name": "A Mão de Valíria", "icon": "✋",
         "desc": "Você para de causar dano, mas a Imposição das Mãos passa a curar o GRUPO inteiro, e todos no grupo recebem 20% menos dano."},
        {"id": "martir", "name": "Mártir de Valíria", "icon": "✨",
         "desc": "Sua CA zera e você não defende mais golpes: absorve TODO o dano que iria pro grupo. Ganha a Luz da Criação, um raio radiante que soma todo o seu dano e cura o grupo a cada acerto."},
        {"id": "combatente", "name": "Combatente Valiriano", "icon": "⚔️",
         "desc": "Fúria sagrada ofensiva: todo ataque básico ACERTA e crava 2 Castigos Divinos, e cada golpe ainda cura uma Imposição das Mãos. Em troca, abre mão do escudo: perde o bloqueio E a armadura do escudo."},
    ],
}


def postures_for(class_id):
    return POSTURES.get(class_id, [])


def get_posture(class_id, posture_id):
    for p in POSTURES.get(class_id, []):
        if p["id"] == posture_id:
            return p
    return None
