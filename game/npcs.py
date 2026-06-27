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
    "o de roxo, o Valdris, te encheu de enigma? ele e assim. bom sujeito, excentrico que so ele.",
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
    "a Beth caiu e ficou. o Valdris ficou pro lado do sudeste, excentrico do jeito dele. eu? eu sempre estive aqui.",
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
    "o cara de roxo la pro sudeste... esse e o unico que eu nao mexo. cada um no seu quadrado.",
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
        "home": (27, 27),
        "radius": 6,
        "wanders": True,
        "step_every": 0.8,
        "solid": True,
        "kind": "person",
        "gender": "H",
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


# === As 9 meninas de Itatinga do Gui (valor em BRONZE, pra economia futura) ===
# So as 3 primeiras entram agora (active=True), espalhadas perto da Maria. As
# outras 6 ficam active=False: criadas e dormentes, prontas pra soltar quando a
# gente fizer a moeda (provavelmente morando dentro das casas, junto com os
# interiores que vem com a Sapopemba). O campo "bronze" ja fica guardado.
ITATINGA_MENINAS = [
    {"name": "Melissa", "bronze": 500, "desc": "ruiva natural, tracos marcantes (favorita da zona)",
     "skin": "#f1c9a5", "hair": "#b5533a", "cloak": "#e85d75", "home": (10, 6), "active": True,
     "greet": ["o, a favorita da zona em pessoa. eu custo o meu valor, e valho cada bronze, viu?",
               "ruiva de verdade, dessas que nao se acha em outro mundo. mas aqui, com bronze, se acha."],
     "murmur": ["numero um da quebrada. a Maria que confirma.", "ser a favorita cansa, mas paga bem."]},
    {"name": "Yasmin", "bronze": 450, "desc": "padrao VIP, tracos simetricos, alta procura",
     "skin": "#e8b58c", "hair": "#2a2233", "cloak": "#c9a0ff", "home": (6, 10), "active": True,
     "greet": ["padrao VIP, meu bem. tem fila, mas pra quem tem bronze a fila anda.",
               "alta procura por aqui. capricha no bronze que eu capricho em voce."],
     "murmur": ["tanta gente querendo, e tao pouco bronze rolando..."]},
    {"name": "Valentina", "bronze": 400, "desc": "loira, estilo capa de revista",
     "skin": "#f1c9a5", "hair": "#e3b347", "cloak": "#7cc4f4", "home": (13, 10), "active": True,
     "greet": ["loira de capa de revista, e olha que aqui nem revista tem. sortudo, ne?",
               "elegancia tem preco, e o meu ta na tabela. paga em bronze."],
     "murmur": ["esse fim de mundo nao merece tanto glamour. mas paga bem."]},
    {"name": "Isabelle", "bronze": 350, "desc": "morena iluminada, simpatia e elegancia",
     "skin": "#c68642", "hair": "#2a2233", "cloak": "#f49ad0", "home": (5, 7), "active": False,
     "greet": ["oi, sumido. morena com simpatia e raro de achar, ainda mais nesses Ermo.",
               "elegancia e um sorriso, e o que eu ofereco. o bronze a gente combina."],
     "murmur": ["simpatia tambem e trabalho, viu."]},
    {"name": "Giovanna", "bronze": 300, "desc": "alternativa, tatuada e estilosa",
     "skin": "#e8b58c", "hair": "#2a2233", "cloak": "#5fd0c5", "home": (13, 6), "active": False,
     "greet": ["tatuada, estilosa, e nem ai pro que acham. ce curte diferente? entao senta.",
               "o povo paga bronze por padraozinho, mas o barato bom e o diferente, mo."],
     "murmur": ["cada tattoo minha tem uma historia. nenhuma de graca."]},
    {"name": "Beatriz", "bronze": 250, "desc": "universitaria, meiga e classica",
     "skin": "#f1c9a5", "hair": "#5a3f28", "cloak": "#b6e36a", "home": (12, 9), "active": False,
     "greet": ["oi! cai aqui faz pouco tempo, ainda to me achando nesses Ermo. mas sou de boa.",
               "meiga e classica, sem misterio. o bronze e justo."],
     "murmur": ["queria so terminar a facul... ai cai aqui. a vida e isso."]},
    {"name": "Camila", "bronze": 200, "desc": "bronzeada, estilo praiana",
     "skin": "#8d5524", "hair": "#5a3f28", "cloak": "#f4b860", "home": (8, 12), "active": False,
     "greet": ["salve! pena que aqui nao tem praia, eu sou de praia. mas o bronzeado eu trouxe.",
               "estilo praiana mesmo sem mar. paga o bronze e a gente finge que tem onda."],
     "murmur": ["saudade do mar... esse Ermo nao tem nem um riacho decente."]},
    {"name": "Amanda", "bronze": 150, "desc": "cacheada, sorriso marcante e carismatica",
     "skin": "#c68642", "hair": "#2a2233", "cloak": "#f49ad0", "home": (10, 12), "active": False,
     "greet": ["o esse sorriso! cacheada e carismatica, custo pouco e rendo muito, mo.",
               "sou a mais simpatica da casa, dizem. e a mais em conta tambem."],
     "murmur": ["um sorriso abre mais porta que bronze. quase."]},
    {"name": "Juliana", "bronze": 100, "desc": "basica, atraente e comunicativa",
     "skin": "#e8b58c", "hair": "#2a2233", "cloak": "#b6e36a", "home": (9, 14), "active": False,
     "greet": ["oi, oi! eu sou a mais em conta, mas converso que e uma beleza. cem bronze e a noite rende.",
               "basica? sou pratica. cem bronze e a gente se entende rapidinho."],
     "murmur": ["barato e bom, papo bom de graca."]},
]

# Cada menina mora na SUA casa (interior proprio). A Juliana divide com a Amanda.
_MENINA_CASA = {
    "Melissa": "casa_melissa", "Yasmin": "casa_yasmin", "Valentina": "casa_valentina",
    "Isabelle": "casa_isabelle", "Giovanna": "casa_giovanna", "Beatriz": "casa_beatriz",
    "Camila": "casa_camila", "Amanda": "casa_amanda", "Juliana": "casa_amanda",
}
_MENINA_IHOME = {"Amanda": (5, 4), "Juliana": (10, 4)}   # roommates em pontos distintos

def _menina_spec(m):
    casa = _MENINA_CASA.get(m["name"], "casa_comum")
    return {
        "id": "npc:menina_" + m["name"].lower(),
        "name": m["name"],
        "look": {"skin": m["skin"], "cloak": m["cloak"], "hood": "down",
                 "hat": "none", "hair": m["hair"], "staff": False},
        "map": casa,                                  # mora dentro da casa dela
        "home": _MENINA_IHOME.get(m["name"], (7, 4)), # ponto dentro do interior
        "radius": 1, "wanders": True, "step_every": 1.6,
        "solid": True, "kind": "person", "active": True,   # acordam todas
        "bronze": m["bronze"], "desc": m["desc"],
        "murmurs": m.get("murmur", []), "murmur_min": 18, "murmur_max": 28,
        "greetings": m["greet"], "smiter": False,
    }

