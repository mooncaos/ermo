"""
================================================================================
  A LORE SECRETA DO ERMO  -  biblia de cânone do mestre
================================================================================

ISTO E SEGREDO. Nada aqui e enviado pro cliente nem aparece pro jogador. E o
registro vivo da mitologia do mundo: serve de fonte da verdade pra escrever
falas, eventos e atualizacoes futuras com coerencia. Este modulo nao e
importado por nenhuma logica de jogo; ele so guarda o cânone.

Regra de ouro da revelacao: os jogadores NAO sabem que os deuses existem. No
maximo ouvem sussurros, veem uma aparicao rara, ou cruzam com os tres mortais
que sabem de tudo (e que falam disso de um jeito que ninguem leva a serio).
"""

# -----------------------------------------------------------------------------
#  HIERARQUIA DE PODER  (segredo)
# -----------------------------------------------------------------------------
# Pofnir (supremo)  >  Valdris (forasteiro, fora dos 12)  >  os outros 11 deuses
#                                                          >  Maria Cachorra (a
#                                                             mortal mais forte)
#                                                          >  os demais mortais
#
# Motivo do panteao: os deuses mais fortes sao GATOS (mas nem todo deus e bicho).

PODER = {
    "supremo": "Pofnir",
    "forasteiro_acima_dos_11": "Valdris",   # NAO e um dos 12
    "mortal_mais_forte": "Maria Cachorra",
    "motivo": "os deuses mais fortes sao gatos; nem todo deus e animal.",
}

# -----------------------------------------------------------------------------
#  O FORASTEIRO  (segredo) - nao e um dos 12 deuses
# -----------------------------------------------------------------------------
VALDRIS = {
    "nome": "Valdris",
    "o_que_e": "um forasteiro de outro mundo, nao nasceu no Ermo.",
    "poder": "o ser mais forte de todos abaixo do Pofnir; mais forte que os 11 "
             "outros deuses. Fica abaixo so do Pofnir.",
    "indole": "excentrico cosmico (criptico, brincalhao, confiante). Para os "
              "proprios deuses, essa excentricidade parece uma forma de loucura.",
    "regiao": "confinado ao sudeste do mapa.",
    "quem_nao_o_teme": ["Jose", "o corvo", "Maria Cachorra"],
    "obs": "todo o resto do mundo o teme. O corvo provavelmente e o unico que "
           "sabe de onde ele veio (viaja por todos os mundos e eras).",
}

# -----------------------------------------------------------------------------
#  OS 12 DEUSES  (segredo)
# -----------------------------------------------------------------------------
# Cada um: epiteto, dominio, forma, indole, relacoes, e (se houver) o povo que
# criou a sua semelhanca.

