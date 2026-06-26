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

# Tiles que bloqueiam passagem. (As estatuas do Salao tambem sao solidas:
# s=humanoide h=lebre j=jabuti f=felino g=dragao b=coruja k=livro; Pofnir e uma
# estatua 2x2 com os quadrantes P Q R U.)
SOLID_CHARS = {"~", "T", "#", "^", "H", "M", "m", "L", "W", "V",
               "s", "h", "j", "f", "g", "b", "k", "P", "Q", "R", "U"}

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
# Salão de pedra: paredes 'H', piso 'o', tapete central 'c', portal de volta 'O'.
# Atras de cada mestre fica uma ESTATUA do deus que ele serve (o mago: um LIVRO,
# pois nao serve deus); no centro, a estatua de OURO de Pofnir, ladeada por
# braseiros 'L'. Os 12 mestres sao NPCs (mapa "salao"), nao tiles.
# Tiles passaveis novos: 'o' piso, 'c' tapete, 'O' portal.
# Tiles solidos novos (estatuas): s humanoide, h lebre, j jabuti, f felino,
# g dragao, b coruja, k livro, P Pofnir(ouro).

# posicao (col, row) de cada mestre no Salao
SALAO_MASTER_POS = {
    "barbaro": (3, 3), "guerreiro": (7, 3), "paladino": (11, 3),
    "ladino": (18, 3), "monge": (22, 3), "patrulheiro": (26, 3),
    "mago": (3, 11), "feiticeiro": (7, 11), "bruxo": (11, 11),
    "bardo": (18, 11), "clerigo": (22, 11), "druida": (26, 11),
}

# qual estatua fica atras de cada mestre (a forma do deus dele; mago = livro)
SALAO_STATUE_OF = {
    "barbaro": "s", "guerreiro": "s", "paladino": "s", "clerigo": "s",  # humanoides (Korgath/Bragor/Valiria)
    "ladino": "h",       # lebre  (Nhare)
    "monge": "j",        # jabuti (Martur)
    "patrulheiro": "f", "druida": "f", "bardo": "f",  # felino (Facalan / Jose)
    "feiticeiro": "g",   # dragao (Drazun)
    "bruxo": "b",        # coruja (Nherith)
    "mago": "k",         # livro  (sem deus)
}


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

    # estatua do deus uma casa ATRAS de cada mestre (rumo a parede)
    for cid, (mx, my) in SALAO_MASTER_POS.items():
        sy = my - 1 if my < 7 else my + 1
        rows[sy][mx] = SALAO_STATUE_OF[cid]

    # Pofnir de OURO no centro: estatua 2x2 (4 tiles) = quadrantes P Q / R U,
    # ladeada por dois braseiros. O caminho passa pelas colunas 13 e 16.
    rows[6][14] = "P"; rows[6][15] = "Q"
    rows[7][14] = "R"; rows[7][15] = "U"
    rows[7][12] = "L"; rows[7][17] = "L"

    rows[13][14] = "O"; rows[13][15] = "O"      # portal de volta no fim do tapete
    return ["".join(r) for r in rows]


SALAO_ROWS = _build_salao()

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