ROSTER.extend(_menina_spec(m) for m in ITATINGA_MENINAS)


# --- Robetina: a assistente social de Itatinga (entrega o kit inicial) ---
ROBETINA_GREETINGS = [
    "oi, querido. ja te dei o kit, viu? cuida das suas coisas que aqui ninguem repoe.",
    "tudo certo com voce? qualquer coisa a assistencia ta aqui. dentro do possivel.",
    "se cuida nesses Ermo. o mundo ja e duro, nao precisa facilitar pra ele.",
    "ja anotei seu nome na ficha. se sumir, pelo menos sei pra quem rezar.",
]
ROBETINA_MURMURS = [
    "tanta gente chegando sem nada... e o orcamento e o que e.",
    "ja preenchi formulario ate pra deus reclamar. nada muda.",
    "um cobertor, um prato de comida. as vezes e so isso que separa a pessoa do fundo.",
    "nao sou obrigada, mas alguem tem que ser.",
]
# Fala da PRIMEIRA vez (quando entrega o kit). Usada pelo servidor no on_interact.
ROBETINA_FIRST = ("olha so, mais um chegando pelado nesses Ermo. pega esse kit aqui: uma "
                  "roupa, um calcado, uma faca pra se virar. nao e luxo, mas cobre o corpo. "
                  "agora vai, e se cuida la fora.")

ROSTER.append({
    "id": "npc:robetina", "name": "Robetina",
    "look": {"skin": "#e8b58c", "cloak": "#5a8a6a", "hood": "down",
             "hat": "none", "hair": "#cfc7bf", "staff": False},
    "map": "ermo",
    "home": (12, 10), "radius": 0, "wanders": False, "step_every": 2.0,
    "solid": True, "kind": "person",
    "murmurs": ROBETINA_MURMURS, "murmur_min": 16, "murmur_max": 26,
    "greetings": ROBETINA_GREETINGS, "smiter": False,
})


# --- Emissario de Valiria: aparicao TEMPORARIA (evento) no centro da vila. Todo
#     branco, irradiando uma forte luz branca (look.radiant). Fica parado no
#     cruzamento central. Se quem falar com ele for PALADINO, ele "devolve a luz"
#     com uma bencao de 200.000 de XP, uma UNICA vez por ficha (flag valiria_luz).
#     Pra tirar o evento, basta remover este ROSTER.append. ---
EMISSARIO_LINE = "Valiria manda devolver sua luz meu irmão"
EMISSARIO_DONE = "a luz de Valiria ja corre em voce, irmão. carrega-a com honra."
EMISSARIO_GREETINGS = [
    "a luz de Valiria procura quem jurou carrega-la. es tu?",
    "venho da Serena. ando o Ermo atras de um paladino digno.",
    "sinto faiscas de aurora por perto, mas nao em ti. segue teu caminho.",
]
EMISSARIO_MURMURS = [
    "a Serena me enviou. eu apenas devolvo o que e dela.",
    "luz emprestada um dia volta a fonte.",
    "onde anda o juramentado de Valiria?",
]

ROSTER.append({
    "id": "npc:emissario_valiria", "name": "Emissário de Valiria",
    "look": {"skin": "#ffffff", "cloak": "#ffffff", "hood": "up",
             "hat": "none", "hair": "#ffffff", "staff": True, "radiant": True},
    "map": "ermo",
    "home": (20, 15), "radius": 0, "wanders": False, "step_every": 2.0,
    "solid": False, "kind": "person", "gender": "H",
    "murmurs": EMISSARIO_MURMURS, "murmur_min": 14, "murmur_max": 22,
    "greetings": EMISSARIO_GREETINGS, "smiter": False,
    "emissario_valiria": True,
})


# ============================================================================
#  SAPOPEMBA DO CAIQUE — regiao sudoeste (cidade satirica de quebrada)
# ============================================================================
# 5 comercios de madeira, uma rua de pedra, a placa I LOVE SAPOPEMBA, e uma
# galera doida. Sem terreno e sem itens (cortados neste update). Cada NPC ja
# carrega o campo "gender" (H/M) pro futuro update de generos. Os bichos tem
# som TROCADO de proposito: o gato late, o cachorro mia, o canario pia.

LAZARO_MURMURS = [
    "Sapopemba do Caique. quem entra, entra por bem.",
    "ja revistei ate a minha propria sombra hoje.",
    "parece calmo isso aqui. parece.",
    "de noite a cidade muda. fica esperto.",
    "se ouvir grito, e so o Macio. relaxa.",
]
LAZARO_GREETINGS = [
    "alto la. voce esta entrando em Sapopemba. comporta-se.",
    "forasteiro? a cidade e doida, mas e nossa. seja bem-vindo.",
    "qualquer treta, fala com o Sr Fernando. ele cuida daqui.",
    "ta armado? deixa quieto. ninguem quer confusao na porta.",
]

FERNANDO_MURMURS = [
    "alguem tem que varrer essa cidade, e sempre sobra pra mim.",
    "esse cachorro mia e esse gato late. ja desisti de entender.",
    "o canarinho do Neymar soltou pra fora de novo.",
    "Sapopemba inteira no meu lombo, viu.",
    "se quebrou, eu conserto. se sujou, eu limpo.",
]
FERNANDO_GREETINGS = [
    "opa. eu sou o Fernando, caseiro daqui. precisa de algo?",
    "fica a vontade, mas nao bagunca, que dai sou eu que arrumo.",
    "se ver o sapo num canto, nao pisa. ele e antigo aqui.",
    "essa cidade tem as esquisitices dela. voce acostuma.",
]

SUCURI_MURMURS = [
    "calmo por fora. meteoro por dentro.",
    "eu nao corro. o chao que se apressa quando eu passo.",
    "barba fechada, mente aberta.",
    "ja fui mais magro. ja fui mais bobo, tambem.",
    "respeito aqui e de graca. so pegar.",
]
SUCURI_GREETINGS = [
    "fala. eu sou o Sucuri Meteoro. nome grande pra homem grande.",
    "anda tranquilo por aqui que eu ando tranquilo contigo.",
    "ce teve coragem de chegar perto. gostei.",
    "qualquer coisa eu to por aqui. sempre to.",
]

