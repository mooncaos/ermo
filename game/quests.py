# ===========================================================================
#  MISSÕES DO ERMO: NPCs com histórias e relíquias exclusivas de recompensa.
#  steps  = objetivos rastreados por eventos (kill / gather / equip / visit)
#  collect = itens conferidos e CONSUMIDOS na entrega (fale com o NPC)
# ===========================================================================

QUESTS = {
    "chamado_valdris": {
        "npc": "npc:valdris", "name": "O Chamado do Feiticeiro", "auto": True,
        "story": "Uma voz atravessa sua mente como vento morno: 'Recém-chegado... sinto uma fagulha em você. Prove que ela é real: arme-se, cace, colha o que a terra dá. Depois me encontre: eu vago por estas terras. — Valdris'",
        "steps": [
            {"type": "equip",  "count": 1, "text": "Equipe uma arma ou peça de equipamento (Ficha ▸ Mochila)"},
            {"type": "kill",   "target": "any", "count": 1, "text": "Derrote 1 criatura (Tab mira, o golpe sai sozinho)"},
            {"type": "gather", "count": 1, "text": "Colete 1 recurso num ponto de coleta (chegue colado e aperte E)"},
        ],
        "collect": {},
        "reward": {"bronze": 300, "xp": 150, "item": ("fagulha_de_valdris", 1)},
        "done_text": "Então a fagulha era real. Tome: um estilhaço do meu velho âmbar. Que ele te lembre que todo poder já foi, um dia, apenas um começo.",
    },
    "balaio_maricota": {
        "npc": "npc:maricota", "name": "O Balaio Vazio",
        "story": "\"Meu balaio tá mais vazio que promessa de vereador, meu filho! O píer tá ali, cheio de peixe. Me traz 5 Peixes Frescos que eu te pago com uma coisa que vale mais que dinheiro.\"",
        "steps": [], "collect": {"peixe_fresco": 5},
        "reward": {"bronze": 250, "xp": 120, "item": ("colar_de_buzios", 1)},
        "done_text": "\"Olha o tamanho desses peixe! Toma: esse colar eu fiz cantando pro mar. Ele protege, pode confiar na velha aqui.\"",
    },
    "ferro_bragan": {
        "npc": "npc:mestre_bragan", "name": "Ferro no Sangue",
        "story": "\"Quer aprender de verdade? Então suja a mão. Minério tem nos veios do mundo; funde 3 Barras de Ferro na minha forja e me traz. Aí conversamos de ferreiro pra ferreiro.\"",
        "steps": [], "collect": {"barra_de_ferro": 3},
        "reward": {"bronze": 200, "xp": 150, "item": ("martelo_do_bragan", 1)},
        "done_text": "\"Barra honesta, sem bolha. Toma o martelo com que EU aprendi. Cuida dele melhor do que eu cuidei.\"",
    },
    "cacada_bartolo": {
        "npc": "npc:mestre_bartolo", "name": "O Banquete Precisa de Caça",
        "story": "\"Panela vazia é ofensa pessoal! Me arruma 6 Carnes de Caça fresquinhas que eu te ensino um segredo que nem a Maricota conhece.\"",
        "steps": [], "collect": {"carne_caca": 6},
        "reward": {"bronze": 300, "xp": 100, "item": ("tempero_secreto_bartolo", 3)},
        "done_text": "\"AGORA sim tem banquete! Toma três pitadas do meu tempero. E não tem presa vampírica nele não. Juro.\"",
    },
    "chama_solene": {
        "npc": "npc:irma_solene", "name": "A Chama dos Doze",
        "story": "\"Os braseiros do templo pedem luz verdadeira. Traga-me 3 Essências Solares destiladas e os Doze saberão do seu nome, viajante.\"",
        "steps": [], "collect": {"essencia_solar": 3},
        "reward": {"bronze": 200, "xp": 140, "item": ("broche_da_alvorada", 1)},
        "done_text": "\"A chama aceitou. Este broche foi abençoado diante do altar: que a alvorada caminhe com você.\"",
    },
    "brilho_petra": {
        "npc": "npc:mestra_petra", "name": "Brilho Bruto",
        "story": "\"Toda gema bruta sonha, sabia? Me traga UMA gema bruta dos veios e eu pago o que ela vale de verdade, não o que o mercado acha.\"",
        "steps": [], "collect": {"gema_bruta": 1},
        "reward": {"bronze": 800, "xp": 200},
        "done_text": "\"Ahh... essa aqui sonha alto. Toma teu bronze, e volta quando achar outra: eu acordo todas.\"",
    },
    "matilha_lazaro": {
        "npc": "npc:lazaro", "name": "A Matilha do Morro",
        "story": "\"Ô estrangeiro! Os lobo desceram o morro e tão rondando Sapopemba de noite. Derruba 6 Lobos pra mim que eu te dou uma lembrança afiada.\"",
        "steps": [{"type": "kill", "target": "lobo", "count": 6, "text": "Derrote 6 Lobos"}],
        "collect": {},
        "reward": {"bronze": 250, "xp": 180, "item": ("faca_do_lazaro", 1)},
        "done_text": "\"Seis lobo! Tá ouvindo o silêncio? Toma meu facão: limpou muito matagal, agora limpa teus problema.\"",
    },
    "vozes_chica": {
        "npc": "npc:chica", "name": "As Vozes da Dona Chica",
        "story": "\"Psiu! Os javali... eles tão CONSPIRANDO. Ouvi tudo ontem, tavam falando em francês! Derruba 8 deles antes que tomem a prefeitura!\"",
        "steps": [{"type": "kill", "target": "javali", "count": 8, "text": "Derrote 8 Javalis (conspiradores, segundo a Chica)"}],
        "collect": {},
        "reward": {"bronze": 350, "xp": 220},
        "done_text": "\"Oito! OITO! A república tá salva... por enquanto. Fica com esse trocado e o olho aberto, mocinho.\"",
    },
    "noticias_cronista": {
        "npc": "npc:cronista", "name": "Notícias da Noite",
        "story": "\"O Memorial precisa de olhos, viajante. Dizem que Véspera respira de novo. VÁ até lá, pise nas pedras da cidade dos vampiros, e volte pra me contar o que viu.\"",
        "steps": [{"type": "visit", "target": "vespera", "count": 1, "text": "Visite Véspera, a cidade dos vampiros"}],
        "collect": {},
        "reward": {"xp": 300, "bronze": 150, "item": ("luneta_do_cronista", 1)},
        "done_text": "\"Seus olhos viram... e agora a História sabe. Tome a minha luneta: quem enxerga longe, erra pouco.\"",
    },
}


def get(qid):
    return QUESTS.get(qid)


def for_npc(npc_id):
    return [(qid, q) for qid, q in QUESTS.items() if q.get("npc") == npc_id]
