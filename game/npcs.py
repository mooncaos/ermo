"""
O ELENCO — todos os habitantes do Ermo, como DADOS.

Antes o NPC vivia grudado no Valdris. Agora cada habitante e so um registro
nesta lista (ROSTER): nome, aparencia, onde mora, se anda ou fica parado, o que
murmura sozinho, o que fala quando voce chega perto, se bloqueia passagem, e se
e do tipo que frita quem xinga por perto. Pra adicionar um novo NPC, basta
acrescentar um registro aqui. O comportamento (andar, falar, punir) e orquestrado
em app.py; o estado vivo mora em world.py; o desenho, no cliente.

Campos de cada registro:
    id, name, look        identidade e aparencia
    home (x, y)           tile alvo de onde ele perambula (ajustado p/ passavel)
    radius                quao longe de casa ele anda (tiles, Chebyshev)
    wanders               True = perambula, False = fica parado
    step_every            segundos entre os passos
    solid                 True = bloqueia passagem; False = da pra atravessar
    kind                  "person" ou "bird" (decide o desenho no cliente)
    murmurs               falas soltas (sozinho)
    murmur_min/max        intervalo do murmurio (s)
    greetings             falas ao interagir (voce chega perto e fala)
    smiter                True = frita quem xinga perto (so o Valdris)
    smite_lines           o que ele diz ao fritar (so se smiter)
"""

from . import valdris

# Re-exporta a deteccao de palavrao pra rede (mora no valdris.py).
contains_curse = valdris.contains_curse


# --------------------------------------------------------------- Bento (campones)
# Nativo do Ermo: nasceu no barro como o pai e o avo. Cuida de um pedaco de terra
# sob o sol torto. Ja viu forasteiros cairem do ceu por anos (o Valdris e o mais
# novo) sempre perguntando como sair. Pra ele nao tem sair: o Ermo e o mundo, o
# unico. Cansado do trabalho e de ver os perdidos, mas gente boa, sabedoria de
# roca e humor seco. Fez as pazes: e duro, mas e o lar.

BENTO_MURMURS = [
    "a terra aqui e boa. teimosa, mas boa.",
    "outro dia o sol nasceu torto de novo. a gente se acostuma.",
    "trigo nao pergunta de onde veio. so cresce. devia aprender com ele.",
    "meu avo plantou aqui, meu pai plantou aqui. eu planto aqui.",
    "dizem que tem outros mundos. eu tenho esse pedaco de chao, ta bom pra mim.",
    "o corvo de novo nas espigas. some daqui, ladrao de pena.",
    "chuva boa essa semana. o Ermo e duro, mas nao e ingrato.",
    "uns caem do ceu. eu nasci no barro. cada um com a sua.",
    "do sol nascer ao sol se por. so que aqui o sol faz o que quer.",
    "o de roxo passou de novo, falando sozinho. coitado, ainda procura.",
]

BENTO_GREETINGS = [
    "salve, viajante. veio de longe ou caiu do ceu como os outros?",
    "se ta perdido, senta um pouco. a pressa nao acha saida nenhuma.",
    "uns chegam aqui achando que e castigo. e so um lugar, moco. da pra viver.",
    "ta com fome? trigo eu tenho de sobra, se quiser.",
    "o de roxo, o Valdris, te encheu de pergunta? ele e assim. bom sujeito, so inquieto.",
    "nao sei como voce chegou, nem como sair. mas sei plantar. precisa de ajuda, e so falar.",
    "fica a vontade pela vila. so nao pisa no meu trigo... brincadeira, pode pisar, ele aguenta.",
    "ja vi muita gente perdida passar por aqui. quase ninguem acha a saida. mas muita gente acha sossego.",
]


# ------------------------------------------------------------------ o corvo
# Criptico, sabido, meio assombroso-zoeiro. Parece que viu tudo e zomba um
# pouco. Fica empoleirado na linha de arvores do leste, coladinho no trigo, da
# uns pulinhos, murmura raramente. As vezes so um "cras". Easter egg do proprio
# murmurio do Valdris ("se um corvo falar comigo, vou fingir que nao entendi").

CORVO_MURMURS = [
    "vi voce chegar. vi todos chegarem.",
    "o de roxo procura a porta. nao tem porta. cras.",
    "tem migalha?",
    "as espigas contam segredo. eu escuto. nao conto.",
    "cras.",
    "um, dois, muitos. todos caem. nenhum sobe.",
    "o velho de roxo tem oitocentos anos e ainda nao me deu migalha.",
    "eu estava aqui antes do caminho. estarei depois.",
    "cras... cras...",
    "o campones me xinga. o campones tambem nao vai embora.",
]