PANTEAO = [
    {
        "id": "pofnir",
        "nome": "Pofnir",
        "epiteto": "o Ansioso",
        "dominio": ["crianca", "magia", "luz", "ansiedade"],
        "forma": "um Maine Coon branco.",
        "supremo": True,
        "indole": "o mais poderoso de todos; tem poder total sobre a dimensao do "
                  "Ermo e muito poder mesmo em outras. Se porta como um gato "
                  "ansioso, mas divino: vigia, controla e sela quem cresce demais.",
        "relacoes": "selou o Jose por nao aceitar outro deus-gato quando o Jose "
                    "ascendeu. Nao consegue apressar nem assustar o Martur, nem "
                    "alcancar o Nhare. Equilibra-se com o Vargo (vida x morte).",
        "aparicao": "e o unico que se manifesta no jogo por enquanto, de noite, "
                    "como 'O Gato Branco e Grande' (some quando alguem se aproxima).",
    },
    {
        "id": "jose",
        "nome": "Jose",
        "epiteto": "Mestre Cuscuz",
        "dominio": ["prazeres", "pecados"],
        "forma": "um gato preto (selado nessa forma pelo Pofnir).",
        "indole": "vive no cabare, no meio do vicio, do jogo e da carne. Criptico, "
                  "sorriso de cheshire, fumaca roxa.",
        "relacoes": "ascendeu como deus-gato e foi selado pelo Pofnir por ciume. "
                    "Reconhece o corvo de longe (os dois sabem que sao deuses). "
                    "Nao teme o Valdris. A Beth e a unica mortal que desconfia que "
                    "ele e mais que um gato.",
    },
    {
        "id": "corvo",
        "nome": "o Corvo",
        "epiteto": None,
        "dominio": ["dimensoes"],
        "forma": "sempre foi um corvo (forma natural, nao e prisao).",
        "indole": "viaja sem restricao por qualquer lugar, mundo e era. Fica "
                  "empoleirado vendo a vida dos mortais por diversao; fofoqueiro "
                  "com quem confia.",
        "relacoes": "provavelmente o unico que sabe de onde o Valdris veio. Nao o "
                    "teme (pode sumir pra qualquer dimensao). Forma com o Martur a "
                    "dupla que sabe de tudo: o corvo conhece todo lugar, o Martur "
                    "conhece todo tempo. Cinico e criptico com o Bento.",
    },
    {
        "id": "nhare",
        "nome": "Nhare",
        "epiteto": "a Lebre de Mil Saidas",
        "dominio": ["fuga", "sorte", "segundas chances"],
        "forma": "uma lebre branca e cinza, de olhos calmos, sempre meio de lado.",
        "indole": "deus de quem esta encurralado e mesmo assim escapa. Sereno, "
                  "brincalhao, nunca preso.",
        "relacoes": "o Pofnir e o Jose nunca o alcancaram, o que irrita o Pofnir. "
                    "E a unica coisa no Ermo que o supremo nao controla. O corvo o "
                    "respeita de longe (dois que ninguem prende).",
    },
    {
        "id": "vargo",
        "nome": "Vargo",
        "epiteto": "o Cao do Umbral",
        "dominio": ["morte", "passagem"],
        "forma": "um cao preto imenso, parado na soleira entre os mundos.",
        "indole": "paciente e inevitavel, nunca cruel. E o cao pro reino dos gatos.",
        "relacoes": "equilibrio com o Pofnir (vida x morte). Anda ao lado da Maria "
                    "Cachorra (a morte no calcanhar dela) depois que ela largou o "
                    "Korgath; por isso ela nao teme nada.",
    },
    {
        "id": "martur",
        "nome": "Martur",
        "epiteto": "o Jabuti das Eras",
        "dominio": ["tempo", "memoria", "paciencia"],
        "forma": "um jabuti antiquissimo, cujo casco e uma colina do mundo.",
        "indole": "lembra de tudo que ja foi, em toda era. O oposto do Pofnir.",
        "relacoes": "o unico que o Pofnir nao apressa nem assusta (ja viu esse fim "
                    "mil vezes). Forma com o corvo a dupla do tudo (tempo + espaco). "
                    "Lembra de cada mundo que o Valdris deixou pra tras.",
    },
    {
        "id": "facalan",
        "nome": "Facalan",
        "epiteto": "a Onca Sem Dono",
        "dominio": ["mato", "caca", "instinto"],
        "forma": "uma onca selvagem.",
        "indole": "nao se curva a deus nenhum, nem ao Pofnir. So respeita forca "
                  "bruta. E o gato selvagem (o Pofnir e o gato domestico supremo).",
        "relacoes": "cisma com o Valdris e com a Maria (forca). Despreza a moleza "
                    "do cabare do Jose.",
    },
    {
        "id": "valiria",
        "nome": "Valiria",
        "epiteto": "a Serena",
        "dominio": ["fogo", "cura", "divinacao", "alvorecer"],
        "forma": "tem aspecto de elfa.",
        "indole": "serena e pacifica; padroeira dos clerigos e paladinos.",
        "relacoes": "serve ao Pofnir. Tem receio do Valdris e sabe que, abaixo do "
                    "Pofnir, ele e o mais poderoso, mesmo com a insanidade dele.",
        "povo": "todos os elfos do Ermo foram criados a semelhanca dela.",
    },
    {
        "id": "bragor",
        "nome": "Bragor",
        "epiteto": "o Forjador",
        "dominio": ["forja", "pedra", "oficio", "juramentos"],
        "forma": "tem aspecto de anao.",
        "indole": "teimoso, firme, um fazedor. Artesao respeita ordem.",
        "relacoes": "serve ao Pofnir.",
        "povo": "os anoes foram feitos a imagem dele.",
    },
    {
        "id": "drazun",
        "nome": "Drazun",
        "epiteto": "o Dragao Primevo",
        "dominio": ["dragoes", "escamas", "fogo primevo", "ambicao"],
        "forma": "um dragao antiquissimo.",
        "indole": "orgulhoso, dorme sobre poder, ganancioso.",
        "relacoes": "curva-se ao Pofnir a contragosto.",
        "povo": "os draconatos sao a cria dele, feitos a sua semelhanca; kobolds e "
                "povo-lagarto ecoam ele de longe.",
    },
    {
        "id": "korgath",
        "nome": "Korgath",
        "epiteto": "o Punho",
        "dominio": ["guerra", "furia", "forca"],
        "forma": "tem aspecto de orc.",
        "indole": "brutal mas honesto; despreza covarde.",
        "relacoes": "respeita a Facalan (o selvagem). AMA a Maria Cachorra, sua "
                    "sacerdotisa que desistiu dele; ela e indiferente a ele.",
        "povo": "os orcs e meio-orcs nasceram dele.",
    },
    {
        "id": "nherith",
        "nome": "Nherith",
        "epiteto": "a Coruja da Lua",
        "dominio": ["noite", "sonhos", "lua", "loucura"],
        "forma": "uma coruja prateada.",
        "indole": "vela o sono e os pressagios.",
        "relacoes": "tem receio do Valdris como os outros, mas uma fascinacao "
                    "morbida por ele: ele e a coisa mais louca de todos os mundos, "
                    "e loucura e o reino dela.",
    },
]

