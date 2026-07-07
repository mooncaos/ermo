# -*- coding: utf-8 -*-
"""
O CÂNONE DO ERMO — decidido por MoonCaos, Avatar do Caos, com Claudinho de escriba.
Lore oficial de bosses e NPCs: origem, laços e poder. Fonte da verdade para
falas, fofocas, quests e o codex. (Etapa de Lore & Cânone, julho/2026)

FUNDAÇÃO DO MUNDO: Valdarkram era a CAPITAL dos ermos; a vila do Ermo, só uma
vila rural. Varth, grande mago da Torre da Alvorada, buscou conhecimento demais:
seus rituais atraíram as trevas e os vampiros, Véspera ruiu, Valdarkram caiu.
Os sobreviventes se refugiaram na vila — e o Ermo nasceu do êxodo. Varth
barganhou com Atalech, perdeu, e coroou-se o LICH REI.
VARGO, o deus-barqueiro das almas, traz gente de OUTROS MUNDOS (inclusive da
Terra, inclusive do Brasil) para segundas chances nos Ermos — a diáspora
brasileira fundou culturalmente Sapopemba do Caique.
"""

CANON = {
    # ============ A ERA DA ALVORADA (canonizada em 07/jul/2026) ============
    "guarda_alvorada": {
        "nome": "A Guarda da Alvorada — a Legião dos Oitenta",
        "origem": "Fundada por decreto do Rei Marth para que Prospera nunca conhecesse uma manhã sem proteção. O Quartel-General ergue-se na Baixa da Égua, ao lado do haras; sob ele, a Ala dos Quartos: um corredor monumental onde cada soldado tem cama, baú e nome.",
        "laco": "Oitenta lâminas em dois turnos: quarenta postos guarnecidos do amanhecer ao amanhecer, de Vilalbina ao Septo dos Doze.",
        "poder": "A disciplina. Um soldado da Alvorada parado no posto é uma promessa: a de que o amanhã chega inteiro.",
    },
    "demetrius_prosperi": {
        "nome": "Lorde Comandante Demétrius Prosperi",
        "origem": "Irmão do Rei Marth, tio de Dante e Diana. Enquanto o irmão aprendia a governar com o trigo, Demétrius aprendia com o aço.",
        "laco": "Prosperi de sangue e de posto: 'cada Prosperi tem sua torre'. A dele tem oitenta espadas dentro.",
        "poder": "Nunca perdeu um duelo. Dorme com a espada ao alcance e a legião no coração.",
    },
    "maria_valmont": {
        "nome": "Tenente Maria Valmont",
        "origem": "A Valmont que trocou o salão de chá pela sala de armas. A corte comenta; ela não escuta — está ocupada treinando novatos na base do grito e do exemplo.",
        "laco": "Prima de Isolda e Fagnin. Braço-direito de Demétrius, e a única pessoa do quartel que ele nunca precisa corrigir.",
        "poder": "A confiança do Lorde Comandante — e uma paciência que dói nos recrutas.",
    },
    "guarda_real": {
        "nome": "A Guarda Real Dourada",
        "origem": "Os doze melhores da Alvorada, vestidos em ouro da cabeça aos pés: dois com a Lady Diana, dois com o Lorde Dante no farol, dois à porta do Solar — dia e noite.",
        "laco": "O ouro chama a atenção de propósito: olhem para eles, não para quem protegem.",
        "poder": "Entre um dourado e um perigo até seu protegido há exatamente: nada.",
    },
    "saudacao_da_aurora": {
        "nome": "A Saudação da Aurora",
        "origem": "O rito marcial da Guarda. Quem pergunta ao Mestre Fanfarrão, no Feirão, 'qual o poder da aurora?' recebe o brado: 'SALVE A AURORA PROSPERINA!' — e a legião inteira se forma em fileiras perfeitas.",
        "laco": "Comparecem o Arcebispo Celestino, o Lorde Dante, a Lady Diana e o Heron. Curto, marcial, inesquecível.",
        "poder": "Por mais que seja simples, é incrível o poder da aurora: fazer oitenta homens acreditarem na mesma manhã.",
    },
    "festival_sao_celeste": {
        "nome": "O Festival de São Celeste",
        "origem": "A cada sete dias, o Feirão explode em música e tendas. Dizem que São Celeste era um gato; dizem que era um santo. O festival não escolhe lado.",
        "laco": "O único chamado que tira o Lorde Dante do farol. O Arcebispo Celestino abençoa; o Mestre Fanfarrão grita.",
        "poder": "Um dia inteiro em que a ilha esquece que já teve medo.",
    },
    "prospera_capital": {
        "nome": "Prospera, a Capital Viva",
        "origem": "Dez lojinhas de rua (do barbeiro Seu Fino ao Zé Boato), nove lares, a Casa Valmont, o Martelo Dourado dos leilões e a Embaixada das Terras do Ermo — cujo porão, oficialmente, não existe. RECEBA.",
        "laco": "Às 17h a corte inteira paparica a Rainha-mãe no Salão de Chá. Às 16h, a ilha INTEIRA confraterniza na praça.",
        "poder": "Uma capital que trabalha, reza, fofoca e leiloa — tudo no mesmo dia.",
    },
    "restaurante_jacquard": {
        "nome": "O Restaurante Jacquard ✶✶✶✶✶✶",
        "origem": "Seis estrelas porque cinco 'era pouco pra minha arte', segundo o Chef. A nobreza janta lá entre 19h e 21h — e quando há nobre presente, o Chef SURTA em francês.",
        "laco": "Gaston, o sous-chef, leva os berros e ama o Chef como um pai. 'OUI, CHEF!' é ao mesmo tempo cargo, oração e diagnóstico.",
        "poder": "O bife ancho que já fez um bárbaro chorar. De emoção. E de pimenta.",
    },
    "varth_arsenal": {
        "nome": "O Arsenal do Lich Rei",
        "origem": "No terceiro andar da torre, Varth não golpeia: CONJURA. O Raio do Fim, a Colheita de Almas, o Sigilo de Varth — e a RUÍNA, o pentagrama em área que marca todos ao redor.",
        "laco": "Ele fala enquanto mata: 'Ajoelhem. Poupem meu tempo e o chão.' A Rainha Cinzenta sussurra os nomes; ele risca da lista.",
        "poder": "Cada alma drenada o remenda. 'Tragam mais heróis. Meus corredores precisam de decoração.'",
    },
    "lady_diana_herdeira": {
        "nome": "Lady Diana Prosperi, a Herdeira de Fogo",
        "origem": "Nasceu de madrugada, chorando forte e olhando a janela — o mar já chamava (palavra da parteira Firmina). Primeira na linha do trono de Prosperina por direito e por VONTADE: o irmão escolheu o farol; ela escolheu a coroa.",
        "laco": "Doce com os leais, cortante com quem a subestima. A corte sussurra sobre seus amores e suas cavalgadas solitárias; ela não se digna a esconder nenhum dos dois. As rosas brancas anônimas da floricultura? Todo mundo sabe. Ninguém ousa dizer.",
        "poder": "A vontade. Diana não pede o que é dela por nascimento — e não será questionada. Nem pela corte, nem pelo conselho, nem pelo próprio mar (com quem, aliás, conversa).",
    },
    # ======================= BOSSES =======================
    "velho_bob": {
        "nome": "O Velho Bob",
        "origem": "Javali comum que engoliu algo MÁGICO na maré baixa: uma Pérola de Leviatã, que pulsa viva dentro dele.",
        "laco": "A Maricota o alimentava filhote. Ela NEGA até hoje.",
        "poder": "A Pérola: a água do mar fecha as feridas do velho. O mar não deixa o Bob morrer (por isso ele sempre volta).",
    },
    "maurao": {
        "nome": "Maurão",
        "origem": "Capanga que traiu o antigo chefão de Sapopemba e sentou no trono dele.",
        "laco": "Irmão mais velho (de sangue jurado, neste mundo) do Lázaro. Família complicada.",
        "poder": "Rede de informantes em todo canto: nada acontece 'aqui embaixo' sem ele saber primeiro.",
    },
    "dama_noite": {
        "nome": "A Dama da Noite",
        "origem": "Nobre de Véspera que RECUSOU a mordida do vampirismo — e no ato da recusa virou algo que nem os vampiros nomeiam.",
        "laco": "As viúvas do Ermo rezam pra ela em segredo.",
        "poder": "Cada oração de viúva tece um véu novo sobre ela; os véus são escudo e lâmina. Ferir a Dama é ferir o luto de cem mulheres — e a dor não sangra.",
    },
    "lorde_varth": {
        "nome": "Lorde Varth, o Lich Rei",
        "origem": "Grande mago da Torre da Alvorada; buscou conhecimento antes da ruína. Seus rituais atraíram as trevas e os vampiros: Véspera ruiu, e Valdarkram — a capital dos ermos — caiu. Ele barganhou com Atalech e PERDEU.",
        "laco": "O êxodo que ele causou fundou o Ermo moderno. Toda a vila existe por culpa dele.",
        "poder": "Já morreu uma vez: a morte não o aceita de volta.",
    },
    "farao_avhur": {
        "nome": "O Faraó de Avhur",
        "origem": "Rei de um império de areia ANTERIOR a Valdarkram (Avhur → Valdarkram → Ermo: três eras).",
        "laco": "Deixou um segredo enterrado que NEM ELE lembra mais.",
        "poder": "Cada Moeda de Avhur é um pedaço da alma dele. (E a Marion as compra, cientemente, a 2500.)",
    },
    "colosso_avasham": {
        "nome": "O Colosso de Avasham",
        "origem": "Golem de guerra de Avhur que sobreviveu ao próprio império — a última arma de um rei morto.",
        "laco": "A Cova é onde tentou voltar a dormir. Não conseguiu. Insone há mil anos.",
        "poder": "Cada pedra da região é uma célula do corpo dele: derrubá-lo é só espalhar as pedras. Elas se juntam de novo.",
    },
    "urso_rei": {
        "nome": "O Urso Rei",
        "origem": "O PRIMEIRO urso, de quando o bosque nasceu.",
        "laco": "O bosque de Atalech sussurra pra ele há eras — e ele RESISTE. É a última muralha contra a corrupção.",
        "poder": "A coroa de galhos: enquanto usar, o bosque inteiro luta ao lado dele. (Quem o derruba enfraquece a muralha sem saber.)",
    },
    "vulkar": {
        "nome": "Vulkar",
        "origem": "A primeira fagulha que escapou da Ferida — e ao invés de apagar, aprendeu a ter FOME.",
        "laco": "O Mestre Bragan aprendeu a forjar OUVINDO Vulkar de longe: o martelo do ferreiro imita a pulsação do coração no fundo do vale. Odeia a chuva com todas as brasas.",
        "poder": "O Coração de Brasa: enquanto pulsa, o Brasal NUNCA esfria. Enquanto restar uma brasa acesa no vale, o coração se recompõe.",
    },
    "krezath": {
        "nome": "Krezath, o Devorador",
        "origem": "Filhote de DRAZUN, roubado do ninho divino por BRAGOR. O roubo deu errado: caiu nos ermos e foi amaldiçoado pela loucura de Varth.",
        "laco": "Cultistas o alimentam achando que o CONTROLAM. É um bebê de deus, órfão, caído e enlouquecido.",
        "poder": "Cresce um palmo a cada década de fome.",
    },
    "maraja": {
        "nome": "O Marajá",
        "origem": "O último de uma linhagem de leões-reis anterior aos homens.",
        "laco": "Reconhece o Faraó — e ainda espera ordens dele. (Ele e o Colosso: os dois últimos soldados de Avhur ainda de pé.)",
        "poder": "O rugido comanda TODA fera da savana.",
    },
    # ======================= NPCS =======================
    "maricota": {
        "nome": "Maricota",
        "origem": "Ex-pirata aposentada. Ninguém na vila desconfia.",
        "laco": "Criou o Bob filhote — o segredo que ela NEGA (dos dois lados do cânone).",
        "poder": "Fala com o mar. E ele responde baixinho ('minha filha, o mar me contou' NÃO é força de expressão).",
    },
    "mestre_bragan": {
        "nome": "Mestre Bragan",
        "origem": "Forjou pra guarda de VALDARKRAM antes da ruína — sobrevivente do êxodo, carrega o peso de cada lâmina que não bastou.",
        "laco": "Ama a Petra em silêncio (a viagem da tarde é canônica). Rivalidade teatral com o Bartolo. E a corte de PROSPERA ainda ENCOMENDA dele e da Petra — sem saber quem são.",
        "poder": "OUVE o metal: defeito, alma, destino. O dom nasceu de escutar Vulkar sem saber.",
    },
    "mestra_petra": {
        "nome": "Mestra Petra",
        "origem": "Lapidou as joias da CORTE de Valdarkram — artesã da capital caída, como o Bragan.",
        "laco": "A Cigana lê a sorte dela toda lua cheia. (O não-dito do Bragan segue não-dito.)",
        "poder": "As Chaves da Fenda que ela forja: ela SONHOU o desenho. Ninguém ensinou. A Fenda mandou a planta.",
    },
    "mestre_bartolo": {
        "nome": "Mestre Bartolo",
        "origem": "Autodidata: aprendeu DESMONTANDO o trabalho alheio — e os primeiros que desmontou foram do Bragan. Ele descobriu.",
        "laco": "Rivalidade TEATRAL com o Bragan ('Você aprendeu me COPIANDO!' / 'Eu aprendi te CORRIGINDO!') — vinte anos de gritaria na taverna, morrendo de amor um pelo outro.",
        "poder": "Guarda um retalho de cada trabalho que já fez. O primeiro da coleção: um pedaço de bainha do Bragan. Ele mostra pra quem pedir. O Bragan nega.",
    },
    "irma_solene": {
        "nome": "Irmã Solene",
        "origem": "Última de uma ordem que cuida dos Doze desde Valdarkram — a fé também fugiu no êxodo.",
        "laco": "Conhece cada osso do Ossuário PELO NOME: são os irmãos da ordem e os mortos da capital. Ela desce a escada fria pra conversar.",
        "poder": "Os Doze RESPONDEM as preces dela. Baixinho. Um por vez.",
    },
    "cronista": {
        "nome": "O Cronista",
        "origem": "Estudante da Torre da Alvorada expulso por 'curiosidade excessiva' → refugiou-se em Valdarkram → escreveu a ÚLTIMA página da crônica na noite da queda e fugiu com o livro.",
        "laco": "Registra TUDO sonhando juntar conhecimento suficiente pra conquistar um novo lugar na Torre que o expulsou.",
        "poder": "Guarda a última página de Valdarkram. Ninguém nunca leu — nem pra se redimir ele mostra.",
    },
    "lazaro": {
        "nome": "Lázaro",
        "origem": "O Lázaro do Brasil (Lázaro Barbosa): feiticeiro e fugitivo lendário da Terra, aprendeu os segredos do Livro de São Cipriano. Morto pelas forças brasileiras, acordou nos braços de VARGO — e foi solto nos Ermos.",
        "laco": "Irmão jurado (mais novo) do Maurão neste mundo. A Dona Chica sabe TUDO — da irmandade E do outro mundo. Ele sabe que ela sabe.",
        "poder": "A origem de outro planeta e o Livro de São Cipriano. O homem que se escondia no mato agora LIMPA o matagal: ressignificação, poda por poda.",
    },
    "chica": {
        "nome": "Dona Chica",
        "origem": "Era a Dona Lucrécia, de Sapopemba, na GRANDE SP. Uma das cidadãs mais ANTIGAS dos Ermos: fundou culturalmente a Sapopemba daqui (a diáspora de Vargo). Parteira de metade da cidade, viúva três vezes ('causas naturais', jura). Sempre meio louca; a loucura piorou — mistura os dois mundos.",
        "laco": "Pombos-espiões LITERAIS. Criou o Maurão pequeno e acolheu o Lázaro renascido (pacto de silêncio mútuo). Amiga da Maria Cachorra. Foi quem acolheu a BETH quando Vargo a trouxe.",
        "poder": "Sabe o segredo de TODOS. Nunca errou um.",
    },
    "jorge": {
        "nome": "Jorge, o Taverneiro",
        "origem": "Herdou a taverna do pai que morreu DEVENDO — e pagou cada centavo.",
        "laco": "O único que o Maurão respeita SEM medo.",
        "poder": "Nunca esquece um pedido (nem o de 20 anos atrás); acerta a bebida favorita na primeira olhada; e a taverna é terreno NEUTRO por juramento antigo ('aqui dentro ninguém briga' é lei).",
    },
    "zeca": {
        "nome": "Zeca, o Caravaneiro",
        "origem": "Anão mágico capaz de viajar ENTRE REINOS — mas só de mãos vazias: carregando a caravana, não atravessa.",
        "laco": "Não consegue ir embora dos Ermos: apego emocional à caravana. A mula é SÓCIA (a opinião dela VALE).",
        "poder": "SENTE emboscada no vento. Por isso vive. Quase sempre.",
    },
    "cigana": {
        "nome": "A Cigana",
        "origem": "Desceu de VÉSPERA quando a noite ficou 'barulhenta demais' (uma vidente OUVINDO os rituais de Varth acordarem as trevas).",
        "laco": "O Zeca a leva de graça: dívida antiga entre viajantes. Lê a sorte da Petra toda lua cheia.",
        "poder": "As cartas NUNCA mentem (ela às vezes mente sobre elas); vê o fio do destino de quem toca a mão; amaldiçoa quem a engana SEM QUERER — é automático.",
    },
    "milton": {
        "nome": "Seu Milton",
        "origem": "Pescador que o mar devolveu TRÊS vezes; o primeiro morador do Ermo pós-êxodo ainda VIVO.",
        "laco": "Joga dominó com a Morte toda sexta (é VARGO do outro lado da mesa). Ensina os meninos a pescar de graça.",
        "poder": "Vargo perde no dominó DE PROPÓSITO: enquanto houver revanche marcada, o velho não morre. Ele acha que é sorte de pescador.",
    },
    "ze_do_remo": {
        "nome": "Zé do Remo",
        "origem": "Remava em Valdarkram: tirou 40 pessoas na noite da queda. Parte do Ermo chegou no barco dele.",
        "laco": "NUNCA cobrou de quem fugia de algo (a regra nasceu naquela noite).",
        "poder": "Conhece travessias que NÃO EXISTEM no mapa.",
    },
    "conchinha": {
        "nome": "Conchinha",
        "origem": "Filha de sereia? A vila especula; ela deixa especularem.",
        "laco": "O mar deixa PRESENTES na porta dela toda maré (o estoque da loja vem daí: o oceano a corteja).",
        "poder": "Ouve o oceano em QUALQUER concha — o rádio do mar.",
    },
    "xama_miranda": {
        "nome": "Xamã Miranda",
        "origem": "Criada por FALACAN em pessoa. Conhece os Doze como se fossem seus TIOS.",
        "laco": "Protegida por Falacan; visita o Templo dos Doze (a sobrinha visitando os tios). Qualquer fruto da natureza a respeita.",
        "poder": "PORTADORA do poder de Falacan: controla os elementos selvagens, vê a doença antes do corpo, anda no mundo dos espíritos como quem vai à feira, fala a língua de todos os bichos.",
    },
    "marion": {
        "nome": "Marion, a Bruxa",
        "origem": "Estudou na Torre da Alvorada DISFARÇADA por 10 anos.",
        "laco": "SABE o que a Moeda de Avhur é — e por isso compra (pedaços da alma do Faraó, a 2500 cada, cientemente).",
        "poder": "Não envelhece desde que começou a coleção. O plano FUNCIONA.",
    },
    "peteco": {
        "nome": "Peteco",
        "origem": "Ninguém sabe: ele MUDA a história a cada cliente (todas com a mesma convicção).",
        "laco": "Chama TODOS de estrangeiro — até quem nasceu na esquina. Estrangeiro de ONDE, Peteco? (Mistério canônico.)",
        "poder": "Consegue QUALQUER arma em 3 dias. Não pergunte como.",
    },
    "sr_fernando": {
        "nome": "Sr. Fernando",
        "origem": "Da Terra: tinha O MESMO bar na Sapopemba real, na Grande SP. Vargo o trouxe; ele reconstruiu o Galo de Ouro da memória.",
        "laco": "O galo empalhado atrás do balcão OUVE — e ele conversa com ele.",
        "poder": "O Galo ainda CANTA à meia-noite. Ninguém comenta. Todo mundo ouve.",
    },
    "sucuri_meteoro": {
        "nome": "Sucuri Meteoro",
        "origem": "Da Terra, de Rondonópolis: gordo safado que só sabia jogar League of Legends.",
        "laco": "Piadista nato de Sapopemba.",
        "poder": "Tão sedentário que toma banho e SAI SUADO. O 'Meteoro' é ironia pura.",
    },
    "macio": {
        "nome": "Macio",
        "origem": "Da Terra também. Grita de dor se pisar numa pedrinha.",
        "laco": "Se acha red pill. É o ser mais frouxo do multiverso. O apelido é literal.",
        "poder": "Nenhum. E dói.",
    },
    "piadista": {
        "nome": "O Piadista",
        "origem": "Sapopemba do Caique.",
        "laco": "Todo mundo ri com ele.",
        "poder": "As piadas dele PREVEEM desgraças. Ninguém percebeu ainda. Releiam as piadas antigas.",
    },
    "bala_shita": {
        "nome": "Bala Shita",
        "origem": "Da Terra. O nome vem da bala Chita — o apelido mais brasileiro do multiverso.",
        "laco": "Sapopemba do Caique.",
        "poder": "Carrega a memória do doce que Vargo deixou vir junto.",
    },
    "goblin_cofre": {
        "nome": "O Goblin do Cofre",
        "origem": "Contratado pelo banco por razões óbvias.",
        "laco": "Ama cada moeda como filho.",
        "poder": "Dá NOME pra elas. Tente sacar a 'Josefina' e entenda a segurança do banco.",
    },
    "coveiro": {
        "nome": "O Coveiro",
        "origem": "Valdarkram encheu o ofício dele de trabalho.",
        "laco": "Conversa com os 'clientes' — e desde a ruína, alguns RESPONDEM.",
        "poder": "Anota os recados dos mortos e entrega às famílias. Sem cobrar. Sem explicar.",
    },
    # ============== PROSPERINA (pré-produção: região da ilha) ==============
    "prosperina": {
        "nome": "Prosperina, a Ilha-Celeiro",
        "origem": "Grande ilha fundada PELOS MAGOS antes da queda (a Torre da Alvorada veio primeiro); quando Valdarkram caiu, os Prosperi trouxeram os refugiados para um lar que já existia.",
        "laco": "Aliada do Ermo: o celeiro ALIMENTA o continente — cada pão do Ermo tem trigo que cruzou o mar.",
        "poder": "Primeira região acessada por BARCO (o Zé do Remo faz a travessia; um porto oficial nasce na Costa).",
    },
    "prosperi": {
        "nome": "A Família Prosperi",
        "origem": "A família mais nobre de Valdarkram: fugiu NA noite da queda com a frota, salvando CENTENAS (heróis do êxodo).",
        "laco": "Ungidos no Templo Estrelado como protetores da ilha; a ilha inteira herdou o nome deles.",
        "poder": "O Farol da Prosperidade: a sede-fortaleza na margem extrema de Prospera, cuja pira guia os navios.",
    },
    "ordem_alvorada": {
        "nome": "A Ordem da Torre da Alvorada",
        "origem": "Os primeiros conhecedores da magia NÃO-DIVINA: provaram que o arcano não precisa dos deuses.",
        "laco": "Colaboram de igual pra igual com a religião sem segui-la; reconhecem os Doze sem depender deles.",
        "poder": "Órfãos espirituais por escolha: buscam algo para se sentirem ACOLHIDOS. (Varth teve a mesma fome — e a respondeu nas trevas.) Nome oficial: O CONCLAVE DA AURORA — e sua magia NASCEU da luz do Âmbar de Valdris.",
    },
    "templo_estrelado": {
        "nome": "O Templo Estrelado dos Doze",
        "origem": "12 torres finas em círculo, uma por deus, ligadas por pontes; cada torre com seu vitral — sobre o mármore negro, a luz pinta o chão com a cor de cada deus.",
        "laco": "Ali os Prosperi foram ungidos, ali os refugiados fizeram o JURAMENTO de nunca esquecer Valdarkram.",
        "poder": "Palco do ÚLTIMO milagre público dos Doze.",
    },
    "corvario_prosperina": {
        "nome": "O Corvário do Templo",
        "origem": "Os corvos mensageiros da ilha são FILHOS DO CORVO DEUS.",
        "laco": "O corvo do Salão das Classes é da mesma linhagem divina.",
        "poder": "Levam recados por onde asa nenhuma comum alcança.",
    },
    "vilalbina": {
        "nome": "Vilalbina",
        "origem": "A vila portuária toda CAIADA DE BRANCO — a primeira visão de quem chega de barco.",
        "laco": "Lar da família Albina, vassalos dos Prosperi.",
        "poder": "Tradição sagrada: TODO forasteiro é recebido com festa.",
    },
    "dante_prosperi": {
        "nome": "Lorde Prosperi Dante",
        "origem": "Gêmeo governante: o guardião do Farol da Prosperidade — e O MAGO MAIS FORTE da era.",
        "laco": "Diana manda na ilha; ele aceita — o dever é MAIOR que política. O segredo do Âmbar é da FAMÍLIA: a dinastia É a linhagem dos guardiões. E Dante SABE quem Valdris é — e TEME o dia em que ele atravessar.",
        "poder": "O ESCOLHIDO DA LUZ: o Âmbar o ACEITA (só ele toca a pira sem cegar); SENTINELA ETERNO (não dorme desde que assumiu — nem precisa); A CHAMA RESPONDE (comanda a luz do farol como arma). Guarda O SEGREDO: a pira é a luz do ÂMBAR DE VALDRIS — origem da magia arcana dos Ermos, com a pessoa amada de Valdris ainda dentro.",
    },
    "diana_prosperi": {
        "nome": "Lady da Alvorada Diana",
        "origem": "Gêmea governante: a mão que rege Prospera (o título a liga ao Conclave da Aurora).",
        "laco": "O irmão guarda o farol; ela guarda a ILHA. Nunca precisou de coroa pra mandar.",
        "poder": "O OLHAR QUE PESA: uma olhada dela encerra discussões (herança da avó Suprema, pulando gerações).",
    },
    "marth_prosperi": {
        "nome": "Rei Avô Marth",
        "origem": "Pai dos gêmeos, filho da Suprema; rei emérito. Foi o PRIMEIRO GUARDIÃO DO ÂMBAR — ainda criança.",
        "laco": "Casado com Valesca; irmão de CORDELIA (a outra filha de Fiona).",
        "poder": "A PALAVRA FÉRTIL: onde ele pisa e ordena, a terra produz — o milagre do trigo passou pro sangue.",
    },
    "valesca_prosperi": {
        "nome": "Rainha Avó Valesca",
        "origem": "Mãe dos gêmeos; rainha emérita de Prosperina.",
        "laco": "A aliança com o Ermo nunca rachou — e agora sabemos por quê.",
        "poder": "A DIPLOMATA ENCANTADA: ninguém consegue MENTIR na presença dela.",
    },
    "fiona_suprema": {
        "nome": "Rainha Mãe Fiona, a SUPREMA",
        "origem": "A bruxa mais forte de TODOS OS TEMPOS; matriarca da dinastia (mãe de Marth e Cordelia). Vaidosa, implacável, gloriosa — a Suprema em cada gesto.",
        "laco": "O Olhar que Pesa da neta Diana é herança direta dela.",
        "poder": "Imensurável. Paradeiro: NINGUÉM SABE — sumiu numa noite sem lua. Pode reaparecer em qualquer era.",
    },
    "cordelia_prosperi": {
        "nome": "Cordelia",
        "origem": "Irmã de Marth, filha da Suprema; tia dos gêmeos. ROMPEU com a família.",
        "laco": "Vive escondida sob o nome ROBERTINA. (Onde 'Robertina' vive... é a próxima pista.)",
        "poder": "Herdeira do sangue de Fiona. (E se a tradição das Supremas se cumprir... a próxima pode ser ela.)",
    },
    "rainha_cinzenta": {
        "nome": "A Rainha Cinzenta",
        "origem": "Capitã lendária dos piratas do mar cinzento: descendentes dos marujos de Valdarkram que NÃO couberam na frota dos Prosperi.",
        "laco": "O ressentimento dos esquecidos da noite da queda tem bandeira, armada e nome.",
        "poder": "Assola a costa de Prosperina — a culpa dos heróis voltou pelo mar.",
    },
    "rainha_cinzenta_v2": {
        "nome": "A Rainha Cinzenta (cânone completo)",
        "origem": "Uma ANCIÃ: ela ESTAVA no cais na noite da queda — e foi DEIXADA.",
        "laco": "O Zé do Remo TENTOU voltar por ela naquela noite; o remo não venceu a maré. Ela VIU. Por isso o barco dele é o único que os piratas não tocam.",
        "poder": "Quer SAQUEAR até quebrar a ilha: vingança pura, de quem viveu. Sem redenção barata.",
    },
    "travessia": {
        "nome": "A Travessia do Mar Cinzento",
        "origem": "DOIS barcos: o do Zé do Remo (intocável pelos piratas) exige uma CADEIA DE MISSÕES e A JUBA DO LEÃO — derrote o Marajá para cruzar pela primeira vez.",
        "laco": "Só depois da primeira rota com o Zé, o barco oficial do porto novo libera.",
        "poder": "O barco oficial tem chance de ATAQUE PIRATA em cada travessia.",
    },
    "heron": {
        "nome": "Arquimago Heron, o Que Ficou",
        "origem": "Líder do Conclave da Aurora; foi COLEGA de Varth — e nunca superou. O único vivo que conheceu o homem antes do Lich Rei.",
        "laco": "Guarda a vaga do Cronista ABERTA em segredo. Descobriu a infiltração da Marion anos depois — e ADMIROU (nunca a denunciou).",
        "poder": "A memória do que Varth ERA — e o peso de não ter visto o que ele viraria.",
    },
    "baltazar_albina": {
        "nome": "Dom Baltazar Albina",
        "origem": "Patriarca de Vilalbina, vassalo dos Prosperi.",
        "laco": "Anfitrião da tradição sagrada: TODO forasteiro desembarca em festa.",
        "poder": "Conhece cada barco pelo CASCO — antes da bandeira aparecer.",
    },
    "arcebispo_rei": {
        "nome": "O Arcebispo Rei Celestino",
        "origem": "Governa os 12 Sumo-Sacerdotes do Templo Estrelado (um por torre, um por deus).",
        "laco": "A voz unificada de um coro de doze fés.",
        "poder": "A hierarquia inteira dos Doze em Prosperina responde a ele.",
    },
    "valdris": {
        "nome": "Valdris",
        "origem": "É O Valdris de Faerûn: a Spellplague (1385 DR, a morte de Mystra) o arrancou de lá — e VARGO o achou caindo entre mundos.",
        "laco": "O cristal âmbar no peito: a pessoa amada AINDA está lá dentro.",
        "poder": "Cada nível recuperado é uma MEMÓRIA recuperada; o Salão das Classes foi ELE que construiu; sabe magias de outro mundo que aqui não existem.",
    },

    # ============ PERSONALIDADES DE PROSPERINA (rodada de julho/2026) ============
    "persona_ze_remo": {
        "nome": 'Zé do Remo',
        "temperamento": 'Zombeteiro filósofo do cais.',
        "sonho": 'Morrer remando, nunca na cama.',
        "hobby": 'Aposta corridas de caranguejo no cais.',
    },
    "persona_rosa_albina": {
        "nome": 'Rosa Albina',
        "temperamento": 'Explosiva e generosa.',
        "sonho": 'Fazer a melhor taverna DO MUNDO — melhor que a do Jorge.',
        "hobby": 'Canta desafinado limpando canecas.',
    },
    "persona_tiao_iscas": {
        "nome": 'Tião das Iscas',
        "temperamento": 'Tagarela de meias-verdades.',
        "sonho": 'Que o neto assuma a banca.',
        "hobby": 'Cochila de olho aberto na cadeira.',
    },
    "persona_otto": {
        "nome": 'Mercador Otto',
        "temperamento": 'Pomposo mas honesto.',
        "sonho": 'Abrir filial no continente.',
        "hobby": 'Pesa moedas por hobby: desconfia de todas.',
    },
    "persona_baltazar": {
        "nome": 'Dom Baltazar',
        "temperamento": 'Vovô bonachão de todos.',
        "sonho": 'Ver a sobrinha Rosa feliz (e casada; ela não sabe).',
        "hobby": 'Joga damas sozinho no cais.',
    },
    "persona_heron": {
        "nome": 'Arquimago Heron',
        "temperamento": 'Melancólico sereno.',
        "sonho": 'Que o Cronista volte: a cadeira segue aberta.',
        "hobby": 'Rega uma flor de Valdarkram no topo da torre.',
    },
    "persona_marth": {
        "nome": 'Rei Avô Marth',
        "temperamento": 'Sábio cansado e sorridente.',
        "sonho": 'Reencontrar a mãe Fiona — ou o túmulo dela.',
        "hobby": 'Conversa com o trigo como se fosse gente.',
    },
    "persona_valesca": {
        "nome": 'Rainha Avó Valesca',
        "temperamento": 'Matriarca doce e implacável; diplomata entediada.',
        "sonho": 'Proteger a família de QUALQUER coisa; uma última grande negociação.',
        "hobby": 'Chá das cinco inegociável; escreve cartas que nunca envia (pra Cordelia).',
    },
    "persona_celestino": {
        "nome": 'Arcebispo Rei Celestino',
        "temperamento": 'Fervor gentil, voz de trovão; político de batina com fé sincera.',
        "sonho": 'Os Doze reconhecidos no mundo todo; manter a paz entre os 12 cultos.',
        "hobby": "Vitrais em miniatura; vinhos 'litúrgicos'.",
    },
    "persona_dante": {
        "nome": 'Lorde Dante',
        "temperamento": 'Sentinela obcecado e insone; estoico de culpa antiga; aterrorizado por dentro.',
        "sonho": 'NÃO deixar Valdris cruzar; um dia DESCANSAR; decifrar O QUE fala de dentro do Âmbar.',
        "hobby": "Treina contra a própria sombra; diário pro pai; violão baixinho pro farol 'dormir'.",
    },
    "persona_diana": {
        "nome": 'Lady Diana',
        "temperamento": 'Regente perfeccionista e carismática; Olhar que Pesa; mãe da cidade, dura e amada.',
        "sonho": 'Prospera brilhando mais que Valdarkram; suceder SEM guerra de corte; ver Dante livre do farol.',
        "hobby": 'Doce novo por semana (anônima); cavalga ao amanhecer; rosas impossíveis.',
    },
    "persona_sumo_aurelian": {
        "nome": 'Sumo Aurelian (Pofnir)',
        "temperamento": 'Ansioso cósmico; sereno que dorme mal; vigilante gentil e metódico.',
        "sonho": 'Prever TODAS as ameaças; UMA visão direta de Pofnir; proteger as crianças da ilha.',
        "hobby": 'Alimenta gatos brancos (nunca se sabe); penas brancas; vela por nascimento.',
    },
    "persona_suma_morwen": {
        "nome": 'Suma Morwen (Vargo)',
        "temperamento": 'Fria e maternal ao mesmo tempo.',
        "sonho": "Preparar a ilha pra 'Grande Passagem' que ela SONHOU.",
        "hobby": 'Acende velas nos túmulos sem nome.',
    },
    "persona_sumo_tenaz": {
        "nome": 'Sumo Tenaz (Martur)',
        "temperamento": 'Lento de dar raiva, certeiro de dar medo.',
        "sonho": 'Terminar o relógio de água de 100 anos (faltam 40).',
        "hobby": 'Xadrez por carta: um lance por mês.',
    },
    "persona_suma_iara": {
        "nome": 'Suma Iara (Facalan)',
        "temperamento": 'Caçadora aposentada de olhar vivo.',
        "sonho": 'Um último rastro digno antes do fim.',
        "hobby": 'Ensina crianças a ler pegadas.',
    },
    "persona_sumo_vermeer": {
        "nome": 'Sumo Vermeer (Drazun)',
        "temperamento": 'Orgulhoso protetor dos draconatos.',
        "sonho": 'Provar que ambição é VIRTUDE.',
        "hobby": 'Cria salamandras num terrário.',
    },
    "persona_sumo_brakk": {
        "nome": 'Sumo Brakk (Korgath)',
        "temperamento": 'Ex-general de riso fácil.',
        "sonho": 'Que a ilha NUNCA precise dele.',
        "hobby": 'Luta braço com qualquer um que topar.',
    },
    "persona_suma_pluma": {
        "nome": 'Suma Pluma (Corvo)',
        "temperamento": 'Fofoqueira sagrada: é LITURGIA.',
        "sonho": 'Saber TUDO de TODOS antes de todos.',
        "hobby": 'Treina corvos pra trazer recados.',
    },
    "persona_suma_clara": {
        "nome": 'Suma Clara (Valiria)',
        "temperamento": 'Luminosa incansável; doce de aço (ex-paladina); maternal com todos, até os maus.',
        "sonho": 'Curar todo doente que pisar na ilha; reacender a fé perdida; um hospital aberto até a inimigos.',
        "hobby": 'Recebe a aurora antes do sol; canta pras ervas; pão de madrugada pros pobres.',
    },
    "persona_suma_selene": {
        "nome": 'Suma Selene (Nherith)',
        "temperamento": 'Sonâmbula lúcida de olheiras eternas; mistério ambulante.',
        "sonho": 'Mapear os sonhos da ilha; sonhar o sonho de Nherith; interpretar a Grande Passagem da Morwen.',
        "hobby": 'Borda constelações inexistentes; harpa pra lua cheia; mariposas prateadas.',
    },
    "persona_sumo_gozo": {
        "nome": 'Sumo Gozo (José)',
        "temperamento": 'Hedonista disciplinado (parece contradição, não é).',
        "sonho": 'Ensinar a ilha a celebrar SEM culpa.',
        "hobby": 'Dança com os gatos do cabaré, em espírito.',
    },
    "persona_sumo_ferro": {
        "nome": 'Sumo Ferro (Bragor)',
        "temperamento": 'Rude de mãos sagradas.',
        "sonho": 'Forjar com o PRÓPRIO Bragor uma noite.',
        "hobby": "Adota ferramentas velhas 'aposentadas'.",
    },
    "persona_suma_sorte": {
        "nome": 'Suma Sorte (Nharé)',
        "temperamento": 'Ex-fugitiva de passado nebuloso; sortuda constrangedora; otimista incorrigível.',
        "sonho": 'PERDER uma aposta na vida; dar a segunda chance que ela recebeu; provar que Nharé ama a ilha.',
        "hobby": 'Solta lebres de armadilhas; moeda pro cardápio; portas destrancadas por princípio.',
    },

}


def get(cid):
    return CANON.get(cid)