CORVO_GREETINGS = [
    "fala comigo? entao responde: pra onde vai o vento quando para?",
    "voce quer a saida. todos querem. eu quero migalha. um de nos vai se decepcionar.",
    "te conheco. ainda nao, mas vou. cras.",
    "o de roxo pergunta como sair. voce devia perguntar por que entrou.",
    "sem migalha, sem profecia. sao as regras.",
    "cras. (ele te encara com um olho so.)",
]


# ===================== Beth Cuzcuz (cabaré no nordeste) =====================
# Bolsao urbano aberto no meio do mato. A casa de quem caiu no Ermo e seguiu a
# vida: a Beth, senhora nordestina dona do cabare, e o espelho exato do Valdris
# (ele caiu e procura a saida sem parar; ela caiu, levantou e botou o cabare pra
# rodar). Tom boemio/noir, falas sugestivas, nada explicito; figuras adultas.

BETH_MURMURS = [
    "ai, esses Ermo... mas o movimento nao para, gracas a Deus.",
    "Rodolfo! oia a fila ai, meu fio.",
    "no Sao Joao la da terra e que era bom. mas aqui tambem se ajeita.",
    "cabare bom nao dorme, meu rei.",
    "cai nesse fim de mundo e fiz o que sabia fazer. ponto final.",
]
BETH_GREETINGS = [
    "o meu rei, senta ai. num sei como vim parar nesses Ermo, mas bordel bom a gente abre em qualquer canto.",
    "perdido? rapaz, todo mundo aqui caiu sem querer. eu cai, levantei e botei o cabare pra rodar. a vida segue.",
    "minhas menina e tratada com respeito, viu? quem esquecer, o Rodolfo bota na memoria.",
    "isso aqui e um pedacinho do meu Nordeste no meio do nada. fica a vontade, mas se comporta.",
]

RODOLFO_MURMURS = [
    "fila andando. sem empurrao.",
    "olho em todo mundo. todo mundo.",
    "o chefe e a Beth. e o que a Beth manda, eu faco.",
]
RODOLFO_GREETINGS = [
    "Ta olhando o que? Entra logo ou sai da fila!",
    "Se arrumar confusao aqui na porta, eu arrumo uma maior!",
    "O chefe mandou barrar, entao ta barrado. Reclama com as estrelas!",
]

DIDI_MURMURS = [
    "ja quebrei uns quinze hoje. ontem. esses dias.",
    "trabaia cansa. fico aqui de butuca so, viu.",
    "meu irmao e o forte. eu sou o inteligente. e o bonito.",
]
DIDI_GREETINGS = [
    "Se veio causar problema, pega a senha e entra na fila!",
    "To de mau humor hoje. Na verdade, todo dia.",
    "Voce tem ingresso ou so coragem mesmo?",
]

DALIA_MURMURS = [
    "a noite e uma crianca...",
    "todo mundo que entra aqui procura alguma coisa. eu acho rapidinho o que e.",
]
DALIA_GREETINGS = [
    "o quem chegou. senta aqui, forasteiro, que do meu lado a noite passa devagarinho.",
    "demorou pra aparecer. eu nao, eu tava te esperando.",
]

MARLENE_MURMURS = [
    "sera que ainda tem mundo la fora? deixa, nao quero saber.",
    "a musica boa e a triste. as outras a gente danca so pra esquecer.",
]
MARLENE_GREETINGS = [
    "todo perdido do Ermo passa por aqui uma vez. uns procuram a saida a noite toda. eu ja desisti, fico bem na fumaca.",
    "senta. fica. la fora nao tem nada que aqui dentro nao console melhor.",
]

CLEIDE_MURMURS = [
    "que figura essa que entrou agora... credo.",
    "se eu ganhasse moeda por cada folgado, ja tava rica.",
]
CLEIDE_GREETINGS = [
    "veio gastar moeda ou gastar meu tempo? um desses eu nao tenho de sobra.",
    "o, espelho e na parede. quer me olhar de perto, tem preco.",
]

JOSE_MURMURS = [
    "ronrom... (ele te observa sumindo aos poucos na fumaca roxa.)",
    "vi o velho de roxo procurando a saida. nao contei a ele. nao vou contar a voce.",
    "todo gato preto da azar, dizem. eu dou respostas. pior, talvez.",
    "a Beth caiu e ficou. o Valdris caiu e nao para de procurar. eu? eu sempre estive aqui.",
]
JOSE_GREETINGS = [
    "As respostas sao como peixes: quanto mais voce aperta, mais rapido elas escapam.",
    "Eu poderia lhe contar a verdade... mas ela e tao sem graca que prefiro inventar algo melhor.",
    "No Beth Cuzcuz, todo mundo tem um segredo. Os espertos escondem o proprio. Os tolos escondem o dos outros.",
    "Procura resposta? Tenho muitas. O preco as vezes e uma moeda, as vezes um favor, as vezes uma boa historia. Hoje... me conta uma.",
]