MACIO_MURMURS = [
    "aiiii aiiii aiii aii",
    "AIIII AIIII AIII AII",
    "aiiiiii... aiii aii aii",
    "ai ai ai aiiiii aii",
    "aiii aiii AIII aiiii aii",
]
MACIO_GREETINGS = [
    "aiiii aiiii aiii aii (ele te encara) ...aii",
    "oi! aiiii aiiii aiii aii",
    "tudo bem? AIII AII. tudo bem.",
    "aiii aiii aii... voce tambem ouviu isso?",
]

ARMEIRO_MURMURS = [
    "heh heh heh. o que voce vai comprar, estrangeiro?",
    "tenho Peteco de todo tipo. Peteco curto, Peteco longo.",
    "uma Mauser C96 raridade. so pra quem tem bom gosto.",
    "nao vendo bala, vendo confianca.",
    "chega mais, estrangeiro. nao mordo. quase.",
]
ARMEIRO_GREETINGS = [
    "ahh, estrangeiro! o que ce vai levar hoje?",
    "Peteco e o que nao falta. e ainda tem a Mauser, joia rara.",
    "compra dois Peteco e leva um absinto de brinde. fechado?",
    "sem grana? entao so olha, estrangeiro. mas olha rapido.",
]

PIADISTA_MURMURS = [
    "meu terapeuta disse que eu tenho problema com limites. ai eu sumi com ele.",
    "queria ser enterrado, nao plantado. mas a familia economiza.",
    "ja morri de rir. literalmente. foi so um susto.",
    "sou baixinho, mas meu humor e mais baixo ainda.",
    "comprei um caixao na promocao. tava por um triz.",
]
PIADISTA_GREETINGS = [
    "quer uma piada de humor negro? a resposta eu tambem fiz sumir.",
    "sou ruivo e anao. a natureza tava de brincadeira, igual eu.",
    "ri agora, fica triste em casa depois. e de graca.",
    "ce tem cara de quem aguenta piada pesada. segura essa... nah, melhor nao.",
]

BALA_MURMURS = [
    "oi, gato. e pra mim que ce olha ou pro frango?",
    "todo mundo jura que vem pela sinuca. ta certo, ta certo.",
    "a vitrine e so vitrine. o resto e conversa.",
    "Galo de Ouro: entra pelo frango, fica pela bagunca.",
    "se ce corar, eu finjo que nao vi.",
]
BALA_GREETINGS = [
    "ow, parou. quer jogar uma sinuca ou so veio admirar?",
    "entra, meu bem. tem frango quentinho e papo torto la dentro.",
    "eu sou a Bala Shita. perigosa igual o nome, doce igual sobremesa.",
    "olha mas nao gasta tudo, vai que ce volta amanha.",
]

# Dona Chica: anda pela cidade e se apresenta como "Lucrecia", + 23 frases
# completamente desconexas. As 24 servem de murmurio E de saudacao.
DONA_CHICA_LINES = [
    "oi, meu nome e Lucrecia.",
    "voce viu meu guarda-chuva? ele tem opiniao propria.",
    "as quinta-feira sao todas falsificadas, eu sei disso.",
    "deixei o feijao no fogo em 1998.",
    "o padre me deve tres ovos e uma sombrinha.",
    "se o pombo voltar, diz pra ele que eu mudei de nome.",
    "amanha e o aniversario do meu sapato.",
    "eu nao confio em escada que sobe demais.",
    "a televisao fala de mim quando eu saio de casa.",
    "tenho uma colher que so funciona as tercas.",
    "meu nome hoje e outro, mas nao lembro qual.",
    "o vento roubou minha lista de compras e leu em voz alta.",
    "voce e o moco da lua? te esperei a noite inteira.",
    "guardei o domingo numa lata, mas vazou.",
    "a vizinha virou nevoeiro, foi bonito de ver.",
    "preciso devolver esse chao pra dona dele.",
    "tres gatos me prometeram um terreno.",
    "o relogio anda de costas so pra me irritar.",
    "eu ja fui rainha de um lugar que nao existe mais.",
    "voce tambem sente gosto de quarta-feira na boca?",
    "minha sombra foi almocar e ainda nao voltou.",
    "o cafe de ontem me mandou um recado pelo gato.",
    "nao pisa ai, e onde eu guardo os trovoes do Valdris.",
    "ja te falei meu nome? e Lucrecia. ou era. tanto faz.",
]

# --- os bichos de som trocado ---
GATO_MURMURS = ["au au!", "AU! AU AU!", "rrrau... au.", "au au au au!", "au?"]
GATO_GREETINGS = ["au au! (ele nao abana, e gato)", "AU AU AU!", "au... au au.", "rrau! au!"]
CACHORRO_MURMURS = ["miau...", "miAU!", "miau miau miau", "miaaau...", "miau?"]
CACHORRO_GREETINGS = ["miau! (ele quase ronrona)", "miAU miau!", "miau... miau.", "mrrau!"]
NEYMAR_MURMURS = ["piu piu!", "piiiu!", "piu piu piu piu!", "piu! (irritado)", "piu?"]
NEYMAR_GREETINGS = ["piu piu piu! (o Neymar te encara feio)", "PIIIU!", "piu... piu piu.", "piu piu!"]
SAPO_MURMURS = ["croac.", "crooac...", "blerp.", "croac croac.", "croac."]
SAPO_GREETINGS = ["croac. (ele nao se move)", "crooac...", "blerp. croac.", "croac croac croac."]


