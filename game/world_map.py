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

import math
import random as _rnd

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
    "TTTTTTTTTTTTTTTTTTTT+TTTTTTTTTTTTTTTTTTT",
]

# Tiles que bloqueiam passagem. (As estatuas do Salao tambem sao solidas:
# s=humanoide h=lebre j=jabuti f=felino g=dragao b=coruja k=livro; Pofnir e uma
# estatua 2x2 com os quadrantes P Q R U.)
SOLID_CHARS = {"~", "T", "#", "^", "H", "M", "m", "L", "W", "V",
               "{", "}",
               "/", ";", "_",
               "s", "h", "j", "f", "g", "b", "k", "P", "Q", "R", "U",
               "A", "l", "q", "N", "I", "v", "y",
               "z", "G", "Y", "B", "F", "K",
               "4", "5", "6", "&", "X", "8", "7", "J",
               "!", "$", "-", "%"}

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


def _build_fundamento():
    """O castelo do Moon (o criador), flutuando no cosmo negro. Denso: muralha,
    salao do trono ao norte com o TRONO monumental vazio, corredor processional,
    camaras laterais (Vargo a oeste, Martur a leste, Valdris junto ao trono),
    braseiros e estandartes. Nao da pra andar no vazio. Portal-estrela ao sul.
    Tiles: z cosmo(SOLIDO) r piso G parede C tapete Y trono(SOLIDO) Z dais
           B braseiro(SOLIDO) F estandarte(SOLIDO) K janela cosmica(SOLIDO)."""
    W = Hh = 100
    rows = _grid(W, Hh, "z")                      # cosmo (vazio) por toda parte
    x0, y0, x1, y1 = 10, 6, 89, 92                # contorno do castelo flutuante
    _rect(rows, x0, y0, x1, y1, "r")              # piso do castelo
    _border(rows, x0, y0, x1, y1, "G")            # muralha externa (2 tiles)
    _border(rows, x0 + 1, y0 + 1, x1 - 1, y1 - 1, "G")
    for x in range(x0 + 6, x1 - 5, 8):            # janelas cosmicas (norte/sul)
        rows[y0][x] = "K"; rows[y1][x] = "K"
    for y in range(y0 + 9, y1 - 6, 9):            # janelas cosmicas (leste/oeste)
        rows[y][x0] = "K"; rows[y][x1] = "K"

    # --- SALAO DO TRONO (norte) ---
    thy = 31
    _border(rows, x0 + 2, y0 + 2, x1 - 2, thy, "G")   # camara do trono
    _rect(rows, x0 + 3, y0 + 3, x1 - 3, thy - 1, "r")
    for x in range(47, 53):
        rows[thy][x] = "C"                        # porta sul do salao (pro corredor)
    _rect(rows, 46, 10, 53, 15, "Y")              # o TRONO monumental (8x6)
    _rect(rows, 44, 16, 55, 19, "Z")              # dais (degraus) na frente
    _rect(rows, 45, 20, 54, 21, "Z")
    _rect(rows, 49, 16, 50, 90, "C")              # tapete real, do trono a entrada
    for y in range(13, 90, 4):                    # colunas ladeando o tapete
        if rows[y][45] in ("r", "C"): rows[y][45] = "G"
        if rows[y][54] in ("r", "C"): rows[y][54] = "G"
    rows[16][44] = "B"; rows[16][55] = "B"        # braseiros nas quinas do trono
    for y in range(36, 88, 12):                   # braseiros ao longo do tapete
        rows[y][47] = "B"; rows[y][52] = "B"
    for x in range(x0 + 5, x1 - 4, 7):            # estandartes do Moon (parede norte)
        rows[y0 + 2][x] = "F"

    # --- CAMARAS LATERAIS (lares dos deuses) ---
    _border(rows, x0 + 2, 40, 38, 66, "G")        # camara oeste (Vargo)
    _rect(rows, x0 + 3, 41, 37, 65, "r")
    rows[53][38] = "r"; rows[52][38] = "r"        # porta pro corredor
    _border(rows, 61, 40, x1 - 2, 66, "G")        # camara leste (Martur)
    _rect(rows, 62, 41, x1 - 3, 65, "r")
    rows[53][61] = "r"; rows[52][61] = "r"        # porta pro corredor
    rows[44][22] = "B"; rows[62][22] = "B"        # braseiros nas camaras
    rows[44][77] = "B"; rows[62][77] = "B"

    # --- ENTRADA (sul) + portal-estrela ---
    _rect(rows, 44, 84, 55, 90, "r")
    for y in range(84, 91):
        rows[y][49] = "C"; rows[y][50] = "C"
    rows[88][45] = "*"; rows[88][46] = "*"        # portal-estrela (sai pro Rasharan)
    return ["".join(r) for r in rows]


FUNDAMENTO_ROWS = _build_fundamento()


def _build_falanor():
    """Falanor: tres dominios divinos num vale crepuscular.
    NORTE: a forja do Bragor (o Forjador) - caverna de pedra, lava, fornalhas,
    bigornas. CENTRO: o cabare do Jose (Mestre Cuscuz) - salao boemio, mesas de
    jogo, palco, cortinas, fumaca roxa. SUL: o jardim do Nhare (a Lebre de Mil
    Saidas) - grama, arbustos, flores e tocas (as mil saidas).
    Tiles novos (SOLIDO marcado): 3 piso-forja  4 rocha(S)  5 lava(S)
    6 fornalha(S)  & bigorna(S) | X parede-cabare(S)  0 piso-cabare
    8 mesa(S)  9 palco  7 cortina(S) | J arbusto(S)  % flores  t toca.
    Borda de rocha. Portal-estrela ao sul. Eixo central andavel ligando os tres."""
    W = Hh = 100
    rows = _grid(W, Hh, ".")                     # grama por baixo (o jardim domina)
    _border(rows, 0, 0, W - 1, Hh - 1, "4")      # borda de montanha
    _border(rows, 1, 1, W - 2, Hh - 2, "4")

    # ============ NORTE: FORJA DO BRAGOR (rows 2..33) ============
    _rect(rows, 2, 2, W - 3, 33, "3")            # piso de pedra
    _border(rows, 2, 2, W - 3, 33, "4")          # paredes de rocha da caverna
    for x in range(8, 92):                       # rio de lava de cima
        yy = 9 + int(2.5 * math.sin(x * 0.25))
        rows[yy][x] = "5"; rows[yy + 1][x] = "5"
    for x in range(14, 86):                      # rio de lava de baixo
        yy = 27 + int(2 * math.sin(x * 0.3 + 1))
        rows[yy][x] = "5"
    for x in range(8, 90, 11):                   # fornalhas encostadas nas paredes
        rows[3][x] = "6"; rows[4][x] = "6"; rows[32][x] = "6"
    for (bx, by) in [(20, 14), (30, 18), (44, 15), (58, 18), (70, 14),
                     (80, 17), (26, 31), (50, 31), (74, 31)]:
        rows[by][bx] = "&"                       # bigornas
    for (px, py) in [(16, 21), (36, 22), (64, 22), (84, 21), (50, 13)]:
        rows[py][px] = "4"                       # pilastras de rocha
    for x in range(47, 53):                      # passagem da forja pro cabare
        rows[33][x] = "3"

    # ============ CENTRO: CABARE DO JOSE (rows 36..64) ============
    _rect(rows, 6, 36, W - 7, 64, ".")           # entorno (limpa a faixa)
    _border(rows, 10, 37, W - 11, 63, "X")       # paredes do cabare
    _rect(rows, 11, 38, W - 12, 62, "0")         # piso vinho do salao
    for x in range(38, 62):                      # cortina (parede de fundo do palco)
        rows[38][x] = "7"
    _rect(rows, 40, 39, 59, 42, "9")             # palco
    for (mx, my) in [(18, 47), (26, 53), (34, 47), (44, 55), (54, 47), (64, 55),
                     (74, 47), (82, 53), (22, 59), (40, 49), (60, 59), (78, 59),
                     (16, 53), (86, 47)]:
        rows[my][mx] = "8"                       # mesas de jogo
    for (cx, cy) in [(20, 43), (80, 43), (20, 60), (80, 60), (50, 58)]:
        rows[cy][cx] = "X"                       # colunas internas
    for x in range(47, 53):                      # portas norte (forja) e sul (jardim)
        rows[37][x] = "0"; rows[36][x] = "0"
        rows[63][x] = "0"; rows[64][x] = "0"

    # ============ SUL: JARDIM DO NHARE (rows 66..97) ============
    for x in range(2, W - 2):                    # faixa de transicao
        rows[66][x] = "."
    for y in range(67, 97):                      # caminho sinuoso central
        x1 = 50 + int(10 * math.sin(y * 0.35))
        rows[y][x1] = ","; rows[y][x1 + 1] = ","
    for x in range(10, 90):                      # caminho sinuoso horizontal
        y1 = 80 + int(6 * math.sin(x * 0.2))
        if rows[y1][x] == ".":
            rows[y1][x] = ","
    rng = _rnd.Random(7)
    for _ in range(72):                          # moitas de arbusto florido
        ax, ay = rng.randint(6, 92), rng.randint(68, 95)
        if rows[ay][ax] == ".":
            rows[ay][ax] = "J"
    for _ in range(52):                          # canteiros de flores
        fx, fy = rng.randint(6, 92), rng.randint(68, 95)
        if rows[fy][fx] == ".":
            rows[fy][fx] = "%"
    for _ in range(26):                          # as tocas do Nhare (mil saidas)
        tx, ty = rng.randint(8, 90), rng.randint(70, 94)
        if rows[ty][tx] in (".", ","):
            rows[ty][tx] = "t"
    for y in range(66, 97):                      # eixo central garantido (spawn->cabare)
        rows[y][49] = ","; rows[y][50] = ","
    rows[93][45] = "*"; rows[93][46] = "*"       # portal-estrela (sai pro Rasharan)
    return ["".join(r) for r in rows]


FALANOR_ROWS = _build_falanor()


# ===========================================================================
#  FADRAKOR — tres mapas ligados por passagem nas bordas (mar -> selva -> fogo)
# ===========================================================================
def _build_fadrakor_litoral():
    """Litoral do Korgath (o Punho): a costa onde se chega ao Fadrakor. Praia de
    areia, mar ao sul, rochedos, e um circulo de totens de guerra fincados.
    Portal-estrela aqui (UNICA saida pra Rasharan). Passagem ao norte -> selva.
    Tiles: S areia  ~ mar(S)  4 rocha(S)  ! totem(S)  + passagem  . grama
    T arvore(S)  , trilha  * portal."""
    W = Hh = 100
    rows = _grid(W, Hh, "S")                          # areia por baixo
    for x in range(0, W):                             # mar ao sul, costa ondulada
        coast = 84 + int(3 * math.sin(x * 0.18))
        for y in range(coast, Hh):
            rows[y][x] = "~"
    rng = _rnd.Random(11)
    for _ in range(64):                               # rochedos na praia
        rx, ry = rng.randint(5, 93), rng.randint(28, 80)
        if rows[ry][rx] == "S": rows[ry][rx] = "4"
    for (cx, cy) in [(14,40),(82,46),(24,66),(74,70),(50,78),(64,34),(34,52),(90,64)]:
        for dx in range(-1,2):                        # formacoes de pedra
            for dy in range(-1,2):
                if 0<=cy+dy<Hh and 0<=cx+dx<W and rows[cy+dy][cx+dx]=="S": rows[cy+dy][cx+dx]="4"
    for _ in range(30):                               # mata costeira no fundo
        tx, ty = rng.randint(5, 93), rng.randint(3, 22)
        if rows[ty][tx] == "S": rows[ty][tx] = "T"
    for _ in range(50):                               # tufos de grama no fundo
        gx, gy = rng.randint(4, 94), rng.randint(3, 26)
        if rows[gy][gx] == "S": rows[gy][gx] = "."
    for ang in range(0, 360, 28):                     # TOTENS de guerra (circulo)
        tx = 50 + int(12 * math.cos(math.radians(ang)))
        ty = 44 + int(9 * math.sin(math.radians(ang)))
        if 0<=ty<Hh and 0<=tx<W: rows[ty][tx] = "!"
    _rect(rows, 0, 0, 2, Hh-1, "4"); _rect(rows, W-3, 0, W-1, Hh-1, "4")   # cliffs laterais
    for y in range(2, 82):                            # trilha praia -> passagem
        rows[y][49] = ","; rows[y][50] = ","
    rows[72][38] = "*"; rows[72][39] = "*"            # portal-estrela (saida unica)
    for x in range(44, 56): rows[0][x] = "+"; rows[1][x] = "+"             # passagem norte
    return ["".join(r) for r in rows]


def _build_fadrakor_selva():
    """Selva da Facalan (a Onca Sem Dono): mata fechada e instintiva. Arvores
    densas, cipos, samambaias, flores e um riacho. Trilha do sul ao norte.
    Passagem sul -> litoral, passagem norte -> vulcao.
    Tiles: . grama  T arvore(S)  J arbusto(S)  ? samambaia  % flores
    ~ riacho(S)  , trilha  + passagem."""
    W = Hh = 100
    rows = _grid(W, Hh, ".")
    _rect(rows, 0, 0, 3, Hh-1, "T"); _rect(rows, W-4, 0, W-1, Hh-1, "T")   # paredao lateral
    rng = _rnd.Random(23)
    for _ in range(270):                              # dossel denso
        tx, ty = rng.randint(4, 94), rng.randint(4, 94)
        if rows[ty][tx] == ".": rows[ty][tx] = "T"
    for _ in range(150):                              # arbustos
        bx, by = rng.randint(4, 94), rng.randint(4, 94)
        if rows[by][bx] == ".": rows[by][bx] = "J"
    for _ in range(170):                              # samambaias / cipos
        fx, fy = rng.randint(4, 94), rng.randint(4, 94)
        if rows[fy][fx] == ".": rows[fy][fx] = "?"
    for _ in range(75):                               # flores do mato
        px, py = rng.randint(4, 94), rng.randint(4, 94)
        if rows[py][px] == ".": rows[py][px] = "%"
    for x in range(4, 96):                            # riacho serpenteando
        ry = 62 + int(5 * math.sin(x * 0.16))
        rows[ry][x] = "~"
        if rows[ry+1][x] == ".": rows[ry+1][x] = "~"
    for yy in range(42, 59):                          # clareira central da Facalan
        for xx in range(40, 61):
            if (xx-50)**2 + ((yy-50)*1.3)**2 < 95 and rows[yy][xx] in ("T","J","?"):
                rows[yy][xx] = "."
    for y in range(0, Hh):                            # corredor central garantido (ford)
        for cx in (49, 50):
            if rows[y][cx] in ("T","J","~"): rows[y][cx] = ","
    for x in range(44, 56):
        rows[Hh-1][x] = "+"; rows[Hh-2][x] = "+"      # passagem sul
        rows[0][x] = "+"; rows[1][x] = "+"            # passagem norte
    return ["".join(r) for r in rows]


def _build_fadrakor_vulcao():
    """Vulcao do Drazun (o Dragao Primevo): a cratera no topo do Fadrakor. Lagos
    e rios de lava, obsidiana, cinzas e o tesouro de ouro onde o dragao dorme.
    Passagem sul -> selva (e o topo: nao ha saida ao norte).
    Tiles: 3 chao vulcanico  4 rocha(S)  5 lava(S)  $ obsidiana(S)
    - tesouro(S)  + passagem."""
    W = Hh = 100
    rows = _grid(W, Hh, "3")
    _border(rows, 0, 0, W-1, Hh-1, "4"); _border(rows, 1, 1, W-2, Hh-2, "4")
    rng = _rnd.Random(31)
    for (cx,cy,r) in [(22,32,9),(76,36,8),(30,72,7),(70,74,9),(50,60,10),(18,54,6),(84,62,6)]:
        for yy in range(cy-r, cy+r):                  # lagos de lava
            for xx in range(cx-r, cx+r):
                if 2<=xx<W-2 and 2<=yy<Hh-2 and (xx-cx)**2+(yy-cy)**2 < r*r: rows[yy][xx]="5"
    for x in range(4, 96):                            # rio de lava
        ly = 46 + int(4 * math.sin(x * 0.22))
        rows[ly][x] = "5"
    for _ in range(72):                               # espinhos de obsidiana
        ox, oy = rng.randint(4, 94), rng.randint(6, 94)
        if rows[oy][ox] == "3": rows[oy][ox] = "$"
    for _ in range(80):                               # rochas
        rx, ry = rng.randint(4, 94), rng.randint(6, 94)
        if rows[ry][rx] == "3": rows[ry][rx] = "4"
    for yy in range(16, 40):                          # CRATERA + tesouro do Drazun
        for xx in range(34, 67):
            d = (xx-50)**2 + ((yy-27)*1.2)**2
            if d < 200: rows[yy][xx] = "-"            # ouro
            elif d < 245: rows[yy][xx] = "4"          # borda da cratera
    for yy in range(24, 31):                          # piso central (onde o dragao fica)
        for xx in range(46, 55): rows[yy][xx] = "3"
    for y in range(29, 97):                           # corredor central seguro
        for cx in (48, 49, 50, 51):
            if rows[y][cx] in ("5", "4", "$", "-"): rows[y][cx] = "3"
    for x in range(44, 56): rows[Hh-1][x] = "+"; rows[Hh-2][x] = "+"       # passagem sul
    return ["".join(r) for r in rows]


FADRAKOR_LITORAL_ROWS = _build_fadrakor_litoral()
FADRAKOR_SELVA_ROWS   = _build_fadrakor_selva()
FADRAKOR_VULCAO_ROWS  = _build_fadrakor_vulcao()