# ===================== Itatinga do Gui (vila no noroeste) =====================
# Vilarejo de casinhas em volta da taverna-hotel. Dois moradores marcantes: o
# Guilherme, que so encara em silencio, e a Maria Cachorra, rainha do crime do
# mapa inicial. Exceto o Valdris, ninguem e tao poderoso quanto ela: e a unica,
# fora dele, com poder de expulsar (mandar pro spawn) quem desacata na quebrada.
# O castigo dela e vermelho-sangue, nao o roxo cosmico do Valdris.

# --- Guilherme Indio: o mudo que so te encara (sem caricatura; "Indio" e apelido) ---
GUI_MURMURS = [
    "(ele encara o vazio)",
    "(um sorriso lento se abre)",
    "(ele nao pisca faz um tempo)",
    "(a cabeca tomba de leve pro lado)",
]
GUI_GREETINGS = [
    "...",
    "(ele te encara em silencio)",
    "(o sorriso nao muda)",
    "(ele continua te olhando, sem piscar)",
    "(ele inclina a cabeca, devagar, sem dizer nada)",
]

# --- Maria Cachorra: a rainha do crime (giria de morro) ---
MARIA_MURMURS = [
    "essa quebrada e minha de ponta a ponta. ninguem respira sem eu deixar.",
    "o veio de roxo la no meio... esse e o unico que eu nao mexo. cada um no seu quadrado.",
    "cade meu bonde que sumiu... bando de vagabundo.",
    "to de olho em todo mundo. ate no maluco que fica encarando ali.",
    "respeito e tudo. quem nao tem, aprende na marra.",
    "salve, salve. a patroa ta na area.",
]
MARIA_GREETINGS = [
    "salve, forasteiro. tu ta pisando na MINHA quebrada, ta ligado?",
    "novato? aqui tu anda na linha ou tu nao anda mais. simples assim.",
    "o, eu sou a lei aqui no Itatinga. o Gui que diga... ah nao, o Gui nao diz nada. mas eu digo.",
    "que o que na minha area? cuidado com o papo, que aqui quem manda no bonde sou eu.",
    "tu e cria de onde, hein? nunca te vi. fica esperto que eu to de olho.",
    "pedagio e na entrada, mane. mas pra tua cara eu abro excecao... hoje.",
]
MARIA_SMITE = [
    "Falou o QUE na minha quebrada?! Some daqui, mane!",
    "Desacato na minha area?! Ta EXPULSO, vacilao!",
    "Aqui quem da as ordem sou eu. Roda fora!",
    "Boca suja na MINHA cara? Pega teu corre e some!",
]


# ------------------------------------------------------------------- o elenco

