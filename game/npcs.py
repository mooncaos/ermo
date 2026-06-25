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

def _menina_spec(m):
    return {
        "id": "npc:menina_" + m["name"].lower(),
        "name": m["name"],
        "look": {"skin": m["skin"], "cloak": m["cloak"], "hood": "down",
                 "hat": "none", "hair": m["hair"], "staff": False},
        "home": m["home"], "radius": 1, "wanders": True, "step_every": 1.5,
        "solid": True, "kind": "person", "active": m.get("active", False),
        "bronze": m["bronze"], "desc": m["desc"],
        "murmurs": m.get("murmur", []), "murmur_min": 18, "murmur_max": 28,
        "greetings": m["greet"], "smiter": False,
    }

ROSTER.extend(_menina_spec(m) for m in ITATINGA_MENINAS)


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
    {   # o mercador do RE4, vende Peteco + Mauser C96
        "id": "npc:armeiro", "name": "Vendedor de Arma",
        "look": {"skin": "#8d5524", "cloak": "#3a3530", "hood": "up",
                 "hat": "none", "hair": "#2a2233", "staff": False},
        "home": (10, 21), "radius": 1, "wanders": True, "step_every": 1.6,
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
