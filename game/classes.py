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
         "desc": "Forma Selvagem do Lobo: veloz e feroz. +2 de dano e +2 de deslocamento.",
         "bonus": {"dmg_flat": 2, "speed": 2}},
        {"id": "urso",  "name": "Urso",  "icon": "🐻",
         "desc": "Forma Selvagem do Urso: muralha de músculo. +3 de armadura e +1 de dano.",
         "bonus": {"ac": 3, "dmg_flat": 1}},
        {"id": "aguia", "name": "Águia", "icon": "🦅",
         "desc": "Forma Selvagem da Águia: ágil e certeira. +2 de deslocamento e +2 para acertar.",
         "bonus": {"speed": 2, "atk": 2}},
    ],
}


def forms_for(class_id):
    """Lista de formas que a classe pode assumir (vazia se nao se transforma)."""
    return TRANSFORMS.get(class_id, [])


def get_form(class_id, form_id):
    for f in forms_for(class_id):
        if f["id"] == form_id:
            return f
    return None
