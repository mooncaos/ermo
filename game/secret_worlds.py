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
    norm("Fadrakor vacum malarim Jeans"):             {"map": "fadrakor_litoral", "from": "rasharan"},
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
    "fundamento": [
        {
            "id": "god:valdris", "name": "Valdris", "form": "valdris", "size": 5,
            "home": (42, 14), "radius": 6, "accent": "#b57bff", "step_every": 1.4,
            "falas": [
                "Voce me reconhece? La fora me chamam de forasteiro, o louco de roxo. Aqui, na casa do meu senhor, eu sou inteiro.",
                "Eu nao sou um dos doze. Vim de fora, de um lugar que nem o jabuti lembra. So o Moon sabia de onde. E ele se foi.",
                "Onde esta o trigo? ...Perdao. As vezes a minha cabeca volta pra la, pra aquele campo. Voce nao entenderia. Ainda.",
                "Sou mais forte que qualquer deus deste mundo. Menos um: o gato branco. Diante do Pofnir, ate eu abaixo os olhos.",
                "Sirvo o Moon por escolha, nao por nascimento. Os deuses nasceram dele. Eu escolhi ele. Ha diferenca, e ela e tudo.",
                "O Criador me deixou um recado antes de partir. Eu o guardo aqui dentro. Quando chegar a hora, voce sera o primeiro a ouvir.",
                "Perdi algo no caminho pra ca. Um cristal cor de ambar. Com ele, eu era outra coisa. Sem ele, sou so a sombra do que fui.",
                "Este trono nao ficara vazio pra sempre. Eu vi. Nao com estes olhos, com os outros. Algo vai sentar nele, e o mundo vai tremer.",
                "Voce vai voltar muitas vezes a este castelo. E a cada vez eu te contarei um pedaco a mais. A verdade nao se da de uma vez.",
                "Cuidado com o trono do meu senhor. Toca-lo e chamar a ira do gato. Eu avisei. Da proxima, nao avisarei de novo.",
            ],
        },
        {
            "id": "god:vargo", "name": "Vargo", "form": "dog_black", "size": 5,
            "home": (25, 53), "radius": 8, "accent": "#7c6a9c", "step_every": 1.0,
            "falas": [
                "Eu sou Vargo, o cao negro. Levo os mortos pela ultima estrada, um por um, sem pressa e sem pena.",
                "Aqui, no castelo do Criador, eu descanso entre uma travessia e outra. So aqui o cao baixa a guarda.",
                "Voce ainda respira, sinto pelo cheiro. Entao nao e comigo, ainda. Volte quando for a hora. Eu espero.",
                "Fui o primeiro a servir o Moon, e serei o ultimo. Lealdade nao se ensina a um cao: ja nasce nele.",
                "A morte nao e castigo. E so a Valiria acendendo uma vela do outro lado enquanto eu fecho a porta deste.",
                "O Moon partiu, mas nao morreu. Eu saberia. Nenhuma alma passou por mim com o cheiro dele. Ele apenas foi.",
                "Os homens temem o cao preto. Tolos. Deviam temer e o silencio que vem depois que eu passo.",
                "Cada um tem o seu fim guardado comigo desde o primeiro latido do mundo. Nao adianta correr: eu tenho quatro patas.",
                "Faco companhia ao trono vazio. Alguem precisa velar a cadeira do dono ausente. Por que nao o cao fiel?",
                "Quando o Moon voltar, eu serei o primeiro a sentir. Vou latir, e o mundo inteiro vai ouvir.",
            ],
        },
        {
            "id": "god:martur", "name": "Martur", "form": "tortoise", "size": 5,
            "home": (74, 53), "radius": 3, "accent": "#a8c08a", "step_every": 3.0,
            "falas": [
                "Sou Martur, o jabuti. Carrego o tempo no casco. Devagar, porque pressa e coisa de quem vai morrer cedo.",
                "Este lugar se chama Fundamento porque eu o seguro. Tire o jabuti, e tudo desaba. Por isso eu nao saio.",
                "Vi o mundo nascer. Vi os outros deuses nascerem. Vi voce nascer, agora ha pouco. Pra mim foi ontem.",
                "A pressa de voces me diverte. Vivem um piscar e acham que e a eternidade. Eu pisco e se passam eras.",
                "Memoria e o meu dom. Lembro de tudo. Ate do que o mundo preferiu esquecer. Ate do nome verdadeiro do forasteiro.",
                "O Moon construiu sobre o meu casco. Disse que eu era a unica coisa antiga o bastante pra aguentar o peso do comeco.",
                "Paciencia, viajante. Tudo chega a quem sabe esperar parado. Eu sou a prova viva, e ja esperei muito.",
                "Nao me apresse com perguntas. Cada resposta minha leva uma era pra amadurecer. Volte daqui a um seculo.",
                "O trono esta vazio porque o tempo do dono ainda nao se cumpriu. E o tempo, meu caro, e assunto meu.",
                "Quando tudo ruir, e ruira, eu recolho a cabeca pra dentro do casco e espero o proximo mundo. Sempre comeca um.",
            ],
        },
    ],
    "falanor": [
        {
            "id": "god:bragor", "name": "Bragor", "form": "dwarf", "size": 5,
            "home": (50, 16), "radius": 4, "accent": "#e08a3a", "step_every": 1.2,
            "falas": [
                "Sou Bragor, o Forjador. Toda bigorna deste mundo ecoa o meu martelo. Senta e olha o trabalho, mas nao atrapalha.",
                "Os anoes sao feitos a minha imagem: teimosos, firmes e bons de mao. Se voce e anao, carrega um pedaco de mim no peito.",
                "Aqui nao se reza, se faz. Quer a bencao do Forjador? Pega um martelo. O suor e a unica oracao que eu escuto.",
                "Sirvo o Pofnir, como os outros. O gato branco vigia; eu construo. Cada um com o seu oficio, e o meu e o aco.",
                "Um juramento e como uma solda: ou pega de vez, ou nao presta. Eu nao quebro os meus. Nunca quebrei. Nunca vou.",
                "Essa lava toda e o sangue do mundo, ainda quente do comeco. Eu tempero o metal nela. Nao tem fogo igual em lugar nenhum.",
                "Guerreiro de verdade conhece a propria arma melhor que o proprio nome. Fui eu que ensinei isso. A Mestra Adila aprendeu comigo.",
                "Tem deus que fala bonito. Tem deus que dorme em ouro. Eu martelo. No fim, e o que eu faco que segura o mundo de pe.",
                "Pressa estraga a tempera. O Martur que o diga, o casco velho. A gente se entende: ele tem o tempo, eu tenho a paciencia da forja.",
                "Leva isso de mim, sem cobrar: o que voce constroi com as proprias maos, nem deus tira. Nem eu. Agora me deixa malhar.",
            ],
        },
        {
            "id": "god:jose", "name": "Jose", "form": "cat_black", "size": 5,
            "home": (50, 50), "radius": 5, "accent": "#b06dff", "step_every": 1.0,
            "falas": [
                "Bem-vindo ao meu cabare. Eu sou o Jose. Mestre Cuscuz, pros intimos. Senta, joga, bebe. A casa as vezes ate perdoa a divida.",
                "Eu fui gato. Virei deus. Ai o Pofnir teve ciume, nao aceita outro gato no trono, e me prendeu nessa pelagem preta. Detalhe. Continuo deus.",
                "A Beth la na Metropole desconfia de mim. Mulher esperta, a Beth. Faz o melhor cuscuz dos sete mundos e finge que nao ve o que eu sou.",
                "Prazer e pecado moram na mesma rua, viajante. Eu sou o dono dos dois imoveis. Quer alugar? A fumaca roxa e cortesia da casa.",
                "O corvo passa por aqui as vezes. A gente se reconhece de longe, dois deuses fingindo de bicho. Ele nao bebe. Chato pra caramba.",
                "O Valdris? Nao me mete medo, nao. O louco de roxo que se cuide com o gato branco. Comigo ele senta, perde no carteado e paga a rodada.",
                "As meninas de Itatinga ainda dormem, sabia? Quando acordarem, a festa volta. Guardo a musica pra elas faz tempo. Tudo no seu tempo.",
                "Aqui dentro nao tem dia nem noite, so a proxima rodada. O vicio e honesto: ele nunca mente sobre o que e. So os santos mentem.",
                "Cada um que entra deixa um pedacinho da alma na mesa. Nao se preocupa, eu cuido bem. Tenho uma gaveta cheia. Quer ver? ...Brincadeira. Ou nao.",
                "Volta sempre, viajante. O Mestre Cuscuz nunca fecha. E entre nos: a aposta mais cara desta casa e achar que voce vai sair igual a como entrou.",
            ],
        },
        {
            "id": "god:nhare", "name": "Nhare", "form": "hare", "size": 5,
            "home": (50, 80), "radius": 8, "accent": "#bcd0c8", "step_every": 0.7,
            "falas": [
                "Oi. Sou o Nhare, a Lebre de Mil Saidas. Se um dia voce se ver encurralado, sem nenhuma saida, procura a milesima primeira. Ela existe.",
                "O Pofnir nunca me pegou. O Jose tambem nao. Sou a unica coisa neste Ermo que o gato branco nao controla, e isso o deixa louco da vida.",
                "Sorte nao e acaso, viajante. E saber pular um instante antes da armadilha fechar. Eu te ensino, se voce prometer nao contar pro gato.",
                "Toda toca aqui leva a outra. E a outra, a outra. Quem me persegue se perde no meio. Quem so quer passear, encontra o jardim inteiro.",
                "Segunda chance e o meu dominio. Errou? Respira. O mundo quase sempre tem uma fresta a mais do que parece. Quase sempre.",
                "O corvo me respeita de longe. Faz sentido: ele some pra qualquer dimensao, eu escapo de qualquer canto. Ninguem prende nenhum de nos dois.",
                "O ladino que me serve aprende cedo: a melhor briga e a que voce nao precisa brigar, porque ja sumiu na esquina rindo.",
                "Calma. Eu sempre fico meio de lado, ja reparou? E pra ver as duas saidas ao mesmo tempo. Velho habito de quem nunca quis ser pego.",
                "O Pofnir e poderoso, e verdade, controla quase tudo. Mas controle e uma gaiola que ele construiu pra todo mundo, menos pra mim. Eu so corro.",
                "Quando voce achar que e o fim, lembra da lebre. Tem sempre mais uma saida. Sempre. E se nao tiver, ai voce cava uma. Boa sorte, viajante.",
            ],
        },
    ],
    "fadrakor_litoral": [
        {
            "id": "god:korgath", "name": "Korgath", "form": "orc", "size": 5,
            "home": (50, 44), "radius": 5, "accent": "#d0512f", "step_every": 1.0,
            "falas": [
                "EU SOU KORGATH! O Punho! Toda guerra digna grita o meu nome. Voce chegou na minha praia, forasteiro. Mostra do que e feito ou cai fora.",
                "Os orcs e meio-orcs nasceram de mim, do meu sangue e da minha furia. Se voce e um deles, levanta a cabeca: voce vem da forca pura.",
                "Eu sou brutal, mas sou honesto. Nunca menti, nunca apunhalei ninguem pelas costas. O covarde que se esconde, esse sim eu desprezo.",
                "A Facalan, a onca, essa eu respeito. Selvagem que nem eu, nao se curva a deus nenhum. A gente nao precisa de palavra pra se entender.",
                "A Maria Cachorra foi minha sacerdotisa. A melhor guerreira que ja vi. Ela me largou. Hoje anda com a morte no calcanhar e nem me olha. Furia tambem doi, forasteiro.",
                "Esses totens? Cada um e uma guerra que eu venci. Finco eles na areia pra que o mar nunca esqueca. O mar esquece tudo. Eu nao deixo.",
                "Forca nao e crueldade. Crueldade e coisa de fraco com medo. Forca de verdade e olhar o inimigo no olho e dar a ele uma morte honrada.",
                "O Pofnir que vigie la do alto dele. Aqui na areia, quem manda e o punho. O gato branco nunca pisou na minha praia. Nem ousaria.",
                "Quer a minha bencao, barbaro? Nao se ajoelha, eu odeio ajoelhado. Fica de pe, aperta o punho, e jura que nunca vai correr de uma luta justa.",
                "Sobe pra selva quando quiser, a Facalan te espera. Mas lembra de mim quando a furia subir no teu peito. Aquilo ali sou eu, gritando do teu sangue.",
            ],
        },
    ],
    "fadrakor_selva": [
        {
            "id": "god:facalan", "name": "Facalan", "form": "jaguar", "size": 5,
            "home": (50, 50), "radius": 6, "accent": "#d9a441", "step_every": 0.8,
            "falas": [
                "Voce entrou no meu mato, forasteiro. Eu te ouvi a tres clareiras de distancia. Anda quieto. Aqui quem nao caca, e cacado.",
                "Eu nao me curvo a deus nenhum. Nem ao Pofnir. Ele e o gato de dentro de casa, gordo no colo do dono. Eu sou o gato que o dono nunca teve.",
                "So existe uma coisa que eu respeito: forca bruta. Palavra bonita nao mata a fome. Garra, dente e instinto, isso sim e verdade.",
                "O cabare do Jose? Aquela moleza de fumaca e carteado me da nojo. Gato preto fingindo de gente, bebendo no escuro. Vai cacar, Jose.",
                "O patrulheiro e o druida me servem porque entendem o mato. Nao se DOMINA a selva, forasteiro. Voce vira parte dela, ou ela te engole.",
                "Cismo com o Valdris, aquele cheiro de loucura de outro mundo. E com a Maria, que carrega a morte e nao teme nada. Forca demais junta me deixa de orelha em pe.",
                "Instinto nunca mente. A cabeca duvida, a cabeca hesita. O corpo sabe. Quando o perigo vem, voce nao pensa: voce salta. Aprende isso e vive.",
                "Cada bicho aqui tem o seu lugar na cadeia. O forte come, o fraco alimenta. Nao e crueldade, forasteiro. E o mato. Sempre foi assim, antes de qualquer deus.",
                "Eu nao tenho dono e nunca vou ter. Por isso me chamam a Onca Sem Dono. Tenta me prender e voce descobre porque nenhum cacador nunca voltou.",
                "La em cima e o vulcao do Drazun, o lagarto orgulhoso dormindo no ouro. Sobe se tiver coragem. O fogo dele nao perdoa quem chega fraco. Eu te avisei.",
            ],
        },
    ],
    "fadrakor_vulcao": [
        {
            "id": "god:drazun", "name": "Drazun", "form": "dragon", "size": 6,
            "home": (50, 27), "radius": 4, "accent": "#ff6a2a", "step_every": 2.5,
            "falas": [
                "Quem ousa subir ate a minha cratera? Eu sou Drazun. O Dragao Primevo. O fogo do comeco do mundo dorme nas minhas escamas. Fala rapido, mortal.",
                "Os draconatos sao minha cria, feitos a minha imagem. Os kobolds e o povo-lagarto me ecoam de longe, como sombras de uma chama. Todos vem de mim.",
                "Esse ouro todo nao e riqueza, forasteiro. E PODER acumulado. Cada moeda e uma vida, um reino, uma era que passou enquanto eu dormia. Eu durmo sobre o tempo.",
                "Sim, eu me curvo ao Pofnir. A contragosto. O gato branco tem poder sobre coisas que nem eu alcanco. Mas que fique claro: eu me curvo, nao me ajoelho.",
                "Ambicao e a unica chama que nunca apaga. O orgulho me sustenta ha eras. Tira o orgulho de um dragao e sobra so um lagarto grande dormindo no frio.",
                "O feiticeiro que me serve carrega uma fagulha do meu fogo no sangue. Magia nao se estuda, mortal. Ela QUEIMA de dentro pra fora. Ou voce nasce com ela, ou nao nasce.",
                "Eu vi o mundo ser jovem. Vi montanhas nascerem e virarem po. O Martur lembra do tempo; eu QUEIMEI atraves dele. Sao coisas diferentes, jabuti velho.",
                "Cuidado por onde pisa. Cada espinho de obsidiana aqui foi lagrima de lava que eu chorei de tedio, esperando o proximo tolo digno de me acordar.",
                "Voce quer a minha bencao? Entao prova que tem ambicao de verdade. Eu nao abencoo os contentes. Abencoo os que QUEREM, os que ardem por mais. O resto que vire cinza.",
                "Agora me deixa. Volta pro mar, pro mato, pro teu mundinho. E quando sonhar com fogo e ouro e com o desejo de ter TUDO, saiba que era eu, mortal. Sempre fui eu.",
            ],
        },
    ],
}


def deities_for(map_name):
    return DEITIES.get(map_name, [])
