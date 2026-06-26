"""
OS MUNDOS SECRETOS — os reinos dos deuses, alcancados pela palavra certa dita
perto do corvo (Jeans).

Como funciona (resumo do cânone):
- O jogador DIGITA a frase no chat estando a <= 5 tiles do corvo. O match e
  EXATO nas letras, mas ignora maiuscula/minuscula e acento.
- Do Ermo, so a frase do Rasharan funciona (Rasharan e o HUB). As outras 4 so
  funcionam perto do Jeans EM Rasharan.
- O corvo pede confirmacao ("podemos ir, caro amigo?"). Valoran pede DUAS
  confirmacoes (e a casa do Pofnir, o gato branco de olhos verdes).
- A volta e por um portal-estrela -> Rasharan; de Rasharan, um portal -> Ermo.

Este modulo guarda os DADOS (frases, deuses, falas). A orquestracao (teleporte,
confirmacao, spawn) vive em app.py; os mapas, em world_map.py.
"""

import unicodedata


def norm(s):
    """Minuscula, sem acento, espacos colapsados. Base da comparacao das frases."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.lower().split())


# --- frases secretas -> destino + onde podem ser ditas ---
# "from": "ermo" (perto do corvo no Ermo) ou "rasharan" (perto do Jeans em Rasharan)
# "double": exige confirmacao dupla (Valoran)
PHRASES = {
    norm("Rasharam ma ham valan Jeans"):              {"map": "rasharan",   "from": "ermo"},
    norm("Fundamentum vacum Jeans"):                  {"map": "fundamento", "from": "rasharan"},
    norm("Fadrakor vacum malarim Jeans"):             {"map": "fadrakor",   "from": "rasharan"},
    norm("Falanor eshama ashalanore Jeans"):          {"map": "falanor",    "from": "rasharan"},
    norm("Pofnir de Valoran sempre busca um amigo"):  {"map": "valoran",    "from": "rasharan", "double": True},
}

# fala do Jeans na confirmacao dupla do Valoran
VALORAN_JEANS_LINE = ("Meu amigo, aqui e zona que nao poderei te ajudar. "
                      "Voce quer ver mesmo o Gato Branco de Olhos Verdes?")

# frase da bencao do Pofnir (dita perto do Pofnir, em Valoran): +5 de vida maxima
BLESSING_POFNIR = norm("Pofnir quer ser meu amigo")


def match_phrase(text):
    """Devolve o dict da frase se o texto bater (ignorando acento/caixa), senao None."""
    return PHRASES.get(norm(text))


# mapa de destino -> de onde a frase pode ser dita (anti-trapaca no teleporte)
FROM_OF = {v["map"]: v["from"] for v in PHRASES.values()}


def is_blessing(text):
    return norm(text) == BLESSING_POFNIR


# ===========================================================================
#  OS DEUSES NOS SEUS REINOS  (Fase 1: Rasharan + Valoran)
# ===========================================================================
# Cada deus e uma ENTIDADE grande (kind "deity") que ANDA e solta efeito ao
# andar. Campos:
#   id, name        identidade (o nome se revela: chegar aqui e descobrir o panteao)
#   form            forma do desenho: cat_white, elf, owl, crow, dog, tortoise,
#                   jaguar, dragon, orc, dwarf, cat, hare
#   size            tiles ocupados (4 a 6), conforme o poder
#   home (col,row)  centro da area dele
#   radius          quao longe perambula
#   accent          cor do efeito/realce ao andar
#   falas           ate 10 falas de lore (interagir)
#   blessing        (opcional) id da bencao que a area concede

DEITIES = {
    "valoran": [
        {
            "id": "god:pofnir", "name": "Pofnir", "form": "cat_white", "size": 6,
            "home": (50, 46), "radius": 16, "accent": "#bff7d0", "eyes": "#34d17a",
            "falas": [
                "Voce chegou ate aqui. Poucos chegam. Eu ja sabia que viria... eu sempre sei, e isso me cansa.",
                "Este lugar e o meu sossego. La fora o Ermo inteiro pesa nas minhas costas. Aqui, eu apenas sou.",
                "Eu fiz aquela dimensao pra voces. Foi um capricho meu. As vezes me arrependo, as vezes me orgulho.",
                "Voce tem cheiro de gente perdida. Quase todos tem. Nao se preocupe: perder-se faz parte.",
                "Eu prendi o Jose. Outro gato-deus na minha caixa de areia? Nao. So cabe um rei felino, e o rei sou eu.",
                "Sente isso no ar? E luz, e magia, e a minha ansiedade tambem. Tudo junto. Dificil separar.",
                "Voce nao deveria me temer. Mas deveria me respeitar. Ha uma diferenca, e ela e fina como um bigode.",
                "Procuro um amigo ha eras. Deuses nao tem amigos, sabe? So devotos. E devoto nao e amigo. Cansa.",
                "O forasteiro de roxo, o Valdris... me intriga. Mais forte que quase todos, e nem deus e. Estranho mundo o meu.",
                "Quando eu fecho os olhos, o Ermo inteiro pisca junto. Cuide pra que eu nao feche por muito tempo.",
            ],
            "blessing": "pofnir_hp",
        },
    ],
    "rasharan": [
        {
            "id": "god:valiria", "name": "Valiria", "form": "elf", "size": 5,
            "home": (50, 18), "radius": 9, "accent": "#ffe9b0",
            "patron_classes": ["clerigo", "paladino"],
            "falas": [
                "Bem-vindo a minha igreja branca. Aqui a luz nunca se apaga, nem ao meio da morte la fora.",
                "Eu sou a aurora. Quando o sol nasce no Ermo, e a minha mao que o empurra por cima do horizonte.",
                "Fiz os elfos a minha imagem: orelhas finas pra ouvir a luz, olhos pra enxergar o amanha.",
                "Cuido dos clerigos e dos paladinos. Quem cura e quem julga. As duas maos da mesma misericordia.",
                "Vargo leva os mortos por um lado; eu acendo uma vela por eles do outro. Trabalhamos juntos.",
                "Sirvo Pofnir, sim, sem vergonha. Ate a aurora precisa de um ceu pra nascer, e o ceu e dele.",
                "Voce esta ferido por dentro. Todos que chegam aqui estao. Sente-se na luz um pouco.",
                "A profecia e so a aurora vista antes da hora. Eu vejo o amanha porque eu mesma o acendo.",
                "Nao tema este cemiterio la fora. A morte aqui e mansa, vizinha minha. Eu a vejo todo dia.",
                "Se um dia empunhar a fe como arma, lembre: a chama que cura e a mesma que queima. Use com cuidado.",
            ],
            "falas_class": [
                "Voce traz a minha luz no peito, clerigo. Eu sinto. Va e cure este mundo torto por mim.",
                "Um paladino diante de mim. Seu juramento brilha. Nao o quebre, ou a aurora se apaga em voce.",
                "Filho meu de fe, ajoelhe-se nao por medo, mas por descanso. Aqui voce pode baixar o escudo.",
            ],
        },
        {
            "id": "god:nherith", "name": "Nherith", "form": "owl", "size": 4,
            "home": (28, 50), "radius": 10, "accent": "#c7b6ff",
            "patron_classes": ["bruxo"],
            "falas": [
                "Shhh. A floresta dorme. Fale baixo, ou acordara os sonhos, e nem todo sonho e gentil.",
                "Eu sou a coruja de prata. Vejo no escuro o que voces escondem ate de si mesmos.",
                "A lua e meu olho aberto. Toda noite eu vejo o Ermo dormir e deliro junto com ele.",
                "Loucura e so um sonho que esqueceu de acordar. Eu cuido dos dois: do sonho e da loucura.",
                "O de roxo, o Valdris, aquele me fascina. A loucura dele e tao bonita que da medo. Nao tiro o olho.",
                "Voce sonha comigo as vezes e nem sabe. Aquele sonho de penas e prata? Era eu, te espiando.",
                "Os bruxos fazem pacto comigo. Poder em troca de um pedaco do sono. Coleciono pesadelos alheios.",
                "A noite nao e o oposto do dia. E o avesso dele, onde as coisas verdadeiras flutuam soltas.",
                "Nao se perca na minha floresta a noite. Ou melhor: perca-se. Os melhores sonhos moram nos perdidos.",
                "Quando a lua some, eu fecho o olho. Reze pra que eu o abra de novo na noite seguinte.",
            ],
            "falas_class": [
                "Meu bruxo. O pacto pulsa em voce. Lembre: tudo que te dei, um dia eu cobro. Em sonhos.",
                "Voce alugou poder da noite. Use-o bem, ou os pesadelos vem cobrar os juros.",
            ],
        },
        {
            "id": "god:jeans", "name": "Jeans", "form": "crow", "size": 4,
            "home": (50, 82), "radius": 9, "accent": "#9b6dff",
            "falas": [
                "Ah, voce! Achou meu ninho de verdade. Aqui, no cemiterio, entre os mortos. Lugar otimo pra fofocar.",
                "Eu sou Jeans. La nos Ermos eu sou so 'o corvo'. Aqui voce sabe meu nome. Guarde-o: e segredo.",
                "Viajo todos os mundos, todas as eras. Vejo tudo. Conto quase nada. Fofoca de deus cobra seu preco.",
                "Fui eu que te trouxe ate aqui, lembra? Eu abro as portas. So preciso da palavra certa e do meu humor bom.",
                "Quer ir a outro reino? Diga a palavra perto de mim. Eu levo. Mas escolha bem: alguns deuses nao gostam de visita.",
                "Eu sei de onde o Valdris veio. Provavelmente o unico que sabe. Mas isso eu nao conto nem por mil migalhas.",
                "Os mortos daqui me contam coisas. Mortos adoram fofocar, e tem tempo de sobra. Otima companhia.",
                "Pofnir confia em mim pra guiar voces. Acha que sou inofensivo. Deixa ele achar.",
                "Cada reino tem uma palavra. Sao chaves. Eu sou a fechadura. Junte os dois e a porta abre.",
                "Cuidado em Valoran. Eu te levo, mas la dentro voce esta por sua conta. Nem eu mexo com o gato branco.",
            ],
        },
    ],
}


def deities_for(map_name):
    return DEITIES.get(map_name, [])