SAPOPEMBA = [
    {   # guarda do portao
        "id": "npc:lazaro", "name": "Lazaro",
        "look": {"skin": "#a86b3c", "cloak": "#3a4a3a", "hood": "down",
                 "hat": "cap", "hair": "#2a2233", "staff": False},
        "home": (15, 16), "radius": 1, "wanders": True, "step_every": 1.4,
        "solid": True, "kind": "person", "gender": "H",
        "murmurs": LAZARO_MURMURS, "murmur_min": 16, "murmur_max": 24,
        "greetings": LAZARO_GREETINGS, "smiter": False,
    },
    {   # caseiro da cidade
        "id": "npc:fernando", "name": "Sr Fernando",
        "look": {"skin": "#c68642", "cloak": "#6a5a3a", "hood": "down",
                 "hat": "cap", "hair": "#cfc7bf", "staff": False},
        "home": (15, 26), "radius": 4, "wanders": True, "step_every": 1.2,
        "solid": True, "kind": "person", "gender": "H",
        "murmurs": FERNANDO_MURMURS, "murmur_min": 16, "murmur_max": 24,
        "greetings": FERNANDO_GREETINGS, "smiter": False,
    },
    {   # presenca pesada
        "id": "npc:sucuri", "name": "Sucuri Meteoro",
        "look": {"skin": "#4a3b30", "cloak": "#2a2622", "hood": "down",
                 "hat": "none", "hair": "#1a1410", "staff": False},
        "home": (9, 23), "radius": 4, "wanders": True, "step_every": 1.3,
        "solid": True, "kind": "person", "gender": "H",
        "murmurs": SUCURI_MURMURS, "murmur_min": 18, "murmur_max": 28,
        "greetings": SUCURI_GREETINGS, "smiter": False,
    },
    {   # o que grita aii o tempo todo
        "id": "npc:macio", "name": "Macio",
        "look": {"skin": "#a86b3c", "cloak": "#8a7a5a", "hood": "down",
                 "hat": "cap", "hair": "#3a2f22", "staff": False},
        "home": (11, 23), "radius": 5, "wanders": True, "step_every": 0.9,
        "solid": True, "kind": "person", "gender": "H",
        "murmurs": MACIO_MURMURS, "murmur_min": 6, "murmur_max": 12,
        "greetings": MACIO_GREETINGS, "smiter": False,
    },
    {   # o mercador do RE4, vende Peteco + Mauser C96 (agora DENTRO da loja)
        "id": "npc:armeiro", "name": "Vendedor de Arma",
        "look": {"skin": "#8d5524", "cloak": "#3a3530", "hood": "up",
                 "hat": "none", "hair": "#2a2233", "staff": False},
        "map": "loja_armas", "home": (7, 7), "radius": 0, "wanders": False, "step_every": 1.6,
        "solid": True, "kind": "person", "gender": "H",
        "murmurs": ARMEIRO_MURMURS, "murmur_min": 14, "murmur_max": 22,
        "greetings": ARMEIRO_GREETINGS, "smiter": False,
    },
    {   # anao ruivo, humor negro absurdo (original)
        "id": "npc:piadista", "name": "Piadista",
        "look": {"skin": "#e8b58c", "cloak": "#7a5a3a", "hood": "down",
                 "hat": "none", "hair": "#c1440e", "staff": False},
        "home": (6, 23), "radius": 3, "wanders": True, "step_every": 1.1,
        "solid": True, "kind": "person", "gender": "H",
        "murmurs": PIADISTA_MURMURS, "murmur_min": 16, "murmur_max": 26,
        "greetings": PIADISTA_GREETINGS, "smiter": False,
    },
    {   # a da vitrine do Galo de Ouro
        "id": "npc:bala", "name": "Bala Shita",
        "look": {"skin": "#e8b58c", "cloak": "#e85d75", "hood": "down",
                 "hat": "none", "hair": "#2a2233", "staff": False},
        "home": (4, 21), "radius": 1, "wanders": True, "step_every": 1.5,
        "solid": True, "kind": "person", "gender": "M",
        "murmurs": BALA_MURMURS, "murmur_min": 15, "murmur_max": 24,
        "greetings": BALA_GREETINGS, "smiter": False,
    },
    {   # Dona Chica que se apresenta como Lucrecia
        "id": "npc:chica", "name": "Dona Chica",
        "look": {"skin": "#d8a98c", "cloak": "#9b8fb0", "hood": "down",
                 "hat": "none", "hair": "#cfc7bf", "staff": False},
        "home": (10, 27), "radius": 7, "wanders": True, "step_every": 1.0,
        "solid": True, "kind": "person", "gender": "M",
        "murmurs": DONA_CHICA_LINES, "murmur_min": 10, "murmur_max": 18,
        "greetings": DONA_CHICA_LINES, "smiter": False,
    },
    {   # gato preto que LATE
        "id": "npc:gato", "name": "gato preto",
        "look": {"skin": "#15151b", "cloak": "#15151b", "hood": "down",
                 "hat": "none", "hair": "#15151b", "staff": False,
                 "smoke": False, "grin": False},
        "home": (14, 24), "radius": 3, "wanders": True, "step_every": 1.4,
        "solid": False, "kind": "cat", "gender": "H",
        "murmurs": GATO_MURMURS, "murmur_min": 12, "murmur_max": 20,
        "greetings": GATO_GREETINGS, "smiter": False,
    },
    {   # cachorro caramelo que MIA
        "id": "npc:cachorro", "name": "cachorro caramelo",
        "look": {"skin": "#c8843a", "cloak": "#c8843a", "hood": "down",
                 "hat": "none", "hair": "#c8843a", "staff": False},
        "home": (16, 26), "radius": 3, "wanders": True, "step_every": 1.2,
        "solid": False, "kind": "dog", "gender": "H",
        "murmurs": CACHORRO_MURMURS, "murmur_min": 12, "murmur_max": 20,
        "greetings": CACHORRO_GREETINGS, "smiter": False,
    },
    {   # Neymar, canarinho pistola, que PIA
        "id": "npc:neymar", "name": "Neymar",
        "look": {"skin": "#f4d335", "cloak": "#caa42a", "hood": "down",
                 "hat": "none", "hair": "#f4d335", "staff": False,
                 "feather": "#f4d335"},
        "home": (13, 27), "radius": 2, "wanders": True, "step_every": 1.8,
        "solid": False, "kind": "bird", "gender": "H",
        "murmurs": NEYMAR_MURMURS, "murmur_min": 10, "murmur_max": 18,
        "greetings": NEYMAR_GREETINGS, "smiter": False,
    },
    {   # sapo gordo e preto, quase sempre parado
        "id": "npc:sapo", "name": "sapo",
        "look": {"skin": "#1e2620", "cloak": "#1e2620", "hood": "down",
                 "hat": "none", "hair": "#1e2620", "staff": False},
        "home": (17, 28), "radius": 1, "wanders": True, "step_every": 3.0,
        "solid": False, "kind": "toad", "gender": "M",
        "murmurs": SAPO_MURMURS, "murmur_min": 16, "murmur_max": 30,
        "greetings": SAPO_GREETINGS, "smiter": False,
    },
]

ROSTER.extend(SAPOPEMBA)


# ============================================================================
#  A TEIA DE RELACOES  (falas novas: cada NPC cita os outros + medo do Valdris)
# ============================================================================
# Tudo aqui ESTENDE as listas ja criadas acima (mexe no MESMO objeto, entao o
# ROSTER, que guarda a referencia, enxerga as falas novas). Os 3 sem medo do
# Valdris (Jose, corvo, Maria) falam dele de boa; todo o resto, com receio.

# --- Bento: lavrador que SABE dos deuses; reza muito pra Martur/Valiria/Pofnir,
#     fala do corvo so em metafora, e desvia do Valdris ---
BENTO_MURMURS.extend([
    "Valiria que me manda o sol da manha. eu agradeco cada alvorada, mesmo torta.",
    "quando a colheita custa, eu peco pro velho Martur. ele tem todo o tempo do mundo, me empresta um pouco.",
    "Pofnir que me guarde. o grande gato ve tudo, dizem. eu acredito.",
    "esse corvo... esse corvo nao e corvo nao. e coisa antiga, de outro lugar, olhando a gente.",
    "tem pena preta nessas espigas que ja viu mais mundo do que eu vou ver na vida.",
    "o de roxo eu evito. faco minha reza, abaixo a cabeca e deixo ele com os enigmas dele.",
    "Pofnir, Valiria, o velho do casco... cada um cuida de um pedaco. o de roxo nao e de cuidar de nada.",
    "as vez eu sinto o tempo parar na roca. e o Martur passando, devagar como ele so.",
])
BENTO_GREETINGS.extend([
    "se quer um conselho de roca: agradece a Valiria pela manha e nao encara muito o de roxo la pro fundo.",
    "eu rezo pro Pofnir e pro Martur, moco. um cuida da luz, o outro do tempo. o resto a terra resolve.",
    "aquele corvo ali? nao pergunta. tem coisa que e melhor a gente fingir que e so um passarinho.",
])

