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


def get_class(cid):
    return CLASS_BY_ID.get(cid)


def class_ids():
    return [c["id"] for c in CLASSES]
