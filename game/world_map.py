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
               "s", "h", "j", "f", "g", "b", "k", "P", "Q", "R", "U",
               "A", "l", "q", "N", "I", "v", "y"}

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


# ===========================================================================
#  OS MUNDOS SECRETOS — reinos dos deuses (mapas ENORMES, 100x100)
# ===========================================================================
# Tiles novos (Rasharan, o hub em terra divina):
#   a marmore branco da igreja (passavel)   A coluna/parede de marmore (SOLIDO)
#   l altar de Valiria (SOLIDO)
#   e chao de floresta noturna (passavel)   n flor-da-lua (passavel, brilha)
#   d terra de cemiterio (passavel)         q lapide (SOLIDO)
#   N ninho do Jeans (SOLIDO)               @ portal pros Ermos (passavel)
# Tiles novos (Valoran, a alcova de luz do Pofnir):
#   i marmore divino luminoso (passavel)    I pilar dourado (SOLIDO)
#   u dais de luz (passavel)                v nuvem luminosa (SOLIDO, borda)
#   x fleco de luz no chao (passavel)       y fonte de luz (SOLIDO)
# Comum: * portal-estrela -> volta pra Rasharan (passavel)

def _grid(W, H, fill):
    return [[fill] * W for _ in range(H)]

def _ring(rows, ch):
    H = len(rows); W = len(rows[0])
    for x in range(W):
        rows[0][x] = ch; rows[H - 1][x] = ch
    for y in range(H):
        rows[y][0] = ch; rows[y][W - 1] = ch

def _rect(rows, x0, y0, x1, y1, ch):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            rows[y][x] = ch

def _border(rows, x0, y0, x1, y1, ch):
    for x in range(x0, x1 + 1):
        rows[y0][x] = ch; rows[y1][x] = ch
    for y in range(y0, y1 + 1):
        rows[y][x0] = ch; rows[y][x1] = ch


def _build_rasharan():
    W = Hh = 100
    rows = _grid(W, Hh, ".")                  # base de grama
    _rect(rows, 1, 1, W - 2, 33, "a")         # NORTE: praca de marmore (igreja)
    _rect(rows, 1, 34, W - 2, 65, "e")        # MEIO: floresta noturna
    _rect(rows, 1, 66, W - 2, Hh - 2, "d")    # SUL: cemiterio
    _ring(rows, "T")                          # borda de arvores

    # --- IGREJA BRANCA (norte) ---
    _border(rows, 36, 5, 63, 31, "A")         # paredes do templo
    _rect(rows, 37, 6, 62, 30, "a")           # interior de marmore
    for x in range(40, 60, 3):                # duas colunatas internas
        rows[12][x] = "A"; rows[24][x] = "A"
    rows[8][49] = "l"; rows[8][50] = "l"       # altar ao norte
    for ry in range(31, 34):                   # porta sul (saida do templo)
        rows[ry][49] = "a"; rows[ry][50] = "a"

    # --- FLORESTA NOTURNA (meio): arvores densas + flores-da-lua, com clareiras ---
    for y in range(35, 65):
        for x in range(2, W - 2):
            d = (x * 7 + y * 13) % 11
            if d == 0:
                rows[y][x] = "T"
            elif d == 5 and (x + y) % 3 == 0:
                rows[y][x] = "n"
    _rect(rows, 22, 44, 34, 56, "e")           # clareira da Nherith (28,50)
    for x in range(2, W - 2):                   # corredor passavel descendo o centro
        rows[34][x] = "e" if x % 9 else "e"
    _rect(rows, 48, 31, 51, 67, "e")           # trilha central igreja->cemiterio

    # --- CEMITERIO + NINHO DO JEANS (sul) ---
    for y in range(69, Hh - 3, 3):             # fileiras de lapides
        for x in range(6, W - 6, 5):
            if (x + y) % 7 != 0:
                rows[y][x] = "q"
    _rect(rows, 45, 77, 55, 92, "d")           # area limpa do ninho/portal
    rows[80][50] = "N"                          # ninho do Jeans
    rows[89][50] = "@"                          # portal pros Ermos
    return ["".join(r) for r in rows]


def _build_valoran():
    W = Hh = 100
    rows = _grid(W, Hh, "i")                   # marmore divino por toda parte
    _ring(rows, "v")                           # borda de nuvens luminosas
    _rect(rows, 1, 1, 14, 14, "v"); _rect(rows, W - 15, 1, W - 2, 14, "v")
    _rect(rows, 1, Hh - 15, 14, Hh - 2, "v"); _rect(rows, W - 15, Hh - 15, W - 2, Hh - 2, "v")
    for y in range(2, Hh - 2):                  # flecos de luz (deco passavel)
        for x in range(2, W - 2):
            if (x * 5 + y * 3) % 17 == 0 and rows[y][x] == "i":
                rows[y][x] = "x"
    for y in range(18, 86, 4):                  # colunata processional dourada
        rows[y][42] = "I"; rows[y][57] = "I"
    _rect(rows, 43, 39, 56, 53, "u")            # dais de luz (lar do Pofnir)
    rows[39][43] = "y"; rows[39][56] = "y"       # fontes de luz nas quinas do dais
    rows[53][43] = "y"; rows[53][56] = "y"
    rows[94][49] = "*"; rows[94][50] = "*"       # portal-estrela (saida -> Rasharan)
    _rect(rows, 47, 43, 53, 49, "u")             # miolo limpo onde Pofnir habita
    rows[88][49] = "i"; rows[88][50] = "i"        # chegada do jogador, limpa
    return ["".join(r) for r in rows]


RASHARAN_ROWS = _build_rasharan()
VALORAN_ROWS = _build_valoran()

RASHARAN_SPAWN = [(50, 86), (49, 86), (51, 86), (50, 87)]   # cemiterio, perto do Jeans
VALORAN_SPAWN  = [(50, 88), (49, 88), (51, 88), (50, 89)]   # sul, de frente pra nave


# ---- registro dos mapas (fonte unica) ----
MAPS = {
    "ermo":     {"rows": MAP_ROWS,      "spawns": SPAWN_POINTS},
    "salao":    {"rows": SALAO_ROWS,    "spawns": SALAO_SPAWN},
    "rasharan": {"rows": RASHARAN_ROWS, "spawns": RASHARAN_SPAWN},
    "valoran":  {"rows": VALORAN_ROWS,  "spawns": VALORAN_SPAWN},
}


def get_map(name):
    return MAPS.get(name) or MAPS["ermo"]


def map_rows(name):
    return get_map(name)["rows"]


def map_dims(name):
    r = map_rows(name)
    return len(r[0]), len(r)