def _build_descampado():
    """O DESCAMPADO: sertao selvagem ao sul da vila, dominio do Facalan (a Onca
    Sem Dono). Terra seca e aberta, moitas, arvores esparsas, formacoes de pedra,
    uma aguada onde os bichos se juntam e um acampamento dos capangas de Sapopemba.
    Aqui vivem os primeiros inimigos do jogo. Passagem ao NORTE -> Ermo (na estrada).
    Tiles (reusa o que o cliente ja desenha): . mato  S terra seca  T arvore(S)
    4 pedra(S)  ^ moita(S)  ~ aguada(S)  , trilha  W madeira(S)  D porta  + passagem."""
    W = Hh = 100
    rows = _grid(W, Hh, ".")                              # mato por baixo
    rng = _rnd.Random(73)
    # manchas de terra seca (o "descampado")
    for _ in range(70):
        cx, cy = rng.randint(5, 94), rng.randint(5, 94)
        rx, ry = rng.randint(2, 5), rng.randint(2, 4)
        for dx in range(-rx, rx + 1):
            for dy in range(-ry, ry + 1):
                x, y = cx + dx, cy + dy
                if 3 < x < W - 3 and 3 < y < Hh - 3 and rows[y][x] == ".":
                    rows[y][x] = "S"
    # formacoes de pedra (penhascos soltos)
    for (cx, cy, r) in [(20, 20, 3), (80, 18, 4), (16, 74, 3), (86, 80, 4),
                        (64, 58, 3), (74, 46, 3), (28, 50, 2), (56, 86, 3), (90, 40, 2)]:
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                x, y = cx + dx, cy + dy
                if dx * dx + dy * dy <= r * r and 3 < x < W - 3 and 3 < y < Hh - 3:
                    rows[y][x] = "4"
    # bosque esparso no sudoeste
    for _ in range(130):
        tx, ty = rng.randint(8, 36), rng.randint(60, 92)
        if rows[ty][tx] in ".S": rows[ty][tx] = "T"
    # arvores soltas pelo resto
    for _ in range(90):
        tx, ty = rng.randint(6, 93), rng.randint(6, 93)
        if rows[ty][tx] in ".S": rows[ty][tx] = "T"
    # moitas
    for _ in range(120):
        bx, by = rng.randint(6, 93), rng.randint(6, 93)
        if rows[by][bx] in ".S": rows[by][bx] = "^"
    # aguada (onde os bichos se juntam), centro-sul, com margem de areia
    acx, acy = 42, 64
    for dx in range(-8, 9):
        for dy in range(-6, 7):
            x, y = acx + dx, acy + dy
            if 3 < x < W - 3 and 3 < y < Hh - 3 and (dx / 8.0) ** 2 + (dy / 6.0) ** 2 <= 1.0 and rows[y][x] in ".^T":
                rows[y][x] = "S"
    for dx in range(-6, 7):
        for dy in range(-4, 5):
            x, y = acx + dx, acy + dy
            if (dx / 6.0) ** 2 + (dy / 4.0) ** 2 <= 1.0 and 3 < x < W - 3 and 3 < y < Hh - 3:
                rows[y][x] = "~"
    # === ACAMPAMENTO DE SAPOPEMBA (nordeste): o QG dos traficantes ===
    # favela improvisada: barracos de zinco enferrujado, fogueira central, barris,
    # lampioes, cerca de tapume e o letreiro I LOVE SAPOPEMBA ladeando o portao.
    bx0, by0, bx1, by1 = 57, 20, 80, 40
    _rect(rows, bx0, by0, bx1, by1, "S")                  # chao batido (terra)
    for x in range(bx0, bx1 + 1):
        rows[by0][x] = "W"; rows[by1][x] = "W"            # cerca de tapume (topo/base)
    for y in range(by0, by1 + 1):
        rows[y][bx0] = "W"; rows[y][bx1] = "W"            # cerca (laterais)
    rows[30][bx0] = "D"; rows[31][bx0] = "D"              # portao oeste (alinha c/ a trilha)
    rows[by0][67] = "D"                                   # passagem dos fundos (norte)

    def _barraco(x0, y0, x1, y1, dxp, dyp):
        _rect(rows, x0, y0, x1, y1, "K")                  # telhado/parede de zinco
        rows[dyp][dxp] = "D"                              # entrada do barraco
    _barraco(60, 22, 64, 25, 62, 25)                      # o barracao do patrao (o maior)
    _barraco(70, 22, 73, 24, 71, 24)
    _barraco(75, 26, 78, 28, 76, 28)
    _barraco(59, 34, 62, 37, 60, 34)
    _barraco(72, 34, 75, 37, 73, 34)
    _barraco(66, 35, 69, 37, 67, 35)

    rows[30][67] = "F"                                    # fogueira central
    for (x, y) in [(66, 29), (68, 29), (66, 31), (68, 31)]:
        if rows[y][x] == "S": rows[y][x] = "4"            # pedras em volta do fogo
    for (x, y) in [(59, 23), (65, 23), (74, 24), (78, 32), (64, 31), (70, 32), (61, 31), (77, 38)]:
        if rows[y][x] == "S": rows[y][x] = "b"            # barris e engradados
    for (x, y) in [(58, 21), (79, 21), (58, 39), (79, 39), (59, 29), (59, 32)]:
        if rows[y][x] in "SW": rows[y][x] = "L"           # lampioes
    for (x, y) in [(63, 28), (72, 28), (76, 33), (62, 32), (69, 27)]:
        if rows[y][x] == "S": rows[y][x] = "^"            # entulho/moita de cobertura
    rows[28][bx0] = "V"; rows[33][bx0] = "V"              # letreiro I LOVE SAPOPEMBA no portao

    # trilha: tronco norte (col 50) + ramo leste ate o portao, ramo oeste -> aguada
    for y in range(2, 64):
        rows[y][50] = ","                                # tronco principal
    for x in range(50, 57):
        rows[30][x] = ","                                # ramo leste -> portao oeste
    for x in range(42, 51):
        rows[58][x] = ","                                # ramo oeste -> aguada
    # bordas (penhascos) e a passagem norte de volta pro Ermo
    _rect(rows, 0, 0, 2, Hh - 1, "4"); _rect(rows, W - 3, 0, W - 1, Hh - 1, "4")
    _rect(rows, 0, 0, W - 1, 2, "4"); _rect(rows, 0, Hh - 3, W - 1, Hh - 1, "4")
    for x in range(48, 53):
        rows[0][x] = "+"; rows[1][x] = "+"; rows[2][x] = ","
    rows[3][50] = ","; rows[4][50] = ","                  # liga a passagem na trilha
    return ["".join(r) for r in rows]


DESCAMPADO_ROWS = _build_descampado()

# abre a passagem LESTE do Descampado -> Brasal (a Ferida do Mundo)
def _open_descampado_east():
    for y in range(48, 53):
        row = list(DESCAMPADO_ROWS[y])
        for x in range(93, 97): row[x] = "."
        for x in range(97, 100): row[x] = "+"
        DESCAMPADO_ROWS[y] = "".join(row)
_open_descampado_east()
DESCAMPADO_SPAWN = [(50, 6), (49, 6), (51, 6), (50, 7)]   # logo abaixo da entrada norte


def _build_repouso_dama():
    """REPOUSO DA DAMA: floresta escura ao LESTE do Ermo (100x100). Comeca rala
    (poucos pinheiros, ainda com luz) na borda oeste e vai FECHANDO e escurecendo
    pro fundo (leste), onde os espiritos vagam e a Dama da Noite (banshee) espera
    numa clareira funda. Tiles: . mato  d chao escuro  i pinheiro(S)  T arvore(S)
    ^ sarca(S)  4 pedra(S)  , trilha  + passagem. Saida OESTE -> Ermo."""
    W, H = 100, 100
    rows = _grid(W, H, ".")
    rng = _rnd.Random(914)
    midY = H // 2  # 50

    # gradiente: quanto mais pro leste (depth ~0->1), mais chao escuro e pinheiro
    for y in range(2, H - 2):
        for x in range(2, W - 2):
            depth = x / float(W)
            if depth > 0.42 and rng.random() < (depth - 0.38) * 0.95:
                rows[y][x] = "d"
            if rng.random() < (0.012 + depth * depth * 0.40):
                rows[y][x] = "i"
    # arvores soltas e sarcas (mais densas no fundo)
    for _ in range(420):
        x = rng.randint(3, W - 3); y = rng.randint(3, H - 3)
        if rows[y][x] in ".d" and rng.random() < (0.28 + (x / float(W)) * 0.5):
            rows[y][x] = rng.choice(["T", "^", "^"])
    # afloramentos de pedra espalhados
    for (cx, cy, r) in [(16, 14, 3), (22, 70, 4), (40, 22, 3), (52, 78, 4), (60, 12, 3),
                        (48, 50, 3), (70, 64, 4), (74, 30, 3), (30, 44, 3), (66, 88, 3),
                        (84, 18, 3), (88, 80, 4)]:
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                x, y = cx + dx, cy + dy
                if dx * dx + dy * dy <= r * r and 2 < x < W - 2 and 2 < y < H - 2:
                    rows[y][x] = "4"

    # a CLAREIRA da Dama (fundo leste): chao escuro aberto cercado de pinheiros
    clx, cly, crx, cry = 86, midY, 9, 8
    for dx in range(-crx - 1, crx + 2):
        for dy in range(-cry - 1, cry + 2):
            x, y = clx + dx, cly + dy
            if 2 < x < W - 2 and 2 < y < H - 2:
                e = (dx / float(crx)) ** 2 + (dy / float(cry)) ** 2
                if e <= 1.0:
                    rows[y][x] = "d"
                elif e <= 1.5 and rng.random() < 0.74:
                    rows[y][x] = "i"

    # trilha reta do oeste ate a clareira (garante caminho entre os pinheiros)
    for x in range(1, clx + 1):
        rows[midY][x] = ","
    # boca de entrada limpa no oeste
    for yy in range(midY - 2, midY + 3):
        for xx in range(1, 6):
            if rows[yy][xx] in "iT^": rows[yy][xx] = "."

    # bordas de pedra + passagem OESTE de volta pro Ermo
    _ring(rows, "4")
    for y in range(midY - 1, midY + 2):
        rows[y][0] = "+"; rows[y][1] = "+"; rows[y][2] = ","
    return ["".join(r) for r in rows]


REPOUSO_ROWS = _build_repouso_dama()
# o pinheiro da floresta era 'i', MESMO char do marmore do Valoran (que precisa
# ser passavel). Renomeia o pinheiro pra 'Y' (solido) e desfaz a colisao.
REPOUSO_ROWS = [r.replace("i", "Y") for r in REPOUSO_ROWS]
REPOUSO_SPAWN = [(3, 50), (4, 50), (3, 49), (3, 51)]   # logo dentro da boca oeste


def _build_avasham():
    """DESERTO DE AVASHAM (100x100): areia pura ao SUL do Descampado. Entra pela
    boca norte. Rochas, cactos, ossadas e um oasis. Mais forte que a floresta."""
    W = Hh = 100
    g = _grid(W, Hh, ".")                       # areia por toda parte
    rng = _rnd.Random(7)
    for _ in range(300):                         # rochas, cactos e ossadas esparsos
        x, y = rng.randint(2, W - 3), rng.randint(2, Hh - 3)
        if 45 <= x <= 54 and y <= 9:             # corredor de entrada (norte) limpo
            continue
        r = rng.random()
        if r < 0.42:   g[y][x] = "^"             # rocha (solido)
        elif r < 0.58: g[y][x] = "T"             # cacto / arvore morta (solido)
        elif r < 0.74: g[y][x] = ","             # ossada (deco passavel)
    _rect(g, 14, 46, 20, 52, "~")                # lagoa do oasis (agua, meio-oeste)
    for (px, py) in [(13, 46), (21, 46), (13, 52), (21, 52), (17, 45), (17, 53)]:
        g[py][px] = "T"                          # palmeiras na borda do oasis
    _ring(g, "T")                                # borda de rochas / arvores mortas
    g[0][49] = "+"; g[0][50] = "+"               # boca norte (vinda do Descampado)
    for y in range(1, 7):
        g[y][49] = "."; g[y][50] = "."
    g[Hh - 1][49] = "+"; g[Hh - 1][50] = "+"     # boca SUL: desce pra Cova do Colosso
    for yy in range(Hh - 8, Hh - 1):             # corredor limpo ate a boca da cova
        for xx in (48, 49, 50, 51):
            g[yy][xx] = "."
    # --- PIRAMIDE DE AVHUR (centro-leste): a boca da Mina Fechada de Avhur ---
    pcx, pcy = 76, 38
    for yy in range(pcy - 7, pcy + 8):
        for xx in range(pcx - 7, pcx + 8):
            if not (0 <= xx < W and 0 <= yy < Hh):
                continue
            rr = max(abs(xx - pcx), abs(yy - pcy))       # anel (distancia Chebyshev)
            if rr <= 7:
                g[yy][xx] = "b" if rr <= 3 else "B"      # 2 niveis: apice 'b', base 'B'
    g[pcy + 7][pcx] = "p"                                 # PORTA na face sul -> Mina de Avhur
    for yy in range(pcy + 8, pcy + 11):                  # areia limpa em frente a porta
        if 0 <= yy < Hh:
            for xx in (pcx - 1, pcx, pcx + 1):
                if g[yy][xx] in "^T,": g[yy][xx] = "."
    return ["".join(r) for r in g]


def _build_valdarkram():
    """CEMITERIO ANTIGO DE VALDARKRAM (100x100): tumulos e criptas ao LESTE do
    Repouso. Entra pela boca oeste. Mais forte que o deserto."""
    W = Hh = 100
    g = _grid(W, Hh, ".")                        # chao morto (cinza no cliente)
    rng = _rnd.Random(13)
    for _ in range(220):                          # arvores mortas e entulho esparsos
        x, y = rng.randint(2, W - 3), rng.randint(2, Hh - 3)
        if x <= 9 and 45 <= y <= 54:              # corredor de entrada (oeste) limpo
            continue
        r = rng.random()
        if r < 0.30:   g[y][x] = "T"              # arvore morta (solido)
        elif r < 0.50: g[y][x] = ","              # ossada / entulho (passavel)
    for y in range(12, Hh - 12, 4):               # fileiras de lapides
        for x in range(10, W - 10, 5):
            if (x + y) % 7 != 0:
                g[y][x] = "^"                      # lapide (solido)
    _border(g, 44, 42, 56, 56, "H")               # mausoleu central (cripta)
    _rect(g, 45, 43, 55, 55, ".")
    for ry in range(56, 59):
        g[ry][49] = "."; g[ry][50] = "."          # entrada sul do mausoleu
    _ring(g, "T")                                 # borda de arvores mortas
    g[50][0] = "+"; g[49][0] = "+"; g[51][0] = "+"  # boca oeste (vinda do Repouso)
    for x in range(1, 7):
        g[49][x] = "."; g[50][x] = "."; g[51][x] = "."
    # TORRE DO LORDE NECROTICO: torre escura no cemiterio, com a PORTA ao NORTE de
    # frente pra quem chega (a porta 'Y' brilha roxo e leva ao andar 1). Fica logo
    # ao sul do mausoleu central, ligada por um atrio limpo.
    _border(g, 43, 61, 57, 76, "H")               # paredes de pedra (torre grande)
    _rect(g, 44, 62, 56, 75, ".")                 # interior limpo
    g[61][50] = "Z"                                # PORTA ao NORTE -> andar 1 (Z = caminhavel)
    for y in range(56, 61):                        # atrio limpo levando ate a porta
        for x in range(46, 55):
            g[y][x] = "."
    g[59][47] = "^"; g[59][53] = "^"              # 2 lapides marcando a entrada
    return ["".join(r) for r in g]


AVASHAM_ROWS = _build_avasham()
AVASHAM_SPAWN = [(49, 4), (50, 4), (49, 5), (50, 5)]      # logo dentro da boca norte


def _build_cova_colosso():
    """COVA DO COLOSSO (100x100): um desfiladeiro de pedra fechado, escondido no
    fundo SUL do deserto de Avasham. Paredoes de rocha cercam uma grande arena de
    areia rachada e escura onde O Colosso de Avasham aguarda, no meio das ossadas
    de quem tentou antes. Entra pela boca NORTE (descendo do deserto). Tiles:
    . areia  d areia rachada(arena)  ^ rocha(S)  T cacto morto(S)  , ossada
    + passagem. Saida NORTE -> deserto."""
    W, H = 100, 100
    rows = _grid(W, H, ".")
    rng = _rnd.Random(513)
    midX = W // 2          # 50
    arenaY = 66            # centro da arena, la no fundo

    # paredoes: quanto mais longe do eixo central, mais rocha (canyon fechado)
    for y in range(2, H - 2):
        for x in range(2, W - 2):
            wall = (abs(x - midX) - 13) / 26.0     # 0 perto do centro, 1 nas laterais
            if wall > 0 and rng.random() < wall:
                rows[y][x] = "^"
            elif rng.random() < 0.045:
                rows[y][x] = rng.choice(["^", "T", ",", ",", ","])

    # ossadas espalhadas (vitimas), so onde ainda for areia
    for _ in range(160):
        x = rng.randint(4, W - 4); y = rng.randint(4, H - 4)
        if rows[y][x] == "." and rng.random() < 0.55:
            rows[y][x] = ","

    # A ARENA: grande circulo de areia rachada cercado por um anel de rochas
    arr = 17
    for dx in range(-arr - 2, arr + 3):
        for dy in range(-arr - 2, arr + 3):
            x, y = midX + dx, arenaY + dy
            if 2 < x < W - 2 and 2 < y < H - 2:
                d2 = dx * dx + dy * dy
                if d2 <= arr * arr:
                    rows[y][x] = "d"                         # piso rachado da arena
                elif d2 <= (arr + 2) * (arr + 2) and rng.random() < 0.8:
                    rows[y][x] = "^"                         # anel de pedras

    # pilares quebrados dentro da arena (cobertura + drama)
    for (px, py) in [(midX - 10, arenaY - 7), (midX + 10, arenaY - 7),
                     (midX - 10, arenaY + 7), (midX + 10, arenaY + 7),
                     (midX, arenaY - 12), (midX, arenaY + 12)]:
        if (px - midX) ** 2 + (py - arenaY) ** 2 <= arr * arr:
            rows[py][px] = "^"

    # corredor de descida do norte ate a arena: ABRE a entrada DEPOIS da arena,
    # pra furar o anel de pedras e garantir caminho limpo de cima ate o centro
    for y in range(1, arenaY + 1):
        for x in range(midX - 3, midX + 4):
            if rows[y][x] in "^T":
                rows[y][x] = "."

    # bordas de rocha + boca NORTE de volta pro deserto
    _ring(rows, "^")
    rows[0][midX - 1] = "+"; rows[0][midX] = "+"
    for y in range(1, 6):
        rows[y][midX - 1] = "."; rows[y][midX] = "."
    return ["".join(r) for r in rows]


