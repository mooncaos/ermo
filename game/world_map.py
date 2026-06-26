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
               "/", ";", "_",
               "s", "h", "j", "f", "g", "b", "k", "P", "Q", "R", "U",
               "A", "l", "q", "N", "I", "v", "y",
               "z", "G", "Y", "B", "F", "K",
               "4", "5", "6", "&", "X", "8", "7", "J",
               "!", "$", "-"}

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
DESCAMPADO_SPAWN = [(50, 6), (49, 6), (51, 6), (50, 7)]   # logo abaixo da entrada norte


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

INTERIOR_MAPS = set(CASA_MENINAS) | {"casa_comum", "loja_armas"}   # "estou dentro de uma casa?"

# porta (x, y) no Ermo -> mapa de interior, ou "LOCKED" (comercios ainda fechados)
DOOR_INTERIORS = {pos: name for name, pos in CASA_MENINAS.items()}
DOOR_INTERIORS[(33, 20)] = "casa_comum"                              # casa do Bento
DOOR_INTERIORS[(10, 20)] = "loja_armas"                             # Armas Peteco (liberada!)
for _d in [(4, 20), (14, 20), (3, 26), (10, 26)]:                   # Sapopemba: ainda trancadas
    DOOR_INTERIORS[_d] = "LOCKED"


# ---- motor de passagem por borda: (mapa, borda) -> (mapa destino, x, y, facing) ----
# Voce anda ate a faixa de '+' numa borda e cai no mapa vizinho, virado pra dentro.
EDGE_LINKS = {
    "ermo":             {"south": ("descampado",      50, 4,  "down")},
    "descampado":       {"north": ("ermo",            20, 28, "up")},
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
