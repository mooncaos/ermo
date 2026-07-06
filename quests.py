"""
VALDRIS — o excentrico do Ermo, senhor das terras do sudeste.

Nada de velho, nada de confuso: o Valdris e excentrico ate o osso. Conversa com
as pedras, guarda trovao em pote, conta o infinito por esporte. Sabe exatamente
onde esta e o que faz; o mundo e que e estreito demais pro jeito dele. Perambula
pelos campos e pelo lago la no sudeste murmurando coisas cosmicas pro nada;
quando voce chega perto, ele te encara e solta um enigma, achando graca.

E tem um limite: xingou perto dele (em PT/EN/ES/FR), ele te apaga com uma magia
cosmica. Excentrico, nao surdo: vulgaridade no campo dele, nao passa.

Aqui mora so o CONTEUDO (as falas) e a deteccao de palavrao. O comportamento
(andar, falar, punir) e orquestrado em app.py; o estado do NPC vive em world.py.
"""

import unicodedata

# Identidade do NPC no mundo (chave em world.players e id no protocolo).
NPC_ID = "npc:valdris"
NPC_NAME = "Valdris"

# ------------------------------------------------------------------ falas

# Murmurios soltos, cosmicos: ele fala SOZINHO enquanto perambula. Sem "voce".
MURMURS = [
    "guardei um trovao num pote. e melhor nao abrir o pote.",
    "as pedras tambem sonham, so que bem devagar.",
    "contei ate o infinito uma vez. parei no meio porque deu fome.",
    "ontem o sol nasceu quadrado. achei elegante.",
    "a agua daquele lago me deve dinheiro. e sabe disso.",
    "voce tambem escuta a batata pensando, ou e privilegio meu?",
    "uma vez fui vento por uma tarde inteira. recomendo.",
    "ja conversei com cada espiga daquele trigo. tem uma que mente.",
    "o lago e um espelho preguicoso: me copia sempre com atraso.",
    "dei nome pra todas as nuvens. aquela ali e a Gertrudes.",
    "se um corvo falar comigo, vou fingir que entendi de proposito.",
    "plantei uma pergunta ali atras. semana que vem nasce a resposta.",
    "o silencio daqui tem sotaque. voce nao acha?",
    "guardo segredos que ainda nem aconteceram.",
    "tem dias que eu ando ao contrario so pra desafiar a paisagem.",
    "a sombra daquela arvore me deve uma desculpa.",
    "eu nao durmo. so pisco bem devagar por umas horas.",
]

# Falas de quando VOCE chega perto e interage: forasteiro perdido, pedem um "voce".
GREETINGS = [
    "ah, um visitante. diga: voce ja contou os seus proprios passos hoje?",
    "voce chegou na hora exata. eu so nao sei exata de que.",
    "responde rapido, sem pensar: de que cor e o vento agora?",
    "voce tem cara de quem guarda um numero secreto. eu tambem guardo.",
    "fica entre nos: a sua sombra confia em voce?",
    "interessante. voce anda como quem ainda nao decidiu existir direito.",
    "se eu te emprestar um trovao, voce devolve limpo?",
    "voce veio dos campos, ou os campos e que te cuspiram aqui? curiosidade minha.",
    "gosto de voce. tem o peso certo pra atravessar uma quinta-feira.",
    "me diz uma verdade que ninguem sabe, e eu te conto uma que ninguem devia.",
]

# O que ele diz no instante em que frita o engracadinho que xingou perto.
SMITE_LINES = [
    "essa palavra eu conheco. ela e feia em todos os idiomas que eu inventei.",
    "nao. aqui no meu campo, isso nao se diz.",
    "vulgaridade enferruja o cosmos. vai pensar la longe.",
    "guardei um trovao justamente pra momentos assim.",
    "a paisagem se ofendeu. e eu concordo com ela.",
]


# -------------------------------------------------------- deteccao de palavrao
#
# Regra: casamos PALAVRA INTEIRA, nunca pedaco. Assim "assistir", "Scunthorpe"
# e afins nao tomam raio a toa (o classico problema do filtro burro). Tambem
# tiramos acento antes de comparar, pra pegar "cabron"/"cabron", "conio" etc.
#
# De proposito ficaram DE FORA alguns homografos comuns e inocentes pra nao
# punir frase honesta: "con" (em espanhol e "com") e "puto" (em pt-BR vira so
# "estou puto" = irritado). Os claramente vulgares estao todos aqui, nas quatro
# linguas que o Valdris conhece.

_CURSES = {
    # ---- portugues ----
    "merda", "bosta", "porra", "caralho", "carai", "cacete", "buceta",
    "foder", "fodase", "foda", "fodido", "cu", "cuzao", "cuzudo",
    "fuder", "fudido", "fudendo", "fudeu", "fude", "fudam", "fudase",
    "viado", "veado", "corno", "puta", "putaria", "putinha",
    "arrombado", "otario", "babaca", "desgraca", "desgracado",
    "piranha", "vagabundo", "vagabunda", "escroto", "fdp", "pqp",
    "krl", "vsf", "vtnc", "xexelento", "pinto", "rola",
    # ---- ingles ----
    "fuck", "fucking", "fucker", "fucked", "shit", "shitty", "bullshit",
    "bitch", "asshole", "ass", "bastard", "dick", "cunt", "motherfucker",
    "crap", "damn", "douche", "prick", "slut", "whore", "wanker",
    "twat", "bollocks", "jerk",
    # ---- espanhol ----
    "mierda", "joder", "puta", "cabron", "cono", "pendejo", "gilipollas",
    "polla", "hostia", "capullo", "follar", "verga", "chinga", "chingada",
    "cojones", "maricon", "zorra", "culero", "pinche", "mamon", "carajo",
    # ---- frances ----
    "merde", "putain", "salope", "connard", "connasse", "encule", "enculer",
    "bite", "couilles", "conne", "foutre", "bordel", "chiotte", "salaud",
    "pute", "branleur", "niquer", "nique", "batard", "chiant", "emmerde",
}

# Xingoes de mais de uma palavra (checados sobre o texto normalizado).
_CURSE_PHRASES = (
    "puta que pariu", "filho da puta", "filha da puta", "vai se foder",
    "vai tomar no cu", "pau no cu", "que se foda", "vai a merda",
    "hijo de puta", "hija de puta", "me cago en", "la concha",
    "ta gueule", "ferme ta gueule", "fils de pute", "nique ta",
    "son of a bitch", "piece of shit", "go to hell",
)


def _normalize(text):
    """minusculo, sem acento, pontuacao virando espaco. Devolve (texto, tokens)."""
    if not isinstance(text, str):
        return "", []
    # tira acentos
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    # tudo que nao for letra/numero vira espaco (separa palavras de pontuacao)
    cleaned = "".join(c if c.isalnum() else " " for c in text)
    tokens = cleaned.split()
    return " ".join(tokens), tokens


def contains_curse(text):
    """True se o texto tem palavrao (palavra inteira) em PT/EN/ES/FR."""
    norm, tokens = _normalize(text)
    if not tokens:
        return False
    for tok in tokens:
        if tok in _CURSES:
            return True
    # frases: precisa estar cercada por borda de palavra no texto normalizado
    padded = " " + norm + " "
    for phrase in _CURSE_PHRASES:
        if (" " + phrase + " ") in padded:
            return True
    return False