def _build_mina_avhur():
    """MINA FECHADA DE AVHUR (100x100): a tumba-mina egipcia sob a piramide do
    deserto, agora MAIOR e mais ramificada. Nove camaras de arenito ligadas por
    largos corredores, cheias de mortos-vivos. La no FUNDO SUL, uma grande
    antecamara guarda a descida selada pra CAMARA DE AVHUR (a sala do trono).
    Tiles: '.' chao  'd' chao nobre  '#' parede(S)  'H' sarcofago(S)  'L' tocha(S)
    ',' entulho  'p' saida pro deserto (norte)  '+' descida pra Camara de Avhur (sul)."""
    W = Hh = 100
    rows = _grid(W, Hh, "#")
    rng = _rnd.Random(4040)

    def carve_rect(x1, y1, x2, y2, ch="."):
        for y in range(max(1, y1), min(Hh - 1, y2 + 1)):
            for x in range(max(1, x1), min(W - 1, x2 + 1)):
                rows[y][x] = ch

    def carve_corr(x1, y1, x2, y2, wide=2):
        cx, cy = x1, y1
        while cx != x2:
            for w in range(wide):
                if 1 <= cy + w < Hh - 1: rows[cy + w][cx] = "."
            cx += 1 if x2 > cx else -1
        while cy != y2:
            for w in range(wide):
                if 1 <= cx + w < W - 1: rows[cy][cx + w] = "."
            cy += 1 if y2 > cy else -1

    # --- 9 camaras + a grande antecamara do trono ---
    carve_rect(44, 3, 56, 13)         # ENTRADA (norte)
    carve_rect(10, 17, 28, 33)        # NO
    carve_rect(40, 16, 60, 30)        # N
    carve_rect(72, 17, 90, 33)        # NE
    carve_rect(10, 42, 28, 58)        # O
    carve_rect(38, 40, 62, 56)        # CENTRAL
    carve_rect(72, 42, 90, 58)        # E
    carve_rect(10, 64, 28, 80)        # SO
    carve_rect(72, 64, 90, 80)        # SE
    carve_rect(36, 76, 64, 94, "d")   # ANTECAMARA do trono (chao nobre)

    # --- corredores largos: eixo central + ramais pras 8 camaras ---
    carve_corr(50, 13, 50, 40, 3)     # entrada -> N -> central
    carve_corr(50, 56, 50, 76, 3)     # central -> antecamara
    carve_corr(38, 46, 28, 25, 2)     # central -> NO
    carve_corr(62, 46, 72, 25, 2)     # central -> NE
    carve_corr(38, 50, 28, 50, 2)     # central -> O
    carve_corr(62, 50, 72, 50, 2)     # central -> E
    carve_corr(38, 54, 28, 72, 2)     # central -> SO
    carve_corr(62, 54, 72, 72, 2)     # central -> SE
    # --- aneis externos (aproveita mais o mapa + labirinto) ---
    carve_corr(19, 33, 19, 42, 2)     # NO <-> O
    carve_corr(81, 33, 81, 42, 2)     # NE <-> E
    carve_corr(19, 58, 19, 64, 2)     # O <-> SO
    carve_corr(81, 58, 81, 64, 2)     # E <-> SE
    carve_corr(28, 72, 36, 85, 2)     # SO -> antecamara
    carve_corr(72, 72, 64, 85, 2)     # SE -> antecamara
    carve_corr(28, 25, 40, 22, 2)     # NO -> N
    carve_corr(72, 25, 60, 22, 2)     # NE -> N

    # --- saida pro deserto (p) + descida pra Camara de Avhur (sul) ---
    rows[5][50] = "p"
    for yy in range(90, 99):           # passagem larga ate a boca sul
        for xx in (49, 50, 51):
            rows[yy][xx] = "."

    # --- deco: sarcofagos nas camaras, tochas no eixo, entulho ---
    for (cx, cy) in [(14, 21), (24, 30), (50, 19), (76, 21), (86, 30), (14, 46),
                     (24, 55), (76, 46), (86, 55), (14, 68), (24, 77), (76, 68),
                     (86, 77), (44, 43), (56, 53)]:
        if rows[cy][cx] == ".": rows[cy][cx] = "H"
    for yy in range(16, 56, 5):
        if rows[yy][48] == "#": rows[yy][48] = "L"
        if rows[yy][53] == "#": rows[yy][53] = "L"
    for _ in range(220):
        x, y = rng.randint(2, W - 3), rng.randint(2, Hh - 3)
        if rows[y][x] == "." and rng.random() < 0.42:
            rows[y][x] = ","

    # --- antecamara: tochas e sarcofagos dos servos guardando a descida ---
    for (tx, ty) in [(38, 78), (62, 78), (38, 92), (62, 92)]:
        rows[ty][tx] = "L"
    for tx in range(40, 61, 5):
        rows[77][tx] = "H"
    rows[93][48] = "L"; rows[93][53] = "L"

    _ring(rows, "#")
    rows[Hh - 1][49] = "+"; rows[Hh - 1][50] = "+"   # boca SUL -> Camara de Avhur
    return ["".join(r) for r in rows]


def _build_camara_avhur():
    """CAMARA DE AVHUR (100x100): a sala do trono de Avhur, o Maldito, selada no
    fundo da Mina Fechada. Um grande salao hipostilo de arenito dourado, com
    fileiras de colunas, braseiros e sarcofagos dos servos, e o trono ao sul.
    Entra pela boca NORTE (descendo da mina). Saida NORTE -> mina."""
    W, H = 100, 100
    rows = _grid(W, H, "#")
    midX = W // 2
    hx0, hy0, hx1, hy1 = 20, 14, 80, 88

    for y in range(hy0, hy1 + 1):                # o grande salao (chao nobre)
        for x in range(hx0, hx1 + 1):
            rows[y][x] = "d"
    for y in range(1, hy0 + 1):                  # corredor de entrada (norte)
        for x in (midX - 1, midX, midX + 1):
            rows[y][x] = "d"

    # colunas (pilares 2x2) em grade, deixando o corredor central livre
    for cy in range(hy0 + 6, hy1 - 8, 12):
        for cx in range(hx0 + 6, hx1 - 5, 13):
            if abs(cx - midX) < 6:
                continue
            for ox in (0, 1):
                for oy in (0, 1):
                    if hx0 < cx + ox < hx1 and hy0 < cy + oy < hy1:
                        rows[cy + oy][cx + ox] = "#"

    for ty in range(hy0 + 5, hy1 - 5, 10):       # braseiros flanqueando o corredor
        rows[ty][midX - 6] = "L"; rows[ty][midX + 6] = "L"
    for sy in range(hy0 + 3, hy1 - 3, 7):        # sarcofagos nas paredes laterais
        rows[sy][hx0 + 1] = "H"; rows[sy][hx1 - 1] = "H"
    for tx in range(midX - 5, midX + 6):         # o TRONO ao sul (podio de sarcofagos)
        rows[hy1 - 2][tx] = "H"
    rows[hy1 - 4][midX - 3] = "L"; rows[hy1 - 4][midX + 3] = "L"

    _ring(rows, "#")
    rows[0][midX - 1] = "+"; rows[0][midX] = "+"   # boca NORTE -> mina
    for y in range(1, 6):
        rows[y][midX - 1] = "d"; rows[y][midX] = "d"
    return ["".join(r) for r in rows]


