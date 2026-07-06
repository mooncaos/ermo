# -*- coding: utf-8 -*-
"""Os 8 Outfits Básicos do Ermo: aparência é identidade, addon é TROFÉU.
Cada outfit tem versão masculina e feminina (o corpo segue look.sex)."""

OUTFITS = [
    {"id": "aldeao",     "nome": "Aldeão do Ermo",         "lvl": 1,
     "cloak": "#8a6f4e", "accent": "#c9b48a",
     "desc": "Linho, terra e dignidade."},
    {"id": "cacador",    "nome": "Caçador do Descampado",  "lvl": 1,
     "cloak": "#4e5a3a", "accent": "#8a6a3a",
     "desc": "Couro batido e paciência de tocaia."},
    {"id": "mercenario", "nome": "Mercenário da Taverna",  "lvl": 1,
     "cloak": "#5a3a3a", "accent": "#a83838",
     "desc": "Cobra adiantado. Entrega sempre."},
    {"id": "aprendiz",   "nome": "Aprendiz Arcano",        "lvl": 1,
     "cloak": "#4a4a6a", "accent": "#8a7ae0",
     "desc": "Uma túnica cinzenta e um mundo de perguntas."},
    {"id": "pescador",   "nome": "Pescador de Maravaí",    "lvl": 10,
     "cloak": "#3a5a6a", "accent": "#5aa9d0",
     "desc": "O mar conhece esse colete."},
    {"id": "andarilho",  "nome": "Andarilho da Estrada",   "lvl": 10,
     "cloak": "#6a5a3a", "accent": "#c9a05a",
     "desc": "Poncho, poeira e nenhuma pressa."},
    {"id": "guardiao",   "nome": "Guardião do Ermo",       "lvl": 20,
     "cloak": "#3a4a5a", "accent": "#c9b44a",
     "desc": "O brasão da vila no peito."},
    {"id": "mergulhador","nome": "Mergulhador da Fenda",   "lvl": 20,
     "cloak": "#2a2438", "accent": "#a06aff",
     "desc": "Runas roxas pulsam no tecido escuro."},
    {"id": "nobre", "nome": "Nobre de Prospera", "lvl": 1,
     "req": "prosperina", "reqtxt": "Conquiste a cidadania: as 3 Provas do Zé do Remo",
     "cloak": "#7a2e3a", "accent": "#e0c060",
     "desc": "Gibão de veludo vinho, gola de arminho e o circlete da corte."},
    {"id": "clerigo", "nome": "Clérigo dos Doze", "lvl": 1,
     "req": "bencao12", "reqtxt": "Visite a Ala dos Sumos e receba a bênção do Arcebispo Celestino",
     "cloak": "#e8e0d0", "accent": "#c9a842",
     "desc": "Túnica alva com a estola das doze cores."},
    {"id": "mago_alvorada", "nome": "Mago da Alvorada", "lvl": 1,
     "req": "torre_ok", "reqtxt": "Decifre o enigma dos grifos da Torre da Alvorada",
     "cloak": "#4a6ab0", "accent": "#e8c860",
     "desc": "O robe azul do Conclave com o Sol da Alvorada no peito."},
]

