"""
O MUNDO — definição do mapa (fonte única da verdade).

Grade de tiles; cada caractere é um tipo. O servidor envia esta grade pros
clientes no 'init'. A solidez (colisão) é decidida AQUI no servidor.

Legenda:
    .  grama          ,  grama com flor     :  arbusto (passável)
    =  caminho        ~  água (SÓLIDO)      T  árvore (SÓLIDO)
    #  cerca (SÓLIDO) ^  telhado (SÓLIDO)   H  parede (SÓLIDO)   D  porta
    w  trigo (passável: dá pra andar no meio das espigas)
    p  paralelepípedo (passável)   E  entrada do cabaré (passável)
    M  parede do cabaré (SÓLIDO)    m  toldo do cabaré (SÓLIDO)   L  lampião (SÓLIDO)

Para crescer: edite MAP_ROWS (ou gere de novo com gen_map.py) e os SPAWN_POINTS.
O cliente tem uma câmera, então o mapa pode ser bem maior que a tela.
"""

TILE_SIZE = 32  # pixels por tile

MAP_ROWS = [
    "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
    "T.^^^....^^^........=..T.....T......T..T",
    "T.HHH....HHH.....,..=...,T.......,T..T.T",
    "T.HDH....HDH...^^^..=.T............T.T.T",
    "T....^^^^......HHH..=.....mmmmmm.....T.T",
    "T....HHHH.....,HDH..=.....MMMMMM....T..T",
    "T....HDHH..,,...,...=.....MMEMMM.....T.T",
    "T.^^^.............,.=....LpppppppL..T..T",
    "T.HHH.......=========.....ppppppp....T.T",
    "T.HDH..:.^^^......,.=..........pp....T.T",
    "T........HHH........=..........pp...T..T",
    "T........HDH..^^^^..=..........pp....T.T",
    "T....^^^......HHHH..=...,......pp....T.T",
    "T....HHH......HDHH..=.T........pp.,.T..T",
    "T....HDH.,..........=..T.......pp......T",
    "T======================================T",
    "T............VV.p...=...........:......T",
    "T.^^^^^.........p...=..:...............T",
    "T.WWWWW..^^^.^^^p...=...~~~~~...^^^^...T",
    "T.WWWWW..WWW.WWWp...=..~~~~~~~..HHHH...T",
    "T.WWDWW..WDW.WDWp...=..~~~~~~~..HDHH...T",
    "T...............p...=.~~~~~~~~~wwwwwww.T",
    "T..ppppLppppLpppp...=..~~~~~~~.wwwwwww.T",
    "T...................=..~~~~~~~.wwwwwww.T",
    "T.^^^^..^^^^........=...~~~~~..wwwwwww.T",
    "T.WWWW..WWWW........=.......,..wwwwwww.T",
    "T.WDWW..WWDW........=..........wwwwwww.T",
    "T...................=..................T",
    "T...................=..................T",
    "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
]

# Tiles que bloqueiam passagem.
SOLID_CHARS = {"~", "T", "#", "^", "H", "M", "m", "L", "W", "V"}

# Onde os jogadores nascem (precisa ser tile passável).
SPAWN_POINTS = [
    (19, 14),
    (21, 14),
    (19, 16),
    (21, 16),
    (20, 13),
    (20, 17),
    (18, 15),
    (22, 15),
]


# ===========================================================================
#  SEGUNDO MAPA — O Salão das Classes (separado do Ermo)
# ===========================================================================
# Salão de pedra: paredes 'H', piso 'o', tapete central 'c', braseiros 'L' e o
# portal de volta 'O'. Os 12 mestres sao NPCs (mapa "salao"), nao tiles.
# Tiles novos passaveis: 'o' (piso), 'c' (tapete), 'O' (portal). Solidos: 'H','L'.

def _build_salao():
    W, Hh = 30, 15
    rows = []
    for y in range(Hh):
        if y == 0 or y == Hh - 1:
            rows.append(list("H" * W)); continue
        line = ["o"] * W
        line[0] = "H"; line[W - 1] = "H"
        line[14] = "c"; line[15] = "c"          # corredor/tapete central
        rows.append(line)
    for x in [3, 7, 11, 18, 22, 26]:            # braseiros atras dos mestres
        rows[2][x] = "L"
        rows[12][x] = "L"
    rows[13][14] = "O"; rows[13][15] = "O"      # portal de volta no fim do tapete
    return ["".join(r) for r in rows]


SALAO_ROWS = _build_salao()

# posicao (col, row) de cada mestre no Salao
SALAO_MASTER_POS = {
    "barbaro": (3, 3), "guerreiro": (7, 3), "paladino": (11, 3),
    "ladino": (18, 3), "monge": (22, 3), "patrulheiro": (26, 3),
    "mago": (3, 11), "feiticeiro": (7, 11), "bruxo": (11, 11),
    "bardo": (18, 11), "clerigo": (22, 11), "druida": (26, 11),
}
# onde o jogador chega ao entrar no Salao (em frente ao tapete, embaixo)
SALAO_SPAWN = [(14, 12), (15, 12), (13, 12), (16, 12)]


# ---- registro dos mapas (fonte unica) ----
MAPS = {
    "ermo":  {"rows": MAP_ROWS,   "spawns": SPAWN_POINTS},
    "salao": {"rows": SALAO_ROWS, "spawns": SALAO_SPAWN},
}


def get_map(name):
    return MAPS.get(name) or MAPS["ermo"]


def map_rows(name):
    return get_map(name)["rows"]


def map_dims(name):
    r = map_rows(name)
    return len(r[0]), len(r)
