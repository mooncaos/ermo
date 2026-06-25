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
    "T...................=..T.....T......T..T",
    "T................,..=...,T.......,T..T.T",
    "T...............,...=.T............T.T.T",
    "T....^^^^...........=.....mmmmmm.....T.T",
    "T....HHHH.....,.....=.....MMMMMM....T..T",
    "T....HDHH..,,...,...=.....MMEMMM.....T.T",
    "T.................,.=....LpppppppL..T..T",
    "T...................=.....ppppppp....T.T",
    "T..,...:..........,.=..........pp....T.T",
    "T...................=..........pp...T..T",
    "T.............^^^^..=..........pp....T.T",
    "T.............HHHH..=...,......pp....T.T",
    "T.............HDHH..=.T........pp.,.T..T",
    "T........,..........=..T.......pp......T",
    "T======================================T",
    "T..........,....:...=...........:......T",
    "T..:...........,.,..=..:...............T",
    "T......:............=...~~~~~...^^^^...T",
    "T.,:................=..~~~~~~~..HHHH...T",
    "T...................=..~~~~~~~..HDHH...T",
    "T...............,...=.~~~~~~~~~wwwwwww.T",
    "T...................=..~~~~~~~.wwwwwww.T",
    "T.....:...,.........=..~~~~~~~.wwwwwww.T",
    "T.....^^^^..........=...~~~~~..wwwwwww.T",
    "T.....HHHH..........=.......,..wwwwwww.T",
    "T.....HHDH..........=..........wwwwwww.T",
    "T......,......,.....=..................T",
    "T...................=..................T",
    "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
]

# Tiles que bloqueiam passagem.
SOLID_CHARS = {"~", "T", "#", "^", "H", "M", "m", "L"}

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