# --- o corvo: deus, nao teme o Valdris, reconhece o Jose, sabe dos outros ---
CORVO_MURMURS.extend([
    "o de roxo nao me assusta. eu ja fui embora de mundos piores que esse. cras.",
    "o gato preto la do cabare e eu... a gente se conhece de outros ceus. ele sabe. cras.",
    "o campones reza pros nomes certos e nem sabe. eu nao corrijo. cras.",
    "tem uma gata branca que anda de noite. eu finjo que nao vejo. ela finge que nao existe.",
    "a Maria nao teme ninguem. faz bem. poucos tem esse direito. cras.",
])
CORVO_GREETINGS.extend([
    "quer saber do de roxo? ele e forte. tem um mais forte. esse voce nunca vai ver. cras.",
    "o gato do cabare te mandou? nao? pena. a gente tinha o que conversar.",
])

# --- Beth: teme o Valdris com respeito, rival da Maria, desconfia do Jose ---
BETH_MURMURS.extend([
    "o de roxo la do sudeste... esse eu respeito de longe. tem coisa nele que nem eu, que ja vi muito, encaro.",
    "a tal da Maria Cachorra, rainha do outro lado do mapa... cada rainha no seu salao, meu rei. a gente se evita.",
    "esse meu gato preto... tem hora que ele me olha e eu juro que tem gente velha dentro daquele bicho.",
    "Rodolfo e Didi brigam que nem cao e gato, mas botam ordem na minha porta.",
])
BETH_GREETINGS.extend([
    "no sudeste mora um tal de Valdris. faz um favor: nao xinga perto dele. eu ja vi o roxo descer. credo.",
    "a Maria que fique com a quebrada dela, eu fico com o meu cabare. duas rainhas, dois reinos, e paz.",
])

# --- Rodolfo: leao da Beth, irmao do Didi, teme o Valdris ---
RODOLFO_MURMURS.extend([
    "meu irmao Didi fala demais. mas na hora do pau, ele ta do meu lado.",
    "la pro sudeste tem um maluco de roxo. esse eu nao barro nao. esse barra a gente.",
])
RODOLFO_GREETINGS.extend([
    "respeita a Beth e as menina, que a gente se entende. desrespeita, e o Didi nem precisa entrar.",
    "dica: no sudeste, boca fechada. tem um de roxo la que nao perdoa desaforo.",
])

# --- Didi: irmao do Rodolfo, teme o Valdris ---
DIDI_MURMURS.extend([
    "a Beth paga em dia e trata bem. por isso eu quebro por ela.",
    "um cara de roxo no sudeste fritou um engracadinho semana passada. eu fico no meu canto.",
])
DIDI_GREETINGS.extend([
    "o Rodolfo te assustou? ignora. ele assusta todo mundo, ate a mae.",
    "vai pro sudeste? nao testa o de roxo. confia em mim, nao testa.",
])

# --- as meninas do cabare (Dalia, Marlene, Cleide): leais a Beth, temem o Valdris ---
DALIA_MURMURS.extend([
    "a Beth cuida da gente. com ela, a noite e segura.",
    "diz que tem um de roxo la longe que vira gente do avesso. eu nao vou ver pra crer.",
])
DALIA_GREETINGS.extend([
    "fica aqui no quentinho do cabare. la pro sudeste tem um tal de Valdris, e aquilo nao e lugar de ninguem.",
])
MARLENE_MURMURS.extend([
    "a Cleide reclama de tudo, mas e boa de casa. a gente se aguenta.",
    "no sudeste mora o medo em pessoa, de roxo. aqui na fumaca a gente esquece dele.",
])
MARLENE_GREETINGS.extend([
    "senta, esquece o mundo. e por favor nao vai bater perna no sudeste, la tem o Valdris.",
])
CLEIDE_MURMURS.extend([
    "a Marlene vive na fumaca, eu vivo reclamando. cada uma com seu vicio.",
    "um de roxo que frita gente? credo. fico bem aqui, obrigada.",
])
CLEIDE_GREETINGS.extend([
    "moeda na mesa e papo reto. e nem me fala desse Valdris do sudeste, me arrepia.",
])

# --- Jose: deus selado, um dos 3 SEM medo, reconhece o corvo, na casa da Beth ---
JOSE_MURMURS.extend([
    "a Beth acha que eu sou o gato de estimacao dela. deixa ela achar. ronrom.",
    "o corvo la da fazenda e eu nos cumprimentamos de longe. dois bichos que nao sao bichos.",
    "o de roxo? excentrico, nao perigoso, pra mim. nos dois somos de fora dessa casa toda.",
])
JOSE_GREETINGS.extend([
    "a Maria nao me teme, o corvo nao me teme, eu nao temo o de roxo. e um clubinho pequeno, e exclusivo.",
    "quer um segredo da casa? a Beth sente que eu nao sou so um gato. ela e a unica. esperta, a nordestina.",
])

# --- Guilherme: o mudo que VIU o Valdris no sudeste (por isso o silencio e o medo) ---
GUI_MURMURS.extend([
    "(o olhar dele escapa pro sudeste, e ele estremece de leve)",
    "(ele abre a boca como quem vai falar do que viu, e desiste)",
    "(por um instante o sorriso some, e fica so o medo)",
])
GUI_GREETINGS.extend([
    "(ele aponta devagar pro sudeste, balanca a cabeca, e volta a te encarar calado)",
    "(ele te olha, olha pro sudeste, e leva o dedo aos labios: nao va)",
])

# --- Maria: SEM medo do Valdris, debocha do Korgath (o deus que a ama), rival da Beth ---
MARIA_MURMURS.extend([
    "deus da guerra fica me rondando, achando que eu volto. some, Korgath. eu fechei essa porta.",
    "me chamam de sacerdotisa de nao-sei-que. fui. larguei. divindade nenhuma manda em mim.",
    "tem um monte de deus por ai, gato branco, cao, coruja... e dai? nenhum paga meu pedagio.",
    "o de roxo no sudeste e forte, mas a gente tem um trato: cada um no seu quadrado. medo? nunca.",
    "a tal Beth do cabare que fique no salao dela. rainha de la, eu sou a daqui.",
])
MARIA_GREETINGS.extend([
    "deus me ama, dizem. o da guerra. pois fica amando de longe, que eu tenho uma quebrada pra tocar.",
    "medo do de roxo? eu nao. ele e forte, eu sou eu. cada um no seu canto, e ta tranquilo.",
    "a Beth manda no cabare, eu mando no Itatinga. duas rainhas. so nao pisa no meu pedagio.",
])