def _build_torre_floor(seed):
    """Um andar da Torre do Lorde Necrotico (44x48): salao de pedra com pilares e
    braseiros. Sobe pela boca NORTE, desce pela boca SUL. Entra-se por baixo."""
    W, H = 44, 48
    rows = _grid(W, H, "d")                       # chao de pedra
    rng = _rnd.Random(seed)
    midX = W // 2
    # pilares (blocos 2x2) em grade, deixando o corredor central livre
    for cy in range(8, H - 10, 9):
        for cx in range(6, W - 6, 9):
            if abs(cx - midX) < 3:
                continue
            for ox in (0, 1):
                for oy in (0, 1):
                    if 0 < cx + ox < W - 1 and 0 < cy + oy < H - 1:
                        rows[cy + oy][cx + ox] = "#"
    for ty in range(7, H - 7, 8):                 # braseiros flanqueando o corredor
        rows[ty][midX - 4] = "L"; rows[ty][midX + 4] = "L"
    for sy in range(6, H - 6, 6):                 # nichos/sarcofagos nas paredes
        rows[sy][2] = "H"; rows[sy][W - 3] = "H"
    if rng.random() < 0.5:                         # uma leve variacao por andar
        rows[H // 2][6] = "L"; rows[H // 2][W - 7] = "L"
    _ring(rows, "#")
    rows[0][midX - 1] = "+"; rows[0][midX] = "+"          # boca NORTE -> sobe
    for y in range(1, 4):
        rows[y][midX - 1] = "d"; rows[y][midX] = "d"
    rows[H - 1][midX - 1] = "+"; rows[H - 1][midX] = "+"  # boca SUL -> desce
    for y in range(H - 4, H - 1):
        rows[y][midX - 1] = "d"; rows[y][midX] = "d"
    return ["".join(r) for r in rows]


def _build_camara_varth():
    """CAMARA DO LORDE NECROTICO (100x100): o topo da Torre. Salao de pedra com o
    trono de ossos de Lorde Varth ao NORTE. Entra pela boca SUL (subindo do andar
    3). Saida SUL -> andar 3."""
    W, H = 100, 100
    rows = _grid(W, H, "#")
    midX = W // 2
    hx0, hy0, hx1, hy1 = 18, 10, 82, 90
    for y in range(hy0, hy1 + 1):                 # o grande salao
        for x in range(hx0, hx1 + 1):
            rows[y][x] = "d"
    for y in range(hy1, H):                        # corredor de entrada (sul)
        for x in (midX - 1, midX, midX + 1):
            rows[y][x] = "d"
    for cy in range(hy0 + 8, hy1 - 8, 12):         # colunas
        for cx in range(hx0 + 6, hx1 - 5, 13):
            if abs(cx - midX) < 6:
                continue
            for ox in (0, 1):
                for oy in (0, 1):
                    if hx0 < cx + ox < hx1 and hy0 < cy + oy < hy1:
                        rows[cy + oy][cx + ox] = "#"
    for ty in range(hy0 + 6, hy1 - 5, 10):         # braseiros no corredor
        rows[ty][midX - 6] = "L"; rows[ty][midX + 6] = "L"
    for tx in range(midX - 5, midX + 6):           # trono de ossos ao NORTE
        rows[hy0 + 2][tx] = "H"
    rows[hy0 + 4][midX - 3] = "L"; rows[hy0 + 4][midX + 3] = "L"
    _ring(rows, "#")
    rows[H - 1][midX - 1] = "+"; rows[H - 1][midX] = "+"   # boca SUL -> andar 3
    for y in range(H - 5, H - 1):
        rows[y][midX - 1] = "d"; rows[y][midX] = "d"
    return ["".join(r) for r in rows]


COVA_COLOSSO_ROWS = _build_cova_colosso()
COVA_COLOSSO_SPAWN = [(50, 3), (49, 3), (50, 4), (49, 4)]   # logo dentro da boca norte
MINA_AVHUR_ROWS = _build_mina_avhur()
MINA_AVHUR_SPAWN = [(50, 7), (49, 7), (51, 7), (50, 8)]   # logo dentro da boca (vindo da piramide)
CAMARA_AVHUR_ROWS = _build_camara_avhur()
CAMARA_AVHUR_SPAWN = [(50, 3), (49, 3), (51, 3), (50, 4)]   # logo dentro da boca norte (vindo da mina)
VALDARKRAM_ROWS = _build_valdarkram()
VALDARKRAM_SPAWN = [(4, 50), (5, 50), (4, 49), (4, 51)]   # logo dentro da boca oeste
TORRE_ANDAR1_ROWS = _build_torre_floor(101)
TORRE_ANDAR2_ROWS = _build_torre_floor(202)
TORRE_ANDAR3_ROWS = _build_torre_floor(303)
TORRE_SPAWN = [(22, 43), (21, 43), (23, 43), (22, 42)]        # entra por baixo (boca sul)
CAMARA_VARTH_ROWS = _build_camara_varth()
CAMARA_VARTH_SPAWN = [(50, 92), (49, 92), (51, 92), (50, 91)]  # entra pela boca sul (vindo do andar 3)

# --- liga o Descampado ao Deserto (boca sul do Descampado) ---
_dr = [list(r) for r in DESCAMPADO_ROWS]
for _y in range(88, 99):
    _dr[_y][49] = "."; _dr[_y][50] = "."          # corredor descendo ate a borda sul
_dr[99][49] = "+"; _dr[99][50] = "+"
DESCAMPADO_ROWS = ["".join(r) for r in _dr]

# --- liga o Repouso ao Cemiterio (boca leste do Repouso, passando a clareira) ---
_rr = [list(r) for r in REPOUSO_ROWS]
for _x in range(88, 99):
    _rr[50][_x] = "d"                              # estende a trilha ate a borda leste
_rr[50][99] = "+"; _rr[49][99] = "+"; _rr[51][99] = "+"
REPOUSO_ROWS = ["".join(r) for r in _rr]


# ===========================================================================
#  INTERIORES — uma casa aconchegante reaproveitada por todas as portas.
#  Chars (solidez global ja bate): 1 piso(passavel)  F parede  b cama  h lareira
#  k mesa  q bau  2 tapete(passavel)  D porta-saida. O desenho e especifico de
#  interior no cliente (drawInteriorTile, ativado quando o mapa comeca com casa_).
# ===========================================================================
def _build_interior_casa():
    W, Hh = 15, 11
    rows = _grid(W, Hh, "1")                              # piso de madeira
    _border(rows, 0, 0, W-1, Hh-1, "F")                  # paredes de madeira
    rows[1][6] = "h"; rows[1][7] = "h"; rows[1][8] = "h"  # lareira no topo-centro
    rows[2][11] = "b"; rows[2][12] = "b"                 # cama 2x2 (canto sup. dir.)
    rows[3][11] = "b"; rows[3][12] = "b"
    rows[4][3] = "k"; rows[4][4] = "k"                   # mesa
    rows[7][2] = "q"                                      # bau
    rows[5][7] = "2"; rows[5][8] = "2"                   # tapete central 2x2
    rows[6][7] = "2"; rows[6][8] = "2"
    rows[Hh-1][7] = "D"                                  # porta de saida (parede de baixo)
    return ["".join(r) for r in rows]


INTERIOR_CASA_ROWS = _build_interior_casa()


# ---------------------------------------------------------------------------
#  MODELOS DE INTERIOR (todos 15x11, porta 'D' em (7,10), spawn (7,9)).
#  A cor de cada casa vem do tema no cliente; aqui muda so a planta dos moveis.
#  Tiles novos: '/' rack de arma  ';' estante  '#' balcao  '_' penteadeira
#  (reusados: b cama  h lareira  k mesa  q bau/engradado  2 tapete)
# ---------------------------------------------------------------------------
def _int_room(w=15, h=11):
    rows = _grid(w, h, "1")
    _border(rows, 0, 0, w - 1, h - 1, "F")
    rows[h - 1][7] = "D"
    return rows

def _S(rows):
    return ["".join(r) for r in rows]

def _quarto_a():
    r = _int_room()
    r[1][1] = "b"; r[1][2] = "b"; r[2][1] = "b"; r[2][2] = "b"   # cama sup-esq
    r[1][7] = "h"                                                # lareira topo
    r[1][12] = "_"; r[1][13] = "_"                               # penteadeira sup-dir
    r[4][3] = "k"                                                # mesinha
    r[7][2] = "q"                                                # bau
    r[5][7] = "2"; r[5][8] = "2"; r[6][7] = "2"; r[6][8] = "2"   # tapete central
    return _S(r)

def _quarto_b():
    r = _int_room()
    r[1][11] = "b"; r[1][12] = "b"; r[2][11] = "b"; r[2][12] = "b"  # cama sup-dir
    r[1][1] = "_"; r[1][2] = "_"                                    # penteadeira sup-esq
    r[1][7] = "h"                                                   # lareira topo
    r[4][6] = "2"; r[4][7] = "2"; r[5][6] = "2"; r[5][7] = "2"      # tapete
    r[7][12] = "q"                                                  # bau dir
    r[6][2] = "k"                                                   # mesinha esq
    return _S(r)

def _quarto_c():
    r = _int_room()
    r[2][1] = "b"; r[2][2] = "b"; r[3][1] = "b"; r[3][2] = "b"   # cama meio-esq
    r[1][6] = "h"                                                # lareira
    r[1][12] = "_"                                               # penteadeira
    r[4][11] = "k"                                               # mesa dir
    r[6][7] = "2"; r[6][8] = "2"; r[7][7] = "2"; r[7][8] = "2"   # tapete
    r[8][2] = "q"                                                # bau
    return _S(r)

def _casa_comum_int():
    r = _int_room()
    r[2][11] = "b"; r[2][12] = "b"; r[3][11] = "b"; r[3][12] = "b"  # cama
    r[1][6] = "h"; r[1][7] = "h"                                    # lareira
    r[4][3] = "k"                                                   # mesa
    r[7][2] = "q"                                                   # bau
    r[6][7] = "2"; r[6][8] = "2"                                    # tapetinho
    return _S(r)

def _loja_armas_int():
    r = _int_room()
    for x in range(2, 13):              # racks de arma na parede do fundo
        r[1][x] = "/"
    r[3][1] = ";"; r[4][1] = ";"        # estante esquerda
    r[3][13] = ";"; r[4][13] = ";"      # estante direita
    for x in range(4, 11):              # balcao (display) atras do mercador
        r[6][x] = "#"
    r[8][2] = "q"                       # engradado
    return _S(r)


def _taverna_int():
    """Interior GRANDE da taverna enxaimel: salão com balcão de bar, lareira,
    barris e várias mesinhas. A Mesa de Confraternizações (NPC) vai no centro."""
    W, H = 21, 15
    rows = _grid(W, H, "1")
    _border(rows, 0, 0, W - 1, H - 1, "F")
    rows[H - 1][10] = "D"                       # porta no centro da frente
    for x in range(3, 12):                      # balcão do bar no fundo
        rows[1][x] = "#"
    rows[1][14] = "h"; rows[1][15] = "h"        # lareira
    rows[1][17] = "q"; rows[1][18] = "q"        # barris atrás do bar
    rows[7][2] = "q"; rows[11][18] = "q"        # barris pelos cantos
    for (mx, my) in [(4, 4), (8, 4), (15, 4),   # mesinhas espalhadas pelo salão
                     (4, 8), (16, 8),
                     (4, 11), (7, 11), (14, 11), (17, 11)]:
        rows[my][mx] = "k"
    for (rx, ry) in [(9, 7), (10, 7), (11, 7),  # tapete central (onde vai a Mesa de Confraternizações)
                     (9, 8), (10, 8), (11, 8)]:
        rows[ry][rx] = "2"
    return _S(rows)


# quais portas usam qual modelo (variedade entre as casas das meninas)
_QUARTO_VARIANTS = {
    "casa_melissa": _quarto_a(), "casa_yasmin": _quarto_b(), "casa_valentina": _quarto_c(),
    "casa_isabelle": _quarto_a(), "casa_giovanna": _quarto_b(), "casa_beatriz": _quarto_c(),
    "casa_camila": _quarto_a(), "casa_amanda": _quarto_b(),
}
INTERIOR_SPAWN = [(7, 9)]                                 # logo acima da porta, virado pra dentro

RASHARAN_SPAWN = [(50, 86), (49, 86), (51, 86), (50, 87)]   # cemiterio, perto do Jeans
VALORAN_SPAWN  = [(50, 88), (49, 88), (51, 88), (50, 89)]   # sul, de frente pra nave
FUNDAMENTO_SPAWN = [(49, 87), (50, 87), (48, 87), (49, 88)]  # entrada sul, de frente pro tapete
FALANOR_SPAWN = [(49, 91), (50, 91), (49, 92), (50, 92)]     # jardim do Nhare, ao sul
FADRAKOR_LITORAL_SPAWN = [(50, 74), (49, 74), (50, 73), (49, 73)]  # praia, de frente pro norte
FADRAKOR_SELVA_SPAWN   = [(50, 50), (49, 50), (50, 49), (49, 49)]  # clareira (fallback)
FADRAKOR_VULCAO_SPAWN  = [(50, 90), (49, 90), (50, 91), (49, 91)]  # corredor sul (fallback)


# ---- registro dos mapas (fonte unica) ----
# ===========================================================================
#  A VILA (40x30) VAI PRO CENTRO DE UM MAPA 100x100 (espaco pra cidade crescer).
#  Muralha de pedra em volta, 4 portoes (N/S/L/O) alinhados as estradas, campos
#  abertos ao redor e estradas dos portoes ate as bordas. TUDO que referencia
#  coordenada do Ermo desloca por (OX, OY): spawns, portas, passagens, NPCs.
# ===========================================================================
OX, OY = 30, 35                                 # canto sup-esq da vila no 100x100
_VW, _VH = len(MAP_ROWS[0]), len(MAP_ROWS)      # 40 x 30
ERMO_W = ERMO_H = 100

# abre a passagem LESTE da vila (na altura da estrada, linha 15) antes de centralizar
_er = [list(r) for r in MAP_ROWS]
for _y in (14, 15, 16):
    _er[_y][38] = "="
    _er[_y][39] = "+"
MAP_ROWS = ["".join(r) for r in _er]



def _embed_ermo():
    g = _grid(ERMO_W, ERMO_H, ".")
    rng = _rnd.Random(2026)
    # campos: arvores e moitas esparsas nos arredores (sem invadir a vila)
    for _ in range(420):
        x, y = rng.randint(1, ERMO_W - 2), rng.randint(1, ERMO_H - 2)
        if OX - 3 <= x <= OX + _VW + 2 and OY - 3 <= y <= OY + _VH + 2:
            continue
        if g[y][x] == ".":
            g[y][x] = rng.choice(["T", "T", "^"])
    # cola a vila no centro
    for j in range(_VH):
        for i in range(_VW):
            g[OY + j][OX + i] = MAP_ROWS[j][i]
    # converte o anel de arvores da vila em MURALHA de pedra ('H')
    # (inclui o '+' antigo da borda; os portoes reais sao reabertos abaixo)
    for i in range(_VW):
        for jy in (0, _VH - 1):
            if g[OY + jy][OX + i] in ("T", "+"):
                g[OY + jy][OX + i] = "H"
    for j in range(_VH):
        for jx in (0, _VW - 1):
            if g[OY + j][OX + jx] in ("T", "+"):
                g[OY + j][OX + jx] = "H"
    gx = OX + 19          # estrada vertical (N/S) -> col 49
    gy = OY + 15          # estrada horizontal (L/O) -> row 50
    # portoes (aberturas na muralha)
    g[OY][gx] = "="                       # NORTE
    g[OY + _VH - 1][gx] = "="             # SUL (era '+', vira estrada)
    g[gy][OX] = "="                       # OESTE
    for ry in (gy - 1, gy, gy + 1):       # LESTE (o punch ja abriu)
        g[ry][OX + _VW - 1] = "="
    # estradas dos portoes ate as bordas
    for y in range(0, OY):
        g[y][gx] = "="
    for y in range(OY + _VH, ERMO_H):
        g[y][gx] = "="
    for x in range(0, OX):
        g[gy][x] = "="
    for x in range(OX + _VW, ERMO_W):
        g[gy][x] = "="
    # borda externa (linha de arvores) + passagens SUL e LESTE
    _ring(g, "T")
    g[ERMO_H - 1][gx] = "+"; g[ERMO_H - 2][gx] = "+"      # SUL -> Descampado
    g[gy][ERMO_W - 1] = "+"; g[gy][ERMO_W - 2] = "+"      # LESTE -> Repouso
    g[ERMO_H - 3][gx] = "="; g[gy][ERMO_W - 3] = "="      # estrada coladinha
    g[0][gx] = "+"; g[1][gx] = "+"; g[2][gx] = "="        # NORTE -> Planaltos Ermais (estrada ja sobe ate aqui)
    return ["".join(r) for r in g]


MAP_ROWS = _embed_ermo()
SPAWN_POINTS = [(x + OX, y + OY) for (x, y) in SPAWN_POINTS]

# ---- TAVERNA enxaimel, a LESTE da vila (perto do Neichon), de frente pra estrada (y=50) ----
# 7 de largura x 5 de altura: 1a linha telhado '{', resto parede enxaimel '}', porta 'D' no centro.
_tav = [list(r) for r in MAP_ROWS]
_TVX, _TVY = 80, 45
for _yy in range(5):
    for _xx in range(7):
        _tav[_TVY + _yy][_TVX + _xx] = "{" if _yy <= 1 else "}"
_tav[_TVY + 4][_TVX + 3] = "D"                  # porta -> (83, 49)
MAP_ROWS = ["".join(r) for r in _tav]

# a RUA DOS OFÍCIOS: fachadas nativas belas; a porta D leva pro interior
def _build_prof_houses():
    def casa(cx, cy):
        linhas = ("mmmmmmm", "MMMMMMM", "MMMDMMM", "ppppppp")
        for i, ln in enumerate(linhas):
            row = list(MAP_ROWS[cy + i])
            for j, ch in enumerate(ln):
                row[cx + j] = ch
            MAP_ROWS[cy + i] = "".join(row)
    for cy in (14, 19, 24, 29):
        casa(41, cy)
    for cy in (16, 22, 28):
        casa(51, cy)
_build_prof_houses()


# O TEMPLO DOS DOZE: fachada monumental; o portal triplo D leva à nave interna
def _build_templo():
    x0, y0 = 52, 4
    linhas = ("mmmmmmmmmmmmmmm",
              "MMMMMMMMMMMMMMM",
              "MMMMMMMMMMMMMMM",
              "MMMMMMDDDMMMMMM",
              "ppppppppppppppp")
    for i, ln in enumerate(linhas):
        row = list(MAP_ROWS[y0 + i])
        for j, ch in enumerate(ln):
            row[x0 + j] = ch
        MAP_ROWS[y0 + i] = "".join(row)
    row = list(MAP_ROWS[y0 + 5])
    row[x0 + 2] = "L"; row[x0 + 12] = "L"
    for j in range(6, 9):
        row[x0 + j] = "p"
    MAP_ROWS[y0 + 5] = "".join(row)
_build_templo()


# calçadas de paralelepípedo ligando cada porta à estrada principal (x=49)
def _build_calcadas():
    ligas = [(44, 17, 1), (44, 22, 1), (44, 27, 1), (44, 32, 1),
             (54, 19, -1), (54, 25, -1), (54, 31, -1)]
    for (px, py, sentido) in ligas:
        x = px
        while 41 <= x <= 58:
            row = list(MAP_ROWS[py])
            if row[x] in (".", ",", ":", "T", "^", "Y", "d"):
                row[x] = "p"
            MAP_ROWS[py] = "".join(row)
            if (sentido > 0 and x >= 48) or (sentido < 0 and x <= 50):
                break
            x += sentido
    for y in range(10, 15):
        row = list(MAP_ROWS[y])
        for x in (58, 59, 60):
            if row[x] in (".", ",", ":", "T", "^", "Y", "d"):
                row[x] = "p"
        MAP_ROWS[y] = "".join(row)
    row = list(MAP_ROWS[14])
    for x in range(49, 59):
        if row[x] in (".", ",", ":", "T", "^", "Y", "d"):
            row[x] = "p"
    MAP_ROWS[14] = "".join(row)
_build_calcadas()


# ===========================================================================
#  MAPAS DO NORTE (vazios, foco em arte): Planaltos Ermais + Floresta do Ermo
# ===========================================================================
def _build_planaltos_ermais():
    """Planalto de altitude 120x120: degraus de penhasco, tarns, pedregulhos,
    pinheiros esparsos e uma estrada de pedra serpenteando do sul ao norte.
    Entrada sul (vinda do Ermo, col 60) e saida norte (pra Floresta, col 60)."""
    W = H = 120
    g = _grid(W, H, ".")
    rng = _rnd.Random(7001)
    _ring(g, "T")
    for by, gap in [(28, 58), (58, 44), (88, 74)]:           # bandas de penhasco (degraus)
        for x in range(2, W - 2):
            if abs(x - gap) > 5:
                g[by][x] = "H"
                if rng.random() < 0.45 and g[by - 1][x] == ".":
                    g[by - 1][x] = "^"
                if rng.random() < 0.30 and g[by + 1][x] == ".":
                    g[by + 1][x] = "^"
    for _ in range(8):                                        # campos de pedregulho
        cx, cy = rng.randint(12, W - 12), rng.randint(12, H - 12)
        for _ in range(rng.randint(10, 22)):
            bx, by = cx + rng.randint(-6, 6), cy + rng.randint(-6, 6)
            if 1 <= bx < W - 1 and 1 <= by < H - 1 and g[by][bx] == ".":
                g[by][bx] = rng.choice(["^", "^", "r"])
    for cx, cy, rad in [(26, 48, 7), (86, 36, 8), (54, 98, 6), (95, 92, 5)]:   # tarns
        for y in range(cy - rad, cy + rad + 1):
            for x in range(cx - rad, cx + rad + 1):
                if 1 <= x < W - 1 and 1 <= y < H - 1 and (x - cx) ** 2 + (y - cy) ** 2 < rad * rad and g[y][x] in (".", "r"):
                    g[y][x] = "~"
    for _ in range(420):                                      # textura esparsa
        x, y = rng.randint(2, W - 3), rng.randint(2, H - 3)
        if g[y][x] == ".":
            g[y][x] = rng.choice(["T", "T", ":", ":", ",", ",", "^", "r", "."])
    x = 60                                                    # estrada serpenteante (carve por ultimo)
    for y in range(H - 1, -1, -1):
        x += rng.choice([-1, 0, 0, 0, 1]); x = max(7, min(W - 8, x))
        if y < 6 or y > H - 7:
            x += (1 if x < 60 else (-1 if x > 60 else 0))
        for dx in (0, 1):
            xx = max(1, min(W - 2, x + dx))
            if g[y][xx] != "~":
                g[y][xx] = "="
    for yy in (1, 2, 3, 4):                                   # corredor de entrada limpo (norte/sul)
        g[yy][60] = "="; g[H - 1 - yy][60] = "="
    g[H - 1][60] = "+"; g[H - 1][61] = "+"; g[H - 2][60] = "="; g[H - 2][61] = "="   # SUL -> Ermo
    g[0][60] = "+"; g[0][61] = "+"; g[1][60] = "="; g[1][61] = "="                   # NORTE -> Floresta
    return ["".join(r) for r in g]


def _build_floresta_ermo():
    """Floresta densa 150x150 ao estilo Ilex (Pokemon Gold): mata fechada com
    corredores estreitos serpenteando, uma clareira central com um SANTUARIO de
    pedra ('%'), um lago e piso variado. Entrada sul (col 75)."""
    W = H = 150
    g = _grid(W, H, "T")
    rng = _rnd.Random(7777)

    def carve(x, y, r=1):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                xx, yy = x + dx, y + dy
                if 1 <= xx < W - 1 and 1 <= yy < H - 1:
                    g[yy][xx] = "."

    cx, cy = 75, 75
    x, y = 75, H - 2                                          # tronco do caminho (sul -> centro)
    while y > cy:
        carve(x, y, 1); y -= 1
        x += rng.choice([-1, 0, 0, 1]); x = max(6, min(W - 7, x))
    for _ in range(10):                                       # ramos saindo do tronco
        by = rng.randint(cy + 2, H - 8); dirx = rng.choice([-1, 1]); px, py = 75, by
        for _ in range(rng.randint(15, 40)):
            px += dirx; py += rng.choice([-1, 0, 0, 1])
            if not (2 <= px < W - 2 and 2 <= py < H - 2):
                break
            carve(px, py, 1)
    for yy in range(cy - 9, cy + 10):                         # clareira central
        for xx in range(cx - 9, cx + 10):
            if (xx - cx) ** 2 + (yy - cy) ** 2 < 80 and 1 <= xx < W - 1 and 1 <= yy < H - 1:
                g[yy][xx] = "."
    nx = cx                                                   # TRONCO NORTE: clareira -> topo (deixa o norte alcancavel)
    north_trunk = []
    yy2 = cy - 8
    while yy2 > 5:
        carve(nx, yy2, 1); north_trunk.append((nx, yy2))
        yy2 -= 1; nx += rng.choice([-1, 0, 0, 1]); nx = max(6, min(W - 7, nx))
    for _ in range(12):                                       # ramos do tronco norte (saem de pontos REAIS = conectados)
        bx, by = rng.choice(north_trunk)
        dirx = rng.choice([-1, 1]); px, py = bx, by
        for _ in range(rng.randint(12, 30)):
            px += dirx; py += rng.choice([-1, 0, 0, 1])
            if not (2 <= px < W - 2 and 2 <= py < H - 2):
                break
            carve(px, py, 1)
    g[cy][cx] = "%"                                           # SANTUARIO
    g[cy - 1][cx] = "d"; g[cy + 1][cx] = "d"; g[cy][cx - 1] = "d"; g[cy][cx + 1] = "d"   # piso de pedra
    for yy in range(48, 60):                                  # lago na mata
        for xx in range(36, 50):
            if (xx - 43) ** 2 + ((yy - 54) * 1.2) ** 2 < 42 and 1 <= xx < W - 1 and 1 <= yy < H - 1:
                g[yy][xx] = "~"
    for yy in range(1, H - 1):                                # textura: terra, piso claro, pinheiros
        for xx in range(1, W - 1):
            if g[yy][xx] == ".":
                r = rng.random()
                if r < 0.10:
                    g[yy][xx] = ","
                elif r < 0.16:
                    g[yy][xx] = "d"
            elif g[yy][xx] == "T" and rng.random() < 0.24:
                g[yy][xx] = rng.choice(["Y", "Y", "4", "T"])   # pinheiros + mata escura (mata o bug do '^')
    for yy in (2, 3, 4):                                      # corredor de entrada limpo (sul)
        g[H - 1 - yy][75] = "."
    g[H - 2][75] = "."; g[H - 2][76] = "."
    g[H - 1][75] = "+"; g[H - 1][76] = "+"                    # SUL -> Planaltos
    for yy in range(1, cy - 7):                               # corredor NORTE reto -> saida pra Atalech
        g[yy][cx - 1] = g[yy][cx] = g[yy][cx + 1] = "."
    g[0][cx] = "+"; g[0][cx + 1] = "+"                        # NORTE -> Bosque de Atalech
    return ["".join(r) for r in g]


def _build_bosque_atalech():
    """O Profundo Bosque de Atalech 200x200: floresta de coniferas escura ao estilo
    das matas do leste da Alemanha (Floresta Negra). Pinheiros densos, mata fechada,
    um LAGO central alimentado por uma CACHOEIRA, e uma rede de trilhas que deixa o
    bosque inteiro andavel. Entrada sul (col 100). Sem vida (so arte)."""
    W = H = 200
    g = _grid(W, H, ".")
    rng = _rnd.Random(8200)
    _ring(g, "4")
    for _ in range(120):                                      # bosques densos (pinheiro + mata escura)
        cx, cy = rng.randint(6, W - 6), rng.randint(6, H - 6); rad = rng.randint(4, 12)
        for y in range(cy - rad, cy + rad + 1):
            for x in range(cx - rad, cx + rad + 1):
                if 1 <= x < W - 1 and 1 <= y < H - 1 and (x - cx) ** 2 + (y - cy) ** 2 < rad * rad and g[y][x] == ".":
                    g[y][x] = rng.choice(["4", "4", "Y", "Y", "Y"])
    lx, ly, lr = 100, 120, 25                                 # LAGO central
    for y in range(ly - lr, ly + lr + 1):
        for x in range(lx - lr, lx + lr + 1):
            if 1 <= x < W - 1 and 1 <= y < H - 1 and ((x - lx) ** 2 + ((y - ly) * 1.05) ** 2) < lr * lr:
                g[y][x] = "~"
    for x in range(lx - 12, lx + 13):                         # PENHASCO no norte do lago
        if 1 <= x < W - 1:
            g[ly - lr][x] = "4"; g[ly - lr - 1][x] = "4"
    for fy in range(ly - lr - 1, ly - lr + 9):                # CACHOEIRA caindo no lago
        for fx in (lx - 1, lx, lx + 1):
            if 1 <= fx < W - 1 and 1 <= fy < H - 1:
                g[fy][fx] = "F"
    for x in range(lx - 3, lx + 4):                           # espuma na base da queda
        if 0 <= ly - lr + 9 < H:
            g[ly - lr + 9][x] = "~"
    for y in range(1, H - 1):                                 # detalhe: pinheiros soltos, terra, piso seco
        for x in range(1, W - 1):
            if g[y][x] == ".":
                r = rng.random()
                if r < 0.06:
                    g[y][x] = "Y"
                elif r < 0.10:
                    g[y][x] = ","
                elif r < 0.14:
                    g[y][x] = "d"

    def carve(x, y, r=1):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                xx, yy = x + dx, y + dy
                if 1 <= xx < W - 1 and 1 <= yy < H - 1 and g[yy][xx] not in ("~", "F"):
                    g[yy][xx] = "."

    x = 100                                                   # trilha oeste (contorna o lago pela esquerda)
    for y in range(H - 2, -1, -1):
        if ly - lr - 4 < y < ly + lr + 4:
            x = lx - lr - 6
        else:
            x += rng.choice([-1, 0, 0, 1])
        x = max(6, min(W - 7, x)); carve(x, y, 1)
    x = lx + lr + 6                                           # trilha leste (contorna pela direita)
    for y in range(ly + lr + 3, 6, -1):
        x += rng.choice([-1, 0, 0, 1]); x = max(6, min(W - 7, x)); carve(x, y, 1)
    for _ in range(24):                                       # ramos serpenteantes (espalha andabilidade)
        px, py = rng.randint(8, W - 8), rng.randint(8, H - 8)
        dirx, diry = rng.choice([-1, 1]), rng.choice([-1, 1])
        for _ in range(rng.randint(15, 45)):
            if rng.random() < 0.5:
                px += dirx
            else:
                py += diry
            if not (2 <= px < W - 2 and 2 <= py < H - 2):
                break
            carve(px, py, 1)
    for yy in range(2, 8):                                    # corredor de entrada limpo (sul)
        carve(100, H - 1 - yy, 1)
    g[H - 2][100] = "."; g[H - 2][101] = "."
    g[H - 1][100] = "+"; g[H - 1][101] = "+"                  # SUL -> Floresta do Ermo
    return ["".join(r) for r in g]


PLANALTOS_ROWS = _build_planaltos_ermais()
FLORESTA_ROWS = _build_floresta_ermo()
PLANALTOS_SPAWN = [(60, 117), (59, 117), (61, 117), (60, 116)]   # logo dentro da entrada sul
FLORESTA_SPAWN = [(75, 147), (74, 147), (76, 147), (75, 146)]    # logo dentro da entrada sul
BOSQUE_ATALECH_ROWS = _build_bosque_atalech()

# abre a passagem NORTE do Bosque de Atalech -> Umbraval
def _open_bosque_north():
    for y in range(0, 4):
        row = list(BOSQUE_ATALECH_ROWS[y])
        for x in range(72, 79):
            row[x] = "+" if y <= 1 else "."
        BOSQUE_ATALECH_ROWS[y] = "".join(row)
_open_bosque_north()

BOSQUE_ATALECH_SPAWN = [(100, 197), (99, 197), (101, 197), (100, 196)]   # logo dentro da entrada sul


# ===========================================================================
#  BRASAL, A FERIDA DO MUNDO + GOELA DE KREZATH (leste do Descampado)
#  Tiles (interpretados pelo cliente em drawBrasalTile/drawGoelaTile):
#   . cinza   , brasas no chao   d terra rachada de magma   + passagem
#   l LAVA(S)   B obsidiana(S)   Y arvore carbonizada(S)   k ossada(S)   G geiser(S)
#   # parede de basalto(S)   v veio de magma na parede(S)
# ===========================================================================
def _build_brasal():
    import random as _rd
    R = _rd.Random(4242)
    W = H = 150
    rows = [["." for _ in range(W)] for _ in range(H)]
    for x in range(W): rows[0][x] = "~"; rows[H-1][x] = "~"
    for y in range(H): rows[y][0] = "~"; rows[y][W-1] = "~"
    # ruído de chão: brasas e terra rachada
    for y in range(1, H-1):
        for x in range(1, W-1):
            r = R.random()
            if r < 0.10: rows[y][x] = ","
            elif r < 0.17: rows[y][x] = "d"
    # RIO DE LAVA serpenteando norte-sul no meio, com 3 pontes de basalto
    import math as _m
    pontes = {(40, 43), (74, 77), (108, 111)}
    for y in range(1, H-1):
        cx = int(75 + 22 * _m.sin(y / 13.0))
        w = 2 if (y % 7) else 3
        em_ponte = any(a <= y <= b for (a, b) in pontes)
        for x in range(cx - w, cx + w + 1):
            if 1 <= x < W-1:
                rows[y][x] = "d" if em_ponte else "l"
    # lagos de lava
    for (lx, ly, rx, ry) in ((30, 110, 9, 6), (115, 40, 10, 7), (50, 24, 7, 5)):
        for y in range(ly - ry, ly + ry + 1):
            for x in range(lx - rx, lx + rx + 1):
                if 1 <= x < W-1 and 1 <= y < H-1 and ((x-lx)/rx)**2 + ((y-ly)/ry)**2 <= 1:
                    rows[y][x] = "l"
    # obsidianas, árvores carbonizadas, ossadas, gêiseres
    def scatter(ch, n, keep=2):
        placed = 0
        while placed < n:
            x, y = R.randint(3, W-4), R.randint(3, H-4)
            if rows[y][x] == "." or rows[y][x] == ",":
                for dy in range(keep):
                    for dx in range(keep):
                        if rows[y+dy][x+dx] in ".,d":
                            rows[y+dy][x+dx] = ch
                placed += 1
    scatter("B", 46, 2); scatter("Y", 110, 1); scatter("k", 14, 2); scatter("G", 16, 1)
    # paredão de obsidiana no LESTE (boca da Goela) 
    for y in range(1, H-1):
        for x in range(W-6, W-1):
            if R.random() < 0.5: rows[y][x] = "B"
    # ENTRADAS: oeste (vindo do Descampado) e leste (boca da Goela), corredores limpos
    for y in range(47, 54):
        for x in range(1, 10): rows[y][x] = "."
        for x in range(0, 3): rows[y][x] = "+"
    for y in range(72, 79):
        for x in range(W-10, W-1): rows[y][x] = "."
        for x in range(W-3, W): rows[y][x] = "+"
    return ["".join(r) for r in rows]


def _carve_cave(seed, W, H, way_in, way_out):
    """Caverna: paredes '#' escavadas com corredor principal GARANTIDO entrada->saída,
    salas laterais, bolsões de lava e veios de magma. way_in/way_out: (x, y)."""
    import random as _rd, math as _m
    R = _rd.Random(seed)
    rows = [["#" for _ in range(W)] for _ in range(H)]
    def carve(x, y, r):
        for dy in range(-r, r+1):
            for dx in range(-r, r+1):
                if dx*dx + dy*dy <= r*r and 1 <= x+dx < W-1 and 1 <= y+dy < H-1:
                    rows[y+dy][x+dx] = "."
    # corredor principal serpenteante
    (x0, y0), (x1, y1) = way_in, way_out
    steps = max(abs(x1-x0), abs(y1-y0)) * 2
    path = []
    for i in range(steps + 1):
        t = i / steps
        env = _m.sin(t * _m.pi)                       # envelope: desvio ZERA nas pontas
        px = int(x0 + (x1-x0)*t + 7*_m.sin(t*6.0 + seed) * env)
        py = int(y0 + (y1-y0)*t + 5*_m.sin(t*9.0 + seed*2) * env)
        px = max(2, min(W-3, px)); py = max(2, min(H-3, py))
        carve(px, py, 2); path.append((px, py))
    # salas laterais conectadas ao corredor
    for _ in range(7):
        sx, sy = R.randint(8, W-9), R.randint(8, H-9)
        rx, ry = R.randint(4, 7), R.randint(3, 6)
        for yy in range(sy-ry, sy+ry+1):
            for xx in range(sx-rx, sx+rx+1):
                if 1 <= xx < W-1 and 1 <= yy < H-1 and ((xx-sx)/rx)**2 + ((yy-sy)/ry)**2 <= 1:
                    rows[yy][xx] = "."
        ax, ay = min(path, key=lambda p: abs(p[0]-sx) + abs(p[1]-sy))
        x, y = sx, sy
        while x != ax: x += 1 if ax > x else -1; carve(x, y, 1)
        while y != ay: y += 1 if ay > y else -1; carve(x, y, 1)
        # bolsão de lava no fundo da sala + estalagmites
        if R.random() < 0.75:
            for yy in range(sy-1, sy+2):
                for xx in range(sx-2, sx+3):
                    if rows[yy][xx] == "." and (xx, yy) not in path and R.random() < 0.7:
                        rows[yy][xx] = "l"
        for _ in range(3):
            bx, by = sx + R.randint(-rx+1, rx-1), sy + R.randint(-ry+1, ry-1)
            if rows[by][bx] == ".": rows[by][bx] = "B"
    # corredor principal SEMPRE limpo (remove lava/pedra que caiu nele)
    for (px, py) in path:
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if rows[py+dy][px+dx] in ("l", "B"): rows[py+dy][px+dx] = "."
    # cascalho + veios de magma nas paredes que tocam o chão
    for y in range(1, H-1):
        for x in range(1, W-1):
            if rows[y][x] == "." and R.random() < 0.14: rows[y][x] = ","
            if rows[y][x] == "#":
                viz = any(rows[y+dy][x+dx] in ".," for dy in (-1,0,1) for dx in (-1,0,1))
                if viz and R.random() < 0.10: rows[y][x] = "v"
    # aberturas de entrada e saída
    for (ex, ey) in (way_in, way_out):
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                if 0 <= ex+dx < W and 0 <= ey+dy < H and (abs(dx) <= 1 or abs(dy) <= 1):
                    if ex+dx in (0, W-1) or ey+dy in (0, H-1):
                        rows[ey+dy][ex+dx] = "+"
                    elif rows[ey+dy][ex+dx] in ("#", "v", "l", "B"):
                        rows[ey+dy][ex+dx] = "."
    return ["".join(r) for r in rows]


def _build_goela_1():
    return _carve_cave(7, 70, 70, (2, 35), (35, 2))       # entra OESTE, sobe NORTE

def _build_goela_2():
    return _carve_cave(13, 70, 70, (35, 67), (35, 2))     # entra SUL, sobe NORTE (Vulkar na porta)


def _build_covil():
    W, H = 60, 50
    rows = [["#" for _ in range(W)] for _ in range(H)]
    cx, cy, rx, ry = 30, 24, 25, 19
    for y in range(1, H-1):
        for x in range(1, W-1):
            if ((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1:
                rows[y][x] = "."
    # LAGO DE MAGMA no norte (o trono líquido do Devorador)
    for y in range(4, 15):
        for x in range(1, W-1):
            if rows[y][x] == "." and ((x-30)/20.0)**2 + ((y-8)/7.0)**2 <= 1:
                rows[y][x] = "l"
    # plataforma de basalto no meio do lago (onde ELE dorme)
    for y in range(9, 15):
        for x in range(25, 36):
            rows[y][x] = "."
    # colunas de obsidiana simétricas
    for (bx, by) in ((14, 18), (46, 18), (12, 30), (48, 30), (20, 38), (40, 38)):
        rows[by][bx] = "B"; rows[by][bx+1] = "B"; rows[by+1][bx] = "B"; rows[by+1][bx+1] = "B"
    # cascalho e veios
    import random as _rd
    R = _rd.Random(99)
    for y in range(1, H-1):
        for x in range(1, W-1):
            if rows[y][x] == "." and R.random() < 0.12: rows[y][x] = ","
            if rows[y][x] == "#":
                viz = any(0 <= y+dy < H and 0 <= x+dx < W and rows[y+dy][x+dx] in ".," for dy in (-1,0,1) for dx in (-1,0,1))
                if viz and R.random() < 0.14: rows[y][x] = "v"
    # entrada SUL
    for y in range(H-3, H):
        for x in range(28, 33): rows[y][x] = "+"
    for y in range(cy+ry-2, H-3):
        for x in range(28, 33):
            if rows[y][x] in ("#", "v"): rows[y][x] = "."
    return ["".join(r) for r in rows]


BRASAL_ROWS = _build_brasal()
GOELA_1_ROWS = _build_goela_1()
GOELA_2_ROWS = _build_goela_2()
COVIL_KREZATH_ROWS = _build_covil()
BRASAL_SPAWN = [(4, 50), (4, 49), (4, 51), (5, 50)]
GOELA_1_SPAWN = [(4, 35), (4, 34), (4, 36)]
GOELA_2_SPAWN = [(35, 65), (34, 65), (36, 65)]
COVIL_SPAWN = [(30, 45), (29, 45), (31, 45)]

# abre a passagem SUL do Brasal -> Costa de Maravai
def _open_brasal_south():
    for y in range(144, 150):
        row = list(BRASAL_ROWS[y])
        for x in range(72, 79):
            row[x] = "+" if y >= 147 else "."
        BRASAL_ROWS[y] = "".join(row)
_open_brasal_south()






# ===========================================================================
#  COSTA DE MARAVAI (300x300, o MAIOR mapa do Ermo): savana ao norte,
#  praia paradisiaca ao sul, VILA CAICARA a leste da praia.
#  Tiles (drawCostaTile decide o bioma pela LINHA gy):
#   . chao   , capim/areia-fofa   d terra/areia-molhada   : areia clara   + passagem
#   T acacia/coqueiro(S)   ^ rochedo(S)   Y cupinzeiro(S)   W agua(S)
#   # casa de pescador(S)   b barco(S)   j rede(S)   F fogueira(S)   = pier (passavel)
# ===========================================================================
def _build_costa_maravai():
    import random as _rd, math as _m
    R = _rd.Random(777)
    W = H = 300
    rows = [["." for _ in range(W)] for _ in range(H)]
    for x in range(W): rows[0][x] = "~"; rows[H-1][x] = "~"
    for y in range(H): rows[y][0] = "~"; rows[y][W-1] = "~"
    # ---- SAVANA (y 1-158): capim, acacias, rochedos, cupinzeiros ----
    for y in range(1, 159):
        for x in range(1, W-1):
            r = R.random()
            if r < 0.16: rows[y][x] = ","
            elif r < 0.21: rows[y][x] = "d"
    def scatter(ch, n, y0, y1, keep=1):
        placed = 0
        while placed < n:
            x, y = R.randint(3, W-4), R.randint(y0, y1)
            if rows[y][x] in ".,d:":
                for dy in range(keep):
                    for dx in range(keep):
                        if rows[y+dy][x+dx] in ".,d:": rows[y+dy][x+dx] = ch
                placed += 1
    scatter("T", 300, 3, 155, 1)          # acacias
    scatter("^", 55, 3, 155, 1)           # rochedos
    scatter("Y", 45, 3, 155, 1)           # cupinzeiros
    # lagoa da savana (as capivaras agradecem)
    for (lx, ly, rx, ry) in ((70, 82, 15, 9), (200, 50, 11, 7)):
        for y in range(ly-ry, ly+ry+1):
            for x in range(lx-rx, lx+rx+1):
                if ((x-lx)/rx)**2 + ((y-ly)/ry)**2 <= 1: rows[y][x] = "W"
    # ---- TRANSICAO (y 159-185): cerrado ralo virando duna ----
    for y in range(159, 186):
        for x in range(1, W-1):
            rows[y][x] = ":" if R.random() < (y-158)/27.0*0.7 else ("," if R.random()<0.1 else ".")
    scatter("T", 30, 160, 184, 1)
    # ---- PRAIA (y 186+): areia clara, coqueiros, e o MAR ao sul ----
    for y in range(186, H-1):
        for x in range(1, W-1):
            rows[y][x] = ":" if R.random() > 0.12 else ","
    scatter("T", 90, 188, 248, 1)          # coqueiros
    scatter("^", 18, 190, 250, 1)
    # MAR: linha de costa ondulada (tudo abaixo vira agua)
    for x in range(1, W-1):
        costa = int(262 + 5*_m.sin(x/17.0) + 3*_m.sin(x/41.0))
        for y in range(costa, H-1):
            rows[y][x] = "W"
        rows[costa-1][x] = "d"             # areia molhada na beira
    # ---- VILA CAICARA (leste da praia: x 208-292, y 196-256) ----
    for y in range(196, 257):              # limpa o terreno da vila
        for x in range(208, 293):
            if rows[y][x] in ("T", "^"): rows[y][x] = ":"
    def casa(x0, y0, w, h):
        for y in range(y0, y0+h):
            for x in range(x0, x0+w):
                rows[y][x] = "#"
        rows[y0+h-1][x0+w//2] = ":"        # porta ao sul
    casa(214, 200, 7, 5); casa(228, 198, 8, 5); casa(244, 202, 7, 5)
    casa(260, 199, 8, 5); casa(274, 204, 7, 5)
    casa(218, 226, 7, 5); casa(266, 228, 8, 5)
    # ruas de terra batida ligando as casas
    for x in range(212, 286): rows[212][x] = "d"; rows[236][x] = "d"
    for y in range(200, 254): rows[y][250] = "d"
    # PIER: tabuas '=' entrando no mar
    for y in range(252, 288):
        for x in range(249, 253): rows[y][x] = "="
    # barcos, redes e fogueiras
    for (bx, by) in ((222, 250), (238, 252), (270, 249), (284, 246), (230, 246)):
        rows[by][bx] = "b"; rows[by][bx+1] = "b"
    for (jx, jy) in ((226, 214), (256, 212), (278, 216), (240, 232)):
        rows[jy][jx] = "j"
    for (fx, fy) in ((234, 222), (262, 220), (250, 244)):
        rows[fy][fx] = "F"
    # ---- ENTRADA NORTE (vindo do Brasal) ----
    for y in range(0, 3):
        for x in range(72, 79): rows[y][x] = "+"
    for y in range(3, 10):
        for x in range(70, 81):
            if rows[y][x] in ("T", "^", "Y", "W"): rows[y][x] = "."
    return ["".join(r) for r in rows]


# ===========================================================================
#  UMBRAVAL, A NOITE ETERNA (300x300): a mata alem do Bosque de Atalech.
#  Aqui o sol nunca entrou. Trilhas estreitas, clareiras raras e cogumelos
#  que brilham no escuro. Tiles: . chao  , folhas  T arvore(S)  ^ pedra(S)
#  c cogumelo luminoso (passavel)  + passagem
# ===========================================================================
def _build_umbraval():
    import random as _rd, math as _m
    R = _rd.Random(1313)
    W = H = 300
    rows = [["T" for _ in range(W)] for _ in range(H)]
    def carve(x, y, r):
        for dy in range(-r, r+1):
            for dx in range(-r, r+1):
                if dx*dx + dy*dy <= r*r and 1 <= x+dx < W-1 and 1 <= y+dy < H-1:
                    rows[y+dy][x+dx] = "."
    # trilha principal: sul -> norte, serpenteando
    for i in range(0, 297):
        t = i / 296.0
        px = int(75 + 60*_m.sin(t*5.2) + 40*_m.sin(t*2.1) + 60*t)
        px = max(4, min(W-5, px))
        carve(px, H-3-i, 2)
    # 2 trilhas transversais leste-oeste
    for (ty, amp, ph) in ((100, 25, 1.3), (200, 30, 4.1)):
        for x in range(3, W-3):
            py = int(ty + amp*_m.sin(x/37.0 + ph))
            carve(x, max(4, min(H-5, py)), 2)
    # clareiras raras (cada uma ganha um corredor ate a trilha principal)
    def _px_main(y):
        t = (H-3-y) / 296.0
        return max(4, min(W-5, int(75 + 60*_m.sin(t*5.2) + 40*_m.sin(t*2.1) + 60*t)))
    for _ in range(9):
        cxx, cyy = R.randint(25, W-26), R.randint(25, H-26)
        rx, ry = R.randint(7, 13), R.randint(6, 10)
        for y in range(cyy-ry, cyy+ry+1):
            for x in range(cxx-rx, cxx+rx+1):
                if ((x-cxx)/rx)**2 + ((y-cyy)/ry)**2 <= 1: rows[y][x] = "."
        alvo = _px_main(cyy)
        for x in range(min(cxx, alvo), max(cxx, alvo)+1):
            carve(x, cyy, 1)
    # moldura
    for x in range(W): rows[0][x] = "~"; rows[H-1][x] = "~"
    for y in range(H): rows[y][0] = "~"; rows[y][W-1] = "~"
    # detalhes no chao: folhas mortas, pedras, COGUMELOS LUMINOSOS
    for y in range(1, H-1):
        for x in range(1, W-1):
            if rows[y][x] == ".":
                r = R.random()
                if r < 0.16: rows[y][x] = ","
                elif r < 0.175: rows[y][x] = "c"
                elif r < 0.182: rows[y][x] = "^"
    # ENTRADA SUL (vindo do Bosque de Atalech)
    for y in range(H-3, H):
        for x in range(72, 79): rows[y][x] = "+"
    for y in range(H-14, H-3):
        for x in range(70, 81):
            if rows[y][x] in ("T", "^"): rows[y][x] = "."
    # SAÍDA NORTE (para Véspera, a Cidade Morta)
    for y in range(0, 3):
        for x in range(112, 119): rows[y][x] = "+"
    for y in range(3, 16):
        for x in range(110, 121):
            if rows[y][x] in ("T", "^"): rows[y][x] = "."
    return ["".join(r) for r in rows]


COSTA_MARAVAI_ROWS = _build_costa_maravai()
UMBRAVAL_ROWS = _build_umbraval()
COSTA_MARAVAI_SPAWN = [(75, 5), (74, 5), (76, 5), (75, 6)]
UMBRAVAL_SPAWN = [(75, 294), (74, 294), (76, 294)]





# ===========================================================================
#  VÉSPERA, A CIDADE MORTA (150x150): a metrópole que a noite engoliu.
#  Quarteirões em ruína, praça da fonte seca e a CATEDRAL onde o Ancião
#  espera. Tiles: . calçamento  , entulho  d cinza  # parede arruinada(S)
#  ^ escombro(S)  T árvore morta(S)  Y lampião apagado(S)  b carroça(S)
#  W água parada(S)  + passagem
# ===========================================================================
def _build_vespera():
    import random as _rd
    R = _rd.Random(1888)
    W = H = 150
    rows = [["." for _ in range(W)] for _ in range(H)]
    for x in range(W): rows[0][x] = "~"; rows[H-1][x] = "~"
    for y in range(H): rows[y][0] = "~"; rows[y][W-1] = "~"
    # calçamento rachado
    for y in range(1, H-1):
        for x in range(1, W-1):
            r = R.random()
            if r < 0.12: rows[y][x] = ","
            elif r < 0.18: rows[y][x] = "d"
    ruas_y = (40, 65, 90, 115)
    ruas_x = (30, 60, 90, 120)
    def rua_livre(x, y):
        return any(abs(y-ry) <= 2 for ry in ruas_y) or any(abs(x-rx) <= 2 for rx in ruas_x)
    # PRÉDIOS arruinados nos quarteirões (paredes com buracos)
    def predio(x0, y0, w, h):
        for y in range(y0, y0+h):
            for x in range(x0, x0+w):
                borda = (y in (y0, y0+h-1)) or (x in (x0, x0+w-1))
                if borda:
                    r = R.random()
                    rows[y][x] = "." if r < 0.22 else ("^" if r < 0.34 else "#")
                else:
                    rows[y][x] = "," if R.random() < 0.3 else "."
    celulas = [(6, 6), (36, 6), (96, 6), (126, 6),
               (6, 46), (36, 46), (96, 46), (126, 46),
               (6, 71), (36, 71), (66, 96), (96, 71), (126, 71),
               (6, 96), (36, 96), (96, 96), (126, 96),
               (6, 121), (36, 121), (66, 121), (96, 121)]
    for (cx0, cy0) in celulas:
        w = R.randint(10, 16); h = R.randint(9, 14)
        predio(cx0 + R.randint(0, 4), cy0 + R.randint(0, 3), w, h)
    # PRAÇA central com a fonte seca
    for y in range(60, 85):
        for x in range(55, 96):
            if rows[y][x] in ("#", "^"): rows[y][x] = "."
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if abs(dx) == 2 or abs(dy) == 2: rows[72+dy][75+dx] = "^"
    rows[72][75] = "W"
    # CATEDRAL do Ancião (norte): paredes duplas, colunas, entrada sul larga
    for y in range(10, 35):
        for x in range(55, 96):
            borda = y in (10, 11, 33, 34) or x in (55, 56, 94, 95)
            if borda:
                rows[y][x] = "." if R.random() < 0.12 else "#"
            else:
                rows[y][x] = "."
    for cy in (16, 22, 28):
        for cx in (62, 70, 80, 88):
            rows[cy][cx] = "^"
    for x in range(72, 79):
        rows[33][x] = "."; rows[34][x] = "."
    # ruas garantidas (limpam o que caiu nelas)
    for ry in ruas_y:
        for y in range(ry-2, ry+3):
            for x in range(1, W-1):
                if rows[y][x] in ("#", "^", "T"): rows[y][x] = "."
    for rx in ruas_x:
        for x in range(rx-2, rx+3):
            for y in range(1, H-1):
                if rows[y][x] in ("#", "^", "T"): rows[y][x] = "."
    # mobiliário urbano morto: lampiões nas ruas, árvores mortas, carroças, escombros
    def scatter(ch, n, so_rua=False):
        placed = 0
        while placed < n:
            x, y = R.randint(3, W-4), R.randint(3, H-4)
            if rows[y][x] in (".", ",", "d") and (rua_livre(x, y) == so_rua or not so_rua):
                rows[y][x] = ch; placed += 1
    scatter("Y", 30, so_rua=True)
    scatter("T", 40)
    scatter("b", 10)
    scatter("^", 90)
    # ENTRADA SUL (vindo do Umbraval)
    for y in range(H-3, H):
        for x in range(112, 119): rows[y][x] = "+"
    for y in range(H-14, H-3):
        for x in range(110, 121):
            if rows[y][x] in ("#", "^", "T", "Y", "b"): rows[y][x] = "."
    return ["".join(r) for r in rows]


VESPERA_ROWS = _build_vespera()
VESPERA_SPAWN = [(115, 144), (114, 144), (116, 144)]



MAPS = {
    "ermo":             {"rows": MAP_ROWS,             "spawns": SPAWN_POINTS},
    "salao":            {"rows": SALAO_ROWS,           "spawns": SALAO_SPAWN},
    "rasharan":         {"rows": RASHARAN_ROWS,        "spawns": RASHARAN_SPAWN},
    "valoran":          {"rows": VALORAN_ROWS,         "spawns": VALORAN_SPAWN},
    "fundamento":       {"rows": FUNDAMENTO_ROWS,      "spawns": FUNDAMENTO_SPAWN},
    "falanor":          {"rows": FALANOR_ROWS,         "spawns": FALANOR_SPAWN},
    "fadrakor_litoral": {"rows": FADRAKOR_LITORAL_ROWS, "spawns": FADRAKOR_LITORAL_SPAWN},
    "fadrakor_selva":   {"rows": FADRAKOR_SELVA_ROWS,   "spawns": FADRAKOR_SELVA_SPAWN},
    "fadrakor_vulcao":  {"rows": FADRAKOR_VULCAO_ROWS,  "spawns": FADRAKOR_VULCAO_SPAWN},
    "descampado":       {"rows": DESCAMPADO_ROWS,       "spawns": DESCAMPADO_SPAWN},
    "repouso_dama":     {"rows": REPOUSO_ROWS,          "spawns": REPOUSO_SPAWN},
    "avasham":          {"rows": AVASHAM_ROWS,          "spawns": AVASHAM_SPAWN},
    "cova_colosso":     {"rows": COVA_COLOSSO_ROWS,     "spawns": COVA_COLOSSO_SPAWN},
    "mina_avhur":       {"rows": MINA_AVHUR_ROWS,       "spawns": MINA_AVHUR_SPAWN},
    "camara_avhur":     {"rows": CAMARA_AVHUR_ROWS,     "spawns": CAMARA_AVHUR_SPAWN},
    "valdarkram":       {"rows": VALDARKRAM_ROWS,       "spawns": VALDARKRAM_SPAWN},
    "torre_andar1":     {"rows": TORRE_ANDAR1_ROWS,     "spawns": TORRE_SPAWN},
    "torre_andar2":     {"rows": TORRE_ANDAR2_ROWS,     "spawns": TORRE_SPAWN},
    "torre_andar3":     {"rows": TORRE_ANDAR3_ROWS,     "spawns": TORRE_SPAWN},
    "camara_varth":     {"rows": CAMARA_VARTH_ROWS,     "spawns": CAMARA_VARTH_SPAWN},
    "planaltos_ermais": {"rows": PLANALTOS_ROWS,        "spawns": PLANALTOS_SPAWN},
    "floresta_ermo":    {"rows": FLORESTA_ROWS,         "spawns": FLORESTA_SPAWN},
    "brasal":           {"rows": BRASAL_ROWS,           "spawns": BRASAL_SPAWN},
    "goela_1":          {"rows": GOELA_1_ROWS,          "spawns": GOELA_1_SPAWN},
    "goela_2":          {"rows": GOELA_2_ROWS,          "spawns": GOELA_2_SPAWN},
    "covil_krezath":    {"rows": COVIL_KREZATH_ROWS,    "spawns": COVIL_SPAWN},
    "costa_maravai":    {"rows": COSTA_MARAVAI_ROWS,    "spawns": COSTA_MARAVAI_SPAWN},
    "umbraval":         {"rows": UMBRAVAL_ROWS,         "spawns": UMBRAVAL_SPAWN},
    "vespera":          {"rows": VESPERA_ROWS,          "spawns": VESPERA_SPAWN},
    "bosque_atalech":   {"rows": BOSQUE_ATALECH_ROWS,   "spawns": BOSQUE_ATALECH_SPAWN},
}


# ---- interiores: cada porta da vila leva a uma casa (a mesma planta, reusada) ----
# Itatinga (NW): 8 casas, uma menina em cada (Juliana divide com a Amanda).
# Bento (SE): casa comum (interior generico, vazio). Sapopemba (SW): trancadas.
CASA_MENINAS = {                                  # mapa da casa -> porta dela no Ermo
    "casa_melissa":   (3, 3),   "casa_yasmin":    (10, 3),
    "casa_valentina": (16, 5),  "casa_isabelle":  (6, 6),
    "casa_giovanna":  (3, 9),   "casa_beatriz":   (10, 11),
    "casa_camila":    (15, 13), "casa_amanda":    (6, 14),
}
for _cm in CASA_MENINAS:                          # cada menina ganha um quarto (variado)
    MAPS[_cm] = {"rows": _QUARTO_VARIANTS.get(_cm, INTERIOR_CASA_ROWS), "spawns": INTERIOR_SPAWN}
MAPS["casa_comum"] = {"rows": _casa_comum_int(), "spawns": INTERIOR_SPAWN}   # casa do Bento
MAPS["loja_armas"] = {"rows": _loja_armas_int(), "spawns": INTERIOR_SPAWN}   # Armas Peteco
MAPS["taverna"]    = {"rows": _taverna_int(), "spawns": [(10, 13)]}          # taverna enxaimel (leste)

INTERIOR_MAPS = set(CASA_MENINAS) | {"casa_comum", "loja_armas", "taverna"}   # "estou dentro de uma casa?"

# porta (x, y) no Ermo -> mapa de interior, ou "LOCKED" (comercios ainda fechados)
# (coords ja deslocadas pelo embed: a vila vive no centro do 100x100)
DOOR_INTERIORS = {(pos[0] + OX, pos[1] + OY): name for name, pos in CASA_MENINAS.items()}
DOOR_INTERIORS[(33 + OX, 20 + OY)] = "casa_comum"                    # casa do Bento
DOOR_INTERIORS[(10 + OX, 20 + OY)] = "loja_armas"                    # Armas Peteco (liberada!)
DOOR_INTERIORS[(83, 49)] = "taverna"                                 # Taverna enxaimel (leste, fora da vila)

# ============ INTERIORES DAS OFICINAS (padrão Armas Peteco) ============
def _oficina_int(tema):
    """Interior 15x11 customizado por ofício: F parede, 1 piso, # bancada,
    ; braseiro de parede, / prateleira, D porta de saída."""
    g = [list("F1111111111111F") for _ in range(11)]
    g[0] = list("FFFFFFFFFFFFFFF")
    g[10] = list("FFFFFFFDFFFFFFF")
    g[1] = list("F1///////////1F")
    if tema == "ferreiro":
        for x in range(3, 8): g[3][x] = "#"          # a bancada da forja
        g[3][10] = ";"; g[5][10] = ";"               # braseiros gêmeos
        g[6][3] = "#"; g[6][4] = "#"                 # mesa de martelar
    elif tema == "coureiro":
        for x in range(9, 13): g[3][x] = "#"         # mesa de corte
        g[5][2] = "/"; g[6][2] = "/"                 # varal de peles
        g[7][11] = "#"
    elif tema == "costureiro":
        g[3][3] = "#"; g[3][4] = "#"                 # o tear
        g[5][9] = "#"; g[5][10] = "#"                # mesa de costura
        g[2][12] = "/"; g[6][2] = "/"
    elif tema == "carpinteiro":
        for x in range(4, 11): g[4][x] = "#"         # bancada comprida
        g[6][3] = "/"; g[6][11] = "/"                # pilhas de tábua
    elif tema == "alquimista":
        g[3][7] = ";"                                # o caldeirão central
        g[2][3] = "/"; g[2][11] = "/"                # prateleiras de frascos
        g[5][3] = "#"; g[5][11] = "#"
    elif tema == "joalheiro":
        g[4][6] = "#"; g[4][7] = "#"; g[4][8] = "#"  # a vitrine
        g[2][3] = "/"; g[2][11] = "/"
        g[6][7] = ";"                                # a lupa iluminada
    elif tema == "cozinheiro":
        for x in range(3, 7): g[3][x] = "#"          # o fogão
        g[3][10] = ";"                               # a boca de fogo
        g[6][5] = "#"; g[6][6] = "#"; g[6][9] = "#"  # mesas de servir
    return ["".join(r) for r in g]


def _templo_int():
    """A nave dos Doze: 21x15 com colunatas, braseiros e o ALTAR ao fundo."""
    g = [list("F" + "1" * 19 + "F") for _ in range(15)]
    g[0] = list("F" * 21)
    g[14] = list("F" * 10 + "D" + "F" * 10)
    g[1] = list("F1" + "/" * 17 + "1F")
    for cy in (4, 7, 10):
        for cx in (4, 9, 11, 16):
            g[cy][cx] = "^"
    for x in range(8, 13):                           # o ALTAR dos Doze
        g[2][x] = "#"
    g[3][8] = ";"; g[3][12] = ";"                    # braseiros do altar
    g[11][3] = ";"; g[11][17] = ";"                  # braseiros da nave
    return ["".join(r) for r in g]


OFICINAS_INT = {
    "oficina_ferreiro":    _oficina_int("ferreiro"),
    "oficina_coureiro":    _oficina_int("coureiro"),
    "oficina_costureiro":  _oficina_int("costureiro"),
    "oficina_carpinteiro": _oficina_int("carpinteiro"),
    "oficina_alquimista":  _oficina_int("alquimista"),
    "oficina_joalheiro":   _oficina_int("joalheiro"),
    "oficina_cozinheiro":  _oficina_int("cozinheiro"),
}
for _nm, _rows in OFICINAS_INT.items():
    MAPS[_nm] = {"rows": _rows, "spawns": [(7, 8), (6, 8), (8, 8)]}
MAPS["templo_doze"] = {"rows": _templo_int(), "spawns": [(10, 12), (9, 12), (11, 12)]}


def _fenda_int():
    """A sala da Fenda do Caos: uma câmara de pedra viva, 17x13."""
    g = [list("F" + "1" * 15 + "F") for _ in range(13)]
    g[0] = list("F" * 17)
    g[12] = list("F" * 17)
    for (bx, by) in ((3, 2), (13, 2), (3, 10), (13, 10)):
        g[by][bx] = ";"
    return ["".join(r) for r in g]


MAPS["fenda"] = {"rows": _fenda_int(), "spawns": [(8, 10), (7, 10), (9, 10)]}


def _ossuario_int():
    """O Ossuário dos Doze: subsolo do templo, 19x13, paredes de ossos."""
    g = [list("F" + "1" * 17 + "F") for _ in range(13)]
    g[0] = list("F" * 19)
    g[12] = list("F" * 19)
    for (bx, by) in ((3, 2), (15, 2), (3, 6), (15, 6), (3, 10), (15, 10)):
        g[by][bx] = ";"
    return ["".join(r) for r in g]


MAPS["ossuario"] = {"rows": _ossuario_int(), "spawns": [(9, 10), (8, 10), (10, 10)]}


import random as R
import math

ILHA_CASAS = {}      # {mapa: [(x, y, w, h, estilo)]} — pro decor do cliente


def _casa_solida(g, casas, cx, cy, w, h, estilo="comum"):
    """Casa MACIÇA (só paredes H): o telhado é desenhado pelo cliente por cima."""
    for yy in range(cy, cy + h):
        for xx in range(cx, cx + w):
            g[yy][xx] = "H"
    casas.append((cx, cy, w, h, estilo))


def _borda_mais(g, lado, a0, a1):
    """Faixa de '+' na borda (o EDGE_LINKS faz a travessia automática)."""
    W, H = len(g[0]), len(g)
    for a in range(a0, a1 + 1):
        if lado == "west":
            g[a][0] = "+"
            g[a][1] = "+"
        elif lado == "east":
            g[a][W - 1] = "+"
            g[a][W - 2] = "+"
        elif lado == "north":
            g[0][a] = "+"
            g[1][a] = "+"
        elif lado == "south":
            g[H - 1][a] = "+"
            g[H - 2][a] = "+"


def _vilalbina():
    """Vilalbina (44x28): vila portuária caiada de branco. Cais ao sul,
    praça festiva, casario. Borda LESTE -> Trigal."""
    W, H = 44, 28
    g = [["." for _ in range(W)] for _ in range(H)]
    rng = R.Random(41)
    casas = []
    for _ in range(60):
        x, y = rng.randint(1, W - 2), rng.randint(1, H - 6)
        if g[y][x] == ".":
            g[y][x] = rng.choice([",", ",", ",", "d"])
    for x in range(W):
        g[H - 1][x] = "~"
        g[H - 2][x] = "~"
    for x in range(18, 27):                       # o cais de madeira
        g[H - 3][x] = "="
        g[H - 4][x] = "="
    for y in range(H - 8, H - 4):
        for x in range(20, 25):
            g[y][x] = "p"
    for (cx, cy, w, h) in ((3, 3, 5, 3), (10, 3, 4, 3), (30, 3, 5, 3), (37, 3, 4, 3),
                           (3, 9, 4, 3), (37, 9, 4, 3), (3, 15, 5, 3), (36, 15, 5, 3),
                           (10, 20, 4, 3), (30, 20, 4, 3)):
        _casa_solida(g, casas, cx, cy, w, h, "branca")
    for y in range(9, 17):                        # a praça das festas
        for x in range(16, 29):
            g[y][x] = "p"
    for (bx, by) in ((17, 10), (27, 10), (17, 15), (27, 15)):
        g[by][bx] = ";"
    for y in range(17, H - 8):                    # cais -> praça
        for x in range(20, 25):
            g[y][x] = "p"
    for x in range(29, W):                        # praça -> borda leste
        g[12][x] = "p"
        g[13][x] = "p"
    _borda_mais(g, "east", 11, 14)
    ILHA_CASAS["vilalbina"] = casas
    return ["".join(r) for r in g]


def _trigal_dourado():
    """O Trigal Dourado (56x36). Borda OESTE -> Vilalbina; LESTE -> Prospera."""
    rng = R.Random(777)
    W, H = 56, 36
    g = [["," if rng.random() < 0.7 else "." for _ in range(W)] for _ in range(H)]
    casas = []
    for x in range(W):
        if x % 6 == 3:
            g[0][x] = "T"
        if x % 7 == 2:
            g[H - 1][x] = "T"
    for x in range(0, W):
        g[17][x] = "p"
        g[18][x] = "p"
    _casa_solida(g, casas, 8, 7, 6, 4, "fazenda")
    _casa_solida(g, casas, 38, 25, 6, 4, "fazenda")
    for y in range(11, 17):
        g[y][10] = "p"
        g[y][11] = "p"
    for y in range(19, 25):
        g[y][40] = "p"
        g[y][41] = "p"
    for (bx, by) in ((5, 17), (28, 16), (50, 18)):
        g[by][bx] = ";"
    _borda_mais(g, "west", 16, 19)
    _borda_mais(g, "east", 16, 19)
    ILHA_CASAS["trigal_dourado"] = casas
    return ["".join(r) for r in g]


def _vinhedo():
    """Vinhedo & Pomares (52x34). Borda SUL -> Prospera; OESTE -> Pastos."""
    rng = R.Random(1212)
    W, H = 52, 34
    g = [["." for _ in range(W)] for _ in range(H)]
    casas = []
    for _ in range(40):
        x, y = rng.randint(2, W - 3), rng.randint(1, 4)
        if g[y][x] == ".":
            g[y][x] = rng.choice(["T", ",", "d"])
    for y in range(7, H - 6):                     # as fileiras de parreiras
        if y % 3 != 0:
            for x in range(5, W - 5):
                if x % 2 == 0:
                    g[y][x] = "d"
    for x in range(0, W):
        g[16][x] = "p"
        g[17][x] = "p"
    for y in range(17, H):
        g[y][25] = "p"
        g[y][26] = "p"
    _casa_solida(g, casas, 42, 12, 5, 3, "adega")
    for y in range(15, 16):
        g[y][44] = "p"
    g[10][8] = ";"
    g[10][43] = ";"
    _borda_mais(g, "west", 15, 18)
    _borda_mais(g, "south", 24, 27)
    ILHA_CASAS["vinhedo"] = casas
    return ["".join(r) for r in g]


def _pastos():
    """Pastos & Fazendas (52x32). Borda LESTE -> Vinhedo."""
    W, H = 52, 32
    g = [["." for _ in range(W)] for _ in range(H)]
    rng = R.Random(88)
    casas = []
    for _ in range(50):
        x, y = rng.randint(1, W - 2), rng.randint(1, H - 2)
        if g[y][x] == ".":
            g[y][x] = ","
    def cercado(cx, cy, w, h):
        for xx in range(cx, cx + w):
            g[cy][xx] = "H"
            g[cy + h - 1][xx] = "H"
        for yy in range(cy, cy + h):
            g[yy][cx] = "H"
            g[yy][cx + w - 1] = "H"
        g[cy][cx + w // 2] = "1"
    cercado(6, 4, 14, 9)
    cercado(30, 4, 15, 9)
    cercado(6, 19, 14, 9)
    _casa_solida(g, casas, 31, 20, 10, 6, "celeiro")
    for x in range(0, W):
        g[15][x] = "p"
        g[16][x] = "p"
    _borda_mais(g, "east", 14, 17)
    ILHA_CASAS["pastos"] = casas
    return ["".join(r) for r in g]


def _prospera():
    """PROSPERA (86x62): a capital. Muralha, canal com pontes, praça com fonte,
    avenidas, distritos. Portões: O->Trigal, N->Vinhedo, L->Jardim, S->Farol."""
    W, H = 86, 62
    g = [["." for _ in range(W)] for _ in range(H)]
    rng = R.Random(2024)
    casas = []
    for _ in range(240):
        x, y = rng.randint(1, W - 2), rng.randint(1, H - 2)
        if g[y][x] == ".":
            g[y][x] = ","
    for x in range(W):                            # muralha
        g[0][x] = "H"
        g[H - 1][x] = "H"
    for y in range(H):
        g[y][0] = "H"
        g[y][W - 1] = "H"
    # o canal (3 pontes)
    for x in range(1, W - 1):
        g[38][x] = "~"
        g[39][x] = "~"
    for px in (12, 42, 72):
        for dx in (0, 1):
            g[38][px + dx] = "p"
            g[39][px + dx] = "p"
    # avenidas
    for y in range(1, H - 1):
        for x in (42, 43):
            if g[y][x] in ".,":
                g[y][x] = "p"
    for x in range(1, W - 1):
        for y in (30, 31):
            if g[y][x] in ".,":
                g[y][x] = "p"
    # a praça da fonte
    for y in range(22, 30):
        for x in range(33, 53):
            if g[y][x] in ".,":
                g[y][x] = "p"
    for (bx, by) in ((34, 23), (51, 23), (34, 28), (51, 28)):
        g[by][bx] = ";"
    # distritos de casario
    for (cx, cy, w, h, st) in ((4, 4, 6, 4, "nobre"), (13, 4, 5, 3, "comum"), (21, 4, 5, 4, "comum"),
                               (50, 4, 6, 4, "nobre"), (59, 4, 5, 3, "comum"), (67, 4, 6, 4, "nobre"),
                               (76, 4, 6, 3, "comum"),
                               (4, 12, 5, 3, "comum"), (13, 12, 6, 4, "comum"), (67, 12, 5, 3, "comum"),
                               (76, 11, 6, 4, "nobre"),
                               (4, 20, 5, 3, "comum"), (22, 20, 5, 3, "comum"), (58, 20, 5, 3, "comum"),
                               (4, 44, 6, 4, "comum"), (13, 44, 5, 3, "comum"), (22, 44, 6, 4, "nobre"),
                               (50, 44, 5, 3, "comum"), (59, 44, 6, 4, "comum"), (68, 44, 5, 3, "comum"),
                               (77, 44, 5, 4, "nobre"),
                               (4, 53, 5, 3, "comum"), (13, 53, 6, 3, "comum"), (50, 53, 5, 3, "comum"),
                               (59, 53, 6, 3, "comum"), (68, 53, 5, 3, "comum")):
        _casa_solida(g, casas, cx, cy, w, h, st)
    for (tx, ty) in ((30, 10), (56, 12), (20, 34), (64, 34), (30, 50), (60, 56), (10, 34), (76, 34)):
        if g[ty][tx] in ".,":
            g[ty][tx] = "T"
    # portões (aberturas na muralha) + bordas '+'
    for y in (30, 31):
        g[y][0] = "+"
        g[y][1] = "+"
        g[y][W - 1] = "+"
        g[y][W - 2] = "+"
    for x in (42, 43):
        g[0][x] = "+"
        g[1][x] = "+"
        g[H - 1][x] = "+"
        g[H - 2][x] = "+"
    ILHA_CASAS["prospera"] = casas
    return ["".join(r) for r in g]


def _jardim_templo():
    """O Jardim do Templo Estrelado (54x54): 12 torres em círculo, anel de
    mármore, altar central. Bordas: O->Prospera, L->Cidade Alta."""
    W, H = 54, 54
    g = [["." for _ in range(W)] for _ in range(H)]
    rng = R.Random(12)
    casas = []
    for _ in range(120):
        x, y = rng.randint(2, W - 3), rng.randint(2, H - 3)
        if g[y][x] == ".":
            g[y][x] = rng.choice([",", ",", "d", "d", "T"])
    cx, cy, RR = 27, 27, 17
    torres = []
    for i in range(12):
        a = i * math.pi * 2 / 12 - math.pi / 2
        tx, ty = int(cx + RR * math.cos(a)), int(cy + RR * math.sin(a))
        for dx in (0, 1):
            for dy in (0, 1):
                g[ty + dy][tx + dx] = "H"
        torres.append((tx, ty))
    ILHA_CASAS["_torres_templo"] = torres
    for deg in range(0, 720):
        a = deg * math.pi / 360
        for rr in (RR - 3, RR + 3):
            px, py = int(cx + rr * math.cos(a)), int(cy + rr * math.sin(a))
            if 0 < px < W - 1 and 0 < py < H - 1 and g[py][px] != "H":
                g[py][px] = "p"
    for y in range(cy - 4, cy + 5):
        for x in range(cx - 4, cx + 5):
            if abs(x - cx) + abs(y - cy) <= 6:
                g[y][x] = "p"
    for y in range(cy - 2, cy + 3):        # O SANTUÁRIO (estrutura central maciça)
        for x in range(cx - 2, cx + 3):
            g[y][x] = "H"
    for x in range(0, cx):
        if g[27][x] != "H":
            g[27][x] = "p"
        if g[28][x] != "H":
            g[28][x] = "p"
    for x in range(cx, W):
        if g[27][x] != "H":
            g[27][x] = "p"
        if g[28][x] != "H":
            g[28][x] = "p"
    _borda_mais(g, "west", 26, 29)
    _borda_mais(g, "east", 26, 29)
    ILHA_CASAS["jardim_templo"] = casas
    return ["".join(r) for r in g]


def _cidade_alta():
    """A Cidade Alta (50x40): a Torre da Alvorada, grifos, casario nobre.
    Borda OESTE -> Jardim do Templo."""
    W, H = 50, 40
    g = [["." for _ in range(W)] for _ in range(H)]
    rng = R.Random(7)
    casas = []
    for _ in range(80):
        x, y = rng.randint(1, W - 2), rng.randint(1, H - 2)
        if g[y][x] == ".":
            g[y][x] = ","
    for x in range(W):
        g[0][x] = "H"
    # A TORRE (bloco maciço 10x7; a entrada é por INTERACT nos grifos)
    for yy in range(4, 11):
        for xx in range(20, 30):
            g[yy][xx] = "H"
    g[12][22] = "Y"                               # os grifos
    g[12][27] = "Y"
    for y in range(11, H):
        for x in range(22, 28):
            if g[y][x] in ".,":
                g[y][x] = "p"
    for x in range(0, 22):
        for y in (24, 25):
            if g[y][x] in ".,":
                g[y][x] = "p"
    for (cx, cy, w, h) in ((4, 4, 5, 3), (4, 12, 6, 4), (38, 4, 6, 4), (38, 12, 5, 3),
                           (4, 30, 5, 3), (38, 30, 6, 4), (12, 30, 5, 3)):
        _casa_solida(g, casas, cx, cy, w, h, "nobre")
    for (bx, by) in ((21, 12), (28, 12), (10, 24), (40, 24)):
        if g[by][bx] in ".,":
            g[by][bx] = ";"
    _borda_mais(g, "west", 23, 26)
    ILHA_CASAS["cidade_alta"] = casas
    return ["".join(r) for r in g]


def _farol_margem():
    """A Margem do Farol (34x28). Borda NORTE -> Prospera."""
    W, H = 34, 28
    g = [["." for _ in range(W)] for _ in range(H)]
    rng = R.Random(5)
    casas = []
    for _ in range(30):
        x, y = rng.randint(1, W - 2), rng.randint(1, H - 4)
        if g[y][x] == ".":
            g[y][x] = ","
    for x in range(W):
        g[H - 1][x] = "~"
        g[H - 2][x] = "~"
    for y in range(H - 7, H - 2):                 # a península
        for x in range(19, 31):
            g[y][x] = "p"
    for yy in range(H - 10, H - 5):               # O FAROL (bloco 4x5, maciço)
        for xx in range(23, 27):
            g[yy][xx] = "H"
    _casa_solida(g, casas, 4, 6, 12, 8, "mansao") # a Mansão Prosperi
    for y in range(0, H - 7):                     # o caminho real
        for x in (24, 25):
            if g[y][x] in ".,":
                g[y][x] = "p"
    for x in range(10, 25):
        if g[16][x] in ".,":
            g[16][x] = "p"
    g[18][21] = ";"
    g[18][28] = ";"
    _borda_mais(g, "north", 23, 26)
    ILHA_CASAS["farol_margem"] = casas
    return ["".join(r) for r in g]



MAPS["vilalbina"] = {"rows": _vilalbina(), "spawns": [(22, 21), (21, 21), (23, 21)]}
MAPS["trigal_dourado"] = {"rows": _trigal_dourado(), "spawns": [(4, 17), (4, 18), (5, 17)]}
MAPS["vinhedo"] = {"rows": _vinhedo(), "spawns": [(4, 16), (4, 17), (5, 16)]}
MAPS["pastos"] = {"rows": _pastos(), "spawns": [(48, 15), (48, 16), (47, 15)]}
MAPS["prospera"] = {"rows": _prospera(), "spawns": [(4, 30), (4, 31), (5, 30)]}
MAPS["jardim_templo"] = {"rows": _jardim_templo(), "spawns": [(3, 27), (3, 28), (4, 27)]}
MAPS["cidade_alta"] = {"rows": _cidade_alta(), "spawns": [(3, 24), (3, 25), (4, 24)]}
MAPS["farol_margem"] = {"rows": _farol_margem(), "spawns": [(24, 2), (25, 2), (24, 3)]}

def _taverna_vilalbina():
    """A Taverna da Rosa (16x11): lareira, balcão, mesas de tapete, barris."""
    g = [list("F" + "1" * 14 + "F") for _ in range(11)]
    g[0] = list("FFFjjFFhhFFjjFFF")
    g[10] = list("FFFFFFFDDFFFFFFF")
    for x in range(3, 9):
        g[2][x] = "#"
    g[2][12] = "o"; g[3][12] = "o"; g[3][13] = "o"
    for (mx, my) in ((3, 5), (8, 5), (12, 6), (5, 8), (10, 8)):
        g[my][mx] = "k"
        if my + 1 < 10:
            g[my + 1][mx] = "2"
    g[6][1] = "q"
    return ["".join(r) for r in g]


def _iscas_cais():
    """A Isqueria do Tião (12x9): balcão, barris de isca, maré na janela."""
    g = [list("F" + "1" * 10 + "F") for _ in range(9)]
    g[0] = list("FFjjFFFhFjjF")
    g[8] = list("FFFFFDDFFFFF")
    g[2][2] = "#"; g[2][3] = "#"; g[2][4] = "#"
    g[3][9] = "o"; g[4][9] = "o"; g[4][8] = "o"
    g[5][2] = "q"; g[6][2] = "q"
    g[4][5] = "k"; g[5][5] = "2"
    return ["".join(r) for r in g]


def _mercado_prospera():
    """O Empório do Otto (17x12): prateleiras fartas, tapete da capital."""
    g = [list("F" + "1" * 15 + "F") for _ in range(12)]
    g[0] = list("FFjjFFFhhFPFjjFFF")
    g[11] = list("FFFFFFFDDFFFFFFFF")
    for x in range(3, 8):
        g[2][x] = "#"
    for y in (4, 6, 8):
        for x in (11, 12, 13, 14):
            g[y][x] = "E"
    for y in (5, 6):
        for x in (4, 5, 6):
            g[y][x] = "2"
    g[8][2] = "q"; g[9][2] = "q"; g[9][3] = "o"
    return ["".join(r) for r in g]


def _solar_prospera():
    """O Solar dos Eméritos (20x14): lareira dupla, mesa longa, memória."""
    g = [list("F" + "1" * 18 + "F") for _ in range(14)]
    g[0] = list("FFjjFPFFhhFFPFjjFFFF")
    g[13] = list("FFFFFFFFFDDFFFFFFFFF")
    for x in range(8, 12):
        for y in range(2, 5):
            g[y][x] = "2"
    for x in (7, 8, 9, 10, 11, 12):
        g[7][x] = "k"
    g[7][6] = "^"; g[7][13] = "^"
    g[3][2] = "q"; g[4][2] = "q"
    g[3][17] = "E"; g[4][17] = "E"
    g[10][3] = "k"; g[11][3] = "2"
    g[10][16] = "k"; g[11][16] = "2"
    g[2][14] = ";"
    return ["".join(r) for r in g]


def _templo_estrelado():
    """O Santuário dos Doze (33x33): mármore negro, pilares, bancos,
    12 altares acesos e o tapete do Arcebispo."""
    W, H = 33, 33
    g = [["F" for _ in range(W)] for _ in range(H)]
    cx, cy = 16, 15
    for y in range(H):
        for x in range(W):
            if (x - cx) ** 2 + (y - cy) ** 2 <= 14.4 ** 2:
                g[y][x] = "1"
    for i in range(12):
        a = i * math.pi * 2 / 12 - math.pi / 2
        tx, ty = int(cx + 12.4 * math.cos(a)), int(cy + 12.4 * math.sin(a))
        g[ty][tx] = ";"
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 8
        tx, ty = int(cx + 8.2 * math.cos(a)), int(cy + 8.2 * math.sin(a))
        g[ty][tx] = "F"
    for i in range(8):
        a = i * math.pi / 4
        tx, ty = int(cx + 5.6 * math.cos(a)), int(cy + 5.6 * math.sin(a))
        g[ty][tx] = "^"
    for y in range(cy - 1, cy + 2):
        for x in range(cx - 1, cx + 2):
            g[y][x] = "2"
    for y in range(cy + 13, H):
        for x in (cx - 1, cx, cx + 1):
            g[y][x] = "2" if x == cx else "1"
    g[H - 1][cx] = "D"
    return ["".join(r) for r in g]


def _torre_alvorada():
    """A Grande Biblioteca (25x15): corredores de estantes, mesas de leitura."""
    W, H = 25, 15
    g = [list("F" + "1" * (W - 2) + "F") for _ in range(H)]
    g[0] = list("F" * W)
    g[H - 1] = list("F" * W)
    for x in (3, 4, 20, 21):
        g[0][x] = "j"
    g[0][7] = ";"
    g[0][17] = ";"
    for x in (9, 10, 11, 12, 13, 14, 15):
        g[0][x] = "E"
    g[H - 1][11] = "D"
    g[H - 1][12] = "D"
    for y in (3, 6, 9):
        for x in range(3, 22):
            if x not in (8, 12, 16):
                g[y][x] = "E"
    for (mx, my) in ((6, 11), (12, 11), (18, 11)):
        g[my][mx] = "k"
        g[my + 1][mx] = "2"
    g[1][3] = ";"
    g[1][21] = ";"
    return ["".join(r) for r in g]


MAPS["torre_alvorada"] = {"rows": _torre_alvorada(), "spawns": [(12, 12), (11, 12), (13, 12)]}
MAPS["templo_estrelado"] = {"rows": _templo_estrelado(), "spawns": [(16, 29), (15, 29), (17, 29)]}








MAPS["taverna_vilalbina"] = {"rows": _taverna_vilalbina(), "spawns": [(8, 7), (7, 7), (9, 7)]}
MAPS["iscas_cais"] = {"rows": _iscas_cais(), "spawns": [(6, 5), (5, 5), (7, 5)]}
MAPS["mercado_prospera"] = {"rows": _mercado_prospera(), "spawns": [(8, 8), (7, 8), (9, 8)]}
MAPS["solar_prospera"] = {"rows": _solar_prospera(), "spawns": [(10, 10), (9, 10), (11, 10)]}


def _gotico_vespera():
    """O entorno do castelo de Varth vira um cemitério gótico: lápides, árvores
    mortas e braseiros no anel externo, entrada cerimonial com tapete de pedra."""
    rows = [list(r) for r in MAPS["vespera"]["rows"]]
    H, W = len(rows), len(rows[0])
    rng = _random_mod.Random(1408)

    def walk(x, y):
        return 0 <= x < W and 0 <= y < H and rows[y][x] in ".,d"

    def viz_livres(x, y):
        return sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if walk(x + dx, y + dy))

    # anel do cemitério em volta da massa do castelo (x55-99, y10-31)
    for y in range(7, 35):
        for x in range(51, 104):
            if not walk(x, y):
                continue
            dentro = 55 <= x <= 99 and 10 <= y <= 31
            if dentro:
                continue                       # o pátio interno fica como está
            if rng.random() < 0.07 and viz_livres(x, y) >= 3:
                r = rng.random()
                rows[y][x] = "Y" if r < 0.5 else ("T" if r < 0.8 else ";")

    # entrada cerimonial ao sul: braseiros flanqueando + tapete de pedra
    for bx in (56, 67):
        if walk(bx, 31):
            rows[31][bx] = ";"
    for ty in range(32, 36):
        for tx in range(59, 64):
            if walk(tx, ty):
                rows[ty][tx] = "p"

    MAPS["vespera"]["rows"] = ["".join(r) for r in rows]


import random as _random_mod
_gotico_vespera()


# A ARENA DO ERMO: fachada no sudeste + o ringue interior
def _build_arena():
    x0, y0 = 71, 39
    linhas = ("mmmmmmmmmmm",
              "MMMMMMMMMMM",
              "MMMMMDMMMMM",
              "ppppppppppp")
    for i, ln in enumerate(linhas):
        row = list(MAP_ROWS[y0 + i])
        for j, ch in enumerate(ln):
            row[x0 + j] = ch
        MAP_ROWS[y0 + i] = "".join(row)
_build_arena()


def _arena_int():
    """O coliseu: 21x15, arquibancadas nas bordas, o ringue no centro."""
    g = [list("F" + "1" * 19 + "F") for _ in range(15)]
    g[0] = list("F" * 21)
    g[14] = list("F" * 10 + "D" + "F" * 10)
    g[1] = list("F1" + "/" * 17 + "1F")
    for (bx, by) in ((2, 3), (18, 3), (2, 11), (18, 11)):
        g[by][bx] = ";"
    return ["".join(r) for r in g]


MAPS["arena"] = {"rows": _arena_int(), "spawns": [(10, 12), (9, 12), (11, 12)]}
INTERIOR_MAPS.add("arena")
DOOR_INTERIORS[(76, 41)] = "arena"

INTERIOR_MAPS |= set(OFICINAS_INT) | {"templo_doze"}
# as portas D da Rua dos Ofícios e o portal triplo do Templo
DOOR_INTERIORS[(44, 16)] = "oficina_ferreiro"
DOOR_INTERIORS[(44, 21)] = "oficina_coureiro"
DOOR_INTERIORS[(44, 26)] = "oficina_carpinteiro"
DOOR_INTERIORS[(44, 31)] = "oficina_alquimista"
DOOR_INTERIORS[(54, 18)] = "oficina_costureiro"
DOOR_INTERIORS[(54, 24)] = "oficina_joalheiro"
DOOR_INTERIORS[(54, 30)] = "oficina_cozinheiro"
DOOR_INTERIORS[(58, 7)] = "templo_doze"
DOOR_INTERIORS[(59, 7)] = "templo_doze"
DOOR_INTERIORS[(60, 7)] = "templo_doze"

for _d in [(4, 20), (14, 20), (3, 26), (10, 26)]:                   # Sapopemba: ainda trancadas
    DOOR_INTERIORS[(_d[0] + OX, _d[1] + OY)] = "LOCKED"




# ---- motor de passagem por borda: (mapa, borda) -> (mapa destino, x, y, facing) ----
# Voce anda ate a faixa de '+' numa borda e cai no mapa vizinho, virado pra dentro.
EDGE_LINKS = {
    "vilalbina":        {"east":  ("trigal_dourado",    4, 17, "right")},
    "trigal_dourado":   {"west":  ("vilalbina",        40, 12, "left"),
                         "east":  ("prospera",          4, 30, "right")},
    "prospera":         {"west":  ("trigal_dourado",   52, 17, "left"),
                         "north": ("vinhedo",           25, 30, "up"),
                         "east":  ("jardim_templo",      4, 27, "right"),
                         "south": ("farol_margem",      24,  3, "down")},
    "vinhedo":          {"south": ("prospera",          42,  3, "down"),
                         "west":  ("pastos",            48, 15, "left")},
    "pastos":           {"east":  ("vinhedo",            4, 16, "right")},
    "jardim_templo":    {"west":  ("prospera",          82, 30, "left"),
                         "east":  ("cidade_alta",        4, 24, "right")},
    "cidade_alta":      {"west":  ("jardim_templo",     50, 27, "left")},
    "farol_margem":     {"north": ("prospera",          43, 58, "up")},
    "ermo":             {"south": ("descampado",      50, 4,  "down"),
                         "north": ("planaltos_ermais", 60, 117, "up"),
                         "east":  ("repouso_dama",     3, 50, "right")},
    "planaltos_ermais": {"south": ("ermo",            49,  3, "down"),
                         "north": ("floresta_ermo",   75, 147, "up")},
    "floresta_ermo":    {"south": ("planaltos_ermais", 60,  2, "down"),
                         "north": ("bosque_atalech",   100, 197, "up")},
    "bosque_atalech":   {"south": ("floresta_ermo",    75,  2, "down"),
                         "north": ("umbraval",          75, 293, "up")},
    "costa_maravai":    {"north": ("brasal",            75, 145, "up")},
    "umbraval":         {"south": ("bosque_atalech",    75,   4, "down"),
                         "north": ("vespera",          115, 145, "up")},
    "vespera":          {"south": ("umbraval",         115,   4, "down")},
    "brasal":           {"west":  ("descampado",       95, 50, "left"),
                         "east":  ("goela_1",            4, 35, "right"),
                         "south": ("costa_maravai",     75,  5, "down")},
    "goela_1":          {"west":  ("brasal",           145, 75, "left"),
                         "north": ("goela_2",           35, 64, "up")},
    "goela_2":          {"south": ("goela_1",           35,  4, "down"),
                         "north": ("covil_krezath",     30, 44, "up")},
    "covil_krezath":    {"south": ("goela_2",           35,  4, "down")},
    "descampado":       {"north": ("ermo",       OX + 19, ERMO_H - 3, "up"),
                         "south": ("avasham",          49,  4, "down"),
                         "east":  ("brasal",            4, 50, "right")},
    "repouso_dama":     {"west":  ("ermo",       ERMO_W - 3, OY + 15, "left"),
                         "east":  ("valdarkram",         4, 50, "right")},
    "avasham":          {"north": ("descampado",       49, 96, "up"),
                         "south": ("cova_colosso",      50, 3,  "down")},
    "cova_colosso":     {"north": ("avasham",           50, 95, "up")},
    "mina_avhur":       {"south": ("camara_avhur",       50, 3,  "down")},
    "camara_avhur":     {"north": ("mina_avhur",         50, 95, "up")},
    "valdarkram":       {"west":  ("repouso_dama",      96, 50, "left")},
    "torre_andar1":     {"north": ("torre_andar2",      22, 43, "up"),
                         "south": ("valdarkram",        50, 58, "down")},
    "torre_andar2":     {"north": ("torre_andar3",      22, 43, "up"),
                         "south": ("torre_andar1",      22, 5,  "down")},
    "torre_andar3":     {"north": ("camara_varth",      50, 92, "up"),
                         "south": ("torre_andar2",      22, 5,  "down")},
    "camara_varth":     {"south": ("torre_andar3",      22, 5,  "down")},
    "fadrakor_litoral": {"north": ("fadrakor_selva",   50, 95, "up")},
    "fadrakor_selva":   {"south": ("fadrakor_litoral", 50, 4,  "down"),
                         "north": ("fadrakor_vulcao",  50, 95, "up")},
    "fadrakor_vulcao":  {"south": ("fadrakor_selva",   50, 4,  "down")},
}


def get_map(name):
    return MAPS.get(name) or MAPS["ermo"]


def map_rows(name):
    return get_map(name)["rows"]


def map_dims(name):
    r = map_rows(name)
    return len(r[0]), len(r)