ROSTER = [
    {
        "id": valdris.NPC_ID,
        "name": valdris.NPC_NAME,
        "look": {"skin": "#f1c9a5", "cloak": "#9b6dff", "hood": "up",
                 "hat": "none", "hair": "#2a2233", "staff": False},
        "home": (20, 12),
        "radius": 5,
        "wanders": True,
        "step_every": 0.8,
        "solid": True,
        "kind": "person",
        "murmurs": valdris.MURMURS,
        "murmur_min": 15, "murmur_max": 20,
        "greetings": valdris.GREETINGS,
        "smiter": True,
        "smite_lines": valdris.SMITE_LINES,
        "smite_color": "#9b6dff",
    },
    {
        "id": "npc:bento",
        "name": "Bento",
        "look": {"skin": "#c68642", "cloak": "#f4b860", "hood": "down",
                 "hat": "cap", "hair": "#5a3f28", "staff": False},
        "home": (33, 23),           # no meio do trigo, na frente da casa dele (SE)
        "radius": 4,
        "wanders": True,
        "step_every": 1.1,
        "solid": True,
        "kind": "person",
        "murmurs": BENTO_MURMURS,
        "murmur_min": 16, "murmur_max": 24,
        "greetings": BENTO_GREETINGS,
        "smiter": False,
    },
    {
        "id": "npc:corvo",
        "name": "corvo",
        "look": {"skin": "#2a2233", "cloak": "#1c1a26", "hood": "down",
                 "hat": "none", "hair": "#2a2233", "staff": False},
        "home": (38, 24),           # empoleirado na linha de arvores do leste
        "radius": 1,                # so uns pulinhos no lugar
        "wanders": True,
        "step_every": 2.6,          # bem devagar
        "solid": False,             # da pra atravessar (e miudo)
        "kind": "bird",
        "murmurs": CORVO_MURMURS,
        "murmur_min": 22, "murmur_max": 36,
        "greetings": CORVO_GREETINGS,
        "smiter": False,
    },
    {
        "id": "npc:beth", "name": "Beth",
        "look": {"skin": "#8d5524", "cloak": "#e85d75", "hood": "down",
                 "hat": "none", "hair": "#cfc7bf", "staff": False},
        "home": (28, 7), "radius": 0, "wanders": False, "step_every": 1.5,
        "solid": True, "kind": "person",
        "murmurs": BETH_MURMURS, "murmur_min": 16, "murmur_max": 24,
        "greetings": BETH_GREETINGS, "smiter": False,
    },
    {
        "id": "npc:rodolfo", "name": "Rodolfo",
        "look": {"skin": "#c68642", "cloak": "#4a4640", "hood": "down",
                 "hat": "none", "hair": "#2a2233", "staff": False},
        "home": (27, 7), "radius": 0, "wanders": False, "step_every": 1.5,
        "solid": True, "kind": "person",
        "murmurs": RODOLFO_MURMURS, "murmur_min": 20, "murmur_max": 30,
        "greetings": RODOLFO_GREETINGS, "smiter": False,
    },
    {
        "id": "npc:didi", "name": "Didi",
        "look": {"skin": "#c68642", "cloak": "#5a4a3a", "hood": "down",
                 "hat": "cap", "hair": "#2a2233", "staff": False},
        "home": (29, 7), "radius": 0, "wanders": False, "step_every": 1.5,
        "solid": True, "kind": "person",
        "murmurs": DIDI_MURMURS, "murmur_min": 18, "murmur_max": 26,
        "greetings": DIDI_GREETINGS, "smiter": False,
    },
    {
        "id": "npc:dalia", "name": "Dalia",
        "look": {"skin": "#e8b58c", "cloak": "#f49ad0", "hood": "down",
                 "hat": "none", "hair": "#2a2233", "staff": False},
        "home": (27, 8), "radius": 1, "wanders": True, "step_every": 1.4,
        "solid": True, "kind": "person",
        "murmurs": DALIA_MURMURS, "murmur_min": 17, "murmur_max": 26,
        "greetings": DALIA_GREETINGS, "smiter": False,
    },
    {
        "id": "npc:marlene", "name": "Marlene",
        "look": {"skin": "#f1c9a5", "cloak": "#9b6dff", "hood": "down",
                 "hat": "none", "hair": "#2a2233", "staff": False},
        "home": (29, 8), "radius": 1, "wanders": True, "step_every": 1.5,
        "solid": True, "kind": "person",
        "murmurs": MARLENE_MURMURS, "murmur_min": 18, "murmur_max": 28,
        "greetings": MARLENE_GREETINGS, "smiter": False,
    },
    {
        "id": "npc:cleide", "name": "Cleide",
        "look": {"skin": "#c68642", "cloak": "#f4b860", "hood": "down",
                 "hat": "none", "hair": "#2a2233", "staff": False},
        "home": (31, 8), "radius": 1, "wanders": True, "step_every": 1.4,
        "solid": True, "kind": "person",
        "murmurs": CLEIDE_MURMURS, "murmur_min": 17, "murmur_max": 26,
        "greetings": CLEIDE_GREETINGS, "smiter": False,
    },
    {
        "id": "npc:jose", "name": "Jose",
        "look": {"skin": "#15151b", "cloak": "#15151b", "hood": "down",
                 "hat": "none", "hair": "#15151b", "staff": False},
        "home": (32, 10), "radius": 2, "wanders": True, "step_every": 2.2,
        "solid": False, "kind": "cat",
        "murmurs": JOSE_MURMURS, "murmur_min": 20, "murmur_max": 32,
        "greetings": JOSE_GREETINGS, "smiter": False,
    },
    {
        "id": "npc:guilherme", "name": "Guilherme Indio",
        "look": {"skin": "#e8b58c", "cloak": "#6a6356", "hood": "down",
                 "hat": "none", "hair": "#2a2233", "staff": False},
        "home": (12, 12), "radius": 0, "wanders": False, "step_every": 1.5,
        "solid": True, "kind": "person", "gazes": True,
        "murmurs": GUI_MURMURS, "murmur_min": 14, "murmur_max": 22,
        "greetings": GUI_GREETINGS, "smiter": False,
    },
    {
        "id": "npc:maria", "name": "Maria Cachorra",
        "look": {"skin": "#c68642", "cloak": "#c0392b", "hood": "down",
                 "hat": "cap", "hair": "#2a2233", "staff": False},
        "home": (9, 8), "radius": 7, "wanders": True, "step_every": 1.0,
        "solid": True, "kind": "person",
        "murmurs": MARIA_MURMURS, "murmur_min": 15, "murmur_max": 22,
        "greetings": MARIA_GREETINGS,
        "smiter": True, "smite_lines": MARIA_SMITE, "smite_color": "#e24b4a",
    },
]