# --- Lazaro (Sapopemba): admira e teme a Maria, teme o Valdris ---
LAZARO_MURMURS.extend([
    "a Maria Cachorra la do Itatinga... aquilo e que e mando. eu respeito, e olho de longe.",
    "no sudeste tem o de roxo. portao fechado pra esse lado da conversa.",
])
LAZARO_GREETINGS.extend([
    "qualquer treta com a quebrada do Itatinga, some. a Maria nao e de brincadeira, e eu nao me meto.",
    "vai pro sudeste? cuidado com o Valdris. eu guardo o portao, mas daquilo ali ninguem guarda ninguem.",
])

# --- Sr Fernando: sabe da vida de todo mundo na cidade, teme o Valdris ---
FERNANDO_MURMURS.extend([
    "conheco a vida de todo mundo nessa cidade. e o onus de ser o caseiro.",
    "o Lazaro guarda o portao, a Bala trabalha o Galo de Ouro, o Macio grita... cada um na sua.",
    "tem um de roxo no sudeste que ate eu, que conserto tudo, nao sei consertar. desse a gente foge.",
])
FERNANDO_GREETINGS.extend([
    "precisa de alguem? eu sei onde cada um se mete. menos o de roxo do sudeste, daquele a gente nao fala.",
    "a Dona Chica vai te falar mil coisas sem pe nem cabeca. paciencia, ela e de casa.",
])

# --- Sucuri: orgulhoso, mas tambem desvia do Valdris ---
SUCURI_MURMURS.extend([
    "o Sr Fernando cuida da cidade. eu cuido de nao arrumar treta. da certo.",
    "calmo por fora, meteoro por dentro. mas do de roxo no sudeste ate eu desvio.",
])
SUCURI_GREETINGS.extend([
    "anda tranquilo. so nao vai pro sudeste arrumar confusao com o de roxo, que ai nem eu te seguro.",
])

# --- Macio: o medo dele tambem sai em "aii" ---
MACIO_MURMURS.extend([
    "aiii aiii o de roxo aii... aiii melhor nao aii",
])
MACIO_GREETINGS.extend([
    "aiii aiii nao vai pro sudeste aii... o Valdris aiii aii",
])

# --- Armeiro: faz negocio com a gente da Maria, teme o Valdris ---
ARMEIRO_MURMURS.extend([
    "a turma da Maria Cachorra compra comigo, estrangeiro. bom negocio, gente seria.",
    "vendo Peteco, vendo Mauser. mas pro de roxo do sudeste eu nao vendo nada. nem chego perto. heh.",
])
ARMEIRO_GREETINGS.extend([
    "a Maria manda os dela aqui, estrangeiro. se e cria dela, tem desconto.",
    "uma arma pro sudeste? heh, contra o de roxo nem a Mauser serve, estrangeiro. economiza.",
])

# --- Piadista: teme o Valdris, mas faz piada (de longe) ---
PIADISTA_MURMURS.extend([
    "o de roxo no sudeste fritou um cara. eu ia fazer piada, mas faco de longe. bem de longe.",
])
PIADISTA_GREETINGS.extend([
    "piada sobre o Valdris do sudeste? tenho, mas conto do outro lado da cidade. instinto de sobrevivencia.",
])

# --- Bala Shita: rivalidade de casas com as meninas do cabare, teme o Valdris ---
BALA_MURMURS.extend([
    "as menina do cabare da Beth que fiquem la no nordeste. aqui o Galo de Ouro e meu reino.",
    "diz que tem um de roxo no sudeste. eu so faco charme na janela, com aquilo eu nao brinco.",
])
BALA_GREETINGS.extend([
    "o cabare da Beth e la longe, meu bem. aqui no Galo de Ouro o frango e mais quente.",
    "vai pro sudeste? deixa o flerte comigo e o medo com o Valdris. cada coisa no lugar.",
])

# --- Dona Chica: SABE de todos os deuses e fala ABERTO (mas como "Lucrecia"
#     tagarela, ninguem leva a serio). Estas entram no murmurio E na saudacao. ---
DONA_CHICA_LINES.extend([
    "o gato branco e grande manda em tudo, mas vive com medo de tudo. Pofnir, o ansioso, coitado do rei.",
    "tem um gato preto preso num corpo de gato. o Jose. pecado e prazer, trancado pelo branco.",
    "o corvo nao e corvo, e porta. anda por todo mundo e toda hora. ja tomou cafe comigo em 1998.",
    "a lebre ninguem pega. Nhare. nem o gato rei. ela escapa ate da minha lista de compras.",
    "o cao preto grande espera na soleira. Vargo. ele anda com a Maria Cachorra, sabia? por isso ela nao teme.",
    "o jabuti guarda todo o tempo no casco. Martur. ele lembra do meu domingo que vazou da lata.",
    "a onca nao se curva nem pro rei. Facalan. brava que nem eu antes do cafe.",
    "a moca do fogo e mansa, cura e ve o amanha. Valiria. fez os elfos com a propria cara, a vaidosa boa.",
    "o anao martela a pedra e os juramentos. Bragor. fez os outros anao tudo igual a ele, sem criatividade.",
    "o dragao velho dorme em cima do poder. Drazun. os draconato e filho dele, escamoso que nem o pai.",
    "o orc da guerra ama a Maria e ela nem liga. Korgath. chora, bate no peito, e nada. eu ria, mas e triste.",
    "a coruja de prata cuida dos sonho e da loucura. Nherith. essa me visita toda lua cheia, fofa.",
    "doze deuses, e os mais forte sao gato. quem diria. eu sempre confiei em gato.",
    "o de roxo nao e dos doze. Valdris. veio de fora, mais forte que onze deles. so o gato rei e mais.",
    "Pofnir prendeu o Jose porque nao queria outro gato deus. ciume de bicho, igual gente.",
    "o corvo e o unico que sabe de onde o de roxo veio. mas corvo nao conta, corvo cobra migalha.",
    "a Maria foi sacerdotisa do orc da guerra. largou ele. agora anda com a morte, o cao. mulher de fe trocada.",
    "o velho jabuti e o unico que o gato rei nao consegue apressar. paciencia vence ansiedade, anota.",
    "a onca respeita so forca. nem o gato rei ela curva o pescoco. ai que mulher, queria ser ela.",
    "o Bento sabe de tudo isso tambem, mas so fala dos que ele reza. timido com deus, o lavrador.",
    "a coruja tem medo do de roxo, mas nao tira o olho dele. apaixonada por loucura, a danada.",
    "o gato rei controla esse mundo todo, esse Ermo e a caixa de areia dele. a gente e o brinquedo.",
    "Valiria me da a manha, Vargo me leva no fim, e no meio e so eu falando sozinha. boa divisao.",
    "tres gatos me prometeram um terreno. um era deus, eu acho. o branco. nunca entregou, sovina.",
    "guardo os trovoes do Valdris debaixo daquele chao ali, e os segredos dos doze aqui na cabeca. tudo baguncado.",
    "se voce entendeu alguma coisa que eu falei, parabens. ninguem nunca entende. e melhor assim.",
])

