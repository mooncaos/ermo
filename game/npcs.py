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


# ----------------------------------------------------------------- GÊNERO dos NPCs
# Sexo (M/F) muda a silhueta no cliente. Mestres derivam do título (Mestra=F).
# As meninas já marcam "sex":"F" no spec. Aqui ficam as demais NPCs femininas;
# todo o resto é M por padrão.
_FEMALE_NPCS = {
    "Beth", "Dalia", "Marlene", "Cleide", "Maria Cachorra",
    "Dona Chica", "Robetina", "Marta", "Xamã Miranda",
    "Marion, a Bruxa", "Cigana Vidente",
}


def sex_of(spec):
    """Devolve 'M' ou 'F' pro NPC. Respeita um 'sex' explícito no registro,
    deriva mestres pelo título, e usa a lista de femininas pro resto."""
    s = spec.get("sex")
    if s in ("M", "F"):
        return s
    name = spec.get("name", "") or ""
    if name.startswith("Mestra"):
        return "F"
    if name.startswith("Mestre"):
        return "M"
    return "F" if name in _FEMALE_NPCS else "M"


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
        "look": {"skin": "#d8c9b0", "cloak": "#5a2e7a", "hat": "none", "hood": "down", "hair": "#2a1a30", "staff": False, "outfit": "x_valdris", "sex": "M"},
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
        "home": (30, 7), "radius": 0, "wanders": False, "step_every": 1.5,
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
                 "hat": "none", "hair": "#15151b", "staff": False, "smoke": True, "grin": True},
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
        "look": {"skin": "#b09070", "cloak": "#5a5a64", "hat": "none", "hood": "down", "hair": "#2a2a30", "staff": False, "outfit": "x_maria", "sex": "F"},
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
                 "hat": "none", "hair": m["hair"], "staff": False, "sex": "F"},
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
MARION_GREETINGS = [
    "Moeda de Avhur... eu sinto o cheiro delas na tua mochila. Traz pra Marion, eu pago bem.",
    "os mercadores te dão 500 por uma moeda dessas. a velha Marion te dá 2500. eu sei o que elas valem de verdade.",
    "não pergunta pra que eu quero as moedas. pergunta só quanto eu pago: 2500 de bronze, cada uma.",
    "*mexe num caldeirão fumegante* Avhur não cunhou aquilo só com metal, forasteiro. me vende as tuas moedas.",
    "cinco vezes o preço de um mercador, por cada Moeda de Avhur. pega ou deixa.",
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
        "look": {"skin": "#a8845c", "cloak": "#6a4a34", "hat": "none", "hood": "down", "hair": "#3a2a1a", "staff": True, "outfit": "x_miranda", "sex": "F"},
        "map": "descampado", "home": (41, 47), "radius": 2, "wanders": True,
        "step_every": 1.6, "solid": True, "kind": "person",
        "greetings": [
            "Eu sou Miranda. Faço amarração contra a tua própria morte, viajante.",
            "A morte cobra caro no Ermo. Por um preço, eu adio a conta dela.",
            "Me traz os restos dos grandes e eu te dou proteção pro além.",
        ],
        "smiter": False, "xama": True,
    },
    # ================= VILA CAIÇARA (Costa de Maravai) =================
    {
        "id": "npc:maricota", "name": "Dona Maricota",
        "look": {"skin": "#8a5a38", "cloak": "#e07030", "hood": "down",
                 "hat": "none", "hair": "#e8e0d8", "staff": False},
        "sex": "F",
        "map": "costa_maravai", "home": (232, 208), "radius": 3, "wanders": True,
        "step_every": 1.6, "solid": True, "kind": "person",
        "murmurs": [
            "Peixe fresco! Saiu do mar faz uma hora!",
            "Essa moqueca leva segredo de três gerações...",
        ],
        "greetings": [
            "Chega mais, benzinho! Peixe assado, moqueca, caldo que levanta defunto.",
            "Tá magro demais pra enfrentar leão, meu filho. Come primeiro.",
        ],
        "smiter": False, "peixaria": True,
    },
    {
        "id": "npc:mestre_bragan", "name": "Mestre Bragan",
        "look": {"skin": "#6a4a30", "cloak": "#5a3a2a", "hood": "down",
                 "hat": "none", "hair": "#3a3028", "staff": False},
        "map": "oficina_ferreiro", "home": (7, 4), "radius": 2, "wanders": True,
        "step_every": 1.7, "solid": True, "kind": "person",
        "murmurs": ['O ferro não mente. Gente mente, ferro não.', 'Prata boa morde vampiro. Anota isso.'],
        "greetings": ['Traz minério que eu te faço lâmina, viajante. A forja tá sempre quente.'],
        "smiter": False, "prof": "ferreiro",
    },
    {
        "id": "npc:mestra_iolanda", "name": "Mestra Iolanda",
        "look": {"skin": "#8a5a38", "cloak": "#7a5030", "hood": "down",
                 "hat": "none", "hair": "#3a3028", "staff": False},
        "sex": "F",
        "map": "oficina_coureiro", "home": (7, 4), "radius": 2, "wanders": True,
        "step_every": 1.7, "solid": True, "kind": "person",
        "murmurs": ['Couro bom se conhece pelo cheiro.', 'Pelagem de lobisomem... isso sim é material.'],
        "greetings": ['Pele crua vira armadura fina nas minhas mãos. Traz o couro, benzinho.'],
        "smiter": False, "prof": "coureiro",
    },
    {
        "id": "npc:mestre_justo", "name": "Mestre Justo",
        "look": {"skin": "#7a5436", "cloak": "#8a6a44", "hood": "down",
                 "hat": "none", "hair": "#3a3028", "staff": False},
        "map": "oficina_carpinteiro", "home": (7, 3), "radius": 2, "wanders": True,
        "step_every": 1.7, "solid": True, "kind": "person",
        "murmurs": ['Madeira torta também vira arco. Só precisa de paciência.', 'Carvalho pro corpo, rubra pra alma.'],
        "greetings": ['Madeira boa e fibra firme: é só o que peço. O resto essas mãos resolvem.'],
        "smiter": False, "prof": "carpinteiro",
    },
    {
        "id": "npc:mestre_vidal", "name": "Mestre Vidal",
        "look": {"skin": "#9a6a48", "cloak": "#4a6a4a", "hood": "down",
                 "hat": "none", "hair": "#3a3028", "staff": False},
        "map": "oficina_alquimista", "home": (7, 4), "radius": 2, "wanders": True,
        "step_every": 1.7, "solid": True, "kind": "person",
        "murmurs": ['Erva solar de dia, lunar de noite. O corpo agradece os dois.', 'A panaceia existe. Só não pergunta o preço.'],
        "greetings": ['Ervas, viajante! Solar, lunar, o que tiver. Eu destilo a cura.'],
        "smiter": False, "prof": "alquimista",
    },
    {
        "id": "npc:mestra_linah", "name": "Mestra Linah",
        "look": {"skin": "#b08a68", "cloak": "#8a3050", "hood": "down",
                 "hat": "none", "hair": "#3a3028", "staff": False},
        "sex": "F",
        "map": "oficina_costureiro", "home": (7, 4), "radius": 2, "wanders": True,
        "step_every": 1.7, "solid": True, "kind": "person",
        "murmurs": ['Uma agulha certa vale por dez espadas.', 'Tecido nobre de Véspera... que desperdício deixar lá.'],
        "greetings": ['Fibra, pele ou veludo: eu costuro proteção em qualquer pano, querido.'],
        "smiter": False, "prof": "costureiro",
    },
    {
        "id": "npc:mestra_petra", "name": "Mestra Petra",
        "look": {"skin": "#7a5436", "cloak": "#d060c0", "hood": "down",
                 "hat": "none", "hair": "#3a3028", "staff": False},
        "sex": "F",
        "map": "oficina_joalheiro", "home": (7, 3), "radius": 2, "wanders": True,
        "step_every": 1.7, "solid": True, "kind": "person",
        "murmurs": ['Toda gema bruta sonha. Eu só acordo elas.', 'Prata e pérola: casamento perfeito.'],
        "greetings": ['Prata, gema, pérola... traz o que o mundo esconde que eu faço brilhar.'],
        "smiter": False, "prof": "joalheiro",
    },
    {
        "id": "npc:mestre_bartolo", "name": "Mestre Bartolo",
        "look": {"skin": "#8a5a38", "cloak": "#a86a40", "hood": "down",
                 "hat": "none", "hair": "#3a3028", "staff": False},
        "map": "oficina_cozinheiro", "home": (7, 4), "radius": 2, "wanders": True,
        "step_every": 1.7, "solid": True, "kind": "person",
        "murmurs": ['Fome é o único inimigo que volta três vezes por dia.', 'Carne de caça com chifre ralado... segredo do banquete.'],
        "greetings": ['Carne fresca aqui vira festim, amigo! Cozinho até presa de vampiro, se tiver coragem.'],
        "smiter": False, "prof": "cozinheiro",
    },
    {
        "id": "npc:irma_solene", "name": "Irmã Solene",
        "look": {"skin": "#b08a68", "cloak": "#e8e0d0", "hood": "up",
                 "hat": "none", "hair": "#d8d0c0", "staff": True},
        "sex": "F",
        "map": "templo_doze", "home": (10, 6), "radius": 2, "wanders": True,
        "step_every": 2.0, "solid": True, "kind": "person",
        "murmurs": [
            "Doze nomes, um só silêncio...",
            "Drazun ri, Atalech observa, Korgath ruge. E o templo escuta todos.",
            "Uma oferenda sincera vale mais que cem juras.",
        ],
        "greetings": [
            "Bem-vindo ao Templo dos Doze, viajante. Uma oferenda de 100 de bronze e os deuses fecham tuas feridas.",
        ],
        "smiter": False, "templo": True,
    },
    {
        "id": "npc:cronista", "name": "Cronista Fabiano",
        "look": {"skin": "#9a6a48", "cloak": "#4a5a7a", "hood": "down",
                 "hat": "none", "hair": "#c8c0b8", "staff": False},
        "map": "ermo", "home": (62, 12), "radius": 1, "wanders": True,
        "step_every": 2.2, "solid": True, "kind": "person",
        "murmurs": [
            "Toda lenda começa com um nome numa página...",
            "O Memorial não esquece. Eu não deixo.",
        ],
        "greetings": [
            "Quer ouvir quem são os heróis do Ermo, viajante? O Memorial guarda cada feito.",
        ],
        "smiter": False, "memorial": True,
    },
    {
        "id": "npc:ze_do_remo", "name": "Zé do Remo",
        "look": {"skin": "#6a4a30", "cloak": "#3a5a7a", "hood": "down",
                 "hat": "straw", "hair": "#4a4038", "staff": True},
        "map": "costa_maravai", "home": (250, 250), "radius": 2, "wanders": True,
        "step_every": 1.8, "solid": True, "kind": "person",
        "murmurs": [
            "Maré tá boa pra viagem, tá sim...",
            "Esse barco já cruzou tempestade que afundava navio grande.",
        ],
        "greetings": [
            "Quer carona pro Ermo, forasteiro? Meu barco corta essa costa num sopro.",
        ],
        "smiter": False, "barqueiro": True,
    },
    {
        "id": "npc:seu_milton", "name": "Seu Milton",
        "look": {"skin": "#7a5436", "cloak": "#8a6a2a", "hood": "down",
                 "hat": "none", "hair": "#c8c0b8", "staff": False},
        "map": "costa_maravai", "home": (262, 226), "radius": 2, "wanders": True,
        "step_every": 1.5, "solid": True, "kind": "person",
        "murmurs": [
            "O búzio nunca mente... só desagrada.",
            "Já vi homem rico virar pobre e pobre virar lenda nessa mesa.",
        ],
        "greetings": [
            "Senta, forasteiro. Duzentos de bronze na mesa e o búzio decide teu dia.",
        ],
        "smiter": False, "buzio": True,
    },
    {
        "id": "npc:conchinha", "name": "Mestra Conchinha",
        "look": {"skin": "#9a6a48", "cloak": "#e8b8d0", "hood": "down",
                 "hat": "none", "hair": "#2a2020", "staff": False},
        "sex": "F",
        "map": "costa_maravai", "home": (222, 232), "radius": 3, "wanders": True,
        "step_every": 1.7, "solid": True, "kind": "person",
        "murmurs": [
            "Concha por concha, o mar me paga o aluguel.",
            "Pérola boa é a que ninguém procurou.",
        ],
        "greetings": [
            "Traz conchas raras da praia que eu te faço tesouro, querido. Bronze só não basta aqui.",
        ],
        "smiter": False, "concha_shop": True,
    },
    {
        "id": "npc:tiao_caicara", "name": "Caiçara Tião",
        "look": {"skin": "#6a4a30", "cloak": "#5a7a5a", "hood": "down",
                 "hat": "straw", "hair": "#2a2420", "staff": False},
        "map": "costa_maravai", "home": (270, 240), "radius": 6, "wanders": True,
        "step_every": 1.4, "solid": False, "kind": "person",
        "murmurs": [
            "Remendando rede, remendando a vida...",
            "O Marajá rugiu de novo ontem. Ninguém pesca no rio da savana faz mês.",
            "Dizem que caranguejo velho guarda pérola. Eu digo que guarda dedo de curioso.",
        ],
        "greetings": [
            "Bem-vindo à vila, forasteiro. Aqui o mar dá o peixe e a savana dá o susto.",
        ],
        "smiter": False,
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
        "id": "npc:marion", "name": "Marion, a Bruxa",
        "look": {"skin": "#b89a7a", "cloak": "#5a2a7a", "hood": "down",
                 "hat": "wizard", "hair": "#1a1020", "staff": True},
        "map": "valdarkram", "home": (47, 49), "radius": 2, "wanders": True,
        "step_every": 1.6, "solid": True, "kind": "person",
        "greetings": MARION_GREETINGS, "smiter": False, "buys_avhur": True,
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

# A Mesa de Confraternizações: um NPC que é uma mesa, no centro da taverna.
# Clicar nela abre a interface de formação de party (ready check mútuo).
ROSTER.append({
    "id": "npc:mesa_confra", "name": "Mesa de Confraternizações",
    "look": {"skin": "#caa06a", "cloak": "#6a4a2a"},
    "map": "taverna", "home": (10, 7), "radius": 0, "wanders": False,
    "step_every": 999, "solid": True, "kind": "mesa",
    "greetings": ["..."], "party_table": True,
})

# A Mesa de Negócios: a irmã comerciante da Mesa de Confraternizações.
# Clicar nela abre o Mercado (vendas assíncronas, taxa de 5%) e as ofertas diretas.
ROSTER.append({
    "id": "npc:mesa_negocios", "name": "Mesa de Negócios",
    "look": {"skin": "#caa06a", "cloak": "#3a5a3a"},
    "map": "taverna", "home": (5, 8), "radius": 0, "wanders": False,
    "step_every": 999, "solid": True, "kind": "mesa",
    "greetings": ["..."], "business_table": True,
})

# JORGE, o Taverneiro: o dono da casa, atrás do balcão, sabe de tudo.
ROSTER.append({
    "id": "npc:jorge", "name": "Jorge, o Taverneiro",
    "look": {"skin": "#c9915a", "cloak": "#6a3a2a", "hat": "none", "hair": "#3a2a1a", "staff": False},
    "map": "taverna", "home": (16, 3), "radius": 1, "wanders": True,
    "step_every": 2.2, "solid": True, "kind": "person",
    "greetings": ["Bem-vindo à minha casa. O que vai ser?",
                  "Cerveja gelada, prato quente e fofoca fresca. Escolhe dois.",
                  "Já limpei esse balcão três vezes hoje. TRÊS.",
                  "Aqui dentro ninguém briga. Lá fora o problema é seu.",
                  "O segredo do hidromel? Não conto nem bêbado."],
    "taverneiro": True,
})

# O QUADRO DE PROCURADOS: contratos rotativos pagos pelo Cofre da Cidade.
ROSTER.append({
    "id": "npc:quadro_procurados", "name": "Quadro de Procurados",
    "look": {"skin": "#8a6a4a", "cloak": "#5a4a3a"},
    "map": "taverna", "home": (14, 2), "radius": 0, "wanders": False,
    "step_every": 999, "solid": True, "kind": "mesa",
    "greetings": ["..."], "contract_board": True,
})


# OS 12 SUMO-SACERDOTES do Templo Estrelado (um altar por deus).
ROSTER.append({
    "id": "npc:sumo_pofnir", "name": "Sumo Aurelian",
    "look": {"skin": "#c9b090", "cloak": "#f2c14e", "hat": "none", "hair": "#e8e8e8", "staff": True},
    "map": "templo_estrelado", "home": (16, 4), "radius": 1, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ['O menino Caio deu leite pro gato branco errado. ERRADO como? TODO gato branco é o certo. AI.',
                  'Pofnir vê. Pofnir SEMPRE vê. E se preocupa com tudo. Como eu. Que honra pesada.', '*deixando um pires de leite* Pra... um amigo. Qualquer amigo branco que aparecer.', 'Uma vela por cada nascimento. A ala das velas está QUASE cheia. Bom sinal. Ou péssimo. AI.', 'Dormi duas horas. Sonhei com ameaças que ainda não existem. Anotei todas.', 'O Supremo é um gato branco e grande. Rir disso é heresia. E burrice.'],
})
ROSTER.append({
    "id": "npc:sumo_vargo", "name": "Suma Morwen",
    "look": {"skin": "#c9b090", "cloak": "#5a5a6a", "hat": "none", "hair": "#e8e8e8", "staff": True},
    "map": "templo_estrelado", "home": (21, 5), "radius": 1, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ['Vargo não leva. Vargo ACOMPANHA. Há diferença.', 'Sonhei com a Grande Passagem. A ilha precisa estar pronta. EU preciso estar pronta.', 'Acendo velas nos túmulos sem nome. Alguém os chamou pelo nome um dia.', "Toda alma que chega de outro mundo passou pela coleira d'Ele.", 'Não tema o fim, criança. Tema chegar nele sem companhia. Disso eu cuido.'],
})
ROSTER.append({
    "id": "npc:sumo_martur", "name": "Sumo Tenaz",
    "look": {"skin": "#c9b090", "cloak": "#7a8a5a", "hat": "none", "hair": "#e8e8e8", "staff": True},
    "map": "templo_estrelado", "home": (25, 9), "radius": 1, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ['Martur conta os séculos como você conta moedas.', 'Meu relógio de água ficará pronto em quarenta anos. Estou ADIANTADO.', 'Meu adversário de xadrez respondeu. Um lance. Levou um mês. JOGO RÁPIDO esse nosso.', 'A pressa é a única blasfêmia que o Jabuti reconhece.', 'Volte amanhã. Ou em dez anos. Para mim é... agora.'],
})
ROSTER.append({
    "id": "npc:sumo_facalan", "name": "Suma Iara",
    "look": {"skin": "#c9b090", "cloak": "#e0865a", "hat": "none", "hair": "#e8e8e8", "staff": True},
    "map": "templo_estrelado", "home": (26, 15), "radius": 1, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ['Facalan não tem dono, não tem templo, não tem paciência. Eu tenho só o templo.', 'Vê essa marca no chão? Coelho. Jovem. Com pressa. Sente pressa também? Ele sentiu primeiro.', 'Ensino as crianças a ler pegadas. O chão fala mais verdade que a boca.', 'Um último rastro digno. É tudo que peço a Ela. Depois... que a mata me tome.', 'Este altar é vazio de propósito. Ela caça onde quer.'],
})
ROSTER.append({
    "id": "npc:sumo_drazun", "name": "Sumo Vermeer",
    "look": {"skin": "#c9b090", "cloak": "#e05a4e", "hat": "none", "hair": "#e8e8e8", "staff": True},
    "map": "templo_estrelado", "home": (25, 20), "radius": 1, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ['Drazun sonha em brasa. Os dragões são os sonhos que escaparam.', 'A ambição é VIRTUDE. Anote. Grite. Espalhe. Eu provarei nem que leve a vida toda... ambicioso? SIM.', '*mexendo num terrário* Calma, Fumacinha. O forasteiro não morde.', "Os draconatos são a prole d'Ele. Quem os despreza, despreza o fogo primeiro.", 'O que você fez com a sua ambição hoje? Nada? Que desperdício de brasa.'],
})
ROSTER.append({
    "id": "npc:sumo_korgath", "name": "Sumo Brakk",
    "look": {"skin": "#c9b090", "cloak": "#a83838", "hat": "none", "hair": "#e8e8e8", "staff": True},
    "map": "templo_estrelado", "home": (21, 24), "radius": 1, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ['KORGATH não pede reza. Pede SUOR.', 'Fui general. Sonho que a ilha nunca precise de um. Estranho? A guerra entende.', 'BRAÇO DE FERRO. Você. Eu. Agora. ...depois da oração. KORGATH PRIMEIRO.', 'A guerra é a oração; a cicatriz, o amém.', 'Riso fácil, punho pesado. O segredo é nunca confundir a hora de cada um.'],
})
ROSTER.append({
    "id": "npc:sumo_corvo", "name": "Suma Pluma",
    "look": {"skin": "#c9b090", "cloak": "#8a7ae0", "hat": "none", "hair": "#e8e8e8", "staff": True},
    "map": "templo_estrelado", "home": (16, 25), "radius": 1, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ["A Pluma... digo, EU soube que o Henri chamou o vinho litúrgico de 'suco abençoado'. O Celestino RIU.",
                  'O Corvo esteve em todos os mundos. E fofoca sobre todos. Fofocar é LITURGIA.', 'Você chegou pela travessia, comprou na Rosa e olhou torto pro Otto. Eu SEI. Eu sempre sei.', '*um corvo pousa e crocita no ouvido dela* ...INTERESSANTE. Continue.', 'Se um corvo te encarar hoje... sorria. Ele conta pra Ele.', 'Segredo é oferenda. Me conta um e os deuses sorriem. Principalmente o meu.'],
})
ROSTER.append({
    "id": "npc:sumo_valiria", "name": "Suma Clara",
    "look": {"skin": "#c9b090", "cloak": "#f2e05a", "hat": "none", "hair": "#e8e8e8", "staff": True},
    "map": "templo_estrelado", "home": (10, 24), "radius": 1, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ['Valiria acende o que a noite tentou apagar.', 'Está doente? Ferido? Cansado? Senta. Curar é o meu fôlego. Recusar seria pecado.', 'Acordo antes do sol. Alguém precisa RECEBER a aurora. Ela gosta de plateia.', '*cantarolando pras ervas* Elas crescem melhor assim. Não discuta com quem cura.', 'Fiz pão de madrugada. Leve um. Leve dois. A fé também se come.'],
})
ROSTER.append({
    "id": "npc:sumo_nherith", "name": "Suma Selene",
    "look": {"skin": "#c9b090", "cloak": "#2a3055", "hat": "none", "hood": "down", "hair": "#e8e8e8", "staff": False, "outfit": "x_selene", "sex": "F"},
    "map": "templo_estrelado", "home": (6, 20), "radius": 1, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ['Nherith rege os sonhos. Dormiu, é hóspede Dela.', '*olhos fechados* ...você vai perder uma coisa amanhã. Ou perdeu ontem. Os sonhos não usam relógio.', 'Bordo constelações que ainda não existem. O céu uma hora alcança.', 'A Morwen sonhou a Grande Passagem. Eu vou decifrá-la. A lua me deve essa.', 'Minhas olheiras? Troféus. Cada noite mal dormida foi uma conversa com Ela.'],
})
ROSTER.append({
    "id": "npc:sumo_jose", "name": "Sumo Gozo",
    "look": {"skin": "#c9b090", "cloak": "#e08ae0", "hat": "none", "hair": "#e8e8e8", "staff": True},
    "map": "templo_estrelado", "home": (5, 15), "radius": 1, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ['José entende os prazeres. Por isso o acorrentaram.', 'Celebrar SEM culpa. É disciplina, sabia? A mais difícil de todas.', 'Um brinde é uma prece curta. Saúde!', 'Hedonista disciplinado. Parece contradição. Não é. Prazer sem medida vira fuga; com medida, vira ORAÇÃO.', 'Às vezes fecho os olhos e danço com os gatos do cabaré. Em espírito. Eles são ótimos de salão.'],
})
ROSTER.append({
    "id": "npc:sumo_bragor", "name": "Sumo Ferro",
    "look": {"skin": "#c9b090", "cloak": "#8a6a3a", "hat": "none", "hair": "#e8e8e8", "staff": True},
    "map": "templo_estrelado", "home": (6, 9), "radius": 1, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ['Bragor jura pelo metal. O metal não mente.', '*polindo um martelo sem cabo* Aposentado, não inútil. Respeite os veteranos.', 'Todo juramento honesto ecoa na Forja Dele.', 'Uma noite. Uma bigorna. Ele e eu. É tudo que peço. O ferro sabe esperar.', 'Quebrou? Traz. Conserto de graça o que ninguém vê quebrado. Principalmente esses.'],
})
ROSTER.append({
    "id": "npc:sumo_nhare", "name": "Suma Sorte",
    "look": {"skin": "#c9b090", "cloak": "#7ac06a", "hat": "none", "hair": "#e8e8e8", "staff": True},
    "map": "templo_estrelado", "home": (10, 5), "radius": 1, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ['Nharé é a segunda chance que você não merecia. Eu que o diga.', 'Ganhei de novo. EU NEM QUERIA GANHAR. Uma derrota, Lebre. UMA. É pedir muito?', '*joga uma moeda* Cara: ensopado. Coroa: ensopado também. A moeda gosta de ensopado.', 'Deixo as portas destrancadas. Por princípio. Quem precisa fugir, foge; quem precisa entrar... que os deuses julguem.', 'Meu passado? *sorri* Aposto que você não adivinha. ...viu? Ganhei DE NOVO. Droga.'],
})

# OS PRIMEIROS MAGOS DO CONCLAVE DA AURORA (a Torre da Alvorada)
ROSTER.append({
    "id": "npc:maga_lyra", "name": "Maga Lyra, a Segunda Voz",
    "look": {"skin": "#c9a06a", "cloak": "#4a6ab0", "hat": "none", "hood": "down", "hair": "#2a2a3a", "staff": True, "outfit": "mago_alvorada", "addons": [1, 2], "sex": "F"},
    "map": "torre_alvorada", "home": (6, 5), "radius": 2, "wanders": True,
    "step_every": 3.0, "solid": True, "kind": "person",
    "greetings": ["A Cecille fez a biblioteca 'parecer maior'. Agora ninguém acha a seção de história. PARABÉNS, Cecille.",
                  "O Heron lidera. Eu organizo. O Conclave anda porque ALGUÉM lembra das chaves.",
                  "A magia me escolheu aos sete anos. Levei vinte pra parar de pedir desculpas por isso.",
                  "A cadeira do Cronista? Não toque. É dele. Será dele. O Heron acredita, então eu acredito.",
                  "Aqui ninguém pergunta de onde veio o seu dom. Só o que você fará com ele."],
})
ROSTER.append({
    "id": "npc:mago_bramir", "name": "Mago Bramir, o Muro",
    "look": {"skin": "#a8845c", "cloak": "#4a6ab0", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": True, "outfit": "mago_alvorada", "addons": [1, 2], "sex": "M"},
    "map": "torre_alvorada", "home": (18, 5), "radius": 2, "wanders": True,
    "step_every": 3.6, "solid": True, "kind": "person",
    "greetings": ['Defesa não é medo. É a certeza de que o amanhã merece existir.',
                  "Abjuração. A magia de DIZER NÃO. Subestimada por todo tolo que já explodiu.",
                  "Vi Valdarkram cair. Meus escudos seguraram uma rua inteira. UMA. Nunca esqueço as outras.",
                  "Marion nos enganou por anos. Meus escudos não a pegaram. Escudos não param sorrisos.",
                  "O jovem que estuda proteção salva mais vidas que dez que estudam fogo."],
})
ROSTER.append({
    "id": "npc:maga_cecille", "name": "Maga Cecille, a Véspera",
    "look": {"skin": "#e0c9a8", "cloak": "#4a6ab0", "hat": "none", "hood": "down", "hair": "#e8e0d0", "staff": False, "outfit": "mago_alvorada", "addons": [1, 2], "sex": "F"},
    "map": "torre_alvorada", "home": (12, 8), "radius": 2, "wanders": True,
    "step_every": 2.8, "solid": True, "kind": "person",
    "greetings": ['O crepúsculo me ensinou: toda luz que parte prometeu voltar.',
                  "Ilusão não é mentira. É a verdade ensaiando.",
                  "Fiz esta biblioteca parecer maior por dentro. ...ou não fiz? Viu? FUNCIONA.",
                  "Sonho em cores que não existem. A Suma Selene diz que existem SIM, só ainda não chegaram.",
                  "O Conclave me acolheu quando me chamavam de bruxa da névoa. Aqui, névoa é currículo."],
})
ROSTER.append({
    "id": "npc:aprendiz_tobias", "name": "Tobias, Aprendiz Prodígio",
    "look": {"skin": "#c9a06a", "cloak": "#4a6ab0", "hat": "none", "hood": "down", "hair": "#8a5a2a", "staff": False, "outfit": "mago_alvorada", "addons": [], "sex": "M"},
    "map": "torre_alvorada", "home": (12, 4), "radius": 3, "wanders": True,
    "step_every": 2.2, "solid": True, "kind": "person",
    "greetings": ["Decorei os doze tomos básicos! O Heron disse 'agora esqueça e PENSE'. Estou... tentando.",
                  "Eu NÃO explodi a estante três. Foi a estante que... tá, fui eu. NÃO CONTA PRO BRAMIR.",
                  "Decorei quatrocentos glifos. O quatrocentos e um me odeia pessoalmente.",
                  "O Arquimago rega uma flor lá em cima todo dia. Um dia eu pergunto por quê. Um dia.",
                  "Quando eu crescer quero ser o Cronista! ...que é isso? Por que a Lyra tá me olhando assim?"],
})

# OS CIDADÃOS DA ILHA (a vida de todo dia)
ROSTER.append({
    "id": "npc:naiara", "name": "Naiara, a Pescadora",
    "look": {"skin": "#a8845c", "cloak": "#4a7a8a", "hat": "none", "hair": "#1a1a20", "staff": False},
    "map": "vilalbina", "home": (14, 22), "radius": 4, "wanders": True,
    "step_every": 2.4, "solid": True, "kind": "person",
    "greetings": ['Rede boa é rede remendada. Igual gente: os nós contam a história.',
                  'O Bruno trocou pão por peixe comigo. Melhor negócio da ilha. Não conta pro Otto.',
                  "O mar deu pouco hoje. O mar sabe o que faz. Eu é que não.",
                  "O Tião jura que o peixe-rei existe. Quarenta anos jurando. Eu quase acredito.",
                  "Remendo rede melhor que muito marido remenda promessa."],
})
ROSTER.append({
    "id": "npc:bruno_padeiro", "name": "Bruno, o Padeiro",
    "look": {"skin": "#e0c9a8", "cloak": "#c9b090", "hat": "none", "hair": "#6a4a2a", "staff": False},
    "map": "vilalbina", "home": (8, 8), "radius": 3, "wanders": True,
    "step_every": 2.8, "solid": True, "kind": "person",
    "greetings": ['O segredo do pão quente? Acordar antes do sol e não contar segredo nenhum.',
                  'A Suma Clara elogiou meu pão. EU SEI que o dela é melhor. Santa E diplomata.',
                  "Pão quentinho! O trigo do Trigal, o fermento é segredo, o cheiro é de graça.",
                  "A Suma Clara também faz pão de madrugada. Concorrência SANTA é a pior que tem.",
                  "Farinha na roupa não é sujeira. É uniforme."],
})
ROSTER.append({
    "id": "npc:caio_menino", "name": "Caio",
    "look": {"skin": "#c9a06a", "cloak": "#e0865a", "hat": "none", "hair": "#2a1a10", "staff": False},
    "map": "vilalbina", "home": (20, 12), "radius": 6, "wanders": True,
    "step_every": 1.2, "solid": False, "kind": "person",
    "greetings": ["Um dia vou pescar o peixe-rei! O Tião diz que ele existe. A mamãe diz 'sei'.",
                  'O professor Anselmo ensina conta. Eu ensino ele a fazer pipa. Tamo quite!',
                  "NÃO PISA NA LINHA! ...perdeu. Tá pagando.",
                  "A Suma Iara me ensinou a ler pegada! Aquela ali é sua. Aquela é de gaivota. Aquela é MISTÉRIO.",
                  "Quando eu crescer vou remar que nem o Zé! Minha mãe falou que primeiro eu cresço."],
})
ROSTER.append({
    "id": "npc:guarda_vico", "name": "Guarda Vico",
    "look": {"skin": "#a8845c", "cloak": "#3a4a5a", "hat": "cap", "hair": "#2a2a2a", "staff": False},
    "map": "prospera", "home": (38, 20), "radius": 5, "wanders": True,
    "step_every": 3.2, "solid": True, "kind": "person",
    "greetings": ['A Guarda da Alvorada chegou cheia de elmo bonito. Eu guardo essa esquina há 20 anos. No sereno.',
                  'O menino Caio atravessou a praça em oito segundos. Recorde. Multei. Ele emoldurou a multa.',
                  "Sem correria na praça. A fonte é da cidade, o mergulho é multa.",
                  "Lady Diana passa às seis. TUDO tem que estar perfeito às cinco e meia.",
                  "Ronda tranquila. Em Prospera até os pombos respeitam a fila."],
})
ROSTER.append({
    "id": "npc:florista_marta", "name": "Marta, a Florista",
    "look": {"skin": "#e0c9a8", "cloak": "#e05a8a", "hat": "none", "hair": "#8a4a2a", "staff": False},
    "map": "prospera", "home": (47, 26), "radius": 4, "wanders": True,
    "step_every": 2.6, "solid": True, "kind": "person",
    "greetings": ['Flor do jardim do templo não se vende. Se merece.',
                  'A Madre Aurora conversa com as roseiras. E o pior: elas obedecem.',
                  "Flores frescas! As rosas da Lady eu não vendo. Ninguém consegue. São IMPOSSÍVEIS.",
                  "Todo mês alguém compra um buquê anônimo de doces... digo, DE FLORES. Esquece.",
                  "Uma flor na lapela muda o dia. Duas mudam a semana. Três? Casamento."],
})
ROSTER.append({
    "id": "npc:escriba_nino", "name": "Escriba Nino",
    "look": {"skin": "#c9b090", "cloak": "#6a5a8a", "hat": "none", "hair": "#3a3a4a", "staff": False},
    "map": "prospera", "home": (60, 30), "radius": 3, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ['Anoto tudo. TUDO. Um dia isso vira história. Ou fofoca com data.',
                  'Minha pena quebrou três vezes hoje. O papel sabe quando a notícia é grande.',
                  "Cartas, contratos, declarações de amor. Cobro por palavra; suspiro é grátis.",
                  "O Otto pediu um contrato de dez páginas pra vender UMA corda. Eu cobrei por página.",
                  "A história desta ilha caberia num livro. Estou na página doze há três anos."],
})
ROSTER.append({
    "id": "npc:dora_fazendeira", "name": "Dora, a Fazendeira",
    "look": {"skin": "#a8845c", "cloak": "#c9a05a", "hat": "none", "hair": "#6a5a3a", "staff": False},
    "map": "trigal_dourado", "home": (18, 12), "radius": 5, "wanders": True,
    "step_every": 2.8, "solid": True, "kind": "person",
    "greetings": ['Terra não aceita preguiça nem mentira. Por isso me dou bem com ela.',
                  "O Lorde Fadogan mói minha colheita de graça 'entre vizinhos'. Nobreza é isso: renda alheia.",
                  "O trigo cresceu numa noite, dizem. O MEU cresce em quatro meses e com reza.",
                  "O Rei Marth veio aqui uma vez. Conversou com a plantação. A plantação MELHOROU. Não questiono.",
                  "Espantalho novo. O corvo pousa NELE agora. Acho que virou amizade."],
})
ROSTER.append({
    "id": "npc:pastor_elias", "name": "Pastor Elias",
    "look": {"skin": "#c9a06a", "cloak": "#7a8a5a", "hat": "none", "hair": "#d8d8d8", "staff": True},
    "map": "pastos", "home": (26, 16), "radius": 5, "wanders": True,
    "step_every": 3.0, "solid": True, "kind": "person",
    "greetings": ['Ovelha perdida sempre volta. Gente também, mas demora mais.',
                  'A Suma Iara assobia e o lobo VAI EMBORA. Eu assobio e as ovelhas RIEM. Cada um com seu dom.',
                  "Ovelha não foge. Ovelha EXPLORA. Quem foge é o meu sossego.",
                  "O lobo negro rondou ontem. Assobiei o assobio da Iara. Ele foi embora. Ela ensina isso, sabia?",
                  "Céu limpo, capim alto, ninguém gritando meu nome. Dia perfeito."],
})

# ============ O SEGUNDO POVOAMENTO (rodada de julho/2026) ============
# --- Vilalbina: a rendeira-pirata, o filósofo e o mosteiro ---
ROSTER.append({"id": "npc:guarda_dia_0", "name": "Soldado da Alvorada Alvo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_noite_0", "name": "Soldado da Alvorada Sten",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_dia_1", "name": "Soldado da Alvorada Bran",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_noite_1", "name": "Soldado da Alvorada Torr",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_dia_2", "name": "Soldado da Alvorada Caio",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_noite_2", "name": "Soldado da Alvorada Ulf",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_dia_3", "name": "Soldado da Alvorada Duro",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_noite_3", "name": "Soldado da Alvorada Varo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_dia_4", "name": "Soldado da Alvorada Ergo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_noite_4", "name": "Soldado da Alvorada Wael",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_dia_5", "name": "Soldado da Alvorada Fael",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_noite_5", "name": "Soldado da Alvorada Xan",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_dia_6", "name": "Soldado da Alvorada Gor",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_noite_6", "name": "Soldado da Alvorada Yorn",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_dia_7", "name": "Soldado da Alvorada Hux",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_noite_7", "name": "Soldado da Alvorada Zed",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_dia_8", "name": "Soldado da Alvorada Ivo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_noite_8", "name": "Soldado da Alvorada Adro",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_dia_9", "name": "Soldado da Alvorada Joran",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_noite_9", "name": "Soldado da Alvorada Belo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_dia_10", "name": "Soldado da Alvorada Kel",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_noite_10", "name": "Soldado da Alvorada Corvo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_dia_11", "name": "Soldado da Alvorada Lorn",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_noite_11", "name": "Soldado da Alvorada Dax",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_dia_12", "name": "Soldado da Alvorada Murn",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_noite_12", "name": "Soldado da Alvorada Enzo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_dia_13", "name": "Soldado da Alvorada Nael",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_noite_13", "name": "Soldado da Alvorada Frey",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_dia_14", "name": "Soldado da Alvorada Osk",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_noite_14", "name": "Soldado da Alvorada Galo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_dia_15", "name": "Soldado da Alvorada Pel",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_noite_15", "name": "Soldado da Alvorada Hemo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_dia_16", "name": "Soldado da Alvorada Quim",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_noite_16", "name": "Soldado da Alvorada Iron",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_dia_17", "name": "Soldado da Alvorada Rulf",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_noite_17", "name": "Soldado da Alvorada Juno",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_dia_18", "name": "Soldado da Alvorada Sten",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_noite_18", "name": "Soldado da Alvorada Alvo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_dia_19", "name": "Soldado da Alvorada Torr",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_noite_19", "name": "Soldado da Alvorada Bran",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_dia_20", "name": "Soldado da Alvorada Ulf",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_noite_20", "name": "Soldado da Alvorada Caio",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_dia_21", "name": "Soldado da Alvorada Varo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_noite_21", "name": "Soldado da Alvorada Duro",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_dia_22", "name": "Soldado da Alvorada Wael",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_noite_22", "name": "Soldado da Alvorada Ergo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_dia_23", "name": "Soldado da Alvorada Xan",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_noite_23", "name": "Soldado da Alvorada Fael",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_dia_24", "name": "Soldado da Alvorada Yorn",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_noite_24", "name": "Soldado da Alvorada Gor",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_dia_25", "name": "Soldado da Alvorada Zed",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_noite_25", "name": "Soldado da Alvorada Hux",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_dia_26", "name": "Soldado da Alvorada Adro",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_noite_26", "name": "Soldado da Alvorada Ivo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Dizem que o Lorde Comandante nunca perdeu um duelo. Eu acredito. Você viu o tamanho dele?', 'Silêncio no posto quando tem nobre. Fofoca liberada quando não tem. Regra de ouro.', 'Sol nascente no ombro, dever no peito. Guarda da Alvorada!'],
})
ROSTER.append({"id": "npc:guarda_dia_27", "name": "Soldado da Alvorada Belo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_noite_27", "name": "Soldado da Alvorada Joran",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo serve no Trigal. Diz que lá só passa vento e vaca. Sorte a minha, na cidade.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.', 'Fim de turno é vida de gente comum. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_dia_28", "name": "Soldado da Alvorada Corvo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_noite_28", "name": "Soldado da Alvorada Kel",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é cerveja na taverna.'],
})
ROSTER.append({"id": "npc:guarda_dia_29", "name": "Soldado da Alvorada Dax",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_noite_29", "name": "Soldado da Alvorada Lorn",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Vou de folga.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.'],
})
ROSTER.append({"id": "npc:guarda_dia_30", "name": "Soldado da Alvorada Enzo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é descanso no quartel.', 'Sol nascente no ombro, dever no peito.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.'],
})
ROSTER.append({"id": "npc:guarda_noite_30", "name": "Soldado da Alvorada Murn",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é descanso no quartel.', 'Sol nascente no ombro, dever no peito.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.'],
})
ROSTER.append({"id": "npc:guarda_dia_31", "name": "Soldado da Alvorada Frey",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Semana que vem, se o dia ajudar.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.', 'Silêncio no posto quando tem nobre. Regra de ouro.', 'Fim de turno é refeitório e cama. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_noite_31", "name": "Soldado da Alvorada Nael",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Semana que vem, se o dia ajudar.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.', 'Silêncio no posto quando tem nobre. Regra de ouro.', 'Fim de turno é refeitório e cama. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_dia_32", "name": "Soldado da Alvorada Galo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é descanso no quartel.', 'Sol nascente no ombro, dever no peito.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.'],
})
ROSTER.append({"id": "npc:guarda_noite_32", "name": "Soldado da Alvorada Osk",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto tranquilo hoje. Tranquilo demais. Desconfio.', 'Você viu a Tenente treinando os novatos? Coitados. Bela dor.', 'Meu turno acaba ao anoitecer. Aí é descanso no quartel.', 'Sol nascente no ombro, dever no peito.', 'A Guarda Real tem outfit dourado. A gente tem azul. Ciúme? Um pouco.'],
})
ROSTER.append({"id": "npc:guarda_dia_33", "name": "Soldado da Alvorada Hemo",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Semana que vem, se o dia ajudar.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.', 'Silêncio no posto quando tem nobre. Regra de ouro.', 'Fim de turno é refeitório e cama. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_noite_33", "name": "Soldado da Alvorada Pel",
    "look": {"skin": "#c9a06a", "cloak": "#3a4a6a", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_alvorada"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Ei, colega de farda! Ouviu do festival de São Celeste? Semana que vem, se o dia ajudar.', 'Guardar Prospera é honra. Guardar de pé oito horas é CANSAÇO. As duas coisas.', 'O cozinheiro Lau faz um ensopado... vale a alistada só por isso.', 'Silêncio no posto quando tem nobre. Regra de ouro.', 'Fim de turno é refeitório e cama. Amo as duas metades do meu dia.'],
})
ROSTER.append({"id": "npc:guarda_dia_34", "name": "Guarda Real Iron",
    "look": {"skin": "#c9a06a", "cloak": "#c9a842", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_real"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['A Lady Diana caminha; eu sou a sombra dourada dela. Sombra não conversa. Mas hoje abro exceção.', 'Guarda Real não pisca. Treinei dois anos. Minha esposa discorda, mas ela não é o manual.', 'O ouro desta armadura pesa menos que o juramento.', 'Já vi a Lady falar com o mar. O mar respondeu. Não consta no relatório.', 'Entre mim e um perigo até ela, há exatamente: nada. É assim que deve ser.'],
})
ROSTER.append({"id": "npc:guarda_noite_34", "name": "Guarda Real Quim",
    "look": {"skin": "#c9a06a", "cloak": "#c9a842", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_real"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['A Lady Diana caminha; eu sou a sombra dourada dela. Sombra não conversa. Mas hoje abro exceção.', 'Guarda Real não pisca. Treinei dois anos. Minha esposa discorda, mas ela não é o manual.', 'O ouro desta armadura pesa menos que o juramento.', 'Já vi a Lady falar com o mar. O mar respondeu. Não consta no relatório.', 'Entre mim e um perigo até ela, há exatamente: nada. É assim que deve ser.'],
})
ROSTER.append({"id": "npc:guarda_dia_35", "name": "Guarda Real Juno",
    "look": {"skin": "#c9a06a", "cloak": "#c9a842", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_real"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto: a praça. Missão: a Lady. Distração: zero. Bem... a fonte é bonita. ZERO, eu disse.', 'O dourado chama atenção. É o ponto: olhem pra mim, não pra ela.', 'A Saudação da Aurora arrepia até quem está NA formação. Confirmo por fonte primária.', 'Guarda comum protege lugares. Nós protegemos histórias vivas.', 'Meu elmo reflete o sol. Já ceguei um batedor de carteira sem tirar a mão do cinto.'],
})
ROSTER.append({"id": "npc:guarda_noite_35", "name": "Guarda Real Rulf",
    "look": {"skin": "#c9a06a", "cloak": "#c9a842", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_real"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto: a praça. Missão: a Lady. Distração: zero. Bem... a fonte é bonita. ZERO, eu disse.', 'O dourado chama atenção. É o ponto: olhem pra mim, não pra ela.', 'A Saudação da Aurora arrepia até quem está NA formação. Confirmo por fonte primária.', 'Guarda comum protege lugares. Nós protegemos histórias vivas.', 'Meu elmo reflete o sol. Já ceguei um batedor de carteira sem tirar a mão do cinto.'],
})
ROSTER.append({"id": "npc:guarda_dia_36", "name": "Guarda Real Alvo",
    "look": {"skin": "#c9a06a", "cloak": "#c9a842", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_real"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['O Lorde Dante quase não sai. Quando sai, eu vou junto. Já decorei o silêncio dele.', "O farol acende sozinho, dizem. Eu digo: nada perto do Lorde é 'sozinho'.", 'Guardar um homem que fala com a insônia ensina paciência de pedra.', 'No festival ele sorriu. Uma vez. Anotei a data.', 'Ouro por fora, prontidão por dentro. O resto é postura.'],
})
ROSTER.append({"id": "npc:guarda_noite_36", "name": "Guarda Real Sten",
    "look": {"skin": "#c9a06a", "cloak": "#c9a842", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_real"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['O Lorde Dante quase não sai. Quando sai, eu vou junto. Já decorei o silêncio dele.', "O farol acende sozinho, dizem. Eu digo: nada perto do Lorde é 'sozinho'.", 'Guardar um homem que fala com a insônia ensina paciência de pedra.', 'No festival ele sorriu. Uma vez. Anotei a data.', 'Ouro por fora, prontidão por dentro. O resto é postura.'],
})
ROSTER.append({"id": "npc:guarda_dia_37", "name": "Guarda Real Bran",
    "look": {"skin": "#c9a06a", "cloak": "#c9a842", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_real"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto: o farol. O vento aqui conta segredos. Sou pago pra não repetir.', 'O Lorde Dante toca violão de madrugada. É a melhor guarda-noturna que já fiz.', 'Dois anos guardando a margem. O mar ainda tenta me intimidar. Fofo.', 'A Lady Diana visita o irmão às vezes. Nesses dias, o farol brilha diferente. Fato.', 'Guarda Real não teme onda, sombra ou tédio. O tédio foi o mais difícil.'],
})
ROSTER.append({"id": "npc:guarda_noite_37", "name": "Guarda Real Torr",
    "look": {"skin": "#c9a06a", "cloak": "#c9a842", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_real"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Posto: o farol. O vento aqui conta segredos. Sou pago pra não repetir.', 'O Lorde Dante toca violão de madrugada. É a melhor guarda-noturna que já fiz.', 'Dois anos guardando a margem. O mar ainda tenta me intimidar. Fofo.', 'A Lady Diana visita o irmão às vezes. Nesses dias, o farol brilha diferente. Fato.', 'Guarda Real não teme onda, sombra ou tédio. O tédio foi o mais difícil.'],
})
ROSTER.append({"id": "npc:guarda_dia_38", "name": "Guarda Real Caio",
    "look": {"skin": "#c9a06a", "cloak": "#c9a842", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_real"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['O Solar guarda o Rei e a Rainha-mãe. Eu guardo a porta. Divisão justa de fardos.', 'A Rainha Valesca me oferece chá às 17h. Recuso em serviço. Ela insiste. Eu derreto por dentro. Recuso.', 'O Rei Marth cumprimenta pelo nome. TODOS nós. Isso compra lealdade eterna.', 'Dourado na porta do Solar: metade decoração, metade AVISO.', 'Já barrei um vendedor de mapas do tesouro. Duas vezes. O mesmo. Persistente.'],
})
ROSTER.append({"id": "npc:guarda_noite_38", "name": "Guarda Real Ulf",
    "look": {"skin": "#c9a06a", "cloak": "#c9a842", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_real"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['O Solar guarda o Rei e a Rainha-mãe. Eu guardo a porta. Divisão justa de fardos.', 'A Rainha Valesca me oferece chá às 17h. Recuso em serviço. Ela insiste. Eu derreto por dentro. Recuso.', 'O Rei Marth cumprimenta pelo nome. TODOS nós. Isso compra lealdade eterna.', 'Dourado na porta do Solar: metade decoração, metade AVISO.', 'Já barrei um vendedor de mapas do tesouro. Duas vezes. O mesmo. Persistente.'],
})
ROSTER.append({"id": "npc:guarda_dia_39", "name": "Guarda Real Duro",
    "look": {"skin": "#c9a06a", "cloak": "#c9a842", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_real"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Porta do Solar, turno firme. As colunas e eu já somos íntimos.', 'O Almirante late comigo às visitas. Fazemos dupla. Ele é o mau policial.', 'Vi a coroa de perto uma vez. Preferi o sorriso da Rainha-mãe. Não conte.', 'Guarda Real do Solar: o posto que todo novato sonha e todo veterano defende.', 'Se a Aurora tem um poder, é este: fazer a legião inteira acreditar na mesma manhã.'],
})
ROSTER.append({"id": "npc:guarda_noite_39", "name": "Guarda Real Varo",
    "look": {"skin": "#c9a06a", "cloak": "#c9a842", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False, "outfit": "guarda_real"},
    "map": "quartel_alvorada", "home": (14, 14), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Porta do Solar, turno firme. As colunas e eu já somos íntimos.', 'O Almirante late comigo às visitas. Fazemos dupla. Ele é o mau policial.', 'Vi a coroa de perto uma vez. Preferi o sorriso da Rainha-mãe. Não conte.', 'Guarda Real do Solar: o posto que todo novato sonha e todo veterano defende.', 'Se a Aurora tem um poder, é este: fazer a legião inteira acreditar na mesma manhã.'],
})
ROSTER.append({"id": "npc:demetrius", "name": "Lorde Comandante Demétrius Prosperi",
    "look": {"skin": "#c9b090", "cloak": "#2a3a5a", "hat": "none", "hood": "down", "hair": "#8a8a8a", "staff": False, "outfit": "oficial_alvorada"},
    "map": "quartel_alvorada", "home": (5, 4), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Setenta e duas lâminas sob meu comando. E ainda assim durmo de espada ao alcance.',
                  'Sou Demétrius Prosperi. Meu irmão Marth governa com trigo; eu, com aço.', 'A Guarda da Alvorada não dorme. Bem, dorme em turnos. Mas a vigília nunca cessa.', 'Prospera sob meu escudo é Prospera que amanhece em paz. Todo dia. Sem exceção.', 'Meu sobrinho Dante se tranca no farol. Eu me tranco na muralha. Cada Prosperi tem seu posto.'],
})
ROSTER.append({"id": "npc:maria_valmont", "name": "Tenente Maria Valmont",
    "look": {"skin": "#e0c9a8", "cloak": "#2a3a5a", "hat": "none", "hood": "down", "hair": "#5a3a2a", "staff": False, "outfit": "oficial_alvorada", "sex": "F"},
    "map": "quartel_alvorada", "home": (24, 5), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu primo Fagnin vende relíquias no martelo. Eu defendo as que não têm preço.',
                  'Valmont, sim. A ovelha marmota da família virou soldado. Orgulho de ninguém, menos meu.', 'O Lorde Comandante confia em mim. É só o que me importa. Que a corte comente.', 'Treino os novatos na base do grito e do exemplo. Funciona. Dói, mas funciona.', 'Minha prima Isolda serve chá. Eu sirvo justiça. Adivinha qual Valmont dorme melhor.'],
})
ROSTER.append({"id": "npc:mago_var", "name": "Arquimago-Comandante Varo",
    "look": {"skin": "#c9b090", "cloak": "#2a3a5a", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": False, "outfit": "oficial_alvorada"},
    "map": "quartel_alvorada", "home": (24, 3), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['No Conclave sou o mais novo. No quartel, o mais estranho. Em ambos, necessário.',
                  'Heron estuda as estrelas. Eu estudo como derrubá-las se atacarem.',
                  'Sou a magia da Guarda e a espada do Conclave. Dois postos, uma só mente.', 'De dia estudo com o Heron; de noite guardo Prospera. Magos não descansam, otimizam.', 'Um exército sem mago é um punho sem polegar. Eu sou o polegar.'],
})
ROSTER.append({"id": "npc:clerigo_bat", "name": "Clériga de Batalha Solenne",
    "look": {"skin": "#c9a06a", "cloak": "#2a3a5a", "hat": "none", "hood": "down", "hair": "#c9a842", "staff": False, "outfit": "oficial_alvorada", "sex": "F"},
    "map": "quartel_alvorada", "home": (5, 5), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Valiria não pede que eu escolha entre o altar e o escudo. Ela É os dois.',
                  'Já rezei em campo de batalha. A acústica é péssima, mas a fé chega.',
                  'Curo o que a espada abre e abençoo o que a espada fecha. Valiria me guia.', 'Sirvo no Templo E no Quartel. A fé protege a alma; eu protejo o corpo que a carrega.', 'Antes da batalha, a oração. Depois da batalha, a bandagem. Eu faço as duas.'],
})
ROSTER.append({"id": "npc:mordomo_gil", "name": "Gil, o Mordomo",
    "look": {"skin": "#c9a06a", "cloak": "#2a2a34", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": False},
    "map": "quartel_alvorada", "home": (4, 2), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Setenta e dois pares de botas. Eu conto. Eu SEMPRE conto.',
                  'O tio Jacques diz que servir é arte. Aqui é logística de guerra.',
                  'O Lorde Comandante dobra a própria capa. Eu finjo que não vi. Protocolo.',
                  'Meu tio Jacques serve os Angard. Eu sirvo a legião. Suspiro igual, fardo maior.', 'Cem soldados pra alimentar, vestir e ORGANIZAR. Tio Jacques só tem dez nobres. Amador.'],
})
ROSTER.append({"id": "npc:mordomo_val", "name": "Valdo, o Mordomo",
    "look": {"skin": "#c9a06a", "cloak": "#2a2a34", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "quartel_alvorada", "home": (27, 3), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Papai poliu selas a vida toda na Baixa. Eu pulo armaduras. Subimos na vida... de material.',
                  'A Tenente exige o refeitório impecável. O Lau suja em dez minutos. Meu ciclo eterno.',
                  'Entre a tropa e os oficiais há uma hierarquia. Entre eu e o Gil, uma rivalidade cordial.',
                  'Meu pai Juvenal tem o sobrado da Baixa. Eu tenho o quartel inteiro pra polir.', 'O Gil cuida dos oficiais, eu da tropa. Dividir pra reinar. Ou pra sobreviver.'],
})
ROSTER.append({"id": "npc:cozinheiro_lau", "name": "Lau, o Cozinheiro",
    "look": {"skin": "#6a4a34", "cloak": "#e0a850", "hat": "none", "hood": "down", "hair": "#1a1a20", "staff": False},
    "map": "quartel_alvorada", "home": (5, 20), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Mamãe adoça a Baixa. Eu sustento um exército. O tempero é o mesmo: capricho.',
                  'Sopa rala em dia de treino pesado? Nunca. A Tenente me esganava.',
                  'Minha mãe Luzia faz doce pra Baixa. Eu faço rango pra 72 soldados famintos. RESPEITO.', 'Segredo do meu ensopado? Herança da mãe: capricho e uma pitada de deboche.', 'Soldado bem comido não reclama. Soldado com fome... aí a Tenente que resolve.'],
})
ROSTER.append({"id": "npc:chefe_armas", "name": "Ferro, o Chefe de Armas",
    "look": {"skin": "#b09070", "cloak": "#3a3a4a", "hat": "none", "hood": "down", "hair": "#2a1a10", "staff": False},
    "map": "quartel_alvorada", "home": (4, 3), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['O Bito ganha mais ferrando égua. Mas espada minha nunca falhou em campo. Empate moral.',
                  'Novato que devolve lâmina cega paga com flexão. Cinquenta. A armaria agradece.',
                  'Meu irmão Bito ferra égua com ouro. Eu afio espada com ódio. Ofício de família.', 'Cada lâmina desta armaria passou pela minha pedra. Cada uma. Duas vezes.', 'Arma cega mata o dono. Por isso aqui NENHUMA é cega. Nem os soldados, espero.'],
})
ROSTER.append({"id": "npc:seu_fino", "name": "Seu Fino, o Barbeiro",
    "look": {"skin": "#c9a06a", "cloak": "#e8e0d0", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": False},
    "map": "loja_barbearia", "home": (5, 5), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Navalha afiada, ouvido mais ainda. Senta que eu sei de TUDO.', 'Cortei o cabelo do Rei Marth uma vez. UMA. Conto essa história há vinte anos.', "Barba diz muito de um homem. A sua diz 'me ajuda'."],
})
ROSTER.append({"id": "npc:tico_espuma", "name": "Tico Espuma, aprendiz",
    "look": {"skin": "#e0c9a8", "cloak": "#a8c8e0", "hat": "none", "hood": "down", "hair": "#8a4a2a", "staff": False},
    "map": "loja_barbearia", "home": (3, 5), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Meu pai diz que a navalha é uma extensão da alma. A minha treme.', 'Já sei fazer a espuma PERFEITA. O corte... a gente chega lá.'],
})
ROSTER.append({"id": "npc:dona_prosa", "name": "Dona Prosa, a Livreira",
    "look": {"skin": "#c9b090", "cloak": "#7a5a6a", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": False},
    "map": "loja_livraria", "home": (6, 4), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Todo livro aqui foi lido por mim. Inclusive os diários. Foi sem querer.', 'Uma carta caiu de um livro ontem. Eu... organizei o conteúdo dela. Mentalmente.', 'Ler é viajar. Fofocar é viajar de primeira classe.'],
})
ROSTER.append({"id": "npc:petunia", "name": "Srta. Petúnia, a Florista",
    "look": {"skin": "#e0c9a8", "cloak": "#e05a8a", "hat": "none", "hood": "down", "hair": "#8a4a2a", "staff": False},
    "map": "loja_floricultura", "home": (6, 4), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Alguém compra rosas brancas toda semana. Anônimo. Eu SEI pra quem vai. 🌹', 'Flor não mente. Gente que compra flor às vezes sim, mas com boa intenção.', 'A Lady Diana nunca veio aqui. As rosas dela nascem... sozinhas. Sei.'],
})
ROSTER.append({"id": "npc:mestre_linho", "name": "Mestre Linho, o Alfaiate",
    "look": {"skin": "#a8845c", "cloak": "#3a4a6a", "hat": "none", "hood": "down", "hair": "#2a1a10", "staff": False},
    "map": "loja_alfaiataria", "home": (5, 5), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Visto a corte inteira. A corte inteira me deve. Elegância fiado.', 'O caimento é tudo. TUDO. Um ombro torto derruba um reinado.', "Madame Valliet pediu 'algo discreto'. Fiz. Ela devolveu. Ufa."],
})
ROSTER.append({"id": "npc:dona_agulha", "name": "Dona Agulha",
    "look": {"skin": "#e0c9a8", "cloak": "#6a4a7a", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": False},
    "map": "loja_alfaiataria", "home": (9, 5), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Ele desenha, eu costuro. Ele leva a fama, eu levo os dedais.', 'Quarenta anos casada com um perfeccionista. A bainha do meu vestido? Torta. De birra.'],
})
ROSTER.append({"id": "npc:almir", "name": "Almir do Mar, o Peixeiro",
    "look": {"skin": "#a8845c", "cloak": "#3a6a8a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "loja_peixaria", "home": (6, 4), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Peixe fresco do Tião! O homem pesca, eu vendo fino. Sociedade dos mares.', 'O Tião jura que existe um peixe-rei. Se ele pescar, eu vendo. A 500 moedas.', 'Naveguei vinte anos. Hoje meu mar é essa banca. Tem menos tubarão. Tem mais freguês.'],
})
ROSTER.append({"id": "npc:brigitte", "name": "Brigitte, a Queijeira dos Angard",
    "look": {"skin": "#e0c9a8", "cloak": "#e8e0d0", "hat": "none", "hood": "down", "hair": "#8a4a2a", "staff": False},
    "map": "loja_queijaria", "home": (6, 4), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Queijos da Casa Angard! Madame Valliet supervisiona CADA peça. De longe. Com binóculo.', 'Este aqui maturou oito meses na adega da mansão. Ele viu coisas.', 'Monsieur diz que queijo e vinho são um casal. Eu sou a madrinha.'],
})
ROSTER.append({"id": "npc:sa_benta", "name": "Sá Benta, a Doceira",
    "look": {"skin": "#6a4a34", "cloak": "#e0a850", "hat": "none", "hood": "down", "hair": "#1a1a20", "staff": False},
    "map": "loja_doceria", "home": (6, 4), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Doce da capital, receita da capital! *tosse* Da capital, sim senhor.', 'A Nega Luzia da Baixa? Conheço de vista. De vista SEMANAL. Por motivos... logísticos.', 'Quem revende com amor não engana ninguém. Adoça duas vezes.'],
})
ROSTER.append({"id": "npc:camomilo", "name": "Sr. Camomilo, o Mestre dos Chás",
    "look": {"skin": "#c9b090", "cloak": "#7a9a6a", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": False},
    "map": "loja_chas", "home": (6, 4), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Calma. Senta. Respira. O chá sabe quando você tem pressa. Ele TRAVA.', 'Tenho chá pra tudo: sono, coragem, saudade. Pra pressa não. Pressa é falta de chá.', '*mexe a xícara 40 vezes no mesmo sentido* Tudo sob controle. Tudo. Sob. Controle.'],
})
ROSTER.append({"id": "npc:mestre_corda", "name": "Mestre Corda, o Luthier",
    "look": {"skin": "#a8845c", "cloak": "#7a5a3a", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": False},
    "map": "loja_luthier", "home": (5, 5), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Fiz o violão do Lorde Dante. Ele toca de madrugada. Eu OUÇO. Deste ouvido não.', 'Um instrumento é madeira que aprendeu a chorar bonito.', 'FALA MAIS ALTO. Ah, comprar? Isso eu escuto perfeitamente.'],
})
ROSTER.append({"id": "npc:ze_boato", "name": "Zé Boato, a Banca de Notícias",
    "look": {"skin": "#c9a06a", "cloak": "#c43e5a", "hat": "none", "hood": "down", "hair": "#2a1a10", "staff": False},
    "map": "loja_banca", "home": (6, 4), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['EXTRA! EXTRA! Sumo visto DANÇANDO no feirão! Fontes: eu, que vi de longe, sem óculos!', 'Metade do que vendo é verdade. A outra metade é verdade AINDA NÃO confirmada.', "O Dom Baltazar diz que fofoca dele é 'fonte primária'. A minha é fonte VELOZ."],
})
ROSTER.append({"id": "npc:otavio_valmont", "name": "Lorde Otavio Valmont",
    "look": {"skin": "#c9b090", "cloak": "#3a3a5a", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": False},
    "map": "casa_valmont", "home": (5, 5), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Meu filho bate martelo, minha filha quer violão, minha esposa quer status. Eu quero paz. E lucro.',
                  'Os Prosperi têm história. Os Valmont têm FUTURO. E contabilidade melhor.',
                  'Valmont. V-A-L-M-O-N-T. Uma casa antiga. Quase tão antiga quanto... enfim. Antiga.', 'Os Prosperi têm o farol. Nós temos... perspectivas. E um leilão LUCRATIVO.', 'Meu filho Fagnin bate o martelo como um rei. Um rei de leilões. Conta.'],
})
ROSTER.append({"id": "npc:isolda_valmont", "name": "Lady Isolda Valmont",
    "look": {"skin": "#e0c9a8", "cloak": "#6a3a5a", "hat": "none", "hood": "down", "hair": "#2a1a10", "staff": False},
    "map": "casa_valmont", "home": (12, 5), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['A Rainha-mãe me recebeu no chá. Sentei a DUAS cadeiras dela. Progresso mensurável.',
                  'Beatriz casará bem. Ou tocará violão em festas. Uma mãe se adapta.',
                  'A Rainha Valesca serve o chá às cinco. O MEU é às quatro e meia. Pioneirismo.', 'Beatriz, postura! ...perdão, força do hábito. Postura também pra você.', 'Dizem que inveja é feio. Feio é o brasão dos outros ser maior.'],
})
ROSTER.append({"id": "npc:beatriz_valmont", "name": "Beatriz Valmont",
    "look": {"skin": "#e0c9a8", "cloak": "#8a6a9a", "hat": "none", "hood": "down", "hair": "#8a4a2a", "staff": False},
    "map": "casa_valmont", "home": (8, 6), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['A Srta. Lance me deixa assistir aos leilões. Meu irmão grita números. É quase música.',
                  'Vi a Guarda em formação na Saudação. Por um segundo quis trocar o dote por um elmo.',
                  'Mamãe quer que eu case com um Prosperi. Só tem UM solteiro. E ele mora num farol.', 'Eu queria era tocar violão. Nobre pode? Vou perguntar pro Mestre Corda.', 'A filha do alfaiate é minha melhor amiga. Em segredo. Nobreza cansa.'],
})
ROSTER.append({"id": "npc:prudencio", "name": "Embaixador Prudêncio",
    "look": {"skin": "#c9b090", "cloak": "#2a3a4a", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": False},
    "map": "embaixada_ermo", "home": (7, 4), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['As Terras do Ermo e Prosperina: duas margens, um protocolo. Eu sou a ponte. Carimbada.',
                  'O que acontece no porão fica no porão. Cláusula consular quarta, parágrafo nunca.',
                  'As Terras do Ermo saúdam Prosperina. Protocolo 7, parágrafo 2. Prossiga.', 'Diplomacia é a arte de bocejar por dentro sorrindo por fora.', 'O porão? Depósito. De... assuntos consulares. Não desça. É PROTOCOLO.'],
})
ROSTER.append({"id": "npc:sr_protocolo", "name": "Sr. Protocolo, o Adido",
    "look": {"skin": "#e0c9a8", "cloak": "#4a4a5a", "hat": "none", "hood": "down", "hair": "#2a1a10", "staff": False},
    "map": "embaixada_ermo", "home": (4, 6), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Formulário 9-B em três vias. A quarta via é pra quando perderem as três.',
                  'Sonhei que um documento se auto-assinava. Acordei suando. Que anarquia.',
                  'O Cônsul lá de baixo grita RECEBA. Eu carimbo RECEBIDO. Cada um com seu rito.',
                  'Selou? Carimbou? Datou? Rubricou? Então NÃO EXISTE. Volte com o formulário 9-B.', 'Sou pago para dizer não com elegância. Não. Viu? Elegante.'],
})
ROSTER.append({"id": "npc:caiques", "name": "Caiquês, o Cônsul de Sapopemba",
    "look": {"skin": "#a8845c", "cloak": "#3a8a5a", "hat": "none", "hood": "down", "hair": "#1a1a20", "staff": False},
    "map": "porao_sapopemba", "home": (4, 3), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['RECEBAAAA, excelência!! Bem-vindo ao consulado! O consulado sou eu!', 'Ô meu pai... que ilha LINDA! GRAÇAS A DEUSSSS!', 'Onde é que mija aqui? Sério. Pergunta diplomática. MIJE MIJE.', 'O embaixador lá de cima é o protocolo. EU sou o melhor do mundo. Tmj demais!', 'Sapopemba manda um abraço. E uma linguiça. A linguiça sumiu no caminho. Investigando.'],
})
ROSTER.append({"id": "npc:fagnin_valmont", "name": "Lord Fagnin Valmont, o Leiloeiro",
    "look": {"skin": "#c9b090", "cloak": "#c9a842", "hat": "none", "hood": "down", "hair": "#8a4a2a", "staff": False},
    "map": "casa_leiloes", "home": (8, 3), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ["Já leiloei um mapa 'do tesouro'. Comprador voltou bravo. Revendi o mapa da volta. DOU-LHE DUAS!",
                  'DOU-LHE UMA! DOU-LHE DUAS! ...ah, cliente. Perdão. O martelo fica ansioso.', 'Lord Fagnin Valmont. Bato o martelo, subo o preço, durmo tranquilo.', 'O LOTE DO DIA muda toda alvorada. Raro, único, CARO. Como eu.', 'Papai queria que eu fosse general. Eu conquisto por LANCES.'],
})
ROSTER.append({"id": "npc:srta_lance", "name": "Srta. Lance, a Assistente",
    "look": {"skin": "#e0c9a8", "cloak": "#7a2e3a", "hat": "none", "hood": "down", "hair": "#1a1a20", "staff": False},
    "map": "casa_leiloes", "home": (12, 3), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Anoto lances, calo chiliques e nunca pisco. O martelo confia em mim. O Justino, digo.',
                  "O lote de ontem era 'raro'. O de hoje é 'raríssimo'. Amanhã inventamos palavra nova.",
                  'Lord Fagnin ensaia o DOU-LHE UMA no espelho. Eu cronometro. Profissionalismo.',
                  'Eu registro os lances, os lotes e os chiliques do Lord. Nessa ordem de volume.', "O martelo dele custou mais que meu salário anual. Ele chama o martelo de 'Justino'."],
})
ROSTER.append({"id": "npc:familia_pontual", "name": "Seu Pontual, relojoeiro aposentado",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a4a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "prospera", "home": (15, 8), "radius": 4, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['Aposentado, eu? O tempo não aposenta ninguém. Só muda o ponteiro.',
                  'O relógio da praça atrasa 40 segundos. Já avisei. TRÊS vezes. Anarquia.',
                  'Mercedes diz que conto minutos até dormindo. Conto sim: 480 por noite, se deixarem.',
                  'Meu neto pergunta as horas só pra me ver feliz. Criança esperta.',
                  'Aposentei os ponteiros, não a pontualidade. São 14h03. Você está 3 minutos atrasado pra algo.'],
})
ROSTER.append({"id": "npc:dona_pontuala", "name": "Dona Mercedes Pontual",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a4a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "prospera", "home": (17, 8), "radius": 4, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['Casei com um homem pontual. Chego atrasada de propósito há 40 anos. Equilíbrio.',
                  'Ele conta minutos, eu conto histórias. As minhas rendem mais.',
                  'O segredo do casamento longo? Um relógio e uma paciência.',
                  'Às 15h em ponto ele toma café. Às 15h01 eu escondo a xícara. Diversão é isso.',
                  'Ele conta os minutos. Eu conto as vezes que ele conta. Estamos empatados.'],
})
ROSTER.append({"id": "npc:viuva_clarice", "name": "Viúva Clarice",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a4a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "prospera", "home": (60, 8), "radius": 4, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['O Bigode trouxe uma luva do telhado ontem. De quem? A investigação continua.',
                  'Viúva, não parada. Sei tudo desta rua antes do Zé Boato gritar.',
                  "Meu falecido dizia: 'Clarice, um gato basta'. O Bigode concorda plenamente.",
                  'Gato preto dá sorte SIM. Quem inventou o contrário nunca teve um.',
                  'Só eu e o Bigode agora. Ele caça fofoca nos telhados e me traz. Bom menino.'],
})
ROSTER.append({"id": "npc:rosendo", "name": "Seu Rosendo",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a4a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "prospera", "home": (6, 16), "radius": 4, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['Da janela vejo a padaria, a praça e o destino alheio. Assinatura completa.',
                  "A Rute interpreta o que eu vejo. Ontem: 'suspiro duplo da florista'. Caso sério.",
                  'Binóculo? Que binóculo. Isso é uma luneta de OBSERVAÇÃO CIVIL.',
                  'Quando a Guarda passou em formação, aplaudi da janela. Chorei um pouco. Vento, claro.',
                  'Da minha janela vejo TUDO. A Rute anota. Somos o jornal antes do Zé Boato.'],
})
ROSTER.append({"id": "npc:rute", "name": "Dona Rute",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a4a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "prospera", "home": (8, 16), "radius": 4, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['O Rosendo vê os fatos. Eu vejo as ENTRELINHAS. Juntos somos um jornal.',
                  'A florista suspirou de novo. Terceira vez. Vou precisar de mais chá pra essa análise.',
                  'Não é fofoca. É cartografia social.',
                  'O Zé Boato compra minhas conclusões. Eu cobro em doce da Sá Benta. Economia local.',
                  'O Rosendo vê, eu interpreto. Ontem: a florista suspirou DUAS vezes. Investigando.'],
})
ROSTER.append({"id": "npc:pedreiro_batista", "name": "Mestre Batista, o Pedreiro",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a4a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "prospera", "home": (15, 17), "radius": 4, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['Tijolo assentado com raiva cai. Com pressa, entorta. Com amor, vira parede de cem anos.',
                  'Fiz o muro do quartel. O Lorde Comandante apertou minha mão. Não lavo mais. Brincadeira. Lavo.',
                  'Meus meninos querem ser soldados. Eu digo: primeiro aprendam a CONSTRUIR o que vão defender.',
                  'Orçamento grátis, café é por conta do freguês. Prospera se ergue assim.',
                  'Metade de Prospera tem tijolo meu. A outra metade vai ter. Orçamento grátis.'],
})
ROSTER.append({"id": "npc:professor_anselmo", "name": "Professor Anselmo",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a4a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "prospera", "home": (69, 16), "radius": 4, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['Ensino conta, letra e a diferença entre saber e decorar. A terceira é a mais difícil.',
                  'O Caio vem de Vilalbina correndo. Chega suado e aprende dobrado. Meu melhor aluno.',
                  'A Beatriz Valmont pediu aula de violão escondida. Indiquei o Mestre Corda. Cúmplice, eu.',
                  'Livro emprestado que volta é aluno formado.',
                  'Ensino as crianças da capital. O Caio de Vilalbina vem uma vez por semana. Correndo.'],
})
ROSTER.append({"id": "npc:dede_costureira", "name": "Dedé, a costureira",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a4a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "prospera", "home": (6, 24), "radius": 4, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['Eu corto o tecido e a Didi...',
                  'A gente costura pra metade de Prospera e a outra metade...',
                  'Nascemos juntas, aprendemos juntas, e um dia vamos...',
                  'O segredo da bainha perfeita é...',
                  'Eu começo a frase e a Didi...'],
})
ROSTER.append({"id": "npc:didi_costureira", "name": "Didi, a costureira",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a4a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "prospera", "home": (9, 25), "radius": 4, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['...costura. Sempre foi assim.',
                  '...está na lista de espera.',
                  '...aposentar juntas. Óbvio.',
                  '...paciência. Ela ia dizer isso. Eu sei.',
                  '...termina. É assim desde o berço. Praticamos no útero.'],
})
ROSTER.append({"id": "npc:guarda_trovao", "name": "Seu Trovão, guarda aposentado",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a4a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "prospera", "home": (24, 24), "radius": 4, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['Trinta anos de ronda e nunca perdi uma esquina. Hoje perco é o fôlego.',
                  "O neto quer ser da Alvorada. Eu digo: 'primeiro aprenda a ficar PARADO'. Ele não consegue. Eu ria igual.",
                  'A Guarda nova tem elmo com crista. No meu tempo era chapéu e coragem.',
                  'Aposentei a lança, não o olho. Essa rua ainda é minha.',
                  'Trinta anos de ronda. Hoje patrulho o neto. Missão mais perigosa.'],
})
ROSTER.append({"id": "npc:dona_firmina", "name": "Dona Firmina, a Parteira",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a4a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "prospera", "home": (15, 48), "radius": 4, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['Fiz nascer nobre, plebeu e um bezerro numa emergência. Mãos não escolhem berço.',
                  'A Lady Diana? Nasceu de madrugada, chorando forte e olhando a janela. O mar já chamava.',
                  'Parto é a única batalha onde todo mundo torce pro mesmo lado.',
                  'Fiz metade dessa capital nascer. A OUTRA metade nasceu com pressa antes de eu chegar.', 'A Lady Diana? Puxou o choro forte da mãe. Isso eu posso contar. O resto, segredo de parto.'],
})
ROSTER.append({"id": "npc:moco_elviro", "name": "Moço Elviro, o Poeta",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a4a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "prospera", "home": (52, 48), "radius": 4, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['Fiz um soneto pra fonte da praça. Ela retribuiu com eco. Minha melhor crítica.',
                  'O senhorio chorou no verso nove de novo. Aluguel pago. A arte VENCE.',
                  'Prospera inteira é um poema. Eu só transcrevo o que as ruas rimam.',
                  'Pago o aluguel em sonetos. O senhorio aceita. Ele chora no verso nove, TODA vez.', "Prospera rima com espera, quimera e... 'dinheiro não tem rima', diz meu estômago."],
})
ROSTER.append({"id": "npc:gaston", "name": "Gaston, o Sous-chef",
    "look": {"skin": "#e0c9a8", "cloak": "#d8d0c0", "hat": "cap", "hood": "down", "hair": "#8a4a2a", "staff": False},
    "map": "restaurante_jacquard", "home": (11, 2), "radius": 2, "wanders": True, "step_every": 1.6,
    "solid": True, "kind": "person",
    "greetings": ["OUI, CHEF! ...ah, é você. Perdão. Reflexo.",
                  "*corta cebola tremendo* Ele disse que meu brunoise melhorou. EU CHOREI. De alegria. Acho.",
                  "O Chef berra porque ama. É o que eu digo pro meu travesseiro toda noite.",
                  "Um dia terei meu restaurante. Cinco estrelas. Não seis. Seis é DELE. Eu sei meu lugar.",
                  "*sussurra* O segredo do petit gâteau sou EU tirando do forno no segundo exato. Non conta."],
})
ROSTER.append({"id": "npc:chef_jacquard", "name": "Chef Jacquard ✶✶✶✶✶✶",
    "look": {"skin": "#e0c9a8", "cloak": "#f0ead8", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": False},
    "map": "restaurante_jacquard", "home": (7, 2), "radius": 3, "wanders": True, "step_every": 2.2,
    "solid": True, "kind": "person",
    "greetings": ["Bonjour. Sente. Non toca no talher ainda. O talher SENTE a pressa.",
                  "Seis estrela. SEIS. A sétima non ecziste porque eu ainda non inventei.",
                  "Você comeu na taverna da Rosa? *respira fundo* Ç'est... corajoso da sua parte.",
                  "PUTAIN de trigo do Rei Marth! É o melhor trigo que eu já vi. Non conta pra ele.",
                  "Isso que você chama de 'lanche' non é comida. É um pedido de socorro.",
                  "O segredo? Manteiga. O outro segredo? MAIS manteiga. O terceiro é segredo."],
})
ROSTER.append({"id": "npc:mestre_fanfarrao", "name": "Mestre Fanfarrão, o Cerimonialista",
    "look": {"skin": "#c9a06a", "cloak": "#c9a842", "hat": "cap", "hood": "down", "hair": "#3a2a1a", "staff": False},
    "map": "feirao_sao_celeste", "home": (24, 6), "radius": 5, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Pergunte-me sobre o poder da aurora. Vai. PERGUNTE. Eu ensaiei a resposta a vida toda.',
                  "BEM-VINDOS AO FEIRÃO DE SÃO CELESTE! Hoje não tem evento. Mas o ANÚNCIO foi lindo, não foi?",
                  "Feiras! Campeonatos! Festivais! Tudo acontecerá NESTE palco. Um dia. Em breve. Confia.",
                  "São Celeste, o padroeiro: dizem que era um gato. Dizem que era um santo. Dizem MUITO.",
                  "O palco está pronto, as tendas estão prontas, EU estou pronto. Só falta... o evento."],
})
ROSTER.append({"id": "npc:seu_juvenal", "name": "Seu Juvenal do Sobrado",
    "look": {"skin": "#a8845c", "cloak": "#7a2e3a", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": False},
    "map": "baixa_da_egua", "home": (18, 16), "radius": 4, "wanders": True, "step_every": 3.0,
    "solid": True, "kind": "person",
    "greetings": ['O quartel virou vizinho. Setenta e dois de elmo. Minha sela nunca vendeu tanto.',
                  'Meu Valdo é mordomo da Guarda agora. Filho subiu limpo. Pai orgulhoso suja os olhos.',
                  "Aqui é a Baixa, meu amigo. Quebrada RAIZ. Meu sobrado só tem mármore no primeiro E no segundo andar.",
                  "A Cidade Alta olha pra gente de cima. Geograficamente. Financeiramente somos SÓCIOS.",
                  "Nasci aqui, fiquei rico aqui, morro aqui. Com vista pro haras e adega climatizada, mas AQUI."],
})
ROSTER.append({"id": "npc:dona_rita", "name": "Dona Rita das Éguas",
    "look": {"skin": "#c9a06a", "cloak": "#4a6a3a", "hat": "none", "hood": "down", "hair": "#3a2a1a", "staff": False},
    "map": "baixa_da_egua", "home": (38, 9), "radius": 3, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['A Guarda comprou seis éguas minhas. Escolhi as mais valentes. E as mais teimosas. Combina.',
                  'Égua sente respeito antes do homem falar. Por isso gosto mais delas.',
                  "O bairro tem meu nome. Quer dizer, das minhas éguas. Mesma coisa.",
                  "A corte inteira monta cavalo MEU. A Lady Diana cavalga uma cria da Estrela. Eu criei as duas.",
                  "Égua boa é que nem fofoca boa: pura, veloz e todo mundo quer."],
})
ROSTER.append({"id": "npc:bito_ferradura", "name": "Bito Ferradura",
    "look": {"skin": "#b09070", "cloak": "#3a3a4a", "hat": "cap", "hood": "down", "hair": "#2a1a10", "staff": False},
    "map": "baixa_da_egua", "home": (30, 16), "radius": 4, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu irmão Ferro cuida das lâminas do quartel. Eu, dos cascos. O aço é da família.',
                  'Ferradura de ouro? Fiz. Espada fina? Vendo. A Baixa forjou gente grande.',
                  "Ferro casco de égua de ouro. Literalmente: a Dona Rita pediu ferradura BANHADA.",
                  "Na Baixa a gente se cumprimenta pelo nome e se mede pelo estábulo.",
                  "Subir pra Cidade Alta? Pra quê? Aqui o ar cheira a feno e dinheiro."],
})
ROSTER.append({"id": "npc:nega_luzia", "name": "Nega Luzia, a Doceira da Baixa",
    "look": {"skin": "#6a4a34", "cloak": "#e05a8a", "hat": "none", "hood": "down", "hair": "#1a1a20", "staff": False},
    "map": "baixa_da_egua", "home": (12, 12), "radius": 4, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Meu Lau cozinha pra setenta e dois. Aprendeu na minha panela de três bocas. Talento estica.',
                  "A Sá Benta 'da capital' compra meu doce toda semana. Capital, sei. O açúcar é DAQUI.",
                  "Doce da Baixa é doce de verdade: açúcar, capricho e uma pitada de deboche.",
                  "Tem gente FINA de Prospera que manda buscar doce aqui escondido. Toda semana. Anônimo. Sei quem é.",
                  "Rica eu? Sou. Mas doce bom não se faz com dinheiro, se faz com braço."],
})
ROSTER.append({"id": "npc:coelho_fofo", "name": "Fofo",
    "look": {"skin": "#d8d0c0", "cloak": "#d8d0c0", "hat": "none", "hood": "down", "hair": "#d8d0c0", "staff": False},
    "map": "jardim_templo", "home": (20, 20), "radius": 7, "wanders": True, "step_every": 1.2,
    "solid": False, "kind": "rabbit",
    "greetings": ['*mexe o focinho avaliando suas intenções*',
                  '*orelha esquerda em pé: aprovação parcial*',
                  '*rói um talo com pose de quem paga imposto*',
                  "*mexe o nariz em altíssima frequência*", "*congela. te encara. some.*"],
})
ROSTER.append({"id": "npc:coelha_tufo", "name": "Tufo",
    "look": {"skin": "#a8845c", "cloak": "#a8845c", "hat": "none", "hood": "down", "hair": "#a8845c", "staff": False},
    "map": "jardim_templo", "home": (34, 34), "radius": 7, "wanders": True, "step_every": 1.3,
    "solid": False, "kind": "rabbit",
    "greetings": ['*pula duas vezes e finge que não foi*',
                  '*te encara: você está no caminho do trevo*',
                  '*bocejo minúsculo, drama gigante*',
                  "*rouba um trevo e foge com orgulho*", "*a Suma Sorte já tentou apostar corrida com ela. Perdeu.*"],
})
ROSTER.append({"id": "npc:cao_bilau", "name": "Bilau",
    "look": {"skin": "#a8845c", "cloak": "#a8845c", "hat": "none", "hood": "down", "hair": "#a8845c", "staff": False},
    "map": "vilalbina", "home": (16, 20), "radius": 8, "wanders": True, "step_every": 1.4,
    "solid": False, "kind": "dog",
    "greetings": ['*abana o rabo em código morse: b-i-s-c-o-i-t-o*',
                  '*late para uma nuvem suspeita. A nuvem recua*',
                  "*abana o rabo com o corpo inteiro*", "Au! *te acompanha por três passos e desiste*",
                  "*fareja seu bolso com esperança profissional*"],
})
ROSTER.append({"id": "npc:galinha_cocota", "name": "Cocota",
    "look": {"skin": "#e8e0d0", "cloak": "#e8e0d0", "hat": "none", "hood": "down", "hair": "#e8e0d0", "staff": False},
    "map": "pastos", "home": (22, 18), "radius": 5, "wanders": True, "step_every": 1.8,
    "solid": False, "kind": "chicken",
    "greetings": ['*cisca com autoridade de dona do terreiro*',
                  '*có-có indignado: você pisou perto DEMAIS*',
                  '*bota a cabeça de lado julgando sua vida*',
                  "Có? *te olha de lado, julgando*", "Có có CÓ! *anúncio importante sobre nada*"],
})
ROSTER.append({"id": "npc:galinha_nini", "name": "Nini",
    "look": {"skin": "#c9803a", "cloak": "#c9803a", "hat": "none", "hood": "down", "hair": "#c9803a", "staff": False},
    "map": "pastos", "home": (28, 20), "radius": 5, "wanders": True, "step_every": 2.0,
    "solid": False, "kind": "chicken",
    "greetings": ['*persegue um besouro com foco militar*',
                  '*có suave: hoje ela está de bom humor*',
                  '*empoleira e finge ser decoração*',
                  "*cisca com a dedicação de quem paga boleto*", "Có. *é tudo que você merece hoje*"],
})
ROSTER.append({"id": "npc:madre_aurora", "name": "Madre Aurora, Guardiã do Jardim",
    "look": {"skin": "#c9b090", "cloak": "#e8e0d0", "hat": "none", "hood": "up", "hair": "#d8d8d8", "staff": True},
    "map": "jardim_templo", "home": (27, 22), "radius": 7, "wanders": True, "step_every": 3.2,
    "solid": True, "kind": "person",
    "greetings": ["Este jardim é a oração que os Doze podem CHEIRAR. Cada canteiro, um verso.",
                  "Chefio os noviços do Mosteiro e cuido do Jardim. Um dos dois me obedece. Adivinha qual.",
                  "TICO! A vassoura varre pra FORA do canteiro! ...perdão. Quarenta anos, e ainda me espanto.",
                  "O Simão chamou Facalan de 'Falacan' regando a torre Dela. A roseira MURCHOU. Replantei. Rezei. Repreendi. Nessa ordem.",
                  "Com noviço sou ferro; com flor sou pluma. As flores nunca erram o nome dos deuses.",
                  "O Rei Marth conversa com o trigo dele. Eu ESCUTO as minhas flores. Métodos... perdoáveis, o dele."],
})
ROSTER.append({"id": "npc:dona_ceci", "name": "Dona Ceci, mãe do Caio",
    "look": {"skin": "#c9a06a", "cloak": "#8a5a4a", "hat": "none", "hood": "down", "hair": "#3a2a1a", "staff": False},
    "map": "casa_caio", "home": (4, 4), "radius": 3, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['O Caio corre pra escola em Prospera toda semana. Volta sabendo conta E fofoca. Educação completa.',
                  'Filho de pescador com sonho de peixe-rei. O mar que se prepare.',
                  "CAIO! ...desculpa, achei que fosse o menino. Entra, entra.",
                  "Ele quer remar que nem o Zé. Eu quero que ele COMA primeiro.",
                  "A casa é pequena, o menino é grande. Dá certo, sempre deu."],
})
ROSTER.append({"id": "npc:dona_bibi", "name": "Dona Bibi, a Rendeira",
    "look": {"skin": "#a8845c", "cloak": "#5a4a6a", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": False, "sex": "F"},
    "map": "vilalbina", "home": (8, 21), "radius": 2, "wanders": True, "step_every": 4.0,
    "solid": True, "kind": "person", "prof": "costureiro",
    "greetings": ["Pirata, eu? *dá um nó cego em 2 segundos* ...renda exige dedos firmes, só isso.",
        "Linha básica? Procura outro. Eu teço OPULÊNCIA ou teço nada.",
        "O Set de Opulência Prosperiana leva tecido que só EU vendo. E só pra quem merece.",
        "O Baltazar acha que sabe das coisas. Eu SEI. Diferença sutil, abissal.",
        "Essa renda? Padrão de nó de abordagem... digo, de FLOR. Nó de flor."],
    "greetings_night": ["A maré da noite conta as histórias que a do dia esconde.",
        "*olhando o mar escuro* Certas bandeiras a gente arria, mas nunca esquece."]})
ROSTER.append({"id": "npc:lita", "name": "Lita, neta da Bibi",
    "look": {"skin": "#b09070", "cloak": "#8a5a8a", "hat": "none", "hood": "down", "hair": "#2a1a10", "staff": False, "sex": "F"},
    "map": "vilalbina", "home": (15, 23), "radius": 4, "wanders": True, "step_every": 2.0,
    "solid": True, "kind": "person",
    "greetings": ['A vó Bibi diz que costura conserta roupa e conversa conserta gente. Eu tô aprendendo os dois.',
                  'Fui no festival! O Fanfarrão gritou tanto que a gaivota revoou. MELHOR DIA.',
                  "A vó diz que nunca foi pirata. Aí canta música de abordagem pra me ninar.",
        "Um dia eu costuro igual ela. Por ora, desmancho igual ninguém.",
        "Ela guarda um baú que NUNCA abre. Eu já tentei. O cadeado riu de mim."]})
ROSTER.append({"id": "npc:gaspar", "name": "Gaspar, o Filósofo da Caneca",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a44", "hat": "none", "hood": "down", "hair": "#8a8078", "staff": False, "sex": "M"},
    "map": "taverna_vilalbina", "home": (11, 5), "radius": 3, "wanders": True, "step_every": 3.5,
    "solid": True, "kind": "person",
    "greetings": ["*hic* A verdade, meu caro, mora no fundo da caneca. Eu só faço as visitas.",
        "Sóbrio eu minto por educação. Bêbado, a verdade escapa. Por isso bebo: honestidade!",
        "A Rosa me expulsa toda noite. Eu volto toda manhã. Chamamos isso de ROTINA.",
        "*hic* O Zé rema pra fugir de uma saudade. Todo mundo sabe. Ninguém fala. Eu falo: tô bêbado.",
        "Quer um conselho? Custa uma caneca. Verdades custam DUAS."],
    "greetings_night": ["*hic* De noite as verdades ficam maiores. E a caneca, menor. Injusto.",
        "Brindemos aos deuses! Eles bebem melhor que nós: bebem SÉCULOS."]})
ROSTER.append({"id": "npc:vidigaste", "name": "Irmão Vidigaste",
    "look": {"skin": "#c9b090", "cloak": "#8a7a5a", "hat": "none", "hood": "up", "hair": "#6a5a4a", "staff": True, "sex": "M", "outfit": "clerigo"},
    "map": "mosteiro_celeste", "home": (5, 4), "radius": 2, "wanders": True, "step_every": 4.0,
    "solid": True, "kind": "person",
    "greetings": ["Bem-vindo ao Mosteiro de São Celeste. Tire as pressas na porta.",
        "São Celeste plantou o primeiro jardim do templo com as próprias mãos. Nós só continuamos.",
        "Quatro noviços sob meu teto. Três vocações e um mistério. Não conto qual é qual.",
        "O silêncio também é uma oração. A mais difícil de decorar.",
        "Falo com as plantas do jardim SUSSURRANDO. O Rei Marth CONVERSA alto. Os métodos divergem; as flores, não."],
    "greetings_night": ["A noite é o claustro dos pensamentos. Reze baixo, que eles escutam."]})
ROSTER.append({"id": "npc:novico_tico", "name": "Noviço Tico",
    "look": {"skin": "#c9a06a", "cloak": "#9a8a6a", "hat": "none", "hood": "up", "hair": "#3a2a1a", "staff": False, "sex": "M"},
    "map": "jardim_templo", "home": (20, 20), "radius": 5, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ["A Madre Aurora diz que orar é ouvir. Eu oro alto. Ainda tô no nível 'falar'.",
                  'Decorei o nome dos doze! Errei só o Nharé. Duas vezes. Tá bem, cinco.',
                  "É Facalan ou Falacan? Ela me MATA se eu errar. Ela CAÇA quem erra!",
        "Varro o mármore do círculo todo dia. O mármore agradece. Eu acho.",
        "O Irmão Vidigaste diz que silêncio é oração. Eu rezo MUITO mal."]})
ROSTER.append({"id": "npc:novico_abel", "name": "Noviço Abel",
    "look": {"skin": "#a8845c", "cloak": "#9a8a6a", "hat": "none", "hood": "up", "hair": "#1a1a20", "staff": False, "sex": "M"},
    "map": "jardim_templo", "home": (34, 34), "radius": 5, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ["Varri o salão inteiro hoje. O Sumo de Bragor disse 'bom trabalho'. Guardei a poeira de lembrança. Brincadeira. Joguei fora.",
                  'À noite os três de vigília cantam baixinho. Eu finjo que durmo pra ouvir.',
                  "Decorei os Doze em ordem de poder. O Tico decorou em ordem alfabética. Nós dois erramos.",
        "Podei o arco florido hoje. A Suma Iara disse que podar é caçar devagar. Fiquei com medo.",
        "Um dia serei Sumo. De qual deus? O que sobrar. Nharé, provavelmente. Combina."]})
ROSTER.append({"id": "npc:novica_flor", "name": "Noviça Flor",
    "look": {"skin": "#e0c9a8", "cloak": "#9a8a6a", "hat": "none", "hood": "up", "hair": "#8a4a2a", "staff": False, "sex": "F"},
    "map": "mosteiro_celeste", "home": (8, 5), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ["Cuido da horta do mosteiro. As ervas daqui vão pro chá da Suma Clara. Responsabilidade ENORME.",
        "O Irmão Vidigaste sussurra pras plantas. Eu canto. As minhas crescem mais. Não conto pra ele.",
        "São Celeste era jardineiro. Virou santo. Tem esperança pra todo mundo."]})
ROSTER.append({"id": "npc:novico_simao", "name": "Noviço Simão",
    "look": {"skin": "#c9b090", "cloak": "#9a8a6a", "hat": "none", "hood": "up", "hair": "#5a5a5a", "staff": False, "sex": "M"},
    "map": "mosteiro_celeste", "home": (3, 6), "radius": 3, "wanders": True, "step_every": 3.2,
    "solid": True, "kind": "person",
    "greetings": ["Copio os pergaminhos do mosteiro. Minha letra é feia. Os deuses leem mesmo assim. Eu acho.",
        "O Vidigaste diz que uma vocação aqui é mistério. Aposto que é a minha. Ou não. Viu? Mistério.",
        "Antes de noviço eu era pescador. Troquei um mar pelo outro."]})
# --- Cidade Alta: as quatro casas-loja de luxo ---
ROSTER.append({"id": "npc:zelia", "name": "Zélia, a Quitandeira das Frutas Divinas",
    "look": {"skin": "#a8845c", "cloak": "#e0865a", "hat": "none", "hood": "down", "hair": "#2a1a10", "staff": False, "sex": "F"},
    "map": "loja_zelia", "home": (4, 2), "radius": 2, "wanders": True, "step_every": 3.0,
    "solid": True, "kind": "person",
    "greetings": ["Caju-do-Sol colhido CANTANDO, como Valíria gosta. Prova um!",
        "Fruta minha não é comida: é BÊNÇÃO com casca.",
        "A Amêixa-da-Lua só amadurece na cheia. Nherith não tem pressa e eu não tenho estoque.",
        "Um dia dessas frutas sairão receitas que o mundo não provou. Aguarde a minha cozinha!",
        "Minha filha Bela escolhe as melhores. Tem olho de deusa, aquela menina."]})
ROSTER.append({"id": "npc:bela", "name": "Bela, filha da Zélia",
    "look": {"skin": "#b09070", "cloak": "#e0a87a", "hat": "none", "hood": "down", "hair": "#3a2a1a", "staff": False, "sex": "F"},
    "map": "loja_zelia", "home": (8, 3), "radius": 3, "wanders": True, "step_every": 2.2,
    "solid": True, "kind": "person",
    "greetings": ["Eu escolho as frutas pela conversa. A que fala mais alto, colho.",
        "Já comi um Pêssego-da-Sorte inteiro. Naquela semana achei TRÊS moedas no chão. TRÊS.",
        "Mamãe canta pras árvores. As árvores têm ouvido bom, viu."]})
ROSTER.append({"id": "npc:fuao", "name": "Fuão, o Especieiro",
    "look": {"skin": "#c9a06a", "cloak": "#a83838", "hat": "cap", "hood": "down", "hair": "#2a2a30", "staff": False, "sex": "M"},
    "map": "loja_fuao", "home": (4, 2), "radius": 2, "wanders": True, "step_every": 3.2,
    "solid": True, "kind": "person",
    "greetings": ["Pimenta do OUTRO continente! Atravessou dois mares e uma alfândega MUITO desconfiada.",
        "Açafrão, cravo, canela-negra... o paladar de Prospera merece o mundo inteiro.",
        "Essa aqui? Não posso dizer de onde veio. *olha pros lados* Veio de LONGE.",
        "Minha Cida diz que eu exagero. Eu digo que TEMPERO. É diferente."]})
ROSTER.append({"id": "npc:cida", "name": "Cida, esposa do Fuão",
    "look": {"skin": "#e0c9a8", "cloak": "#c05a5a", "hat": "none", "hood": "down", "hair": "#6a4a2a", "staff": False, "sex": "F"},
    "map": "loja_fuao", "home": (8, 3), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ["A 'pimenta do outro continente' é do quintal. MAS o quintal é excelente, isso é.",
        "Casei com o Fuão pelas histórias. Fico pelas especiarias. E pelas histórias.",
        "Ele jura que a canela atravessou dois mares. Atravessou a rua. Com estilo, mas a rua."]})
ROSTER.append({"id": "npc:elian", "name": "Elian, o Destilador da Alvorada",
    "look": {"skin": "#c9b090", "cloak": "#4a6ab0", "hat": "none", "hood": "down", "hair": "#5a4a3a", "staff": False, "sex": "M", "outfit": "mago_alvorada", "addons": []},
    "map": "loja_elian", "home": (4, 2), "radius": 2, "wanders": True, "step_every": 3.4,
    "solid": True, "kind": "person", "prof": "alquimista",
    "greetings": ["Discípulo da Torre da Alvorada, especializado em ENGARRAFAR o que os outros só conjuram.",
        "O Elixir da Alvorada leva seis ervas luminosas e uma paciência que não se vende.",
        "O Arquimago Heron diz que apresso demais. Vinte minutos de efeito é PRESSA?",
        "Poção comum cura um arranhão. As MINHAS mudam o seu dia inteiro.",
        "Errei uma destilação uma vez. O teto lembra até hoje. *aponta pra mancha*"],
    "greetings_night": ["A Alvorada trabalha melhor de noite. Ironia? Alquimia."]})
ROSTER.append({"id": "npc:eloa", "name": "Eloá, gêmea do Elian",
    "look": {"skin": "#c9b090", "cloak": "#6a8ac0", "hat": "none", "hood": "down", "hair": "#5a4a3a", "staff": False, "sex": "F"},
    "map": "loja_elian", "home": (8, 3), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ["Sou a gêmea SEM magia. Alguém precisa fazer as contas desta casa.",
        "O Elian explode um caldeirão por estação. Eu cobro a mais por 'risco operacional'.",
        "Somos idênticos. Eu sou a bonita. Ele discorda. Ele está errado."]})
ROSTER.append({"id": "npc:dinis", "name": "Dinis, o Joalheiro Avaliador",
    "look": {"skin": "#c9a880", "cloak": "#5a5a8a", "hat": "none", "hood": "down", "hair": "#8a8078", "staff": False, "sex": "M"},
    "map": "loja_dinis", "home": (4, 2), "radius": 2, "wanders": True, "step_every": 3.6,
    "solid": True, "kind": "person",
    "greetings": ["Traga o que achou por aí: eu digo o que VALE. Meu olho não erra desde 1.204 avaliações atrás.",
        "As pérolas da Rainha Valesca? Passaram por esta lupa. TODAS.",
        "Ouro engana, prata mente, pedra... pedra confessa.",
        "Minha Pérola diz que amo mais as joias. MENTIRA. Empate técnico."]})
ROSTER.append({"id": "npc:perola", "name": "Pérola, esposa do Dinis",
    "look": {"skin": "#e0c9a8", "cloak": "#c9c4d4", "hat": "none", "hood": "down", "hair": "#d8d0c8", "staff": False, "sex": "F"},
    "map": "loja_dinis", "home": (8, 3), "radius": 3, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ["Ele me chamou de Pérola no primeiro encontro. Achei charmoso. Era avaliação PROFISSIONAL.",
        "Sei o valor de tudo nesta loja. Inclusive do dono. Bom investimento, no fim.",
        "Casamento é lapidação mútua, querido. Vinte anos e ainda tiramos faísca."]})
# --- Vinhedo: a Casa Angard (luxo francês) ---
ROSTER.append({"id": "npc:margot", "name": "Margot, a Copeira",
    "look": {"skin": "#e0c9a8", "cloak": "#7a5a6a", "hat": "none", "hood": "down", "hair": "#8a4a2a", "staff": False},
    "map": "adega_angard", "home": (21, 6), "radius": 3, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Copeira dos Angard: cada taça tem dono, cada dono tem mania, e eu tenho memória.',
                  'Madame Valliet vê poeira a dez passos. Eu limpo a onze. Xeque-mate.',
                  "Doze lugares na mesa, dois moradores. Madame diz que esperança também janta.",
                  "A porcelana veio do continente. Quebrou UMA xícara em vinte anos. Fui eu. Ninguém sabe.",
                  "*polindo talheres* Prata boa é a que reflete a consciência limpa."],
})
ROSTER.append({"id": "npc:amelie", "name": "Amélie, a Camareira",
    "look": {"skin": "#e0c9a8", "cloak": "#8a6a9a", "hat": "none", "hood": "down", "hair": "#2a1a10", "staff": False},
    "map": "adega_angard", "home": (22, 9), "radius": 2, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['Camareira aqui é cargo diplomático: sei de cada suspiro desta mansão. E suspiro junto.',
                  'O quarto do casal tem duas janelas: uma pro vinhedo, outra pro orgulho.',
                  "Madame tem 40 vestidos. Usa 3. Os outros 37 são 'patrimônio emocional'.",
                  "Troco as flores da suíte toda manhã. As da Marta, da praça. As melhores.",
                  "Segredo de camareira: o que eu vejo, o travesseiro esquece."],
})
ROSTER.append({"id": "npc:luc", "name": "Luc, o Lacaio",
    "look": {"skin": "#c9a06a", "cloak": "#3a3a4a", "hat": "none", "hood": "down", "hair": "#4a3a2a", "staff": False},
    "map": "adega_angard", "home": (10, 13), "radius": 4, "wanders": True, "step_every": 2.2,
    "solid": True, "kind": "person",
    "greetings": ['Lacaio corre o dia todo. No festival, corri por prazer. Diferença enorme.',
                  "Monsieur Antoniet me chama de 'garoto'. Tenho trinta anos. Na França dele, sou eterno.",
                  "Recado pra cidade? Eu levo. Recado pra Madame? Eu... reformulo primeiro.",
                  "Jacques diz que um dia serei mordomo. Falta só aprender a suspirar como ele.",
                  "Corro a mansão inteira 40 vezes por dia. Meu cargo oficial é 'vento'."],
})

ROSTER.append({"id": "npc:antoniet", "name": "Monsieur Antoniet Angard",
    "look": {"skin": "#e0c9a8", "cloak": "#5a2e3a", "hat": "none", "hood": "down", "hair": "#8a8078", "staff": False, "sex": "M", "outfit": "nobre"},
    "map": "adega_angard", "home": (11, 5), "radius": 2, "wanders": True, "step_every": 3.8,
    "solid": True, "kind": "person",
    "greetings": ["Bienvenue à la Maison Angard. O vinho respira; o senhor, por favor, também.",
        "Cada safra é uma carta de amor à ilha. Algumas, admito, são cartas de cobrança.",
        "O Arcebispo chama meu vinho de 'litúrgico'. Eu chamo de TRABALHO. Litúrgico é o preço.",
        "Madame Valliet e seus queijos... casei com a concorrência. C'est la vie.",
        "Um Angard não corre. Um Angard DECANTA."],
    "greetings_night": ["À noite provo a safra em silêncio. O vinho fala melhor sem plateia."]})
ROSTER.append({"id": "npc:valliet", "name": "Madame Valliet Angard",
    "look": {"skin": "#e0c9a8", "cloak": "#d8d2e0", "hat": "none", "hood": "down", "hair": "#c9b090", "staff": False, "sex": "F", "outfit": "nobre"},
    "map": "adega_angard", "home": (13, 5), "radius": 2, "wanders": True, "step_every": 3.6,
    "solid": True, "kind": "person",
    "greetings": ['A queijaria leva meu nome no rótulo e meu binóculo na supervisão. Excelência não tira férias.',
                  "Meus queijos maturam ao som de música. O Brie chora com valsa. Magnifique.",
        "O vinho do Antoniet? Adorável. Acompanha MUITO bem o meu queijo. *sorri*",
        "Na corte de Prospera, sirvo a tábua. As decisões importantes acontecem entre uma fatia e outra.",
        "Oito criados e NENHUM sabe cortar Camembert direito. Eu persevero."]})
ROSTER.append({"id": "npc:jacques", "name": "Jacques, o Mordomo",
    "look": {"skin": "#c9b090", "cloak": "#2a2a30", "hat": "none", "hood": "down", "hair": "#8a8078", "staff": False, "sex": "M"},
    "map": "vinhedo", "home": (43, 17), "radius": 3, "wanders": True, "step_every": 3.4,
    "solid": True, "kind": "person",
    "greetings": ['Meu sobrinho Gil serve a Guarda inteira. O sangue mordomo corre firme. E bem passado a ferro.',
                  'Trinta anos e nenhuma taça quebrada. As que caíram... foram aparadas. Detalhe técnico.',
                  'O Duque mia às 17h em ponto. Único da casa mais pontual que eu.',
                  "A Maison Angard recebe às quintas. Hoje não é quinta. Recebemos mesmo assim: nobreza obriga.",
        "Trinta anos de serviço. Vi o Monsieur chorar duas vezes: uma safra perdida e um queijo perfeito."]})
ROSTER.append({"id": "npc:colette", "name": "Colette, a Cozinheira",
    "look": {"skin": "#a8845c", "cloak": "#c05a5a", "hat": "none", "hood": "down", "hair": "#3a2a1a", "staff": False, "sex": "F"},
    "map": "adega_angard", "home": (2, 4), "radius": 3, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['Cozinho francês com tempero daqui. Monsieur chora. De saudade ou pimenta, non pergunto.',
                  "O Chef Jacquard me chamou de 'colega'. Emoldurei a frase. Na memória.",
                  'Sopa de cebola às quintas. Quem falta, chora duas vezes.',
                  "Cozinho com vinho. Às vezes até ponho na comida. *ri*",
        "Madame quer música pros queijos. Eu canto. O Brie prefere as minhas, viu."]})
ROSTER.append({"id": "npc:pierre", "name": "Pierre, o Sommelier",
    "look": {"skin": "#c9a06a", "cloak": "#5a2e3a", "hat": "none", "hood": "down", "hair": "#2a2a30", "staff": False, "sex": "M"},
    "map": "vinhedo", "home": (40, 14), "radius": 4, "wanders": True, "step_every": 3.0,
    "solid": True, "kind": "person",
    "greetings": ['Sommelier do vinhedo: eu apresento o vinho à taça. O resto é romance deles.',
                  'O barril de 30 anos? Não vendo. Conversa comigo nas tardes lentas.',
                  'Henri diz que uva é uva. Já cortei o vinho dele. Justiça líquida.',
                  "Este ano: notas de âmbar, brisa do farol e um final... prosperiano.",
        "Cuspir o vinho na prova é técnica. Eu, pessoalmente, acho desperdício."]})
ROSTER.append({"id": "npc:basile", "name": "Basile, o Jardineiro",
    "look": {"skin": "#a8845c", "cloak": "#5a7a4a", "hat": "cap", "hood": "down", "hair": "#5a4a3a", "staff": False, "sex": "M"},
    "map": "vinhedo", "home": (36, 18), "radius": 5, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ['Jardineiro dos Angard: a roseira mais teimosa da ilha mora aqui. Nós nos respeitamos.',
                  'Pierre cuida das videiras, eu das flores. Disputamos a mesma chuva.',
                  'Terra francesa, terra daqui: minto, planta não tem passaporte.',
                  "Cada videira tem nome. A Josephine dá as melhores uvas e SABE disso, a metida.",
        "Poda é conversa: corta onde a planta pediu. Quem não escuta, colhe vinagre."]})
ROSTER.append({"id": "npc:margaux", "name": "Margaux, a Copeira",
    "look": {"skin": "#e0c9a8", "cloak": "#8a5a8a", "hat": "none", "hood": "down", "hair": "#6a4a2a", "staff": False, "sex": "F"},
    "map": "vinhedo", "home": (45, 16), "radius": 3, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Segunda copeira, primeira a chegar. A Margot que se cuide. Com carinho.',
                  'Sei o chá de cada visita antes de anunciarem. Dom? Escuta atenta.',
                  'No festival dancei com o lacaio. A mansão fingiu não ver. Merci, mansão.',
                  "Polir taça é meditação. Já quebrei três iluminações este mês.",
        "A taça certa muda o vinho. O Monsieur jura. Eu sirvo na mesma e ninguém nota. Shhh."]})
ROSTER.append({"id": "npc:henri", "name": "Henri, o Cocheiro",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a44", "hat": "cap", "hood": "down", "hair": "#8a8078", "staff": False, "sex": "M"},
    "map": "vinhedo", "home": (38, 20), "radius": 4, "wanders": True, "step_every": 3.2,
    "solid": True, "kind": "person",
    "greetings": ['Cocheiro sem estrada longa é filósofo de estábulo. As éguas concordam.',
                  'Levo Monsieur ao solar em sete minutos. Em oito, se o assunto for chato.',
                  'O Pierre e o vinho, eu e o caminho. Cada um embriaga de um jeito.',
                  "Levo os barris pra Prospera sem sacudir. O vinho enjoa, sabia? Sério.",
        "Cavalo bom é como safra boa: paciência, pasto e nenhuma pressa."]})
ROSTER.append({"id": "npc:odette", "name": "Odette, a Governanta",
    "look": {"skin": "#c9b090", "cloak": "#3a3a46", "hat": "none", "hood": "down", "hair": "#d8d0c8", "staff": False, "sex": "F"},
    "map": "adega_angard", "home": (8, 8), "radius": 3, "wanders": True, "step_every": 3.6,
    "solid": True, "kind": "person",
    "greetings": ['Governanta: eu governo. A casa, os horários e os exageros do Monsieur.',
                  'Dez criados, um relógio, zero desculpas. A mansão Angard funciona.',
                  'Madame confia em mim as chaves. Eu confio nela o resto.',
                  "Nesta casa, o pó pede licença antes de assentar.",
        "Gerencio oito criados, dois nobres e um gato que ninguém admite ter. Tudo em ordem."]})
ROSTER.append({"id": "npc:lulu", "name": "Lulu, o Pajem",
    "look": {"skin": "#b09070", "cloak": "#e0a87a", "hat": "none", "hood": "down", "hair": "#2a1a10", "staff": False, "sex": "M"},
    "map": "vinhedo", "home": (41, 19), "radius": 6, "wanders": True, "step_every": 1.6,
    "solid": False, "kind": "person",
    "greetings": ['Pajem é cargo pequeno com olhos grandes. Vejo TUDO desta mansão.',
                  'Um dia serei mordomo como o Jacques. Já treino o suspiro.',
                  'Levei um recado ao quartel ontem. Setenta e dois elmos olharam. Quase virei poesia.',
                  "Sou o pajem! Levo recado, busco chave, provo queijo. O último é extraoficial.",
        "O Monsieur diz 'décante, Lulu!'. Eu finjo que entendo e ando mais devagar."]})
# --- Trigal: o Lorde Fadogan e seus vassalos ---
ROSTER.append({"id": "npc:fadogan", "name": "Lorde Fadogan, o Moleiro Nobre",
    "look": {"skin": "#c9a880", "cloak": "#8a6a3a", "hat": "none", "hood": "down", "hair": "#8a8078", "staff": True, "sex": "M", "outfit": "nobre"},
    "map": "casa_fadogan", "home": (7, 3), "radius": 2, "wanders": True, "step_every": 3.8,
    "solid": True, "kind": "person",
    "greetings": ["Um lorde que mói o próprio trigo. A corte torce o nariz; o pão da corte, não.",
        "Meu brasão é uma pá de moinho. Herdei o título; a farinha, CONQUISTEI.",
        "O moinho gira até sem vento, dizem. Bobagem. É vento. Sempre foi vento. *pausa* Sempre.",
        "Cinco vassalos e nenhum me chama de 'senhor' na colheita. Na colheita somos todos farinha.",
        "O Rei Marth conversa com o trigo. Eu MOO o trigo. Ele planta a poesia; eu, o pão."]})
ROSTER.append({"id": "npc:grum", "name": "Grum, o Capataz",
    "look": {"skin": "#a8845c", "cloak": "#5a4a34", "hat": "cap", "hood": "down", "hair": "#2a2a30", "staff": False, "sex": "M"},
    "map": "trigal_dourado", "home": (12, 13), "radius": 5, "wanders": True, "step_every": 2.8,
    "solid": True, "kind": "person",
    "greetings": ['Capataz do Fadogan: o trigo não espera, eu não descanso, o patrão não muda. Harmonia.',
                  'Durmo no cortiço, sonho com colheita. Vida simples, sonho dourado.',
                  'A Ana semeia, o Tono ceifa, o Beto carrega, a Lia ensaca. Eu? Eu GRITO. Função vital.',
                  "O Lorde diz 'colham com alegria'. Eu digo 'colham'. Funciona igual.",
        "Espantalho mudou de lugar de novo. NÃO olha pra mim. Eu não mexi. NINGUÉM mexe."]})
ROSTER.append({"id": "npc:ana_semeadora", "name": "Ana, a Semeadora",
    "look": {"skin": "#b09070", "cloak": "#c9a05a", "hat": "none", "hood": "down", "hair": "#3a2a1a", "staff": False, "sex": "F"},
    "map": "trigal_dourado", "home": (20, 14), "radius": 5, "wanders": True, "step_every": 2.4,
    "solid": True, "kind": "person",
    "greetings": ['Cada semente que solto é uma promessa. O trigal cumpre quase todas.',
                  'No cortiço a Lia canta antes de dormir. O dia pesa menos.',
                  'Mão caleja, coração não. Regra da terra.',
                  "Semeio cantando baixo. O Rei Marth me ensinou: o trigo gosta de voz.",
        "Cada punhado é uma promessa. O campo cobra TODAS. Bom pagador, também."]})
ROSTER.append({"id": "npc:tono", "name": "Tono, o Ceifador",
    "look": {"skin": "#c9a06a", "cloak": "#6a5a44", "hat": "cap", "hood": "down", "hair": "#5a4a3a", "staff": False, "sex": "M"},
    "map": "trigal_dourado", "home": (26, 16), "radius": 5, "wanders": True, "step_every": 2.6,
    "solid": True, "kind": "person",
    "greetings": ["Ceifar é conversar com o trigo: 'obrigado, próximo'. Ele entende.",
                  'Minha foice tem nome: Dona Justa. Corta certo, nunca a mais.',
                  'O festival me viu dançar. O trigal jurou segredo.',
                  "Foice afiada corta calado. Foice cega reclama. A minha nunca reclamou.",
        "A Suma Morwen abençoou minha foice uma vez. Achei... apropriado demais."]})
ROSTER.append({"id": "npc:beto_carro", "name": "Beto, o Carroceiro",
    "look": {"skin": "#a8845c", "cloak": "#5a5a64", "hat": "none", "hood": "down", "hair": "#2a1a10", "staff": False, "sex": "M"},
    "map": "trigal_dourado", "home": (15, 18), "radius": 5, "wanders": True, "step_every": 3.0,
    "solid": True, "kind": "person",
    "greetings": ['Carroceiro: carrego o ouro do Fadogan. O trigo, digo. O outro ele esconde.',
                  'Minha carroça range no mesmo tom que eu acordo. Parceria antiga.',
                  'Da Baixa ao trigal, sete idas por dia. Minhas costas contam oito.',
                  "Da pedra do moinho à mesa da Rosa: a farinha viaja comigo. VIP, ela.",
        "A carroça range no mesmo tom que eu assobio. Dupla afinada."]})
ROSTER.append({"id": "npc:lia_sacos", "name": "Lia, a Moça dos Sacos",
    "look": {"skin": "#e0c9a8", "cloak": "#c9b090", "hat": "none", "hood": "down", "hair": "#8a4a2a", "staff": False, "sex": "F"},
    "map": "trigal_dourado", "home": (10, 13), "radius": 5, "wanders": True, "step_every": 2.2,
    "solid": True, "kind": "person",
    "greetings": ['Ensacar trigo é abraçar o verão inteiro, saco por saco.',
                  'Canto pro cortiço dormir. O Grum ronca em outra clave. Dueto rural.',
                  'Um dia compro minha casinha em Vilalbina. Com janela pro mar e nada de saco.',
                  "Costuro os sacos e conto os grãos. Brincadeira. Conto os SACOS. Os grãos se contam sozinhos.",
        "Carrego dois sacos por vez. O Grum diz que é recorde. O Grum carrega meio."]})
# --- Prospera: a anfitriã do Salão de Chá ---
ROSTER.append({"id": "npc:madame_clo", "name": "Madame Clô, a Anfitriã do Chá",
    "look": {"skin": "#c9b090", "cloak": "#d8a8b8", "hat": "none", "hood": "down", "hair": "#c9b090", "staff": False, "sex": "F"},
    "map": "salao_cha", "home": (6, 4), "radius": 2, "wanders": True, "step_every": 3.4,
    "solid": True, "kind": "person",
    "greetings": ['A Rainha-mãe chega às 17h. A água ferve às 16h58. O universo que se ajuste.',
                  "Bem-vindo ao Salão da Rainha. O chá é às CINCO. Nem quatro e cinquenta e nove, nem cinco e um.",
        "A Rainha Valesca em pessoa treinou meu serviço. Levei três anos pra segurar o pires sem tremer.",
        "Às cinco em ponto, quem estiver aqui recebe a Língua de Prata. A corte JURA que é lenda. A corte volta às cinco.",
        "Aqui dentro ninguém mente. Não por magia: por VERGONHA. A xícara denuncia."],
    "greetings_night": ["O salão dorme cedo. O chá das cinco exige madrugar a alma."]})
# --- Os bichos da ilha ---
ROSTER.append({"id": "npc:gato_farelo", "name": "Farelo", "look": {"skin": "#c9a05a", "cloak": "#c9a05a", "hat": "none", "hood": "down", "hair": "#c9a05a", "staff": False},
    "map": "vilalbina", "home": (16, 18), "radius": 7, "wanders": True, "step_every": 1.4,
    "solid": False, "kind": "cat", "greetings": ['*se espreguiça ocupando três lugares do salão de chá*',
                  '*mia curto: o pires de leite está ATRASADO*',
                  '*julga a xícara alheia com desdém profissional*',
                  '*ronrona apenas para clientes que dão gorjeta*',
                  "Miau. *olha pro seu bolso* Miau?"]})
ROSTER.append({"id": "npc:gata_bruma", "name": "Bruma", "look": {"skin": "#8a8a94", "cloak": "#8a8a94", "hat": "none", "hood": "down", "hair": "#8a8a94", "staff": False},
    "map": "vilalbina", "home": (22, 10), "radius": 7, "wanders": True, "step_every": 1.8,
    "solid": False, "kind": "cat", "greetings": ['*aparece do nada, como toda névoa que se preze*',
                  '*olha pela janela do chá: o mundo lá fora é subdesenvolvido*',
                  '*aceita carinho por tempo limitado. Acabou.*',
                  '*dorme sobre o jornal do Zé Boato: censura felina*',
                  "*te encara como se soubesse de algo* ...miau."]})
ROSTER.append({"id": "npc:cao_almirante", "name": "Almirante", "look": {"skin": "#6a5a44", "cloak": "#6a5a44", "hat": "none", "hood": "down", "hair": "#6a5a44", "staff": False},
    "map": "vilalbina", "home": (19, 22), "radius": 8, "wanders": True, "step_every": 1.2,
    "solid": False, "kind": "dog", "greetings": ['*late em formação: um AU pra cada navio imaginário*',
                  '*monta guarda na porta do solar melhor que muito soldado*',
                  '*rabo em riste: a patrulha do cheiro começou*',
                  '*aceita continência. Exige, na verdade.*',
                  "AU AU! *abana o rabo com patente de oficial*"]})
ROSTER.append({"id": "npc:gato_duque", "name": "Duque", "look": {"skin": "#5a6a80", "cloak": "#5a6a80", "hat": "none", "hood": "down", "hair": "#5a6a80", "staff": False},
    "map": "prospera", "home": (40, 25), "radius": 7, "wanders": True, "step_every": 1.6,
    "solid": False, "kind": "cat", "greetings": ['*caminha pelo solar como o verdadeiro dono. Porque é.*',
                  '*mia aristocrático: duas sílabas, muito significado*',
                  '*ignora você com pompa hereditária*',
                  '*enrosca no trono quando ninguém vê. Todos veem. Ninguém ousa.*',
                  "*ignora você com elegância aristocrática* ...mia, por fim, como quem concede."]})

# O COMÉRCIO DA ILHA + OS EMÉRITOS
ROSTER.append({
    "id": "npc:rosa_albina", "name": "Rosa Albina",
    "look": {"skin": "#c9a06a", "cloak": "#e05a6a", "hat": "none", "hair": "#3a2a1a", "staff": False},
    "map": "taverna_vilalbina", "home": (5, 1), "radius": 1, "wanders": True,
    "step_every": 2.6, "solid": True, "kind": "person",
    "greetings": ["O Gaspar bebeu e disse que a taverna do Jorge tem 'charme'. CHARME. Cortei a cerveja dele por uma hora.",
                  'A melhor taverna do MUNDO. Anota aí. O Jorge que se cuide.', '*cantando desafinado* ...e o mar levouuu~ ...quê? Canto ótimo.', 'Cerveja gelada, peixe assado e fofoca fresca. O trio sagrado.', "O tio Baltazar vive me arrumando 'pretendente'. Eu vivo arrumando a taverna. Cada um com sua obra.", 'Prova o prato do dia. Se não for o melhor da tua vida, a próxima caneca é... pelo preço de sempre.', 'O Gaspar mora naquela mesa. Eu expulso, ele volta. Já é quase mobília. Mobília que FALA demais.'],
})
ROSTER.append({
    "id": "npc:tiao_iscas", "name": "Tião das Iscas",
    "look": {"skin": "#a8845c", "cloak": "#4a6a5a", "hat": "none", "hair": "#d8d8d8", "staff": False},
    "map": "iscas_cais", "home": (3, 1), "radius": 1, "wanders": True,
    "step_every": 3.2, "solid": True, "kind": "person",
    "greetings": ['A Naiara diz que meu peixe-rei não existe. A Bibi diz que já COSTUROU um. Confio na Bibi.',
                  'Isca viva, fresquinha. Colhida hoje. Ou ontem. Um dos dois.', 'Meu neto vai assumir a banca. Ele só não sabe ainda. Nem a mãe dele. Detalhes.', '*ronco leve, olhos abertos* ...tô acordado. Tô VIGIANDO.', 'O peixe-rei só morde com chuva. Ou foi com sol? Enfim: ele morde.', 'O Zé compra caixa fechada há quarenta anos. Ou trinta. Bons tempos aqueles, seja lá quando foram.'],
})
ROSTER.append({
    "id": "npc:otto", "name": "Mercador Otto",
    "look": {"skin": "#c9b090", "cloak": "#5a4a8a", "hat": "none", "hair": "#8a6a3a", "staff": False},
    "map": "mercado_prospera", "home": (5, 1), "radius": 1, "wanders": True,
    "step_every": 2.8, "solid": True, "kind": "person",
    "greetings": ['A Zélia vende fruta que CURA. Eu vendo armadura que PROTEGE. Prevenir, remediar... o cliente decide.',
                  'O Empório do Otto: se a ilha produz, eu vendo. Se não produz, eu importo.', '*pesando uma moeda* Hm. 0,3 gramas a menos. INTERESSANTE.', "Um dia abro filial no continente. 'Otto & Otto'. O segundo Otto sou eu também.", 'A senhora Diana em pessoa já pisou neste tapete. Eu não lavo mais o tapete. Brincadeira. Lavo.', 'Qualidade da capital, preço de... capital. Ora, estamos em Prospera!', 'O Dinis avaliou minha balança. Disse que pesa CERTO. Emoldurei o laudo.'],
})
ROSTER.append({
    "id": "npc:rei_marth", "name": "Rei Avô Marth",
    "look": {"skin": "#c9a880", "cloak": "#c9a842", "hat": "none", "hood": "down", "hair": "#e8e8e8", "staff": True, "outfit": "x_marth", "sex": "M"},
    "map": "solar_prospera", "home": (8, 5), "radius": 1, "wanders": True,
    "step_every": 3.6, "solid": True, "kind": "person",
    "greetings": ['O Fadogan mói meu trigo há vinte anos. Nobre moendo pra rei. Só em Prosperina, meu amigo.',
                  'Eu era criança quando me deram o Âmbar pra guardar. Criança. Imagina o medo.', '*falando com um pé de trigo* ...e foi isso que eu disse pra ela. Você entende, né?', 'Minha mãe sumiu numa noite sem lua. Se a encontrar... diga que o trigo está alto.', 'Onde eu piso e ORDENO, a terra produz. Mas a terra gosta mais de quem pede.', 'Meu filho não dorme. Minha filha não descansa. Eu plantei bem... eu acho.', 'O Fadogan MOI o que eu converso. Ele acha que discordamos. O pão acha que não.'],
})
ROSTER.append({
    "id": "npc:rainha_valesca", "name": "Rainha Avó Valesca",
    "look": {"skin": "#c9a880", "cloak": "#d8d2e0", "hat": "none", "hood": "down", "hair": "#d8d0c8", "staff": False, "outfit": "x_valesca", "sex": "F"},
    "map": "solar_prospera", "home": (11, 5), "radius": 1, "wanders": True,
    "step_every": 3.4, "solid": True, "kind": "person",
    "greetings": ['Madame Valliet serve um chá... aceitável. O MEU é às cinco. O dela, quando dá. Diz tudo.',
                  'Sente-se. Ninguém mente nesta sala. Nem tenta, é constrangedor.', 'O chá é às cinco. Guerras esperam. Impérios esperam. O chá, não.', 'Escrevo cartas que não envio. O papel aceita o que o correio não alcança.', 'Cordelia era a mais doce das duas crianças. Eu sei que ainda é. Onde quer que esteja.', 'Sinto falta de negociar. Uma última mesa, um último impasse... eu venceria, claro.'],
})

# A CÚPULA DE PROSPERINA
ROSTER.append({
    "id": "npc:heron", "name": "Arquimago Heron, o Que Ficou",
    "look": {"skin": "#c9b090", "cloak": "#4a5568", "hat": "none", "hood": "down", "hair": "#d8d8d8", "staff": True, "outfit": "x_heron", "sex": "M"},
    "map": "torre_terraco", "home": (4, 6), "radius": 2, "wanders": True,
    "step_every": 2.6, "solid": True, "kind": "person",
    "greetings": ['O Tobias explodiu a estante três de novo. O Bramir não sabe. Que continue não sabendo.',
                  'A cadeira na ponta da mesa está vazia. Está reservada. Sempre esteve.', 'No topo da torre cresce uma flor de Valdarkram. Eu a rego todo dia. Alguém precisa lembrar.', 'Varth foi meu amigo antes de ser o que é. O conhecimento não corrompe: a pressa sim.', 'O Conclave não busca poder. Busca um lugar pra quem a magia escolheu sem perguntar.', 'Marion nos enganou por anos dentro da Torre. Que talento. Que desperdício.', 'O jovem Elian engarrafou a alvorada. Eu disse que era pressa. Bebi. Pedi desculpas.'],
})
ROSTER.append({
    "id": "npc:lorde_dante", "name": "Lorde Prosperi Dante",
    "look": {"skin": "#b09070", "cloak": "#2e3a52", "hat": "none", "hood": "down", "hair": "#3a3226", "staff": False, "outfit": "x_dante", "sex": "M"},
    "map": "farol_margem", "home": (24, 17), "radius": 1, "wanders": True,
    "step_every": 3.0, "solid": True, "kind": "person",
    "greetings": ['Minha irmã manda doces anônimos. Todo mundo sabe. Ninguém conta. Prospera é assim.',
                  'Ainda não. Ninguém entra no farol. NINGUÉM.', 'Durmo pouco. O farol não dorme; por que eu dormiria?', '*olheiras fundas* Treinei a noite toda. Contra quem? ...contra mim.', 'Às vezes, lá dentro... esquece. O vento engana os ouvidos. SÓ o vento.', 'Escrevo um diário. Meu pai vai ler. Um dia. Quando eu descansar.'],
})
ROSTER.append({
    "id": "npc:lady_diana", "name": "Lady da Alvorada Diana",
    "look": {"skin": "#c9a880", "cloak": "#7a2e3a", "hat": "none", "hood": "down", "hair": "#4a2e1a", "staff": False, "outfit": "x_diana", "sex": "F"},
    "map": "prospera", "home": (43, 27), "radius": 2, "wanders": True,
    "step_every": 2.4, "solid": True, "kind": "person",
    "greetings": ['O Otto pesou minha moeda na MINHA frente. Atrevido. Contratei ele pra pesar as do tesouro.',
                  'Prospera vai brilhar mais do que Valdarkram JAMAIS brilhou. Anote.', 'Dizem que meu olhar pesa. Ótimo. Coroas pesam; olhares que as merecem também.', 'Cavalgo sozinha ao amanhecer. A cidade acordando é o único conselheiro honesto.', 'Minhas rosas? Impossíveis. Floresceram mesmo assim. Aprenda com elas.', 'Meu irmão guarda o farol há tempo demais. Um dia eu o liberto. Um dia.'],
})
ROSTER.append({
    "id": "npc:celestino", "name": "Arcebispo Rei Celestino",
    "look": {"skin": "#c9a880", "cloak": "#f0ead8", "hat": "none", "hood": "down", "hair": "#e8e8e8", "staff": False, "outfit": "x_celestino", "sex": "M"},
    "map": "templo_estrelado", "home": (16, 15), "radius": 1, "wanders": True,
    "step_every": 3.0, "solid": True, "kind": "person",
    "greetings": ['A Madre Aurora rege aquele mosteiro com mão de ferro e coração de vitral. Os Doze a estimam.',
                  'QUE OS DOZE TE OLHEM! ...perdão, a voz. Ela vem antes de mim.', 'Doze cultos, uma paz. É como reger doze corais cantando hinos diferentes. Eu amo. Eu sofro. Eu amo.', 'Este vinho? Estritamente litúrgico. A liturgia de hoje foi... generosa.', 'Faço vitrais em miniatura. As mãos rezam melhor quando ocupadas.', 'Um dia o mundo inteiro conhecerá os Doze. Começando por você, forasteiro.'],
})

# DOM BALTAZAR ALBINA: o patriarca festeiro de Vilalbina.
ROSTER.append({
    "id": "npc:dom_baltazar", "name": "Dom Baltazar Albina",
    "look": {"skin": "#c9a06a", "cloak": "#f0ead8", "hat": "none", "hair": "#d8d8d8", "staff": False},
    "map": "vilalbina", "home": (22, 12), "radius": 2, "wanders": True,
    "step_every": 2.4, "solid": True, "kind": "person",
    "greetings": ['A Bibi acha que sabe mais fofoca que eu. A Bibi TECE. Eu RECEBO navios. Fonte primária, minha cara.',
                  'BEM-VINDO A VILALBINA! Todo barco que chega é festa. TRADIÇÃO!', 'Minha sobrinha Rosa... um partido, hein? Cozinha, canta... conhece ela? CASADO? Que pena.', '*movendo uma peça de damas* Sua vez. ...ah, é. Jogo sozinho. EU ganho sempre, pelo menos.', 'Conheço cada barco pelo casco, antes da bandeira. Aquele ali? Do Zé. Fácil demais.', 'Fica pra festa! Sempre tem festa. Quando não tem, a gente inventa o motivo.', 'A Bibi acha que sabe mais fofoca que eu. INOCENTE. Eu recebo os barcos; ela, os retalhos.'],
})

# ZECA, o Caravaneiro: a banca ambulante que roda a superfície inteira.
ROSTER.append({
    "id": "npc:zeca", "name": "Zeca, o Caravaneiro",
    "look": {"skin": "#b98a5a", "cloak": "#7a5a2a", "hat": "straw", "hair": "#4a3a2a", "staff": True},
    "map": "ermo", "home": (46, 46), "radius": 1, "wanders": True,
    "step_every": 2.5, "solid": True, "kind": "person",
    "greetings": ["Cheguei, cheguei! Mercadoria que ANDA até você!",
                  "A estrada é longa e a banca é curta: aproveita.",
                  "Isso aqui? Só EU tenho. Palavra de caravaneiro.",
                  "Já fui assaltado três vezes esse mês. O preço reflete o trauma."],
    "caravaneiro": True,
})

# A Goblin do Cofre: roubou o cofre de Lorde Varth e se escondeu no canto sudeste
# da câmara. Vende o set Necrótico (épico, melhor que o do Coveiro) por bronze +
# Símbolos de Varth.
ROSTER.append({
    "id": "npc:goblin_cofre", "name": "Goblin do Cofre",
    "look": {"skin": "#7a9a4a", "cloak": "#243016", "hood": "up",
             "hat": "none", "hair": "#3a2a10", "staff": False},
    "map": "camara_varth", "home": (78, 84), "radius": 1, "wanders": True,
    "step_every": 2.0, "solid": True, "kind": "person",
    "greetings": [
        "Pssiu! Aqui no cantinho... roubei o cofre do Lorde bem debaixo do nariz dele, hehe.",
        "Tudo roxo, tudo necrótico, tudo arrancado do cofre de Varth. Quer ver a mercadoria?",
        "O Lorde tá ocupado lá no trono. Aproveita a liquidação do cofre, forasteiro.",
        "Os melhores trecos da Torre, um tier acima do velho Coveiro. A arma então... nem se compara.",
        "Bronze eu aceito, mas o que eu quero MESMO são os Símbolos de Varth. Cinco por peça, sem choro.",
    ],
    "goblin_cofre": True,
})


# ===========================================================================
#  FALAS DO CÂNONE (Etapa de Lore): cada morador ecoa sua própria história.
#  Aplicadas por substring do id — NPCs fora do cânone ficam intactos.
# ===========================================================================
_LORE_GREETS = {
    "maricota":  ["O mar me contou uma coisa hoje... ah, nada não, esquece.",
                  "Javali?! QUE javali? Nunca alimentei javali NENHUM. Próximo assunto."],
    "bragan":    ["Tem noite que o martelo acha o ritmo sozinho... vem lá de baixo, do vale. Nem pergunta.",
                  "Forjei pra guarda de Valdarkram, sabia? Não bastou. NUNCA mais não basta."],
    "petra":     ["O desenho da Chave da Fenda? Eu SONHEI. Não pergunte mais.",
                  "Lapidei pra corte de Valdarkram... essas mãos já seguraram coroas."],
    "bartolo":   ["O Bragan aprendeu tudo comigo! Ou foi o contrário? DETALHE.",
                  "Guardo um retalho de cada trabalho. O primeiro? Uma bainha... de um CERTO ferreiro."],
    "solene":    ["Os ossos lá embaixo têm nome. Eu conheço todos. TODOS.",
                  "Os Doze respondem, sabia? Baixinho. Um por vez."],
    "cronista":  ["Um dia a Torre da Alvorada vai me aceitar de volta. Esta crônica é meu bilhete.",
                  "A última página de Valdarkram? Está guardada. Ninguém lê. NINGUÉM."],
    "lazaro":    ["Todo mato que eu limpo é uma dívida que eu pago.",
                  "São Cipriano me ensinou demais. Aqui... aqui eu desaprendo."],
    "chica":     ["Na Sapopemba de LÁ os pombos também me obedeciam, viu...",
                  "A Beth chegou chorando, saiu rindo. Coisa minha. Segredo meu."],
    "jorge":     ["Meu pai morreu devendo. Eu paguei TUDO. Esta casa é limpa.",
                  "Aqui dentro é terreno neutro. Juramento antigo. Até o Maurão respeita."],
    "zeca":      ["Eu podia ir pra QUALQUER reino, sabia? Mas... e a caravana? E a MULA?",
                  "A mula é sócia. Metade dos preços foi ideia dela."],
    "cigana":    ["Desci de Véspera quando a noite ficou barulhenta demais. Vocês não OUVEM como eu.",
                  "Minhas cartas nunca mentem. Eu... às vezes."],
    "milton":    ["Sexta tem dominó marcado. Nunca perco de vez... engraçado isso, né?",
                  "O mar me devolveu três vezes. Deve gostar da minha teimosia."],
    "remo":      ["Naquela noite tirei quarenta de Valdarkram. O rio ajudou.",
                  "De quem foge de algo, eu não cobro. Regra antiga."],
    "conchinha": ["O mar deixou presente na porta de novo hoje. Bobo, esse mar.",
                  "Filha de sereia, eu? *sorri* Deixa o povo falar."],
    "xama":   ["Falacan me criou, sabia? Os Doze são meus tios. Os SEUS também, ora.",
                  "Os bichos reclamam de você. Brincadeira. Ou não."],
    "marion":    ["Moedas de Avhur? Pago 2500. Não pergunte por quê, querido.",
                  "Dez anos disfarçada na Torre da Alvorada. Eles nunca souberam. NUNCA."],
    "peteco":    ["Já te contei que fui general? Ou pirata? Tanto faz, ESTRANGEIRO.",
                  "Qualquer arma. Três dias. Não pergunta COMO, estrangeiro."],
    "fernando":  ["O Galo cantou à meia-noite de novo. Cê ouviu? OUVIU.",
                  "Esse bar é IGUALZINHO ao de lá. Tábua por tábua. Da memória."],
    "sucuri":    ["Na Terra eu era MONSTRO no LoL, mano. Elo? Deixa quieto.",
                  "Acabei de tomar banho e já tô suado. Genética, irmão."],
    "macio":     ["AI! Pisei numa pedra... CHAMA A UPA! Chama a UPA!!",
                  "Red pill é estilo de vida, mano. *chora baixinho*"],
    "piadista":  ["Quer ouvir uma? Ah, essa é boa... vocês vão MORRER de rir. De rir, né?",
                  "Minhas piadas nunca falham. É quase... profético."],
    "bala":      ["Bala Chita, mano! Da BOA. Vargo deixou eu trazer a lembrança.",
                  "O nome? História longa. Envolve um doce. Fim."],
}
for _spec in ROSTER:
    _nid = str(_spec.get("id", ""))
    for _k, _falas in _LORE_GREETS.items():
        if _k in _nid:
            _spec.setdefault("greetings", [])
            _spec["greetings"] = list(_spec["greetings"]) + _falas
            break