# addons: (indice, nome, chave, alvo, descricao da missao)
ADDONS = {
    "nobre": [
        ("Coroa de Gala", "invas", 2, "Defenda 2 invasões: a coroa se inclina a quem protege."),
        ("Cetro Dourado", "kills", 150, "150 abates: o poder também se conquista."),
    ],
    "clerigo": [
        ("Mitra Sagrada", "arcano", 15, "Leia 15 escritos: a fé estudada pesa mais."),
        ("Turíbulo dos Doze", "fenda", 3, "Alcance a câmara 3 da Fenda."),
    ],
    "mago_alvorada": [
        ("Chapéu do Conclave", "arcano", 25, "25 escritos lidos: o chapéu reconhece leitores."),
        ("Grimório Orbital", "kills", 200, "200 abates com a Alvorada nos olhos."),
    ],
    "aldeao": [
        ("Chapéu de Palha", "ervas", 70,
         "Entregue 50 Ervas Solares e 20 Lunares à Cigana (entrega automática ao falar)."),
        ("Mochila de Entregas", "ct", 25, "Conclua 25 contratos do Quadro de Procurados."),
    ],
    "cacador": [
        ("Capuz com Pena de Corvo", "feras", 150, "Abata 150 feras selvagens."),
        ("Aljava às Costas", "cacas_entrega", 350,
         "Entregue 300 flechas e 50 couros curtidos ao Mestre Bragan."),
    ],
    "mercenario": [
        ("Ombreira de Ferro", "kills", 300, "Derrote 300 monstros."),
        ("Capa do Campeão", "arena", 10, "Vença 10 duelos na Arena."),
    ],
    "aprendiz": [
        ("Chapéu Pontudo", "ml", 12, "Alcance Nível Mágico 12."),
        ("Grimório no Quadril", "arcano", 40,
         "Leia 30 estantes da Grande Biblioteca e entregue 10 Runas em Branco ao Heron."),
    ],
    "pescador": [
        ("Chapéu de Iscas", "pesca", 100, "Fisgue 100 peixes."),
        ("O Troféu no Cinto", "lend", 2, "Fisgue 2 peixes LENDÁRIOS diferentes."),
    ],
    "andarilho": [
        ("Chapéu do Caravaneiro", "embosc", 3, "Defenda a caravana do Zeca de 3 emboscadas."),
        ("Lanterna no Quadril", "mapas", 20, "Visite 20 lugares do mundo (continente e ilha)."),
    ],
    "guardiao": [
        ("Elmo com Plumas", "invas", 3, "Defenda cidades de 3 INVASÕES."),
        ("Estandarte às Costas", "bosses", 8, "Derrote 8 chefes DIFERENTES."),
    ],
    "mergulhador": [
        ("Máscara da Fenda", "fenda", 8, "Limpe o andar 8 da Fenda do Caos."),
        ("Fragmentos Orbitais", "fenda2", 15, "Limpe o andar 15 da Fenda do Caos."),
    ],
}

FERAS = ("javali", "lobo", "lobo_negro", "hiena_ermo", "urso_pardo", "onca_parda",
         "javali_grande", "lobo_alfa", "coelho", "lebre", "veado", "cervo",
         "capivara", "antilope", "raposa")

BOSS_IDS = ("velho_bob", "maurao", "dama_noite", "lorde_varth", "farao_avhur",
            "colosso_avasham", "urso_rei", "vulkar", "krezath", "maraja")


def by_id(oid):
    return next((o for o in OUTFITS if o["id"] == oid), None)


def progress(ficha, arena_w=0):
    """Computa o progresso das 16 missões de addon a partir da ficha."""
    op = ficha.get("op") or {}
    cod = ficha.get("codex") or {}
    sk = (ficha.get("skills") or {}).get("magic") or {}
    lend = op.get("lend") or []
    p = {
        "ervas": int(op.get("ervas_s", 0)) + int(op.get("ervas_l", 0)),
        "ct": int(op.get("ct", 0)),
        "feras": int(op.get("feras", 0)),
        "cacas_entrega": int(op.get("flechas", 0)) + int(op.get("couros", 0)),
        "kills": int(op.get("kills", 0)),
        "arena": int(arena_w),
        "ml": int(sk.get("lvl", 0)),
        "arcano": int(op.get("estantes", 0)) + int(op.get("runas", 0)),
        "pesca": int(op.get("pesca", 0)),
        "lend": len(set(lend)),
        "embosc": int(op.get("embosc", 0)),
        "mapas": len((cod.get("l") or {})),
        "invas": int(op.get("invas", 0)),
        "bosses": len([b for b in BOSS_IDS if b in (cod.get("m") or {})]),
        "fenda": int(ficha.get("fenda_best", 0)),
        "fenda2": int(ficha.get("fenda_best", 0)),
    }
    return p