# deuses que criaram povos jogaveis (gancho de raca <-> deus)
PROGENITORES = {
    "elfos": "Valiria",
    "anoes": "Bragor",
    "draconatos": "Drazun",
    "orcs": "Korgath",
}

# -----------------------------------------------------------------------------
#  MORTAIS E SEGREDOS LIGADOS AO PANTEAO  (segredo)
# -----------------------------------------------------------------------------
MORTAIS = {
    "Maria Cachorra": {
        "o_que_e": "a mortal mais forte do Ermo.",
        "nivel": "quando houver level, ela fica ~50% acima do level maximo dos "
                 "jogadores.",
        "deuses": "foi sacerdotisa do Korgath (guerra) e desistiu dele; ele a ama, "
                  "ela e indiferente. Anda com o Vargo (a morte) no calcanhar; por "
                  "isso e a 'Cachorra' e nao teme nem o Valdris.",
        "sabe_dos_deuses": True,
    },
    "Beth": {
        "o_que_e": "senhora nordestina, dona do cabare; caiu no Ermo, como o Valdris.",
        "deuses": "e a unica que desconfia que o Jose (o gato) e mais que um gato. "
                  "Teme o Valdris, com respeito. Rivaliza com a Maria (rainhas de "
                  "casas diferentes).",
        "sabe_dos_deuses": False,
    },
    "Bento": {
        "o_que_e": "lavrador, vizinho do Valdris no sudeste.",
        "deuses": "sabe tudo sobre os deuses. Convive com o corvo (que ele acha "
                  "que e so um corvo esquisito) e teme o Valdris.",
        "sabe_dos_deuses": True,
    },
    "Dona Chica": {
        "o_que_e": "velha de Sapopemba que se apresenta como 'Lucrecia' e fala "
                   "coisas desconexas.",
        "deuses": "sabe tudo sobre os deuses; a tagarelice 'sem nexo' dela e, na "
                  "real, conhecimento divino que ninguem entende.",
        "sabe_dos_deuses": True,
    },
}

# os tres mortais que conhecem o panteao inteiro
SABEDORES = ["Maria Cachorra", "Bento", "Dona Chica"]

# -----------------------------------------------------------------------------
#  MANIFESTACOES NO JOGO  (o que o jogador pode, de fato, cruzar)
# -----------------------------------------------------------------------------
APARICOES = {
    "O Gato Branco e Grande": {
        "quem_e_de_verdade": "Pofnir (segredo).",
        "quando": "de noite, raramente.",
        "comportamento": "anda pelo mapa e SOME assim que qualquer jogador chega "
                         "perto. Os jogadores nao sabem que e um deus.",
    },
    # os outros 11 deuses ficam so na lore por enquanto.
}

# -----------------------------------------------------------------------------
#  O CORVO  -  nome secreto e papel de guia  (segredo)
# -----------------------------------------------------------------------------
# O corvo (deus das dimensoes, ver os 12) tem um NOME VERDADEIRO que os jogadores
# nunca sabem: JEANS. Alem de deus-fofoqueiro que viaja todos os mundos, ele e o
# GUIA do sistema de classes: e o primeiro a abrir dialogo com quem nasce, fala
# do Salao das Classes e abre o portal pra la. Esta ACIMA do sistema (nao
# patrocina classe nenhuma).
CORVO = {
    "nome_publico": "Corvo",
    "nome_secreto": "Jeans",
    "papel": "guia do sistema de classes; abre o portal pro Salao.",
    "deus_de": "dimensoes (um dos 12).",
}

# -----------------------------------------------------------------------------
#  O SALAO DAS CLASSES  -  mapa separado, 12 mestres  (semi-segredo)
# -----------------------------------------------------------------------------
# Mapa proprio ("salao"), alcancado pelo portal do corvo. Cada uma das 12 classes
# oficiais de D&D 5e tem um mestre, e cada mestre serve um DEUS (cosmologia). O
# Mago e o unico SEM deus: serve ao cosmo e aos livros. Vargo (morte) e o corvo
# NAO patrocinam classe (o corvo guia; Vargo fica pra uma subclasse de morte).
CLASSE_DEUS = {
    "Barbaro": "Korgath",      # furia/guerra
    "Guerreiro": "Bragor",     # forja/disciplina
    "Paladino": "Valiria",     # luz/juramento
    "Ladino": "Nhare",         # sorte/fuga
    "Monge": "Martur",         # paciencia/tempo
    "Patrulheiro": "Facalan",  # caca/mato
    "Mago": None,              # NENHUM: o cosmo e os livros
    "Feiticeiro": "Drazun",    # sangue draconico
    "Bruxo": "Nherith",        # pacto/lua/loucura
    "Bardo": "Jose",           # prazer/arte/palco
    "Clerigo": "Valiria",      # cura/luz
    "Druida": "Facalan",       # natureza selvagem
}
