"""
VALDRIS — o primeiro habitante do Ermo.

Jovem por fora (parou de envelhecer aos 25), anciao por dentro (874 anos),
forasteiro recem-caido nos nossos Ermos: confuso, deslocado, procurando o
caminho de volta. Perambula pelo vilarejo murmurando coisas cosmicas pro nada;
quando voce chega perto e fala com ele, ele te olha e pergunta as coisas de
quem nao sabe onde caiu.

E tem um limite: xingou perto dele (em PT/EN/ES/FR), ele te apaga com uma
magia cosmica. Perdeu o mundo dele, nao os modos.

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
    "este nao e o meu ceu. as estrelas estao todas no lugar errado.",
    "no meu mundo isso aqui nao existia. ou existia, e eu que nao existia ainda.",
    "acordei neste vilarejo sem ter dormido nele.",
    "meu rosto e jovem e isso confunde todo mundo, inclusive eu.",
    "conheco o cansaco de oitocentos anos, mas este chao e novo pra mim.",
    "se um corvo falar comigo, vou fingir que nao entendi.",
    "uma vez fui vento por uma tarde inteira.",
    "guardei um trovao num pote. e melhor nao abrir o pote.",
    "as pedras tambem sonham, so que bem devagar.",
    "contei ate o infinito uma vez. parei no meio porque deu fome.",
    "874 anos e ainda nao aprendi a assoviar.",
    "ontem o sol nasceu quadrado. ninguem comentou nada.",
    "acho que morri numa terca. mas foi rapidinho.",
    "tem um nome na ponta da minha lingua. nao e o meu.",
    "a agua daquele lago me deve dinheiro.",
    "parei de envelhecer aos 25. a cabeca nao recebeu o aviso.",
    "voce tambem escuta a batata pensando, ou sou so eu?",
]

# Falas de quando VOCE chega perto e interage: forasteiro perdido, pedem um "voce".
GREETINGS = [
    "voce e daqui? como e que se volta?",
    "voce tambem caiu aqui de algum lugar, ou esse mundo e teu de nascenca?",
    "como esse 'Ermo' se chama? eu vim de um lugar com outro nome.",
    "tem um caminho de volta? ou eu sou o tipo de coisa que so vai numa direcao?",
    "me diz: faz quanto tempo que eu estou aqui? perdi a conta.",
    "voce tem cara de quem sabe onde fica a saida. sabe?",
    "se eu te perguntar quem eu sou, voce saberia responder?",
    "voce e real, ou eu te inventei pra ter com quem falar?",
    "fica entre nos: eu nao sei como cheguei neste lugar.",
]

# O que ele diz no instante em que frita o engracadinho que xingou perto.
SMITE_LINES = [
    "essa palavra eu conheco. em todos os meus mundos ela e feia.",
    "874 anos de paciencia. nao inclui isso.",
    "no meu mundo, isso se pagava caro.",
    "eu vim de muito longe pra nao ouvir isso.",
    "perdi meu mundo. nao perdi os modos.",
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