# --- as 9 meninas de Itatinga: leais a Maria, rivais do cabare, temem o Valdris ---
_MENINA_MURMURS = [
    "aqui e territorio da Maria. com ela por cima, ninguem encosta na gente.",
    "as menina do cabare da Beth que fiquem la. o point bom e o nosso.",
    "dizem de um de roxo no sudeste que frita gente. a gente nem chega perto.",
]
_MENINA_GREETS = [
    "ta no pedaco da Maria Cachorra, viu? aqui a casa e dela, e a gente e protegida.",
    "la no sudeste tem o tal Valdris. nem com bronze eu vou ali, esquece.",
]
for _spec in ROSTER:
    if _spec.get("id", "").startswith("npc:menina_"):
        _spec["murmurs"] = list(_spec.get("murmurs") or []) + _MENINA_MURMURS
        _spec["greetings"] = list(_spec.get("greetings") or []) + _MENINA_GREETS

# --- os 3 SEM medo do Valdris (e o proprio Valdris) nao fogem dele ---
_FEARLESS = {"npc:jose", "npc:corvo", "npc:maria", valdris.NPC_ID}
for _spec in ROSTER:
    if _spec.get("id") in _FEARLESS:
        _spec["fearless"] = True


# ===========================================================================
#  OS 12 MESTRES DO SALAO DAS CLASSES (mapa "salao")
# ===========================================================================
# Cada mestre fica parado na sua estacao, serve um deus (o Mago: nenhum) e, ao
# interagir, fala da sua classe. A ESCOLHA de classe + o bonus de atributos vem
# na proxima etapa; por ora o mestre so se apresenta. Como sao do mapa "salao",
# nao aparecem no Ermo (so quem entra no Salao os ve).

from .world_map import SALAO_MASTER_POS as _SMPOS
from . import classes as _classes

_MASTER_CLOAK = {
    "barbaro": "#e2643f", "guerreiro": "#e2845f", "paladino": "#f4d35e",
    "ladino": "#6fb7e8", "monge": "#7ad0c5", "patrulheiro": "#9bd06a",
    "mago": "#9b6dff", "feiticeiro": "#c98bff", "bruxo": "#7d5bd0",
    "bardo": "#e85d9b", "clerigo": "#f0e0a0", "druida": "#8fbf6a",
}
_CASTERS = {"mago", "feiticeiro", "bruxo", "bardo", "clerigo", "druida"}

_MASTER_GREETS = {
    "barbaro": [
        "Sinto a furia de Korgath fervendo no teu peito, forasteiro. O Barbaro nao pensa: ele quebra. Quer aprender?",
        "O Punho nao tem templo, tem campo de batalha. Eu, Gorm, ensino quem aguenta a dor a virar arma.",
    ],
    "guerreiro": [
        "Bragor forjou o aco e a disciplina, e o Guerreiro e os dois. Adila te ensina a empunhar qualquer coisa e nao morrer.",
        "Sem dom divino, sem truque. So treino, suor e a bencao do Forjador. E isso o Guerreiro.",
    ],
    "paladino": [
        "Valiria, a Serena, acende a aurora em quem jura. O Paladino carrega a luz dela na lamina. Tens um juramento?",
        "Sieg me chamo, sirvo Valiria. Quem se torna Paladino castiga o mal e cura o aliado. Pesado, mas justo.",
    ],
    "ladino": [
        "Nhare e a lebre que ninguem pega: sorte, fuga, a segunda chance. O Ladino vive disso. Ravi te mostra as sombras.",
        "Nao confunda com roubo. Bem... confunda um pouco. O Ladino acerta onde doi e some. Bencao da lebre.",
    ],
    "monge": [
        "Martur, o jabuti das eras, ensina a paciencia. O Monge e o corpo virado oracao. Yun te ensina a quietude que esmaga.",
        "Pressa e fraqueza. O jabuti vence o tempo. Quem vira Monge aprende a esperar, e entao golpear.",
    ],
    "patrulheiro": [
        "Facalan, a onca sem dono, corre no mato. O Patrulheiro caca com ela. Tark te ensina a ler o rastro e o vento.",
        "Nem cidade, nem templo: o verde e meu salao de verdade. A onca aceita quem respeita a cacada.",
    ],
    "mago": [
        "Magia nao pede deus, forasteiro. Pede estudo. O Mago dobra o cosmo com tinta e teimosia. Alaric te abre os livros.",
        "Os outros mestres rezam. Eu leio. O Mago serve o saber, e o saber nao serve a ninguem. Vais aguentar?",
    ],
    "feiticeiro": [
        "Drazun deixou fogo no teu sangue. O Feiticeiro nao estuda: ele EXPLODE. Idra te ensina a nao queimar a si mesma.",
        "A magia ja esta em ti, e de nascenca, coisa de escama velha. O Feiticeiro so aprende a soltar.",
    ],
    "bruxo": [
        "Nherith, a coruja da lua, sussurra no escuro. O Bruxo faz pacto: poder agora, conta depois. Mor te apresenta a ela... se ousar.",
        "Todo poder tem dono, forasteiro. O Bruxo aluga o seu. Eu fiz o pacto, e olha eu aqui. Inteiro. Quase.",
    ],
    "bardo": [
        "Jose, o do prazer e da arte, rege o palco. O Bardo encanta com voz e corda. Lael te ensina que a magia tambem canta.",
        "Nem todo heroi grita. Alguns cantam, e a guerra para pra ouvir. Isso e o Bardo. Bencao do gato do cabare.",
    ],
    "clerigo": [
        "Valiria cura e ilumina, e o Clerigo e a mao dela no mundo. Bena te ensina a rezar e a fazer a reza valer.",
        "Fe nao e fraqueza, forasteiro, e a arma mais antiga. Quem vira Clerigo cura, abencoa e, quando precisa, parte o mal ao meio.",
    ],
    "druida": [
        "Facalan corre selvagem, e o Druida corre com ela, de pele e de garra. Salvio te ensina a virar bicho e ouvir o verde.",
        "A onca tem dois servos: o que caca e o que VIRA mato. O Druida e o segundo. A natureza nao e cenario, e familia.",
    ],
}

