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
]