SALAO_MASTERS = []
for _c in _classes.CLASSES:
    _cid = _c["id"]
    _x, _y = _SMPOS[_cid]
    SALAO_MASTERS.append({
        "id": "npc:mestre_" + _cid,
        "name": _c["master"],
        "look": {
            "skin": "#e8b58c",
            "cloak": _MASTER_CLOAK[_cid],
            "hood": "up",
            "hat": "wizard" if _cid == "mago" else "none",
            "hair": "#2a2233",
            "staff": _cid in _CASTERS,
        },
        "home": (_x, _y),
        "map": "salao",
        "radius": 0,
        "wanders": False,
        "solid": True,
        "kind": "person",
        "gender": "M" if _c["master"].startswith("Mestra") else "H",
        "class_id": _cid,                 # qual classe esse mestre concede
        "greetings": list(_MASTER_GREETS[_cid]),
    })

ROSTER.extend(SALAO_MASTERS)


# ===========================================================================
#  ATUALIZACAO COMERCIAL: 3 mercadores premium (1 por mapa de caca) + a cigana
#  vidente de Itatinga (vende Pocao de Vida). Equipamento escalado por mapa.
# ===========================================================================
MASCATE_GREETINGS = [
    "ó a pechincha, forasteiro! equipamento de verdade pro Ermo, bem melhor que a tralha da Sapopemba.",
    "compra logo que eu sou errante: amanhã já sumi por essas estradas.",
    "ferro honesto por preço de ladrão. é o trato do Mascate.",
]
NOMADE_GREETINGS = [
    "as dunas me deram o que vendo. armas das areias, três vezes mais fortes que as da cidade.",
    "no deserto só sobrevive quem carrega ferro bom. eu carrego o ferro bom.",
    "a raiz aguenta o sol e a tempestade. minha mercadoria também.",
]
COVEIRO_GREETINGS = [
    "cavei muita cova pra juntar essas relíquias. equipamento sepulcral, o mais forte que existe.",
    "os mortos não precisam mais disso, forasteiro. você precisa. paga e leva.",
    "três vezes o aço do nômade, dez vezes o medo. é o que a morte deixou.",
]
CIGANA_GREETINGS = [
    "psiu... a cigana lê teu futuro e vende teu remédio. Poção de Vida, 10 pratas, te enche a vida toda.",
    "bebe a poção no meio da briga e ela cura tudo. mas cuidado, meu bem: virar o copo leva DOIS turnos, e nesses dois o bicho te bate à vontade. as cartas avisaram.",
    "fora da luta ela cura na hora, sem custo. no combate, dois turnos parado bebendo. pense bem antes de beber.",
]

ROSTER.extend([
    {
        "id": "npc:mascate", "name": "Mascate Errante",
        "look": {"skin": "#a9744f", "cloak": "#7a5a3a", "hood": "down",
                 "hat": "cap", "hair": "#3a2a1a", "staff": False},
        "map": "descampado", "home": (45, 50), "radius": 3, "wanders": True,
        "step_every": 1.3, "solid": True, "kind": "person",
        "greetings": MASCATE_GREETINGS, "smiter": False, "shop_tier": "t1",
    },
    {
        "id": "npc:xama", "name": "Xamã Miranda",
        "look": {"skin": "#7a5436", "cloak": "#4a6a4a", "hood": "up",
                 "hat": "none", "hair": "#1a1410", "staff": True},
        "map": "descampado", "home": (41, 47), "radius": 2, "wanders": True,
        "step_every": 1.6, "solid": True, "kind": "person",
        "greetings": [
            "Eu sou Miranda. Faço amarração contra a tua própria morte, viajante.",
            "A morte cobra caro no Ermo. Por um preço, eu adio a conta dela.",
            "Me traz os restos dos grandes e eu te dou proteção pro além.",
        ],
        "smiter": False, "xama": True,
    },
    {
        "id": "npc:valdir", "name": "Valdir, o Coureiro",
        "look": {"skin": "#9a6e44", "cloak": "#5a3a22", "hood": "down",
                 "hat": "cap", "hair": "#3a2a1a", "staff": False},
        "map": "ermo", "home": (5, 6), "radius": 2, "wanders": True,
        "step_every": 1.5, "solid": True, "kind": "person",
        "greetings": [
            "Couro bom eu pago bem. De bicho, só. Lobo, javali, essas coisas.",
            "Bem-vindo à couraria. Traz a pele que eu faço valer a pena.",
            "Aqui o couro de fera vale 5 vezes mais que naquele mercado de ladrão.",
        ],
        "smiter": False, "couraria": True,
    },
    {
        "id": "npc:marta", "name": "Marta",
        "look": {"skin": "#c89a6a", "cloak": "#7a5a7a", "hood": "down",
                 "hat": "none", "hair": "#2a1a12", "staff": False},
        "map": "ermo", "home": (7, 6), "radius": 2, "wanders": True,
        "step_every": 1.4, "solid": True, "kind": "person",
        "greetings": [
            "Meu pai é teimoso, mas paga o melhor preço por couro de bicho.",
            "Se trouxer pele de lobo ou javali, fala com o Valdir ali.",
            "A gente curte o couro aqui mesmo. O cheiro você acostuma.",
        ],
        "smiter": False,
    },
    {
        "id": "npc:nomade", "name": "Nômade Raiz",
        "look": {"skin": "#b07a4a", "cloak": "#c8a86a", "hood": "up",
                 "hat": "none", "hair": "#2a2018", "staff": True},
        "map": "avasham", "home": (50, 50), "radius": 3, "wanders": True,
        "step_every": 1.3, "solid": True, "kind": "person",
        "greetings": NOMADE_GREETINGS, "smiter": False, "shop_tier": "t2",
    },
    {
        "id": "npc:coveiro", "name": "Coveiro Mórbido",
        "look": {"skin": "#9a8a7a", "cloak": "#2a2a30", "hood": "up",
                 "hat": "none", "hair": "#15131b", "staff": True},
        "map": "valdarkram", "home": (50, 49), "radius": 3, "wanders": True,
        "step_every": 1.4, "solid": True, "kind": "person",
        "greetings": COVEIRO_GREETINGS, "smiter": False, "shop_tier": "t3",
    },
    {
        "id": "npc:cigana", "name": "Cigana Vidente",
        "look": {"skin": "#caa06a", "cloak": "#a0306a", "hood": "down",
                 "hat": "none", "hair": "#1a1a22", "staff": False},
        "map": "ermo", "home": (9, 8), "radius": 2, "wanders": True,
        "step_every": 1.5, "solid": True, "kind": "person",
        "greetings": CIGANA_GREETINGS, "smiter": False, "sells_potion": True,
    },
])
