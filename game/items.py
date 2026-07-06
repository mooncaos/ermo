"""
OS ITENS — catalogo do que existe no mundo.

Fonte unica da verdade sobre cada item: nome, tipo, se empilha, e a cor que
o cliente usa pra desenhar. Adicionar item novo e somar UMA entrada em ITEMS.

Tambem mora aqui:
  - GROUND_SPAWNS: o que fica largado no chao pra pegar (e em quanto tempo
    reaparece depois de pego, pra dar pra testar a vontade).
  - starting_inventory(): o gancho pros itens iniciais. Por enquanto devolve
    mochila vazia; quando voce quiser dar itens de largada, e so preencher.
  - operacoes sobre uma "bag" (lista de pilhas {item, qty}).
"""

ITEMS = {
    "coin_bronze":  {"name": "Moeda de Bronze", "kind": "currency", "stackable": True,  "color": "#cd7f32", "value": 1},
    "coin_silver":  {"name": "Moeda de Prata",  "kind": "currency", "stackable": True,  "color": "#cbd2d9", "value": 100},
    "coin_gold":    {"name": "Moeda de Ouro",   "kind": "currency", "stackable": True,  "color": "#f4b860", "value": 10000},
    "pocao_vida":   {"name": "Poção de Vida",   "kind": "consumivel", "stackable": True, "color": "#d6314a", "visual": "potion", "heal": 1.0, "value": 400},
    "staff_portuz": {"name": "Cajado do Portuz", "kind": "weapon",   "stackable": False, "color": "#9b6dff",
                     "slot": "hand", "visual": "staff", "rarity": "raro", "dmg": {"n": 1, "d": 6}, "atk": 1},
    "cajado_magico": {"name": "Cajado Mágico", "kind": "weapon", "stackable": False, "color": "#7ad6ff",
                      "slot": "hand", "visual": "staff_magic", "rarity": "lendario",
                      "dmg": {"n": 1, "d": 10}, "atk": 3, "armor": 2, "value": 2000},

    # --- equipamento inicial (o kit simples da Robetina, assistente social) ---
    "touca_la":         {"name": "Touca de Lã",      "kind": "armor",   "stackable": False, "color": "#8a7d63", "slot": "head",     "visual": "helmet",   "rarity": "comum", "ac": 0, "value": 4},
    "camiseta_surrada": {"name": "Camiseta Surrada", "kind": "armor",   "stackable": False, "color": "#b6532f", "slot": "chest",    "visual": "shirt",    "rarity": "comum", "armor": 1, "value": 6},
    "ombreira_couro":   {"name": "Ombreira de Couro","kind": "armor",   "stackable": False, "color": "#6e573e", "slot": "shoulder", "visual": "pauldron", "rarity": "comum", "ac": 0, "value": 5},
    "capa_puida":       {"name": "Capa Puída",       "kind": "armor",   "stackable": False, "color": "#5a5a6a", "slot": "back",     "visual": "cloak",    "rarity": "comum", "ac": 0, "value": 5},
    "calca_jeans":      {"name": "Calça Jeans",      "kind": "armor",   "stackable": False, "color": "#3a5a86", "slot": "legs",     "visual": "pants",    "rarity": "comum", "armor": 1, "value": 6},
    "chinelo":          {"name": "Chinelo de Dedo",  "kind": "armor",   "stackable": False, "color": "#3a8a6a", "slot": "feet",     "visual": "sandal",   "rarity": "comum", "ac": 0, "value": 3},
    "faca_cozinha":     {"name": "Faca de Cozinha",  "kind": "weapon",  "stackable": False, "color": "#cbd2d9", "slot": "hand_r",   "visual": "knife",    "rarity": "comum", "dmg": {"n": 1, "d": 4}, "value": 6},
    "tampa_panela":     {"name": "Tampa de Panela",  "kind": "armor",   "stackable": False, "color": "#9aa0aa", "slot": "hand_l",   "visual": "lid",      "rarity": "comum", "block": 1, "value": 5},
    "anel_lata":        {"name": "Anel de Lata",     "kind": "trinket", "stackable": False, "color": "#b9b2a0", "slot": "ring",     "visual": "ring",     "rarity": "comum", "atk": 0, "value": 4},
    "anel_varth":       {"name": "Anel do Lorde Varth", "kind": "trinket", "stackable": False, "color": "#7a4ad0", "slot": "ring", "visual": "ring", "rarity": "lendario", "armor": 10, "atk": 4, "value": 2000, "desc": "O selo de Lorde Varth, pulsando com energia necromântica. Mitiga até 10 de dano por golpe e +4 para acertar, o melhor anel que existe."},
    "moeda_avhur":      {"name": "Moeda de Avhur", "kind": "trofeu", "stackable": True, "color": "#d8b24a", "value": 500, "sell_value": 500, "rarity": "raro", "desc": "Moeda antiga cunhada nas profundezas da Mina de Avhur. Os mercadores pagam 500 de bronze por ela. Dizem que ainda guarda outro proposito."},
    "mascara_faraonica":{"name": "Máscara Faraônica", "kind": "tesouro", "stackable": False, "color": "#f4d06a", "slot": "head", "visual": "helmet", "rarity": "lendario", "armor": 14, "atk": 3, "value": 4000, "desc": "A máscara funerária de ouro do Faraó de Avhur, fria e pesada nas mãos. Mitiga até 14 de dano por golpe e +3 para acertar, o melhor elmo que existe (mais que o dobro de qualquer peça de cabeça do Goblin). Os mortos ainda obedecem a quem a porta."},
    "fagulha_divindade":{"name": "Fagulha de Divindade", "kind": "tesouro", "stackable": True, "color": "#ffffff", "rarity": "divino", "value": 30000, "sell_value": 30000, "desc": "Um fragmento puro de poder divino arrancado de Avhur, o Maldito. Pulsa com todas as cores que existem e algumas que não deviam existir. Dizem que os deuses do Ermo trocariam quase tudo por uma destas. Por ora, vale 30.000 de bronze pra quem não tem coragem de guardá-la."},
    "bola_la_pofnir":   {"name": "Bola de Lã do Pofnir", "kind": "tesouro", "stackable": False, "color": "#f7d6ff", "slot": "neck", "visual": "divine_orb", "rarity": "divino", "ac": 0, "value": 30000, "sell_value": 0, "desc": "Uma bola de lã que o próprio Pofnir amassou com as patas, encharcada do mesmo brilho multicolorido da Fagulha de Divindade. Pulsa com todas as cores e ronrona baixinho quando ninguém está olhando. Não faz nada (ainda), mas é a prova de que o gato branco te aceitou. Não tem preço, e por isso não se vende."},
    "pocao_divina":     {"name": "Poção Divina", "kind": "consumivel", "stackable": True, "color": "#f7d6ff", "visual": "potion", "rarity": "divino", "heal": 100, "double_next": True, "value": 0, "sell_value": 0, "desc": "Um néctar multicolorido que um deus destilou da própria Fagulha que você ofereceu. Restaura 100 de vida na hora e faz o seu PRÓXIMO golpe valer pelo dobro. Brilha com cores que não deviam existir. Vale mais que ouro, e por isso nenhum mercador ousa comprá-la."},
    "botas_vargo":      {"name": "Botas de Vargo", "kind": "armor", "stackable": False, "color": "#7a1414", "slot": "feet", "visual": "divine_boot", "rarity": "maldito", "armor": 6, "speed": 2, "atk": 6, "dmg_flat": 16, "smoke": True, "value": 0, "sell_value": 0, "desc": "As botas que Vargo, o primeiro lich, calçou ao renunciar à própria carne. A luz multicolorida apagou: hoje pulsam num vermelho-sangue escuro, encharcadas de necromancia, exalando uma fumaça preta que nunca se dissipa. Cada passo é um golpe: +6 para acertar e +16 de dano em TODO ataque, e leves como uma sombra. Quem as calça espalha morte sem parar."},
    "anel_atalech":     {"name": "O Chamado de Atalech", "kind": "trinket", "stackable": False, "color": "#b81d1d", "slot": "ring", "visual": "ring", "rarity": "maldito", "armor": -60, "ward": -60, "dodge": -0.6, "mres": -0.6, "ac": -20, "dmg_mult": 1.0, "value": 3000, "sell_value": 1500, "desc": "Um aro de ferro rubro que pulsa com a fome do bosque de Atalech. Ele DOBRA todo o seu dano (+100%), mas em troca dilacera as suas defesas: -50 em todas as resistências de vida. O portador vira uma lâmina de vidro: atroz no ataque, frágil como um graveto. Para quem quer matar antes de morrer."},
    "simbolo_varth":{"name": "Símbolo de Varth", "kind": "tesouro", "stackable": True, "color": "#7a4ad0", "rarity": "epico", "value": 2500, "sell_value": 2500, "desc": "Um sigilo de osso e obsidiana gravado com a marca de Lorde Varth, ainda quente de necromancia. Os comerciantes pagam 2.500 de bronze por um troféu desses arrancado da Torre do Lorde Necrótico."},
    "correntes_colosso":{"name": "Correntes do Colosso", "kind": "tesouro", "stackable": False, "color": "#9a8a6a", "slot": "neck", "visual": "amulet", "rarity": "lendario", "armor": 14, "atk": 3, "value": 4000, "desc": "As correntes de pedra e bronze que prendiam o Colosso de Avasham, pesadas como a própria montanha. Mitigam até 14 de dano por golpe e +3 para acertar, o melhor colar que existe."},
    "pelo_chacal_avhur":{"name": "Pelo de Chacal de Avhur", "kind": "trofeu", "stackable": True, "color": "#2e2820", "value": 500, "animal": True, "couraria_only": True, "rarity": "raro", "desc": "A pelagem negra e densa de um chacal de Avhur, impregnada da poeira da tumba. So o coureiro Valdir sabe o que vale: 1000 de bronze por peca."},
    "cordao_fake":      {"name": "Cordão Banhado",   "kind": "trinket", "stackable": False, "color": "#d9c27a", "slot": "neck",     "visual": "amulet",   "rarity": "comum", "ac": 0, "value": 5},

    # --- trofeus de caca (bichos do Descampado) ---
    "rabo_rato":     {"name": "Rabo de Rato",     "kind": "trofeu", "stackable": True, "color": "#8a857d", "value": 2, "animal": True},
    "presa_lobo":    {"name": "Presa de Lobo",    "kind": "trofeu", "stackable": True, "color": "#e8e2d0", "value": 6, "animal": True},
    "pelego_lobo":   {"name": "Pele de Lobo",     "kind": "trofeu", "stackable": True, "color": "#7a7d86", "value": 9, "animal": True},
    "presa_javali":  {"name": "Presa de Javali",  "kind": "trofeu", "stackable": True, "color": "#efe6cf", "value": 6, "animal": True},
    "couro_javali":  {"name": "Couro de Javali",  "kind": "trofeu", "stackable": True, "color": "#6e573e", "value": 8, "animal": True},
    # --- espolio dos capangas ---
    "bornal_cria":   {"name": "Bornal da Cria",   "kind": "trofeu", "stackable": True, "color": "#6b5a3a", "value": 5},
    "marreta_velha": {"name": "Marreta Enferrujada", "kind": "trofeu", "stackable": True, "color": "#6b6256", "value": 14},
    # --- drops unicos de chefe ---
    "correntao_ouro":  {"name": "Correntão de Ouro",    "kind": "tesouro", "stackable": False, "color": "#f4d06a", "value": 250,
                        "slot": "neck", "visual": "chain", "rarity": "raro", "armor": 1, "atk": 1},
    "microfone_patrao":{"name": "Microfone do Patrão",  "kind": "tesouro", "stackable": True, "color": "#c9c2cc", "value": 120, "protect": 15},
    "presa_velho_bob": {"name": "Dente Quebrado do Velho Bob", "kind": "tesouro", "stackable": True, "color": "#d9cba0", "value": 180, "protect": 10},
    "couro_velho_bob": {"name": "Couro do Velho Bob",   "kind": "tesouro", "stackable": True,  "color": "#5a5048", "value": 20},

    # trofeus do Repouso da Dama (todos vendiveis na Armas Peteco)
    "couro_lobo_negro":    {"name": "Couro de Lobo Negro",   "kind": "trofeu", "stackable": True, "color": "#26242e", "value": 14, "animal": True},
    "pena_harpia":         {"name": "Pena de Harpia",        "kind": "trofeu", "stackable": True, "color": "#4a3d57", "value": 18},
    "dedo_bruxa":          {"name": "Dedo Mirrado de Bruxa", "kind": "trofeu", "stackable": True, "color": "#9bbf8a", "value": 24},
    "ectoplasma":          {"name": "Ectoplasma",            "kind": "trofeu", "stackable": True, "color": "#cdd8ff", "value": 20},
    "veu_assombracao":     {"name": "Véu de Assombração",    "kind": "trofeu", "stackable": True, "color": "#9fd8b0", "value": 24},
    "cinza_espectral":     {"name": "Cinza Espectral",       "kind": "trofeu", "stackable": True, "color": "#c9ccd6", "value": 28},
    "essencia_sombria":    {"name": "Essência Sombria",      "kind": "trofeu", "stackable": True, "color": "#1b1a26", "value": 32},
    "lamento_petrificado": {"name": "Lamento Petrificado",   "kind": "trofeu", "stackable": True, "color": "#c8a6e0", "value": 36},
    "lagrima_da_dama":     {"name": "Lágrima da Dama",       "kind": "tesouro", "stackable": True, "color": "#bcd0ff", "value": 500, "protect": 20},

    # trofeus do Deserto de Avasham (vendiveis na Armas Peteco)
    "presa_lacraia":       {"name": "Presa de Lacraia",      "kind": "trofeu", "stackable": True, "color": "#caa46a", "value": 40, "animal": True},
    "couro_hiena":         {"name": "Couro de Hiena",        "kind": "trofeu", "stackable": True, "color": "#b08d5a", "value": 44, "animal": True},
    "pena_abutre":         {"name": "Pena de Abutre",        "kind": "trofeu", "stackable": True, "color": "#6a5a4a", "value": 46, "animal": True},
    "veneno_naja":         {"name": "Veneno de Naja",        "kind": "trofeu", "stackable": True, "color": "#9bd06a", "value": 52},
    "ferrao_escorpiao":    {"name": "Ferrão de Escorpião",   "kind": "trofeu", "stackable": True, "color": "#caa05a", "value": 64},
    "placa_verme":         {"name": "Placa de Verme",        "kind": "trofeu", "stackable": True, "color": "#c08a5a", "value": 72},
    "nucleo_areia":        {"name": "Núcleo de Areia",       "kind": "trofeu", "stackable": True, "color": "#e8cf8a", "value": 82},
    "olho_basilisco":      {"name": "Olho de Basilisco",     "kind": "trofeu", "stackable": True, "color": "#d6b84a", "value": 120},

    # --- caça e couros da Floresta do Ermo ---
    "carne_caca":          {"name": "Carne de Caça", "kind": "consumivel", "stackable": True, "color": "#b5503a", "visual": "potion", "heal": 0.18, "value": 40, "desc": "Um naco de carne fresca de caça, assado no fogo. Restaura 18% da vida na hora. O sustento de quem vive nos ermos."},
    "pele_macia":          {"name": "Pele Macia",            "kind": "trofeu", "stackable": True, "color": "#cdbba2", "value": 12, "animal": True},
    "couro_selvagem":      {"name": "Couro Selvagem",        "kind": "trofeu", "stackable": True, "color": "#8a6a44", "value": 38, "animal": True},
    "galhada":             {"name": "Galhada de Cervo",      "kind": "trofeu", "stackable": True, "color": "#cdb98a", "value": 70, "animal": True},
    "couro_urso":          {"name": "Couro de Urso",         "kind": "trofeu", "stackable": True, "color": "#5a3f2a", "value": 160, "animal": True},
    "pelego_do_rei":       {"name": "Pelego do Rei do Planalto", "kind": "armor", "stackable": False, "color": "#6e4a2e", "slot": "back", "visual": "cloak", "rarity": "lendario", "armor": 12, "ward": 10, "speed": 1, "value": 4500, "desc": "O manto feito do couro do próprio Urso Rei, ainda quente de fúria. Pesado, imponente, coroado de garras. Mitiga até 12 de dano por golpe, soma 10 de barreira e dá um passo a mais de deslocamento. Quem o veste carrega o trono do planalto nas costas."},

    # --- Brasal e Goela de Krezath ---
    "seiva_flamejante":    {"name": "Seiva Flamejante", "kind": "consumivel", "stackable": True, "color": "#ff7a30", "visual": "potion", "heal": 0.35, "value": 120, "desc": "Resina incandescente colhida das árvores mortas do Brasal. Desce queimando e costura a carne por dentro: restaura 35% da vida. Arde. Funciona."},
    "escama_obsidiana":    {"name": "Escama de Obsidiana",  "kind": "trofeu", "stackable": True, "color": "#3a2a4a", "value": 120, "animal": True},
    "nucleo_magma":        {"name": "Núcleo de Magma",      "kind": "trofeu", "stackable": True, "color": "#ff6a30", "value": 200},
    "fragmento_forja":     {"name": "Fragmento de Forja",   "kind": "trofeu", "stackable": True, "color": "#c9885a", "value": 90},
    "coracao_brasa":       {"name": "Coração de Brasa",     "kind": "trofeu", "stackable": True, "color": "#ff4a20", "value": 350},
    "garra_krezath":       {"name": "Garra de Krezath",     "kind": "trofeu", "stackable": True, "color": "#8a2020", "value": 900, "animal": True, "desc": "Uma garra do Devorador Soterrado, ainda morna mil anos depois. Colecionadores matariam por ela. Você só precisou matar um dragão."},
    "martelo_do_guardiao": {"name": "Martelo do Guardião", "kind": "weapon", "stackable": False, "color": "#c9885a", "slot": "hand", "visual": "hammer", "rarity": "lendario", "dmg": {"n": 3, "d": 10, "flat": 8}, "atk": 6, "value": 5200, "desc": "O martelo de forja com que Vulkar selou a Goela por mil anos. A cabeça ainda guarda o calor do primeiro fogo. Cada golpe soa como uma porta se fechando."},
    "elmo_da_fornalha":    {"name": "Elmo da Fornalha", "kind": "armor", "stackable": False, "color": "#a85a30", "slot": "head", "visual": "helm", "rarity": "epico", "armor": 9, "ward": 6, "value": 3800, "desc": "O elmo de basalto do Guardião da Goela, com fendas que brilham como brasas quando o perigo chega. Quem o veste pensa frio até no meio do fogo."},
    "presa_do_devorador":  {"name": "Presa do Devorador", "kind": "weapon", "stackable": False, "color": "#e8e0d0", "slot": "hand", "visual": "sword", "rarity": "lendario", "dmg": {"n": 4, "d": 10, "flat": 10}, "atk": 8, "dmg_flat": 8, "value": 9000, "desc": "Uma presa de Krezath lapidada em lâmina. Corta como se o mundo devesse algo a ela: 4d10+10 de dano, +8 para acertar e +8 de dano fixo em todo golpe. A arma mais faminta dos ermos."},
    "coracao_de_krezath":  {"name": "Coração de Krezath", "kind": "trinket", "stackable": False, "color": "#ff3a20", "slot": "neck", "visual": "amulet", "rarity": "lendario", "spell_pow": 10, "ward": 12, "armor": 6, "value": 9000, "desc": "O coração do Devorador, cristalizado em rubi vivo. Ainda BATE. Cada pulso empurra poder pra quem o carrega: +10 de poder mágico, 12 de barreira e 6 de mitigação. Você sente ele julgando suas escolhas."},
    "manto_de_escamas":    {"name": "Manto de Escamas do Devorador", "kind": "armor", "stackable": False, "color": "#3a2a4a", "slot": "back", "visual": "cloak", "rarity": "lendario", "armor": 10, "ward": 12, "immune": ["burning", "chama_eterna"], "value": 8500, "desc": "Escamas de obsidiana do próprio Krezath, trançadas em manto. O fogo simplesmente desiste: imunidade total a queimadura e à Chama Eterna, 10 de mitigação e 12 de barreira. O dragão morreu, a proteção ficou."},
    "anel_da_fornalha":    {"name": "Anel da Fornalha", "kind": "trinket", "stackable": False, "color": "#ff8a40", "slot": "ring", "visual": "ring", "rarity": "epico", "atk": 5, "spell_pow": 6, "dmg_flat": 6, "value": 6000, "desc": "Um aro forjado no calor da Goela, quente ao toque pra sempre. Alimenta o braço e a mente: +5 para acertar, +6 de poder mágico e +6 de dano fixo por golpe."},

    # --- Costa de Maravai: comida de praia, tesouros do mar, artesanato caiçara ---
    "peixe_assado":        {"name": "Peixe Assado", "kind": "consumivel", "stackable": True, "color": "#d8a868", "visual": "potion", "heal": 0.22, "value": 80, "desc": "Peixe fresco na brasa, com sal grosso e limão. Cura 22% da vida e a saudade de casa."},
    "moqueca_capixaba":    {"name": "Moqueca da Vila", "kind": "consumivel", "stackable": True, "color": "#e07030", "visual": "potion", "heal": 0.45, "value": 260, "desc": "A panela de barro da Dona Maricota, com dendê, leite de coco e segredo de família. Restaura 45% da vida. Vale a viagem."},
    "caldo_de_sururu":     {"name": "Caldo de Sururu", "kind": "consumivel", "stackable": True, "color": "#c9885a", "visual": "potion", "heal": 0.30, "value": 150, "desc": "Quente, temperado e levanta defunto, como dizem na vila. Cura 30% da vida."},
    "agua_de_coco":        {"name": "Água de Coco", "kind": "consumivel", "stackable": True, "color": "#e8e0c0", "visual": "potion", "heal": 0.15, "value": 50, "desc": "Gelada, direto do coqueiro da praia. Cura 15% da vida e zera o mau humor."},
    "espetinho_camarao":   {"name": "Espetinho de Camarão", "kind": "consumivel", "stackable": True, "color": "#ff9a70", "visual": "potion", "heal": 0.25, "value": 110, "desc": "Camarão graúdo no espeto de bambu. Cura 25% da vida. Cuidado com as gaivotas."},
    "concha_rara":         {"name": "Concha Rara",      "kind": "trofeu", "stackable": True, "color": "#f0d8e8", "value": 60, "desc": "Uma concha de madrepérola que canta o mar quando encostada no ouvido. A Mestra Conchinha paga bem, mas prefere trocar."},
    "perola":              {"name": "Pérola",           "kind": "trofeu", "stackable": True, "color": "#f6f0f8", "value": 500, "desc": "Uma lágrima do mar, redonda e perfeita. Caranguejos velhos guardam essas por décadas."},
    "pluma_vistosa":       {"name": "Pluma Vistosa",    "kind": "trofeu", "stackable": True, "color": "#e8d8f0", "value": 35, "animal": True},
    "couro_rubro":         {"name": "Couro Rubro",      "kind": "trofeu", "stackable": True, "color": "#a84838", "value": 45, "animal": True},
    "couro_de_leao":       {"name": "Couro de Leão",    "kind": "trofeu", "stackable": True, "color": "#c9a05a", "value": 90, "animal": True},
    "chifre_de_bufalo":    {"name": "Chifre de Búfalo", "kind": "trofeu", "stackable": True, "color": "#6a5a48", "value": 70, "animal": True},
    "juba_maraja":         {"name": "Juba do Marajá",   "kind": "trofeu", "stackable": True, "color": "#f0ead8", "value": 700, "animal": True, "desc": "A juba alva do Leão Branco da savana. O coureiro Valdir choraria de emoção: paga 3500 de bronze por ela."},
    "manto_do_leao_branco": {"name": "Manto do Leão Branco", "kind": "armor", "stackable": False, "color": "#f0ead8", "slot": "back", "visual": "cloak", "rarity": "epico", "armor": 8, "ward": 8, "speed": 1, "value": 4200, "desc": "O manto costurado da pelagem alva do Marajá. Quem o veste anda como rei da savana: 8 de mitigação, 8 de barreira e um passo a mais."},
    # artesanato da Mestra Conchinha (troca: bronze + conchas raras)
    "colar_de_conchas":    {"name": "Colar de Conchas", "kind": "trinket", "stackable": False, "color": "#f0d8e8", "slot": "neck", "visual": "amulet", "rarity": "raro", "ward": 8, "mres": 0.08, "value": 2500, "desc": "Conchas de madrepérola trançadas em fio de rede. O mar protege quem o usa: 8 de barreira e 8% de resistência mágica."},
    "anel_de_perola":      {"name": "Anel de Pérola", "kind": "trinket", "stackable": False, "color": "#f6f0f8", "slot": "ring", "visual": "ring", "rarity": "raro", "spell_pow": 5, "ward": 6, "value": 3200, "desc": "Uma pérola perfeita cravada em prata de naufrágio. Sussurra marés pra quem conjura: +5 de poder mágico e 6 de barreira."},
    "tridente_do_caicara": {"name": "Tridente do Caiçara", "kind": "weapon", "stackable": False, "color": "#8a9aa8", "slot": "hand", "visual": "spear", "rarity": "raro", "dmg": {"n": 3, "d": 8, "flat": 6}, "atk": 5, "rng": 2, "value": 2800, "desc": "Forjado pra fisgar peixe grande, promovido a fisgar problema grande. 3d8+6 de dano, +5 para acertar e alcance de haste."},
    "chapeu_de_palha":     {"name": "Chapéu de Palha Encantado", "kind": "armor", "stackable": False, "color": "#d8c088", "slot": "head", "visual": "hat", "rarity": "raro", "armor": 5, "ward": 5, "speed": 1, "value": 2200, "desc": "Trançado com palha de coqueiro e uma bênção de maré mansa. 5 de mitigação, 5 de barreira e o passo leve de quem anda na areia."},

    # ================= RECURSOS DE COLETA (profissões) =================
    "minerio_ferro":    {"name": "Minério de Ferro",   "kind": "trofeu", "stackable": True, "color": "#8a8078", "value": 18, "desc": "Pedra pesada com veios avermelhados. O pão de cada dia do ferreiro."},
    "minerio_prata":    {"name": "Minério de Prata",   "kind": "trofeu", "stackable": True, "color": "#c9d0d8", "value": 45, "desc": "Brilha frio na mão. Ferreiros e joalheiros brigam por ele, e dizem que a prata morde criaturas da noite."},
    "minerio_umbrio":   {"name": "Minério Umbrío",     "kind": "trofeu", "stackable": True, "color": "#3a3a6a", "value": 120, "desc": "Um metal escuro que só cresce onde o sol nunca chegou. Frio como a Noite Eterna que o pariu."},
    "madeira_carvalho": {"name": "Madeira de Carvalho","kind": "trofeu", "stackable": True, "color": "#8a6a44", "value": 15, "desc": "Toras firmes de carvalho nobre. O carpinteiro transforma isso em arco, cajado e história."},
    "madeira_rubra":    {"name": "Madeira Rubra",      "kind": "trofeu", "stackable": True, "color": "#a84a30", "value": 40, "desc": "Madeira avermelhada da savana, densa e quente ao toque."},
    "madeira_umbria":   {"name": "Madeira Umbría",     "kind": "trofeu", "stackable": True, "color": "#2e3450", "value": 110, "desc": "Cortada das árvores da Noite Eterna. Escura, fria e estranhamente leve."},
    "erva_solar":       {"name": "Erva Solar",         "kind": "trofeu", "stackable": True, "color": "#e8c840", "value": 25, "desc": "Folhas douradas que guardam calor de sol. Base de todo tônico honesto."},
    "erva_lunar":       {"name": "Erva Lunar",         "kind": "trofeu", "stackable": True, "color": "#a0c0e8", "value": 60, "desc": "Só floresce no escuro absoluto. Os alquimistas pagam bem; os lobisomens dormem em cima."},
    "fibra_capim":      {"name": "Fibra de Capim",     "kind": "trofeu", "stackable": True, "color": "#c9b868", "value": 8, "desc": "Capim alto trançável. Costureiros fazem disso capa, corda e sustento."},
    "gema_bruta":       {"name": "Gema Bruta",         "kind": "trofeu", "stackable": True, "color": "#d060c0", "value": 300, "desc": "Uma pedra preciosa ainda sonhando em ser joia. A Mestra Petra sabe acordá-la."},
    "tecido_nobre":     {"name": "Tecido Nobre",       "kind": "trofeu", "stackable": True, "color": "#8a3050", "value": 220, "desc": "Veludo e seda dos salões de Véspera, ainda cheirando a sangue antigo. Costureiros disputam cada retalho."},
    "pelagem_lupina":   {"name": "Pelagem Lupina",     "kind": "trofeu", "stackable": True, "color": "#4a4055", "value": 260, "animal": True, "desc": "Pelo grosso de lobisomem, quente mesmo depois da morte. O coureiro Valdir paga 1300 de bronze e não pergunta como conseguiu."},
    "presa_vampirica":  {"name": "Presa Vampírica",    "kind": "trofeu", "stackable": True, "color": "#e8e0d8", "value": 350, "desc": "Uma presa fria que nunca amarela. Alquimistas moem, cozinheiros ousados temperam, joalheiros arrepiam."},

    # ================= PRODUTOS DAS PROFISSÕES =================
    # ferreiro
    "espada_de_ferro":   {"name": "Espada de Ferro",    "kind": "weapon", "stackable": False, "color": "#a8a8b0", "slot": "hand", "visual": "sword", "rarity": "comum",  "dmg": {"n": 2, "d": 8, "flat": 4}, "atk": 3, "value": 600, "desc": "Forjada com minério honesto e martelo firme. 2d8+4 de dano e +3 para acertar."},
    "armadura_de_ferro": {"name": "Armadura de Ferro",  "kind": "armor",  "stackable": False, "color": "#8a8a94", "slot": "chest", "visual": "plate", "rarity": "raro",  "armor": 7, "value": 1400, "desc": "Placas batidas na forja do Bragan. 7 de mitigação e o peso da segurança."},
    "lamina_de_prata":   {"name": "Lâmina de Prata",    "kind": "weapon", "stackable": False, "color": "#d8e0e8", "slot": "hand", "visual": "sword", "rarity": "raro",  "dmg": {"n": 3, "d": 8, "flat": 8}, "atk": 5, "dmg_flat": 4, "value": 3200, "desc": "Prata pura que MORDE a noite: vampiros e lobisomens odeiam o brilho dela. 3d8+8, +5 para acertar e +4 de dano fixo."},
    "espada_umbria":     {"name": "Espada Umbría",      "kind": "weapon", "stackable": False, "color": "#4a4a8a", "slot": "hand", "visual": "sword", "rarity": "epico", "dmg": {"n": 4, "d": 8, "flat": 12}, "atk": 6, "dmg_flat": 6, "value": 8000, "desc": "Metal umbrío temperado em prata. Corta como a meia-noite corta o dia: 4d8+12, +6 para acertar e +6 de dano fixo."},
    # coureiro
    "couraca_de_couro":  {"name": "Couraça de Couro",   "kind": "armor", "stackable": False, "color": "#8a6242", "slot": "chest", "visual": "leather", "rarity": "comum", "armor": 5, "ward": 2, "value": 500, "desc": "Couro curtido em camadas. 5 de mitigação, 2 de barreira e cheiro de estrada."},
    "botas_do_cacador":  {"name": "Botas do Caçador",   "kind": "armor", "stackable": False, "color": "#6a4a30", "slot": "feet", "visual": "boots", "rarity": "comum", "armor": 4, "speed": 1, "value": 700, "desc": "Sola dupla de javali, passo leve de caçador. 4 de mitigação e um passo a mais."},
    "calcas_de_couro":   {"name": "Calças de Couro Real","kind": "armor", "stackable": False, "color": "#a8824a", "slot": "legs", "visual": "pants", "rarity": "raro", "armor": 6, "ward": 3, "value": 1800, "desc": "Costuradas do couro de leão ermal. 6 de mitigação e 3 de barreira, com pose de rei."},
    "armadura_lupina":   {"name": "Armadura Lupina",    "kind": "armor", "stackable": False, "color": "#4a4058", "slot": "chest", "visual": "leather", "rarity": "epico", "armor": 9, "ward": 6, "value": 7000, "desc": "Pelagem de lobisomem sobre couro negro. Quente, silenciosa, quase viva: 9 de mitigação e 6 de barreira."},
    # costureiro
    "capa_de_fibra":     {"name": "Capa de Fibra",      "kind": "armor", "stackable": False, "color": "#c9b868", "slot": "back", "visual": "cloak", "rarity": "comum", "armor": 3, "ward": 3, "value": 350, "desc": "Trançada do capim alto da savana. 3 de mitigação e 3 de barreira, leve como brisa."},
    "tunica_de_viagem":  {"name": "Túnica de Viagem",   "kind": "armor", "stackable": False, "color": "#a89060", "slot": "chest", "visual": "cloth", "rarity": "comum", "armor": 4, "speed": 1, "value": 800, "desc": "Costura reforçada pra quem vive na estrada. 4 de mitigação e um passo a mais."},
    "traje_nobre":       {"name": "Traje Nobre",        "kind": "armor", "stackable": False, "color": "#8a3050", "slot": "chest", "visual": "cloth", "rarity": "raro", "ward": 8, "spell_pow": 4, "value": 3400, "desc": "Veludo de Véspera recosturado pra vivos. 8 de barreira, +4 de poder mágico e um caimento de outro século."},
    "manto_lupino":      {"name": "Manto Lupino",       "kind": "armor", "stackable": False, "color": "#4a4055", "slot": "back", "visual": "cloak", "rarity": "epico", "armor": 8, "ward": 8, "mres": 0.08, "value": 7500, "desc": "Pelagem de lobisomem forrada de tecido nobre. 8 de mitigação, 8 de barreira e 8% de resistência mágica."},
    # carpinteiro
    "arco_de_carvalho":  {"name": "Arco de Carvalho",   "kind": "weapon", "stackable": False, "color": "#8a6a44", "slot": "hand", "visual": "bow", "rarity": "comum", "dmg": {"n": 2, "d": 8, "flat": 3}, "atk": 2, "rng": 4, "value": 650, "desc": "Verga firme, corda de fibra. 2d8+3 de dano, +2 para acertar e alcance de 4 casas."},
    "cajado_rubro":      {"name": "Cajado Rubro",       "kind": "weapon", "stackable": False, "color": "#a84a30", "slot": "hand", "visual": "staff", "rarity": "comum", "dmg": {"n": 2, "d": 6, "flat": 2}, "spell_pow": 5, "value": 900, "desc": "Madeira rubra da savana, quente na palma. +5 de poder mágico."},
    "arco_rubro":        {"name": "Arco Rubro",         "kind": "weapon", "stackable": False, "color": "#c05838", "slot": "hand", "visual": "bow", "rarity": "raro", "dmg": {"n": 3, "d": 8, "flat": 6}, "atk": 4, "rng": 4, "value": 2600, "desc": "A tensão da madeira rubra canta a cada tiro. 3d8+6, +4 para acertar, alcance 4."},
    "cajado_umbrio":     {"name": "Cajado Umbrío",      "kind": "weapon", "stackable": False, "color": "#3a3a6a", "slot": "hand", "visual": "staff", "rarity": "epico", "dmg": {"n": 3, "d": 6, "flat": 4}, "spell_pow": 9, "value": 7800, "desc": "Madeira da Noite Eterna com uma gema acordada no topo. +9 de poder mágico e sussurros no escuro."},
    # alquimista
    "pocao_leve":        {"name": "Poção Leve",         "kind": "consumivel", "stackable": True, "color": "#e8c840", "visual": "potion", "heal": 0.30, "value": 180, "desc": "Erva solar destilada. Cura 30% da vida com gosto de manhã."},
    "elixir_lunar":      {"name": "Elixir Lunar",       "kind": "consumivel", "stackable": True, "color": "#a0c0e8", "visual": "potion", "heal": 0.50, "value": 450, "desc": "Prateado e frio. Cura 50% da vida e deixa um silêncio bom."},
    "tonico_umbrio":     {"name": "Tônico Umbrío",      "kind": "consumivel", "stackable": True, "color": "#5a5a9a", "visual": "potion", "heal": 0.70, "value": 900, "desc": "Escuro como a mata que o gerou. Cura 70% da vida."},
    "panaceia":          {"name": "Panaceia",           "kind": "consumivel", "stackable": True, "color": "#f0e8ff", "visual": "potion", "heal": 1.00, "value": 2200, "desc": "A obra-prima do Mestre Vidal: cura TODA a vida. Ingredientes que é melhor não perguntar."},
    # joalheiro
    "anel_de_prata":     {"name": "Anel de Prata",      "kind": "trinket", "stackable": False, "color": "#d8e0e8", "slot": "ring", "visual": "ring", "rarity": "comum", "atk": 2, "spell_pow": 2, "value": 800, "desc": "Simples, honesto, brilhante. +2 para acertar e +2 de poder mágico."},
    "colar_de_gema":     {"name": "Colar de Gema",      "kind": "trinket", "stackable": False, "color": "#d060c0", "slot": "neck", "visual": "amulet", "rarity": "raro", "ward": 6, "value": 2400, "desc": "Uma gema lapidada pela Mestra Petra. 6 de barreira e olhares na rua."},
    "anel_lunar":        {"name": "Anel Lunar",         "kind": "trinket", "stackable": False, "color": "#a0c0e8", "slot": "ring", "visual": "ring", "rarity": "raro", "spell_pow": 6, "ward": 4, "value": 4200, "desc": "Metal umbrío com uma pérola do mar de Maravai. +6 de poder mágico e 4 de barreira."},
    "diadema_umbrio":    {"name": "Diadema Umbrío",     "kind": "trinket", "stackable": False, "color": "#6a5a9a", "slot": "head", "visual": "crown", "rarity": "epico", "armor": 4, "spell_pow": 8, "ward": 8, "value": 9000, "desc": "Duas gemas acordadas num arco de metal da Noite. 4 de mitigação, +8 de poder mágico, 8 de barreira."},
    # cozinheiro
    "espeto_do_cacador": {"name": "Espeto do Caçador",  "kind": "consumivel", "stackable": True, "color": "#c08a50", "visual": "potion", "heal": 0.28, "value": 130, "desc": "Carne de caça na brasa, ponto perfeito. Cura 28% da vida."},
    "ensopado_da_vila":  {"name": "Ensopado da Vila",   "kind": "consumivel", "stackable": True, "color": "#a86a40", "visual": "potion", "heal": 0.40, "value": 260, "desc": "Panela cheia, coração quente. Cura 40% da vida."},
    "banquete_do_maraja":{"name": "Banquete do Marajá", "kind": "consumivel", "stackable": True, "color": "#e8a040", "visual": "potion", "heal": 0.60, "value": 600, "desc": "Receita digna do Leão Branco. Cura 60% da vida e rende histórias."},
    "festim_umbrio":     {"name": "Festim Umbrío",      "kind": "consumivel", "stackable": True, "color": "#8a6aa8", "visual": "potion", "heal": 0.85, "value": 1300, "desc": "O prato proibido do Bartolo, com um tempero de presa vampírica. Cura 85% da vida."},
    "peixe_fresco":      {"name": "Peixe Fresco",       "kind": "trofeu", "stackable": True, "color": "#8ab0c9", "value": 40, "desc": "Fisgado no píer da Vila Caiçara. A Dona Maricota paga bem por ele."},
    "peixe_dourado":     {"name": "Peixe Dourado",      "kind": "trofeu", "stackable": True, "color": "#e8c040", "value": 300, "desc": "Raro, brilhante e briguento. Os pescadores contam histórias sobre esse aí."},
    "filhote_capivara":  {"name": "Filhote de Capivara","kind": "trofeu", "stackable": False, "color": "#a8875c", "value": 5000, "desc": "Uma capivarinha mansa que decidiu que você é da família. Te segue pra todo lado."},

    # ============ COMPONENTES (cadeias de ofício, estilo Pax Dei) ============
    "barra_de_ferro":    {"name": "Barra de Ferro",     "kind": "trofeu", "stackable": True, "color": "#9a9aa4", "value": 70,  "desc": "Minério fundido e batido. O tijolo de toda forja."},
    "barra_de_prata":    {"name": "Barra de Prata",     "kind": "trofeu", "stackable": True, "color": "#d8e0e8", "value": 160, "desc": "Prata pura em barra. Morde a noite e enche o olho do joalheiro."},
    "barra_umbria":      {"name": "Barra Umbría",       "kind": "trofeu", "stackable": True, "color": "#4a4a8a", "value": 420, "desc": "Metal da Noite Eterna ligado em prata. Frio até no fogo."},
    "cabo_de_couro":     {"name": "Cabo de Couro",      "kind": "trofeu", "stackable": True, "color": "#8a6242", "value": 60,  "desc": "Empunhadura firme enrolada à mão. O ferreiro agradece o coureiro."},
    "couro_curtido":     {"name": "Couro Curtido",      "kind": "trofeu", "stackable": True, "color": "#a8824a", "value": 55,  "desc": "Pele crua que virou material de verdade no tanque de curtimento."},
    "couro_reforcado":   {"name": "Couro Reforçado",    "kind": "trofeu", "stackable": True, "color": "#c9a05a", "value": 180, "desc": "Camadas de couro curtido costuradas com couro de leão."},
    "botao_de_osso":     {"name": "Botão de Osso",      "kind": "trofeu", "stackable": True, "color": "#e8e0d0", "value": 30,  "desc": "Torneado de presa de lobo. O costureiro compra aos punhados."},
    "fio_rustico":       {"name": "Fio Rústico",        "kind": "trofeu", "stackable": True, "color": "#c9b868", "value": 20,  "desc": "Fibra de capim fiada na roca. Corda de arco, trama de pano."},
    "pano_cru":          {"name": "Pano Cru",           "kind": "trofeu", "stackable": True, "color": "#d8cfa8", "value": 70,  "desc": "Fios tecidos no tear. A base de toda veste honesta."},
    "pano_nobre":        {"name": "Pano Nobre",         "kind": "trofeu", "stackable": True, "color": "#8a3050", "value": 320, "desc": "Pano cru enriquecido com o veludo de Véspera."},
    "tabua_polida":      {"name": "Tábua Polida",       "kind": "trofeu", "stackable": True, "color": "#a8824a", "value": 45,  "desc": "Carvalho aplainado e lixado. Cheiro de oficina boa."},
    "verga_rubra":       {"name": "Verga Rubra",        "kind": "trofeu", "stackable": True, "color": "#c05838", "value": 140, "desc": "Madeira rubra vergada a vapor sobre tábua de carvalho."},
    "cerne_umbrio":      {"name": "Cerne Umbrío",       "kind": "trofeu", "stackable": True, "color": "#2e3450", "value": 380, "desc": "O coração da árvore da Noite, trabalhado em verga rubra."},
    "essencia_solar":    {"name": "Essência Solar",     "kind": "trofeu", "stackable": True, "color": "#e8c840", "value": 90,  "desc": "Ervas solares destiladas até restar só o calor."},
    "essencia_lunar":    {"name": "Essência Lunar",     "kind": "trofeu", "stackable": True, "color": "#a0c0e8", "value": 220, "desc": "Destilado frio de erva lunar com um toque solar."},
    "gema_lapidada":     {"name": "Gema Lapidada",      "kind": "trofeu", "stackable": True, "color": "#d060c0", "value": 550, "desc": "Uma gema bruta acordada pelas mãos da Mestra Petra."},

    # ============ TIER 4: acima do Necrótico (lendários de ofício) ============
    "lamina_do_crepusculo": {"name": "Lâmina do Crepúsculo", "kind": "weapon", "stackable": False, "color": "#7a5ad0", "slot": "hand", "visual": "sword", "rarity": "lendario", "dmg": {"n": 16, "d": 12, "flat": 40}, "atk": 38, "dmg_flat": 10, "value": 90000, "desc": "A obra-prima do Bragan: barras umbrías dobradas cem vezes ao pôr do sol. 16d12+40, +38 para acertar e +10 fixo. Nem o Cofre de Varth guarda igual."},
    "couraca_da_alcateia":  {"name": "Couraça da Alcateia",  "kind": "armor",  "stackable": False, "color": "#4a4058", "slot": "chest", "visual": "leather", "rarity": "lendario", "armor": 24, "ward": 10, "value": 80000, "desc": "Pelagem de toda uma alcateia sobre couro reforçado. 24 de mitigação e 10 de barreira: mais firme que o aço necrótico."},
    "manto_da_meia_noite":  {"name": "Manto da Meia-Noite",  "kind": "armor",  "stackable": False, "color": "#2a1a40", "slot": "back", "visual": "cloak", "rarity": "lendario", "armor": 8, "ward": 12, "mres": 0.12, "speed": 1, "value": 78000, "desc": "Pano nobre tingido na própria Noite Eterna. 8 de mitigação, 12 de barreira, 12% de resistência mágica e um passo silencioso a mais."},
    "cerne_do_mundo":       {"name": "Cerne do Mundo",       "kind": "weapon", "stackable": False, "color": "#3a3a6a", "slot": "hand", "visual": "staff", "rarity": "lendario", "dmg": {"n": 6, "d": 8, "flat": 15}, "spell_pow": 14, "atk": 10, "value": 85000, "desc": "O cajado do Justo: cerne umbrío com uma gema lapidada que sussurra. +14 de poder mágico, 6d8+15: o cosmo inteiro num cabo de madeira."},
    "coroa_do_alvorecer":   {"name": "Coroa do Alvorecer",   "kind": "trinket","stackable": False, "color": "#f0d060", "slot": "head", "visual": "crown", "rarity": "lendario", "armor": 8, "spell_pow": 12, "ward": 10, "value": 88000, "desc": "Prata, gemas e uma pérola do mar de Maravaí. 8 de mitigação, +12 de poder mágico e 10 de barreira. A Petra chorou ao terminar."},
    "lagrima_de_atalech":   {"name": "Lágrima de Atalech",   "kind": "consumivel", "stackable": True, "color": "#c0f0e0", "visual": "potion", "heal": 1.0, "value": 5000, "desc": "O destilado supremo do Vidal: extrato umbrío, essências e um segredo. Restaura TODA a vida num gole frio."},
    "banquete_dos_reis":    {"name": "Banquete dos Reis",    "kind": "consumivel", "stackable": True, "color": "#ffd060", "visual": "potion", "heal": 0.95, "value": 3200, "desc": "O prato definitivo do Bartolo: caça, presa vampírica e tempero de rei. Restaura 95% da vida e a fé na culinária."},

    # ---- SET DE PLACA "CREPÚSCULO" (ferreiro · paladinos e guerreiros) ----
    "elmo_do_crepusculo":     {"name": "Elmo do Crepúsculo",     "kind": "armor", "stackable": False, "color": "#7a5ad0", "slot": "head",     "visual": "helm",    "rarity": "lendario", "armor": 9,  "ward": 4, "value": 42000, "desc": "Placa umbría forjada num só golpe. 9 de mitigação e 4 de barreira."},
    "pauldron_do_crepusculo": {"name": "Pauldrons do Crepúsculo","kind": "armor", "stackable": False, "color": "#7a5ad0", "slot": "shoulder", "visual": "plate",   "rarity": "lendario", "armor": 9,  "ward": 3, "value": 40000, "desc": "Ombreiras que aguentam o mundo. 9 de mitigação e 3 de barreira."},
    "peitoral_do_crepusculo": {"name": "Peitoral do Crepúsculo", "kind": "armor", "stackable": False, "color": "#7a5ad0", "slot": "chest",    "visual": "plate",   "rarity": "lendario", "armor": 26, "ward": 5, "value": 82000, "desc": "A muralha ambulante do Bragan: 26 de mitigação e 5 de barreira. Acima de qualquer aço necrótico."},
    "grevas_do_crepusculo":   {"name": "Grevas do Crepúsculo",   "kind": "armor", "stackable": False, "color": "#7a5ad0", "slot": "legs",     "visual": "plate",   "rarity": "lendario", "armor": 15, "ward": 3, "value": 46000, "desc": "Pernas de fortaleza. 15 de mitigação e 3 de barreira."},
    "botas_do_crepusculo":    {"name": "Botas do Crepúsculo",    "kind": "armor", "stackable": False, "color": "#7a5ad0", "slot": "feet",     "visual": "boots",   "rarity": "lendario", "armor": 9,  "ward": 3, "value": 40000, "desc": "Passo de aço umbrío. 9 de mitigação e 3 de barreira."},
    # ---- SET DE COURO "ALCATEIA" (coureiro · caçadores e ladinos) ----
    "capuz_da_alcateia":      {"name": "Capuz da Alcateia",      "kind": "armor", "stackable": False, "color": "#4a4058", "slot": "head",     "visual": "hood",    "rarity": "lendario", "armor": 7,  "ward": 5, "value": 38000, "desc": "Ouve a mata antes da mata falar. 7 de mitigação e 5 de barreira."},
    "ombreiras_da_alcateia":  {"name": "Ombreiras da Alcateia",  "kind": "armor", "stackable": False, "color": "#4a4058", "slot": "shoulder", "visual": "leather", "rarity": "lendario", "armor": 7,  "ward": 4, "value": 36000, "desc": "Pelagem lupina sobre couro reforçado. 7 de mitigação e 4 de barreira."},
    "calcas_da_alcateia":     {"name": "Calças da Alcateia",     "kind": "armor", "stackable": False, "color": "#4a4058", "slot": "legs",     "visual": "pants",   "rarity": "lendario", "armor": 14, "ward": 4, "value": 44000, "desc": "Corre a noite inteira sem um ruído. 14 de mitigação e 4 de barreira."},
    "botas_da_alcateia":      {"name": "Botas da Alcateia",      "kind": "armor", "stackable": False, "color": "#4a4058", "slot": "feet",     "visual": "boots",   "rarity": "lendario", "armor": 7,  "ward": 3, "speed": 1, "value": 40000, "desc": "Patas de lobo pra pés de gente. 7 de mitigação, 3 de barreira e um passo a mais."},
    # ---- SET DE PANO "MEIA-NOITE" (costureiro · magos e feiticeiros) ----
    "chapeu_da_meia_noite":   {"name": "Chapéu da Meia-Noite",   "kind": "armor", "stackable": False, "color": "#2a1a40", "slot": "head",     "visual": "hat",     "rarity": "lendario", "armor": 4, "spell_pow": 9,  "ward": 8,  "value": 44000, "desc": "Costurado com linha de escuridão. +9 de poder mágico, 8 de barreira."},
    "ombros_da_meia_noite":   {"name": "Ombreiras da Meia-Noite","kind": "armor", "stackable": False, "color": "#2a1a40", "slot": "shoulder", "visual": "cloth",   "rarity": "lendario", "armor": 4, "spell_pow": 4,  "ward": 8,  "value": 38000, "desc": "O peso da noite, leve nos ombros. +4 mágico, 8 de barreira."},
    "tunica_da_meia_noite":   {"name": "Túnica da Meia-Noite",   "kind": "armor", "stackable": False, "color": "#2a1a40", "slot": "chest",    "visual": "cloth",   "rarity": "lendario", "armor": 10, "spell_pow": 6, "ward": 14, "value": 78000, "desc": "Pano nobre banhado em essência lunar. 10 de mitigação, +6 mágico e 14 de barreira."},
    "calcas_da_meia_noite":   {"name": "Calças da Meia-Noite",   "kind": "armor", "stackable": False, "color": "#2a1a40", "slot": "legs",     "visual": "pants",   "rarity": "lendario", "armor": 7, "spell_pow": 3,  "ward": 9,  "value": 42000, "desc": "Anda entre mundos. 7 de mitigação, +3 mágico, 9 de barreira."},
    # ============ RELÍQUIAS DE MISSÃO (exclusivas, não dropam de nada) ============
    "fagulha_de_valdris":    {"name": "Fagulha de Valdris",     "kind": "trinket", "stackable": False, "color": "#e8a040", "slot": "ring",  "visual": "ring",  "rarity": "raro", "atk": 2, "spell_pow": 2, "value": 1500, "desc": "Um estilhaço do âmbar partido de Valdris, ainda morno. 'Todo poder já foi, um dia, apenas um começo.' +2 para acertar e +2 de poder mágico."},
    "colar_de_buzios":       {"name": "Colar de Búzios",        "kind": "trinket", "stackable": False, "color": "#e8d8b8", "slot": "neck",  "visual": "necklace", "rarity": "raro", "ward": 5, "value": 1200, "desc": "A Maricota enfiou búzio por búzio cantarolando pro mar. Guarda 5 de barreira e o cheiro da maré boa."},
    "martelo_do_bragan":     {"name": "Martelo do Bragan",      "kind": "weapon",  "stackable": False, "color": "#9a8a7a", "slot": "hand",  "visual": "hammer", "rarity": "raro", "dmg": {"n": 3, "d": 8, "flat": 4}, "atk": 6, "value": 2200, "desc": "O martelo com que o Bragan aprendeu o ofício. 3d8+4 e +6 para acertar. 'Cuida dele melhor do que eu cuidei.'"},
    "tempero_secreto_bartolo": {"name": "Tempero Secreto do Bartolo", "kind": "consumivel", "stackable": True, "color": "#e0a040", "visual": "potion", "heal": 0.6, "value": 700, "desc": "Uma pitada disso e qualquer rango vira festa. Restaura 60% da vida e o Bartolo jura que não tem presa vampírica. Jura."},
    "broche_da_alvorada":    {"name": "Broche da Alvorada",     "kind": "trinket", "stackable": False, "color": "#f0d888", "slot": "neck",  "visual": "necklace", "rarity": "raro", "ward": 4, "armor": 2, "value": 1400, "desc": "Abençoado pela Irmã Solene diante da chama dos Doze. 4 de barreira, 2 de mitigação e uma paz estranha no peito."},
    "faca_do_lazaro":        {"name": "Facão do Lázaro",        "kind": "weapon",  "stackable": False, "color": "#b8c0c8", "slot": "hand",  "visual": "sword", "rarity": "raro", "dmg": {"n": 2, "d": 6, "flat": 5}, "atk": 8, "value": 1900, "desc": "O facão que limpou o matagal de Sapopemba. 2d6+5, +8 para acertar, e um fio que o Lázaro afiava toda quinta."},
    # ===== RELÍQUIAS DE PRIMEIRA-KILL: só o PRIMEIRO do servidor leva =====
    "juba_do_maraja":       {"name": "Juba do Marajá",        "kind": "armor",   "stackable": False, "color": "#e0a030", "slot": "back", "visual": "cloak", "rarity": "lendario", "armor": 7, "ward": 8, "speed": 1, "value": 30000, "desc": "PRIMEIRA KILL do servidor. A juba do rei da savana, tosquiada do trono. Só existe UMA."},
    "cetro_de_varth":       {"name": "Cetro de Lorde Varth",  "kind": "weapon",  "stackable": False, "color": "#7a4ad0", "slot": "hand", "visual": "staff", "rarity": "lendario", "dmg": {"n": 8, "d": 10, "flat": 20}, "atk": 20, "spell_pow": 10, "value": 45000, "desc": "PRIMEIRA KILL do servidor. O cetro que comandava a Torre inteira. Só existe UM."},
    "presa_de_krezath":     {"name": "Presa de Krezath",      "kind": "trinket", "stackable": False, "color": "#a03040", "slot": "ring", "visual": "ring", "rarity": "lendario", "atk": 6, "dmg_flat": 4, "value": 32000, "desc": "PRIMEIRA KILL do servidor. Um dente do Devorador, ainda com fome. Só existe UMA."},
    "ankh_do_farao":        {"name": "Ankh do Faraó",         "kind": "trinket", "stackable": False, "color": "#e0c040", "slot": "neck", "visual": "necklace", "rarity": "lendario", "ward": 12, "spell_pow": 6, "value": 34000, "desc": "PRIMEIRA KILL do servidor. A vida eterna do Faraó, agora no seu pescoço. Só existe UM."},
    "nucleo_do_colosso":    {"name": "Núcleo do Colosso",     "kind": "trinket", "stackable": False, "color": "#8a9ab0", "slot": "ring", "visual": "ring", "rarity": "lendario", "armor": 8, "ward": 6, "value": 30000, "desc": "PRIMEIRA KILL do servidor. A pedra que fazia a montanha andar. Só existe UMA."},
    "garra_do_urso_rei":    {"name": "Garra do Urso Rei",     "kind": "weapon",  "stackable": False, "color": "#8a6a4a", "slot": "hand", "visual": "sword", "rarity": "lendario", "dmg": {"n": 10, "d": 8, "flat": 18}, "atk": 22, "value": 38000, "desc": "PRIMEIRA KILL do servidor. A garra que governava o bosque. Só existe UMA."},
    "coracao_de_vulkar":    {"name": "Coração de Vulkar",     "kind": "trinket", "stackable": False, "color": "#e05828", "slot": "neck", "visual": "necklace", "rarity": "lendario", "armor": 5, "ward": 5, "spell_pow": 8, "value": 33000, "desc": "PRIMEIRA KILL do servidor. Ainda pulsa quente como o Brasal. Só existe UM."},
    "veu_da_dama":          {"name": "Véu da Dama da Noite",  "kind": "armor",   "stackable": False, "color": "#3a2a58", "slot": "back", "visual": "cloak", "rarity": "lendario", "ward": 10, "mres": 0.08, "value": 31000, "desc": "PRIMEIRA KILL do servidor. A noite tecida em pano. Só existe UM."},
    "anzol_do_velho_bob":   {"name": "Anzol do Velho Bob",    "kind": "trinket", "stackable": False, "color": "#b8c0c8", "slot": "ring", "visual": "ring", "rarity": "lendario", "atk": 5, "ward": 3, "value": 22000, "desc": "PRIMEIRA KILL do servidor. O Bob pescava ALMAS com isso. Só existe UM."},
    "soco_ingles_do_maurao":{"name": "Soco-Inglês do Maurão", "kind": "trinket", "stackable": False, "color": "#9a9aa4", "slot": "ring", "visual": "ring", "rarity": "lendario", "atk": 4, "dmg_flat": 3, "value": 20000, "desc": "PRIMEIRA KILL do servidor. O argumento final do Maurão. Só existe UM."},

    # ================== MACHADOS (skill: Machado) ==================
    "machadinha":           {"name": "Machadinha",            "kind": "weapon", "stackable": False, "color": "#9a8a7a", "slot": "hand", "visual": "sword", "wclass": "axe", "atk": 12, "def": 6, "dmg": {"n": 1, "d": 8, "flat": 1}, "value": 320, "desc": "Curta, honesta, corta lenha e canela."},
    "machado_lenhador":     {"name": "Machado de Lenhador",   "kind": "weapon", "stackable": False, "color": "#8a7a5a", "slot": "hand", "visual": "sword", "wclass": "axe", "atk": 16, "def": 8, "dmg": {"n": 1, "d": 10, "flat": 2}, "value": 780, "desc": "O cabo tem marcas de dez invernos."},
    "machado_de_batalha":   {"name": "Machado de Batalha",    "kind": "weapon", "stackable": False, "color": "#8a929a", "slot": "hand", "visual": "sword", "wclass": "axe", "atk": 24, "def": 11, "dmg": {"n": 2, "d": 8, "flat": 4}, "value": 2400, "desc": "Duas mãos, um arco de aço, silêncio depois."},
    "machado_umbrio":       {"name": "Machado Umbrío",        "kind": "weapon", "stackable": False, "color": "#5a5a7a", "slot": "hand", "visual": "sword", "wclass": "axe", "atk": 32, "def": 14, "rarity": "raro", "dmg": {"n": 3, "d": 8, "flat": 6}, "value": 6200, "desc": "Forjado com ferro do Umbraval: morde até sombra."},
    "machado_do_carrasco":  {"name": "Machado do Carrasco",   "kind": "weapon", "stackable": False, "color": "#7a3040", "slot": "hand", "visual": "sword", "wclass": "axe", "atk": 40, "def": 16, "rarity": "epico", "dmg": {"n": 4, "d": 10, "flat": 8}, "value": 14000, "desc": "Nunca precisou de segundo golpe. Nunca."},
    "lamina_da_ferida":     {"name": "Lâmina da Ferida",      "kind": "weapon", "stackable": False, "color": "#e05828", "slot": "hand", "visual": "sword", "wclass": "axe", "atk": 50, "def": 18, "rarity": "lendario", "dmg": {"n": 6, "d": 10, "flat": 12}, "value": 36000, "desc": "Lascada do próprio Brasal: o corte cauteriza chorando fagulhas."},

    # ================== MAÇAS (skill: Maça) ==================
    "porrete_de_ipe":       {"name": "Porrete de Ipê",        "kind": "weapon", "stackable": False, "color": "#7a5a3a", "slot": "hand", "visual": "hammer", "wclass": "club", "atk": 11, "def": 7, "dmg": {"n": 1, "d": 6, "flat": 2}, "value": 260, "desc": "Madeira de lei: argumento de peso."},
    "maca_cravejada":       {"name": "Maça Cravejada",        "kind": "weapon", "stackable": False, "color": "#8a8a92", "slot": "hand", "visual": "hammer", "wclass": "club", "atk": 17, "def": 9, "dmg": {"n": 1, "d": 12, "flat": 2}, "value": 900, "desc": "Cada cravo tem um nome. Nenhum é carinhoso."},
    "martelo_de_guerra":    {"name": "Martelo de Guerra",     "kind": "weapon", "stackable": False, "color": "#9aa2aa", "slot": "hand", "visual": "hammer", "wclass": "club", "atk": 25, "def": 12, "dmg": {"n": 2, "d": 10, "flat": 4}, "value": 2700, "desc": "Não corta. RESOLVE."},
    "maca_umbria":          {"name": "Maça Umbría",           "kind": "weapon", "stackable": False, "color": "#5a5a7a", "slot": "hand", "visual": "hammer", "wclass": "club", "atk": 33, "def": 15, "rarity": "raro", "dmg": {"n": 3, "d": 10, "flat": 6}, "value": 6800, "desc": "Pesa como culpa e desce como sentença."},
    "estrela_dalva_negra":  {"name": "Estrela-d'Alva Negra",  "kind": "weapon", "stackable": False, "color": "#3a2a58", "slot": "hand", "visual": "hammer", "wclass": "club", "atk": 41, "def": 17, "rarity": "epico", "dmg": {"n": 4, "d": 12, "flat": 8}, "value": 15000, "desc": "Uma esfera de espinhos que engole a luz do amanhecer."},
    "quebra_montanha":      {"name": "Quebra-Montanha",       "kind": "weapon", "stackable": False, "color": "#8a9ab0", "slot": "hand", "visual": "hammer", "wclass": "club", "atk": 52, "def": 20, "rarity": "lendario", "dmg": {"n": 6, "d": 12, "flat": 14}, "value": 38000, "desc": "Dizem que o Colosso caiu de joelhos só de OUVIR o nome."},

    # ================== LANÇAS (skill: Distância, sem munição) ==================
    "lanca_de_pesca":       {"name": "Lança de Pesca",        "kind": "weapon", "stackable": False, "color": "#8a7a5a", "slot": "hand", "visual": "staff", "wclass": "distance", "range": 4, "atk": 14, "def": 5, "dmg": {"n": 1, "d": 8, "flat": 2}, "value": 420, "desc": "Da Vila Caiçara: fisga peixe, fisga problema."},
    "azagaia":              {"name": "Azagaia",               "kind": "weapon", "stackable": False, "color": "#9a8a6a", "slot": "hand", "visual": "staff", "wclass": "distance", "range": 4, "atk": 20, "def": 6, "dmg": {"n": 1, "d": 10, "flat": 3}, "value": 1100, "desc": "Leve no braço, funda na carne."},
    "lanca_serrilhada":     {"name": "Lança Serrilhada",      "kind": "weapon", "stackable": False, "color": "#8a929a", "slot": "hand", "visual": "staff", "wclass": "distance", "range": 4, "atk": 28, "def": 8, "rarity": "raro", "dmg": {"n": 2, "d": 10, "flat": 4}, "value": 4800, "desc": "Entra fácil. Sair é que é o espetáculo."},
    "tridente_abissal":     {"name": "Tridente Abissal",      "kind": "weapon", "stackable": False, "color": "#2a6a8a", "slot": "hand", "visual": "staff", "wclass": "distance", "range": 4, "atk": 38, "def": 10, "rarity": "epico", "dmg": {"n": 3, "d": 12, "flat": 6}, "value": 13000, "desc": "Subiu de um lugar do mar que não tem nome nos mapas."},
    "lanca_do_leviata":     {"name": "Lança do Leviatã",      "kind": "weapon", "stackable": False, "color": "#4a8aaa", "slot": "hand", "visual": "staff", "wclass": "distance", "range": 4, "atk": 48, "def": 12, "rarity": "lendario", "dmg": {"n": 5, "d": 12, "flat": 10}, "value": 34000, "desc": "A farpa que o mar guardou pra cobrar a dívida da terra."},

    # ================== CROSSBOWS (skill: Distância, usam virote) ==================
    "besta_simples":        {"name": "Besta Simples",         "kind": "weapon", "stackable": False, "color": "#7a6a4a", "slot": "hand", "visual": "bow", "wclass": "distance", "range": 5, "ammo": "virote", "atk": 16, "def": 3, "dmg": {"n": 1, "d": 10, "flat": 2}, "value": 950, "desc": "Arma o gatilho, aponta, e a física resolve."},
    "besta_de_caca":        {"name": "Besta de Caça",         "kind": "weapon", "stackable": False, "color": "#8a7a5a", "slot": "hand", "visual": "bow", "wclass": "distance", "range": 5, "ammo": "virote", "atk": 24, "def": 4, "dmg": {"n": 2, "d": 8, "flat": 3}, "value": 2900, "desc": "O javali nem ouviu o clique."},
    "besta_pesada":         {"name": "Besta Pesada",          "kind": "weapon", "stackable": False, "color": "#6a6a72", "slot": "hand", "visual": "bow", "wclass": "distance", "range": 5, "ammo": "virote", "atk": 33, "def": 5, "rarity": "raro", "dmg": {"n": 3, "d": 10, "flat": 5}, "value": 7200, "desc": "Atravessa porta, escudo e a desculpa de quem tava atrás."},
    "besta_do_juizo":       {"name": "Besta do Juízo",        "kind": "weapon", "stackable": False, "color": "#7a3040", "slot": "hand", "visual": "bow", "wclass": "distance", "range": 5, "ammo": "virote", "atk": 46, "def": 6, "rarity": "epico", "dmg": {"n": 4, "d": 12, "flat": 8}, "value": 16000, "desc": "Cada virote sai com uma sentença gravada."},

    # ================== MUNIÇÃO ==================
    "flecha":               {"name": "Flecha",                "kind": "municao", "stackable": True, "color": "#9a8a6a", "atk_bonus": 0, "value": 3, "desc": "Pena, haste, ponta. O resto é pulso."},
    "flecha_de_ferro":      {"name": "Flecha de Ferro",       "kind": "municao", "stackable": True, "color": "#8a929a", "atk_bonus": 4, "value": 9, "desc": "Ponta forjada: morde mais fundo."},
    "virote":               {"name": "Virote",                "kind": "municao", "stackable": True, "color": "#7a6a4a", "atk_bonus": 0, "value": 4, "desc": "Curto, grosso, direto ao assunto."},
    "virote_perfurante":    {"name": "Virote Perfurante",     "kind": "municao", "stackable": True, "color": "#6a6a72", "atk_bonus": 5, "value": 12, "desc": "Feito pra conversar com armadura."},

    # ================== RUNAS MÁGICAS (usam Nível Mágico) ==================
    "runa_em_branco":       {"name": "Runa em Branco",        "kind": "trofeu", "stackable": True, "color": "#c9c2b8", "value": 60, "desc": "Pedra lisa esperando um destino. Os alquimistas sabem gravar."},
    "runa_missil_pesado":   {"name": "Runa: Míssil Pesado",   "kind": "runa", "stackable": True, "color": "#6a8adf", "rune": {"tier": 2, "dtype": "energia"}, "ml_req": 4, "value": 220, "desc": "Um trovão de bolso apontável."},
    "runa_bola_de_fogo":    {"name": "Runa: Grande Bola de Fogo", "kind": "runa", "stackable": True, "color": "#e06828", "rune": {"tier": 2, "dtype": "fogo", "area": 2}, "ml_req": 6, "value": 340, "desc": "Quebra a runa, vira o quarteirão em brasa. ÁREA."},
    "runa_lanca_gelida":    {"name": "Runa: Lança Gélida",    "kind": "runa", "stackable": True, "color": "#8ad8f0", "rune": {"tier": 2, "dtype": "gelo"}, "ml_req": 5, "value": 260, "desc": "Um inverno inteiro comprimido num traço."},
    "runa_explosao":        {"name": "Runa: Explosão",        "kind": "runa", "stackable": True, "color": "#e0a028", "rune": {"tier": 3, "dtype": "fogo", "area": 1}, "ml_req": 9, "value": 520, "desc": "Física aplicada com raiva. ÁREA curta."},
    "runa_pesadelo":        {"name": "Runa: Pesadelo",        "kind": "runa", "stackable": True, "color": "#9a5adf", "rune": {"tier": 3, "dtype": "psiquico"}, "ml_req": 10, "value": 560, "desc": "O alvo lembra de tudo que tentou esquecer. De uma vez."},
    "runa_morte_subita":    {"name": "Runa: Morte Súbita",    "kind": "runa", "stackable": True, "color": "#3a3a4a", "rune": {"tier": 5, "dtype": "necrotico"}, "ml_req": 16, "value": 1400, "desc": "A caveira gravada sorri. Ela sabe o que vem."},
    "runa_cura_intensa":    {"name": "Runa: Cura Intensa",    "kind": "runa", "stackable": True, "color": "#8ae0a0", "rune": {"tier": 2, "heal": True}, "ml_req": 3, "value": 240, "desc": "Costura carne como quem remenda rede."},
    "runa_cura_suprema":    {"name": "Runa: Cura Suprema",    "kind": "runa", "stackable": True, "color": "#c0f0c9", "rune": {"tier": 4, "heal": True}, "ml_req": 11, "value": 900, "desc": "A vida volta correndo, envergonhada de ter saído."},

    "caneca_de_cerveja":  {"name": "Caneca de Cerveja",   "kind": "consumivel", "stackable": True, "color": "#e0a840", "visual": "potion", "heal": 0.15, "value": 40,  "desc": "Gelada como o Jorge gosta de servir. Restaura 15%% da vida e 100%% do humor."},
    "hidromel_do_ermo":   {"name": "Hidromel do Ermo",    "kind": "consumivel", "stackable": True, "color": "#e8c860", "visual": "potion", "heal": 0.25, "value": 100, "desc": "Mel, tempo e paciência. Restaura 25%% da vida."},
    "prato_do_dia":       {"name": "Prato do Dia",        "kind": "consumivel", "stackable": True, "color": "#c98a50", "visual": "potion", "heal": 0.4,  "value": 150, "desc": "O Jorge jura que a receita é da avó dele. Restaura 40%% da vida."},
    "pinga_do_jorge":     {"name": "Pinga do Jorge",      "kind": "consumivel", "stackable": True, "color": "#e8e0c8", "visual": "potion", "heal": 0.1,  "value": 60,  "desc": "Desce queimando, sobe cantando. Restaura 10%% da vida e zero da dignidade."},

    "chave_da_fenda":      {"name": "Chave da Fenda",       "kind": "trofeu", "stackable": True, "color": "#8a5adf", "value": 4000, "desc": "Uma chave que vibra e sussurra. Abre o portal da Fenda do Caos, no leste do Ermo. Consumida ao entrar: e lá embaixo, só a profundidade manda."},
    "fragmento_estelar":   {"name": "Fragmento Estelar",     "kind": "trofeu", "stackable": True, "color": "#e8e0ff", "rarity": "raro", "value": 8000, "desc": "Um caco de algo que caiu do céu antes dos Doze. O Bragan jura que só ISSO aguenta uma forja +3."},

    "luneta_do_cronista":    {"name": "Luneta do Cronista",     "kind": "trinket", "stackable": False, "color": "#c9a860", "slot": "ring",  "visual": "ring", "rarity": "epico", "atk": 4, "ward": 4, "value": 3500, "desc": "Fabiano viu o mundo inteiro por esta lente antes de escrever sobre ele. +4 para acertar e 4 de barreira: quem enxerga longe, erra pouco."},

    "sapatos_da_meia_noite":  {"name": "Sapatos da Meia-Noite",  "kind": "armor", "stackable": False, "color": "#2a1a40", "slot": "feet",     "visual": "boots",   "rarity": "lendario", "armor": 4, "spell_pow": 3,  "ward": 6, "speed": 1, "value": 38000, "desc": "Pisadas que nem o silêncio ouve. +3 mágico, 6 de barreira e um passo a mais."},

    # trofeus do Cemitério Antigo de Valdarkram (vendiveis na Armas Peteco)
    "osso_amaldicoado":    {"name": "Osso Amaldiçoado",      "kind": "trofeu", "stackable": True, "color": "#d8d2c0", "value": 100},
    "carne_putrida":       {"name": "Carne Pútrida",         "kind": "trofeu", "stackable": True, "color": "#7a8a5a", "value": 110},
    "garra_ghoul":         {"name": "Garra de Ghoul",        "kind": "trofeu", "stackable": True, "color": "#9a8a7a", "value": 120},
    "mortalha_espectral":  {"name": "Mortalha Espectral",    "kind": "trofeu", "stackable": True, "color": "#c4ccd8", "value": 130},
    "lingua_carnical":     {"name": "Língua de Carniçal",    "kind": "trofeu", "stackable": True, "color": "#b06a6a", "value": 150},
    "elmo_cavaleiro_morte":{"name": "Elmo do Cavaleiro da Morte", "kind": "trofeu", "stackable": True, "color": "#3a4048", "value": 190},
    "grimorio_negro":      {"name": "Grimório Negro",        "kind": "trofeu", "stackable": True, "color": "#2a2233", "value": 200},
    "coracao_abominacao":  {"name": "Coração da Abominação", "kind": "tesouro", "stackable": True, "color": "#8a2a3a", "value": 400, "protect": 2},
}


def exists(item_id):
    return item_id in ITEMS


def get(item_id):
    return ITEMS.get(item_id)


def extract_currency(bag):
    """Tira as moedas da mochila e devolve (total_em_bronze, mochila_sem_moedas).
    Migracao: contas antigas guardavam moeda como item; agora vira saldo."""
    total, rest = 0, []
    for stack in (bag or []):
        cat = ITEMS.get(stack.get("item"))
        if cat and cat.get("kind") == "currency":
            total += int(cat.get("value", 1)) * int(stack.get("qty", 1))
        else:
            rest.append(stack)
    return total, rest


def is_stackable(item_id):
    it = ITEMS.get(item_id)
    return bool(it and it["stackable"])


# Espacos de equipamento (11 no total). Ordem usada como referencia; o cliente
# desenha o boneco com seu proprio arranjo.
EQUIP_SLOTS = ["head", "neck", "shoulder", "back", "chest",
               "hand_r", "hand_l", "ring1", "ring2", "legs", "feet"]

# Familias: um item pode declarar um espaco "generico" que cai no primeiro livre.
_FAMILY = {"hand": ["hand_r", "hand_l"], "ring": ["ring1", "ring2"]}


def slot_of(item_id):
    it = ITEMS.get(item_id)
    return it.get("slot") if it else None


def fits_slot(item_id, slot):
    """True se item_id pode ocupar a CHAVE de espaco 'slot', incluindo familias
    (arma 'hand' cabe em hand_r/hand_l; anel 'ring' cabe em ring1/ring2)."""
    base = slot_of(item_id)
    return base == slot or slot in _FAMILY.get(base, [])


def resolve_slot(item_id, equipment):
    """Espaco real onde o item vai. Familias (hand/ring) caem no primeiro livre;
    se ambos cheios, troca o primeiro. Espacos especificos vao direto."""
    s = slot_of(item_id)
    if s in _FAMILY:
        opts = _FAMILY[s]
        for o in opts:
            if not (equipment or {}).get(o):
                return o
        return opts[0]
    return s


def is_equippable(item_id):
    return slot_of(item_id) is not None


def rarity_of(item_id):
    it = ITEMS.get(item_id)
    return (it.get("rarity") if it else None) or "comum"


def equip_summary(equipment):
    """Soma os bonus de tudo que esta vestido: CA, acerto, dano da arma, poder
    magico (caster), bloqueio (escudo) e o alcance da arma (ranged). A arma da MAO
    DIREITA e a principal; se houver uma segunda arma na MAO ESQUERDA, ela vira a
    'offhand' (duas armas), e quem a usa soma o dano dela no ataque."""
    eq = equipment or {}
    ac = atk = spell_pow = block = 0
    spell_hit = 0          # +acerto/CD mágico do equipamento (rebalance ofensivo do caster)
    armor = ward = 0
    dodge = mres = 0.0
    speed = 0
    dmg_mult_add = 0.0     # +100% do anel O Chamado de Atalech (somatorio)
    dmg_flat_bonus = 0     # dano fixo extra por golpe (Botas de Vargo)
    immune = []
    smoke = False
    attrs = {}
    shield_ac = 0

    def _wp(iid):
        it = ITEMS.get(iid) or {}
        return it if it.get("dmg") else None
    main = _wp(eq.get("hand_r"))
    off = _wp(eq.get("hand_l"))
    if not main and off:          # so a mao esquerda tem arma -> ela e a principal
        main, off = off, None
    dmg = dict(main["dmg"]) if main else None
    rng = int(main.get("rng", 1)) if main else 1
    offhand = {"n": int(off["dmg"]["n"]), "d": int(off["dmg"]["d"])} if off else None     # 2a arma: so os dados (sem o bonus fixo)

    for _slot, iid in eq.items():                   # CA/atk/poder/bloqueio de TUDO equipado
        it = ITEMS.get(iid)
        if not it:
            continue
        ac += int(it.get("ac", 0))
        atk += int(it.get("atk", 0))
        spell_pow += int(it.get("spell_pow", 0))
        spell_hit += int(it.get("spell_hit", 0))             # +acerto/CD mágico (cajado/chapéu de caster)
        block += int(it.get("block", 0))
        armor += int(it.get("armor", 0))                     # mitigação (reduz dano por golpe)
        dodge += float(it.get("dodge", 0))                   # esquiva (anula o golpe)
        ward += int(it.get("ward", 0))                       # barreira arcana (absorve dano)
        mres += float(it.get("mres", 0))                     # resistência mágica (% no dano de magia)
        speed += int(it.get("speed", 0))                     # +deslocamento (Botas de Vargo)
        dmg_mult_add += float(it.get("dmg_mult", 0))         # +100% de dano (anel O Chamado de Atalech)
        dmg_flat_bonus += int(it.get("dmg_flat", 0))         # dano fixo por golpe (Botas de Vargo)
        for _im in (it.get("immune") or []):                 # imunidade a status (Botas de Vargo)
            if _im not in immune:
                immune.append(_im)
        if it.get("smoke"):
            smoke = True                                     # aura de fumaça preta (Botas de Vargo)
        if it.get("visual") == "shield":                     # CA do escudo (pro Combatente largar)
            shield_ac += int(it.get("ac", 0))
        for _ak, _av in (it.get("attr") or {}).items():      # +atributo (set Necrótico)
            attrs[_ak] = attrs.get(_ak, 0) + int(_av)
    if dmg_flat_bonus:                              # Botas de Vargo: soma dano fixo em todo golpe
        dmg = dict(dmg) if dmg else {"n": 0, "d": 1, "flat": 0}
        dmg["flat"] = int(dmg.get("flat", 0)) + dmg_flat_bonus
    return {"ac": ac, "atk": atk, "dmg": dmg, "spell_pow": spell_pow, "spell_hit": spell_hit,
            "block": block, "rng": rng, "offhand": offhand, "attrs": attrs, "shield_ac": shield_ac,
            "armor": armor, "dodge": round(dodge, 4), "ward": ward, "mres": round(mres, 4),
            "speed": speed, "immune": immune, "smoke": smoke,
            "dmg_mult": round(1.0 + dmg_mult_add, 3)}


# Kit inicial que a Robetina entrega (um por espaco, bem simples; sobra um anel).
STARTER_SET = ["touca_la", "cordao_fake", "ombreira_couro", "capa_puida",
               "camiseta_surrada", "faca_cozinha", "tampa_panela", "anel_lata",
               "calca_jeans", "chinelo"]


def grant_starter_set(bag):
    """Poe o kit inicial na mochila (lista de pilhas). Devolve a propria bag."""
    for iid in STARTER_SET:
        add_to_bag(bag, iid, 1)
    return bag


def shows_staff(item_id):
    """True se o item equipado deve fazer o personagem segurar um cajado."""
    it = ITEMS.get(item_id)
    return bool(it and it.get("visual") == "staff")


# ---------------------------------------------------------------- descrições
# LORE fixo dos itens icônicos (escrito à mão). Os demais ganham um sabor
# automático por categoria/classe/raridade, sempre seguido da linha mecânica.
ITEM_LORE = {
    # kit inicial da Robetina (humilde e honesto)
    "touca_la":        "Uma touca de lã que já aqueceu três gerações de cabeças azaradas.",
    "camiseta_surrada": "Puída nos ombros, rasgada na barra. Ainda assim, é sua.",
    "ombreira_couro":  "Um retalho de couro amarrado com barbante. Melhor que ombro nu.",
    "capa_puida":      "Já foi capa de alguém importante. Hoje só corta o vento dos ermos.",
    "calca_jeans":     "Um jeans surrado que atravessou mundos. Literalmente.",
    "chinelo":         "O calçado dos guerreiros humildes. Estala no chão e no destino.",
    "faca_cozinha":    "Afiada pra cebola, promovida a arma. Os ermos não julgam.",
    "tampa_panela":    "Escudo improvisado que já aparou pancada de marido e de monstro.",
    "anel_lata":       "Um anel de lasca de lata. Não vale nada, mas brilha se você acreditar.",
    "cordao_fake":     "Dourado por fora, decepção por dentro. Impressiona de longe.",
    "bornal_cria":     "A bolsa de quem cresceu se virando. Cabe pouco, aguenta tudo.",
    # moedas e poções
    "coin_bronze":     "A moeda miúda dos ermos. Com muitas delas, até o Goblin sorri.",
    "coin_silver":     "Prata honesta. Compra uma noite quente e uma refeição de verdade.",
    "coin_gold":       "Ouro puro. Nos ermos, quem tem ouro tem inimigos.",
    "pocao_vida":      "Um vidro rubro que fecha ferida e devolve o fôlego. O melhor amigo de quem apanha.",
    # armas icônicas de caster
    "staff_portuz":    "O cajado do velho Portuz, entalhado em madeira de raio. Ainda estala faísca.",
    "cajado_magico":   "Um cajado de aprendiz com o verniz gasto de tanto conjurar.",
    # troféus do Descampado e da mata
    "rabo_rato":       "Rabo de rato gigante. Nojento, mas o Goblin paga sem perguntar.",
    "presa_lobo":      "Presa amarelada de lobo. Nos ermos, vira colar de valentia.",
    "pelego_lobo":     "Pelego cinza e quente. Forra bota, sela e orgulho de caçador.",
    "presa_javali":    "Presa curva de javali. Já rasgou canela de gente distraída.",
    "couro_javali":    "Couro grosso de javali, cheio de cicatriz. Bom pra remendo.",
    "presa_velho_bob": "A presa quebrada do Velho Bob. O patriarca caiu, a lenda ficou.",
    "couro_velho_bob": "O couro grisalho do javali mais velho dos ermos. Pesa história.",
    "couro_lobo_negro": "Couro negro que engole a luz. Os caçadores pagam bem pelo medo.",
    "marreta_velha":   "Uma marreta de obra que trocou o cimento pelo crânio alheio.",
    "correntao_ouro":  "O cordão do Maurão. Grosso, dourado e pesado de ostentação.",
    "microfone_patrao": "O microfone do baile do QG. Ainda ecoa o grave da Sapopemba.",
    # troféus do Repouso e do cemitério
    "pena_harpia":     "Pena longa de harpia, leve como um mau agouro.",
    "dedo_bruxa":      "Um dedo ressecado que ainda aponta pra onde não se deve ir.",
    "ectoplasma":      "Gosma fria de assombração. Escorre devagar, como um suspiro preso.",
    "veu_assombracao": "Um véu que flutua sozinho quando ninguém olha.",
    "cinza_espectral": "Cinza que não esquenta nem esfria. Restos de alguém que insiste.",
    "essencia_sombria": "Um frasco de escuridão condensada. Não abra perto de vela.",
    "lamento_petrificado": "Um grito que virou pedra. Segure longe do ouvido.",
    "lagrima_da_dama": "Uma lágrima cristalizada da Dama. Quem a vende, sonha com ela por semanas.",
    "olho_basilisco":  "O olho que petrificava. Agora só encara, parado, quem o carrega.",
    "veneno_naja":     "Peçonha dourada de naja tumular. Uma gota mata um boi.",
    "carne_putrida":   "Carne que os carniçais disputavam. O cheiro chega antes de você.",
    "osso_amaldicoado": "Um osso que range sozinho nas noites frias. Vende logo.",
    # caça da Floresta do Ermo
    "pele_macia":      "Pele macia de caça miúda. Forra luva, capuz e berço de criança.",
    "couro_selvagem":  "Couro firme de veado dos ermos. O curtidor paga sorrindo.",
    "galhada":         "Galhada de cervo em ponto de troféu. Enfeita taverna e rende bronze.",
    "couro_urso":      "Couro espesso de urso. Uma manta dele atravessa qualquer inverno.",
}

# sabor automático por CLASSE (sets: set_<classe>_<peça>)
CLASS_FLAVOR = {
    "barbaro":     "Forjado para a fúria: os bárbaros vestem pouco e quebram muito.",
    "guerreiro":   "Aço de linha de frente, batido para quem segura a batalha no peito.",
    "paladino":    "Consagrado nos altares de Valíria, brilha contra o que é profano.",
    "ladino":      "Costurado para o silêncio. Quem ouve um ladino já morreu.",
    "monge":       "Leve como a respiração. O corpo é a arma, isto é só o invólucro.",
    "patrulheiro": "Curtido em trilha e chuva, no tom exato da mata ao entardecer.",
    "mago":        "Tecido com fios de conhecimento. Cheira a pergaminho antigo.",
    "feiticeiro":  "Pulsa de leve, como se lembrasse da linhagem de quem o veste.",
    "bruxo":       "Um sussurro do patrono vive costurado na bainha. Ele escuta.",
    "bardo":       "Elegante o bastante pro palco, resistente o bastante pra fuga.",
    "clerigo":     "Ungido com óleo e fé. Protege o corpo enquanto a prece protege a alma.",
    "druida":      "Fibra, osso e folha trançados. A mata reconhece quem o veste.",
}

# pools de sabor por categoria (escolha determinística pelo id: mesma frase sempre)
_FLAVOR = {
    "weapon_low": [
        "Ferro honesto de forja de beira de estrada.",
        "Já viu mais brigas de taverna que campos de batalha.",
        "Simples, gasto e confiável, como as coisas dos ermos.",
        "O fio é irregular, mas corta o que precisa cortar.",
    ],
    "weapon_high": [
        "Aço que já provou sangue de coisa que não devia existir.",
        "Forjado por mãos que sabiam que o mundo é perigoso.",
        "Equilíbrio perfeito: a arma quase decide sozinha onde acertar.",
        "Há runas finas no metal que só aparecem sob a lua.",
    ],
    "shield": [
        "Cada marca nele é um golpe que não chegou em você.",
        "Pesado no braço, leve na consciência.",
        "Um bom escudo vale mais que um bom amigo. Este é bom.",
    ],
    "head": [
        "Protege as ideias, que nos ermos valem tanto quanto o crânio.",
        "Ajustado pra não escorregar na hora errada.",
    ],
    "chest": [
        "Guarda o coração, que é onde os ermos sempre miram.",
        "O peso no tronco que separa o susto do enterro.",
    ],
    "shoulder": [
        "Ombros firmes carregam mais que armadura.",
        "Apara o golpe que desce de cima, o favorito dos covardes.",
    ],
    "back": [
        "Corta o vento frio e esconde a silhueta na estrada.",
        "As costas de um andarilho contam a viagem inteira.",
    ],
    "legs": [
        "Pernas inteiras levam você pra casa. Cuide delas.",
        "Reforçado no joelho, onde a estrada cobra primeiro.",
    ],
    "feet": [
        "Sola firme pra lama, pedra e o que mais o chão inventar.",
        "Quem anda bem calçado foge melhor e chuta mais forte.",
    ],
    "ring": [
        "Um aro discreto com mais história que muita gente.",
        "Aperta de leve o dedo, como um lembrete.",
    ],
    "neck": [
        "Pende no peito e pesa exatamente o que promete.",
        "Um talismã contra o que os olhos não veem.",
    ],
    "trofeu": [
        "Espólio de caça dos ermos. Os mercadores pagam em bronze vivo.",
        "Prova de que a fera caiu. O resto é história de taverna.",
        "Troféu que se vende caro e se conta mais caro ainda.",
    ],
    "tesouro": [
        "Brilha com a promessa de bronze e o silêncio de quem o perdeu.",
        "Valioso demais pra carregar à mostra nos ermos.",
    ],
    "consumivel": [
        "Feito pra hora do aperto. Não deixe pra depois do golpe.",
    ],
}

def _auto_flavor(item_id, it):
    """Sabor determinístico: o mesmo item conta sempre a mesma historinha."""
    if item_id.startswith("set_"):
        parts = item_id.split("_")
        if len(parts) >= 2 and parts[1] in CLASS_FLAVOR:
            return CLASS_FLAVOR[parts[1]]
    k = it.get("kind")
    if k == "weapon":
        rare = it.get("rarity", "comum")
        pool = _FLAVOR["weapon_high"] if rare in ("raro", "epico", "lendario", "divino", "maldito") else _FLAVOR["weapon_low"]
    elif k == "armor":
        slot = it.get("slot")
        pool = _FLAVOR["shield"] if slot == "hand" else _FLAVOR.get(slot) or _FLAVOR["chest"]
    elif k in _FLAVOR:
        pool = _FLAVOR[k]
    else:
        return ""
    h = sum(ord(ch) for ch in item_id)
    return pool[h % len(pool)]


def describe(item_id):
    """Descrição do item: LORE (fixo ou automático) + linha mecânica dos atributos."""
    it = ITEMS.get(item_id) or {}
    if it.get("desc"):
        return it["desc"]
    k = it.get("kind"); d = it.get("dmg") or {}
    bits = []
    if k == "weapon":
        head = "Arma de mão."
        if d:
            base = "%dd%d" % (d.get("n", 1), d.get("d", 6))
            if d.get("flat"): base += "+%d" % d["flat"]
            bits.append("%s de dano" % base)
        if it.get("rng"):
            bits.append("à distância" if it["rng"] >= 50 else ("alcance %d" % it["rng"]))
        if it.get("atk"): bits.append("+%d para acertar" % it["atk"])
        if it.get("spell_pow"): bits.append("+%d de poder mágico" % it["spell_pow"])
        if it.get("spell_hit"): bits.append("+%d de acerto mágico" % it["spell_hit"])
        if it.get("ac"): bits.append("+%d de armadura" % it["ac"])
        if it.get("dmg_flat"): bits.append("+%d de dano fixo" % it["dmg_flat"])
    elif k == "armor":
        head = "Escudo." if it.get("slot") == "hand" else "Peça de armadura."
        if it.get("armor"): bits.append("mitiga até %d de dano por golpe" % it["armor"])
        if it.get("dodge"): bits.append("%d%% de esquiva" % round(it["dodge"] * 100))
        if it.get("ward"): bits.append("barreira absorve %d" % it["ward"])
        if it.get("mres"): bits.append("%d%% de resistência mágica" % round(it["mres"] * 100))
        if it.get("spell_pow"): bits.append("+%d de poder mágico" % it["spell_pow"])
        if it.get("block"): bits.append("bloqueia %d de dano por golpe" % it["block"])
        if it.get("ac"): bits.append("+%d de armadura" % it["ac"])
        if it.get("atk"): bits.append("+%d para acertar" % it["atk"])
        if it.get("speed"): bits.append("+%d de deslocamento" % it["speed"])
    elif k == "consumivel":
        head = "Consumível."
        if it.get("heal"): bits.append("cura %d%% da vida" % int(it["heal"] * 100))
    elif k == "currency":
        return ITEM_LORE.get(item_id, "Moeda do Ermo.")
    else:
        head = it.get("name", "Item")
    rare = it.get("rarity")
    tail = (" Raridade: %s." % rare) if rare and rare != "comum" else ""
    lore = ITEM_LORE.get(item_id) or _auto_flavor(item_id, it)
    mech = ((" ".join([", ".join(bits).capitalize()]) + ".") if bits else "")
    if lore:
        return lore + ((" " + mech) if mech else "") + tail
    return head + ((" " + mech) if mech else "") + tail


def catalog():
    """O que o cliente precisa pra nomear, desenhar, equipar e mostrar cada item."""
    return {
        k: {"name": v["name"], "kind": v["kind"],
            "stackable": v["stackable"], "color": v["color"],
            "equippable": "slot" in v, "slot": v.get("slot"),
            "visual": v.get("visual"), "rarity": v.get("rarity", "comum"),
            "ac": v.get("ac", 0), "atk": v.get("atk", 0), "dmg": v.get("dmg"),
            "spell_pow": v.get("spell_pow", 0), "spell_hit": v.get("spell_hit", 0), "block": v.get("block", 0), "rng": v.get("rng"),
            "armor": v.get("armor", 0), "dodge": v.get("dodge", 0),       # mitigação / esquiva (defesa Tibia)
            "ward": v.get("ward", 0), "mres": v.get("mres", 0),           # barreira arcana / resistência mágica
            "heal": v.get("heal"), "desc": describe(k), "protect": v.get("protect"),
            "animal": v.get("animal"), "value": v.get("value", 1),
            "sell_value": v.get("sell_value"), "couraria_only": v.get("couraria_only")}
        for k, v in ITEMS.items()
    }


def animal_trophies():
    """Itens vindos de criaturas animais (lobo, javali, etc.) que o Valdir compra na Couraria."""
    return [k for k, v in ITEMS.items() if v.get("animal")]


def death_protect_items():
    """Itens que a Xamã Miranda aceita por proteção contra a morte (id, protect%)."""
    return [(k, v["protect"]) for k, v in ITEMS.items() if v.get("protect")]


def starting_inventory():
    """Gancho pros itens iniciais. Por ora, mochila vazia."""
    return []


# Itens largados no chao: (x, y, item_id, segundos_pra_reaparecer).
# Espalhados perto do cruzamento central pra achar facil no teste.
GROUND_SPAWNS = [
    (49, 46, "coin_gold",    30),
    (49, 48, "coin_bronze",  30),
    (49, 54, "coin_silver",  30),
    (45, 50, "coin_bronze",  30),
    (47, 50, "coin_gold",    30),
    (53, 50, "coin_silver",  30),
]
# Nota: o Cajado do Portuz NAO fica mais no chao. Ele e unico do Portuz (1 so),
# nao dropa e nao respawna. Isso mata o farm que enchia a mochila de copias.


# --------------------------------------------------------------- a mochila

def add_to_bag(bag, item_id, qty=1):
    """Adiciona qty de item_id a bag (empilha se for empilhavel). Muta bag."""
    if not exists(item_id):
        return bag
    if is_stackable(item_id):
        for stack in bag:
            if stack.get("item") == item_id:
                stack["qty"] = int(stack.get("qty", 0)) + qty
                return bag
    bag.append({"item": item_id, "qty": qty})
    return bag


def remove_from_bag(bag, item_id, qty=1):
    """Tira qty de item_id da bag. Muta bag. Devolve True se conseguiu."""
    for i, stack in enumerate(bag):
        if stack.get("item") == item_id:
            have = int(stack.get("qty", 0))
            if have <= qty:
                bag.pop(i)
            else:
                stack["qty"] = have - qty
            return True
    return False

def count_in_bag(bag, item_id):
    """Quantos desse item tem na mochila (0 se nenhum)."""
    for st in (bag or []):
        if st.get("item") == item_id:
            return int(st.get("qty", 0))
    return 0



def sanitize_bag(raw):
    """Garante uma bag valida a partir do que veio do banco (JSONB)."""
    out = []
    if isinstance(raw, list):
        for s in raw:
            if not isinstance(s, dict) or not exists(s.get("item")):
                continue
            try:
                q = max(1, int(s.get("qty", 1)))
            except (TypeError, ValueError):
                q = 1
            item_id = s["item"]
            if is_stackable(item_id):
                found = next((t for t in out if t["item"] == item_id), None)
                if found:
                    found["qty"] += q
                    continue
            out.append({"item": item_id, "qty": q})
    return out


# Itens unicos: um jogador so pode ter 1, somando mochila + equipado.
UNIQUE_ITEMS = {"staff_portuz"}


def enforce_uniques(bag, equipment):
    """Garante no maximo 1 de cada item unico por jogador (mochila + equipado).
    Conserta contas que acumularam copias (ex.: o Portuz com 5 cajados).
    Devolve (bag_limpa, mudou)."""
    equipped = {v for v in (equipment or {}).values() if v}
    out, seen, changed = [], set(), False
    for stack in bag:
        item_id = stack.get("item")
        if item_id in UNIQUE_ITEMS:
            if item_id in equipped or item_id in seen:
                changed = True
                continue  # ja tem um (equipado ou na mochila): descarta a sobra
            seen.add(item_id)
            if int(stack.get("qty", 1)) != 1:
                stack = {"item": item_id, "qty": 1}
                changed = True
        out.append(stack)
    return out, changed


# ===========================================================================
#  SETS DE CLASSE — vendidos na Armas Peteco (Sapopemba), 3000 bronze/peca.
#  Cada classe tem arma correspondente + armadura completa (6 pecas). Armas
#  razoaveis (raro), abaixo do Cajado Magico lendario. Gerados por codigo.
# ===========================================================================
SHOP_PRICE = 3000          # preco fixo de qualquer peca da loja (puro money sink)
SHOP_SELL_RATE = 0.4       # o mercador paga 40% do valor ao COMPRAR de voce (lowball RE4)

# id_classe: (tema_do_nome, cor, arquetipo, (arma_nome, visual, dado_n, dado_d, atk, ac_extra))
_CLASS_GEAR = {
    "barbaro":     ("do Bárbaro",     "#9c4a2f", "pesada", ("Machado Brutal",        "sword", 1, 12, 1, 0)),
    "guerreiro":   ("do Guerreiro",   "#8a929c", "pesada", ("Espada Longa de Aço",   "sword", 1, 8,  2, 0)),
    "paladino":    ("do Paladino",    "#e6c66a", "pesada", ("Espada Consagrada",     "sword", 1, 8,  2, 1)),
    "clerigo":     ("do Clérigo",     "#e8e2cf", "pesada", ("Maça Abençoada",        "sword", 1, 8,  1, 1)),
    "patrulheiro": ("do Patrulheiro", "#5e7d4a", "media",  ("Arco Longo",            "bow",   1, 8,  2, 0)),
    "ladino":      ("do Ladino",      "#4a4753", "media",  ("Florete Afiado",        "knife", 1, 8,  2, 0)),
    "monge":       ("do Monge",       "#c8763a", "media",  ("Bastão de Combate",     "staff", 1, 8,  2, 0)),
    "druida":      ("do Druida",      "#6a7d3a", "media",  ("Cimitarra de Espinhos", "knife", 1, 6,  2, 0)),
    "bardo":       ("do Bardo",       "#c45a9c", "media",  ("Florete do Trovador",   "sword", 1, 8,  1, 0)),
    "mago":        ("do Mago",        "#5a7de0", "robe",   ("Cajado Arcano",         "staff", 1, 6,  2, 0)),
    "feiticeiro":  ("do Feiticeiro",  "#d0503a", "robe",   ("Cajado Dracônico",      "staff", 1, 6,  2, 0)),
    "bruxo":       ("do Bruxo",       "#8a4ad0", "robe",   ("Lâmina do Pacto",       "sword", 1, 8,  1, 0)),
}
# AC por peca em cada arquetipo de armadura
_ARQ = {
    "pesada": {"head": 1, "shoulder": 1, "back": 1, "chest": 3, "legs": 2, "feet": 1, "anome": "Placa"},
    "media":  {"head": 1, "shoulder": 1, "back": 0, "chest": 2, "legs": 1, "feet": 1, "anome": "Couro"},
    "robe":   {"head": 1, "shoulder": 1, "back": 1, "chest": 2, "legs": 1, "feet": 1, "anome": "Manto"},
}
_SLOT_VIS = {
    "head":     ("helmet",   "Elmo"),
    "shoulder": ("pauldron", "Ombreira"),
    "back":     ("cloak",    "Capa"),
    "chest":    ("shirt",    "Peitoral"),
    "legs":     ("pants",    "Calça"),
    "feet":     ("sandal",   "Botas"),
}

SHOP_SETS = []          # [{"class_id":..., "items":[ids na ordem arma->botas]}]
SHOP_ITEMS = set()      # todos os ids que a loja vende (pra validar compra)
_SHIELD_AC = {"pesada": 3, "media": 2}   # escudo: arquetipos marciais (robe nao usa)

# === SISTEMA DE DEFESA estilo Tibia (mitigação / esquiva / ward) =============
# Em vez de empilhar CA, cada arquétipo defende do seu jeito:
#   pesada -> ARMADURA alta (cada golpe leva uma mitigação aleatória metade-total) + bloqueio do escudo
#   media  -> ARMADURA baixa + ESQUIVA (chance de ANULAR o golpe)
#   robe   -> WARD (barreira que absorve dano) + RESISTÊNCIA MÁGICA (% no dano de magia)
# Os totais abaixo são do SET COMPLETO (calibrados pra equivaler ao poder de hoje:
# paladino full goblin toma ~4/turno do Varth como antes); distribuídos por peça.
_DEF = {   # tier -> {pa:armadura pesada, ma:armadura media, md:esquiva media,
           #          ra:armadura robe, rw:ward robe, rm:resist. mágica robe}
    "set":   {"pa": 2,  "ma": 1,  "md": 0.05, "ra": 2,  "rw": 4,  "rm": 0.05},
    "t1":    {"pa": 5,  "ma": 3,  "md": 0.12, "ra": 4,  "rw": 9,  "rm": 0.15},
    "t2":    {"pa": 12, "ma": 6,  "md": 0.20, "ra": 7,  "rw": 16, "rm": 0.25},
    "t3":    {"pa": 26, "ma": 13, "md": 0.28, "ra": 13, "rw": 28, "rm": 0.38},
    "necro": {"pa": 58, "ma": 26, "md": 0.38, "ra": 18, "rw": 42, "rm": 0.50},
}
# CHAPÉU do caster (robe): +poder mágico (somado no dano de TODA magia), crescente por tier.
_HEAD_POW = {"set": 1, "t1": 2, "t2": 4, "t3": 8, "necro": 12}
# REBALANCE OFENSIVO DO CASTER: a magia precisa ACERTAR como a espada e BATER forte
# (glass cannon: compensa em dano o que o caster perde em sobrevivência).
# +acerto/CD mágico do equipamento por tier (conserta a mira que não escalava com o gear):
_CASTER_HIT = {"set": 3, "t1": 5, "t2": 9, "t3": 10, "necro": 11}
# poder mágico TOTAL alvo por tier (arma + chapéu). A ARMA carrega o total menos o que o chapéu já dá.
_CASTER_POW_TOTAL = {"set": 3, "t1": 13, "t2": 46, "t3": 84, "necro": 150}
def _caster_weapon_pow(tierkey):
    return max(0, _CASTER_POW_TOTAL.get(tierkey, 0) - _HEAD_POW.get(tierkey, 0))
# DRUIDA: caster de batalha (forma humana = mago). ~85% do poder de um manto puro (ele é
# média/mais tankudo e tem as formas), tudo na arma (druida não usa chapéu de robe).
def _druida_weapon_pow(tierkey):
    return int(round(0.85 * _CASTER_POW_TOTAL.get(tierkey, 0)))
def _split_int(total, arch):
    """Distribui um total inteiro pelas 6 peças conforme o peso do arquétipo (peitoral pega o resto)."""
    w = _ARQ[arch]; slots = ("head", "shoulder", "back", "chest", "legs", "feet")
    sw = sum(w[s] for s in slots) or 1
    out = {s: 0 for s in slots}
    if total <= 0:
        return out
    acc = 0
    for s in slots:
        if s == "chest":
            continue
        out[s] = int(round(total * w[s] / sw)); acc += out[s]
    out["chest"] = max(0, total - acc)
    return out
def _piece_defense(arch, slot, tierkey):
    """Defesa (armadura/esquiva/ward/resist) de UMA peça conforme arquétipo + tier."""
    D = _DEF.get(tierkey, _DEF["set"])
    w = _ARQ[arch]; slots = ("head", "shoulder", "back", "chest", "legs", "feet")
    sw = sum(w[s] for s in slots) or 1
    frac = w[slot] / sw
    out = {}
    if arch == "pesada":
        a = _split_int(D["pa"], arch).get(slot, 0)
        if a: out["armor"] = a
    elif arch == "media":
        a = _split_int(D["ma"], arch).get(slot, 0)
        if a: out["armor"] = a
        dg = D["md"] * frac
        if dg > 0: out["dodge"] = round(dg, 4)
    elif arch == "robe":
        a = _split_int(D["ra"], arch).get(slot, 0)
        if a: out["armor"] = a
        wd = _split_int(D["rw"], arch).get(slot, 0)
        if wd: out["ward"] = wd
        mr = D["rm"] * frac
        if mr > 0: out["mres"] = round(mr, 4)
        if slot == "head":                     # o CHAPÉU do caster reforça a magia (+dano), crescente por tier
            out["spell_pow"] = _HEAD_POW.get(tierkey, _HEAD_POW["set"])
    return out

# Classes que FOCAM EM MAGIA: a arma vira modesta, mas o equipamento da +poder
# magico (somado no dano de TODA magia). As marciais batem forte na arma.
CASTER_CLASSES = {"mago", "feiticeiro", "bruxo", "clerigo", "druida", "bardo"}
# Casters de MANTO (robe): frágeis -> glass cannon (dano mágico ALTO). Os outros casters
# (clérigo pesada, druida/bardo média) são tankudos -> poder mágico MODESTO (princípio: dano compensa fragilidade).
ROBE_CASTERS = {"mago", "feiticeiro", "bruxo"}
# Armas que atacam o ataque basico A DISTANCIA: classe -> alcance em tiles
# (arco = livre/combate todo; cajado de conjurador = medio).
RANGED_RANGE = {"patrulheiro": 99, "mago": 6, "feiticeiro": 6}
# Classes que ganham +poder magico no equipamento (os casters + o paladino hibrido,
# que bate forte na arma E reforca as magias/castigo).
POW_CLASSES = CASTER_CLASSES | {"paladino"}
# Classes que podem usar DUAS ARMAS (uma em cada mao): marciais ageis. Trocam o
# escudo (defesa) por uma segunda arma (mais dano). Casters/paladino/clerigo nao.
DUAL_WIELD_CLASSES = {"guerreiro", "barbaro", "ladino", "patrulheiro", "monge"}

def _gen_class_sets():
    """Set BASE (Armas Peteco), raridade COMUM. Arma = dado da classe. Escudo pros
    arquetipos marciais (com bloqueio). Casters comecam sem +poder magico (vem nos tiers)."""
    for cid, (tema, cor, arq, weap) in _CLASS_GEAR.items():
        wn, wvis, dn, dd, watk, wac = weap
        ids = []
        wid = "set_%s_arma" % cid
        ITEMS[wid] = {"name": wn, "kind": "weapon", "stackable": False, "color": cor,
                      "slot": "hand", "visual": wvis, "rarity": "comum",
                      "dmg": {"n": dn, "d": dd}, "atk": watk, "value": SHOP_PRICE}
        if cid in ROBE_CASTERS:                         # manto (frágil): poder mágico base + acerto
            ITEMS[wid]["spell_pow"] = _caster_weapon_pow("set")
            ITEMS[wid]["spell_hit"] = _CASTER_HIT["set"]
        elif cid == "druida":                           # druida (caster de batalha): poder forte + acerto
            ITEMS[wid]["spell_pow"] = _druida_weapon_pow("set")
            ITEMS[wid]["spell_hit"] = _CASTER_HIT["set"]
        elif cid in CASTER_CLASSES:                     # clérigo/bardo (tankudos): só acerto mágico
            ITEMS[wid]["spell_hit"] = _CASTER_HIT["set"]
        if cid in RANGED_RANGE:
            ITEMS[wid]["rng"] = RANGED_RANGE[cid]
        ids.append(wid)
        a = _ARQ[arq]
        for slot in ("head", "shoulder", "back", "chest", "legs", "feet"):
            vis, slabel = _SLOT_VIS[slot]
            iid = "set_%s_%s" % (cid, slot)
            piece = {"name": "%s %s" % (slabel, tema), "kind": "armor", "stackable": False,
                     "color": cor, "slot": slot, "visual": vis, "rarity": "comum",
                     "value": SHOP_PRICE}
            piece.update(_piece_defense(arq, slot, "set"))
            ITEMS[iid] = piece
            ids.append(iid)
        if arq in _SHIELD_AC:
            sidh = "set_%s_escudo" % cid
            ITEMS[sidh] = {"name": "Escudo %s" % tema, "kind": "armor", "stackable": False,
                           "color": cor, "slot": "hand", "visual": "shield", "rarity": "comum",
                           "block": 2, "value": SHOP_PRICE}
            ids.append(sidh)
        SHOP_SETS.append({"class_id": cid, "items": ids})
        SHOP_ITEMS.update(ids)

_gen_class_sets()
# ===========================================================================
#  3 MERCADORES PREMIUM (Mascate/Nomade/Coveiro): equipamento escalado por mapa
#  E por classe. MARCIAL: a arma multiplica os dados (3/6/9) + dano fixo, e a CA
#  sobe. CASTER: a arma fica modesta (1/2/3 dados) mas o equipamento da +PODER
#  MAGICO, somado no dano de toda magia. Escudo ganha BLOQUEIO (reduz o dano de
#  cada golpe). SEM lendario: o topo (Coveiro) e epico/roxo, drop de chefe que e lendario.
# ===========================================================================
TIER_SETS = {}    # prefixo -> [{"class_id", "items":[ids]}]
TIER_ITEMS = {}   # prefixo -> set(ids vendidos)
TIER_PRICE = {}   # prefixo -> preco por peca
TIER_LABEL = {}   # prefixo -> rotulo da loja
# por tier: (prefixo, sufixo, raridade, preco,
#            MARCIAL: mult_dados, dano_fixo, +atk, +CA/peca,
#            CASTER:  mult_dados, +poder_magico, +atk,
#            ESCUDO:  bloqueio)
_TIERS = [
    ("t1", "do Ermo",   "incomum", 30000,   3,  2,  5,  1,    1,  3,  2,    4),
    ("t2", "das Dunas", "raro",    90000,   6,  5, 10,  2,    2,  6,  4,    6),
    ("t3", "Sepulcral", "epico",   270000,  9, 15, 18,  4,    3, 16,  6,   12),
]
def _gen_tier_sets():
    for (pfx, suf, rar, price, mdice, mflat, matk, acb,
         cdice, cpow, catk, sblock) in _TIERS:
        sets = []; ids_all = set()
        for cid, (tema, cor, arq, weap) in _CLASS_GEAR.items():
            wn, wvis, dn, dd, watk, wac = weap
            caster = cid in CASTER_CLASSES
            ids = []
            wid = "%s_%s_arma" % (pfx, cid)
            wdmg = {"n": (cdice if caster else mdice), "d": dd}
            if (not caster) and mflat:
                wdmg["flat"] = mflat
            W = {"name": "%s %s" % (wn, suf), "kind": "weapon", "stackable": False,
                 "color": cor, "slot": "hand", "visual": wvis, "rarity": rar,
                 "dmg": wdmg, "atk": watk + (catk if caster else matk), "value": price}
            if cid in ROBE_CASTERS:                     # manto (frágil): poder mágico ALTO + acerto (glass cannon)
                W["spell_pow"] = _caster_weapon_pow(pfx)
                W["spell_hit"] = _CASTER_HIT.get(pfx, 0)
            elif cid == "druida":                       # druida (caster de batalha): forte + acerto
                W["spell_pow"] = _druida_weapon_pow(pfx)
                W["spell_hit"] = _CASTER_HIT.get(pfx, 0)
            elif cid in CASTER_CLASSES:                 # clérigo/bardo (tankudos): poder MODESTO + acerto
                W["spell_pow"] = cpow
                W["spell_hit"] = _CASTER_HIT.get(pfx, 0)
            elif (cid in POW_CLASSES) and cpow:          # paladino híbrido: poder mágico modesto (Castigo Divino)
                W["spell_pow"] = cpow
            if cid in RANGED_RANGE:
                W["rng"] = RANGED_RANGE[cid]
            ITEMS[wid] = W
            ids.append(wid)
            a = _ARQ[arq]
            for slot in ("head", "shoulder", "back", "chest", "legs", "feet"):
                vis, slabel = _SLOT_VIS[slot]
                iid = "%s_%s_%s" % (pfx, cid, slot)
                piece = {"name": "%s %s %s" % (slabel, tema, suf), "kind": "armor",
                         "stackable": False, "color": cor, "slot": slot, "visual": vis,
                         "rarity": rar, "value": price}
                piece.update(_piece_defense(arq, slot, pfx))
                ITEMS[iid] = piece
                ids.append(iid)
            if arq in _SHIELD_AC:
                sidh = "%s_%s_escudo" % (pfx, cid)
                ITEMS[sidh] = {"name": "Escudo %s %s" % (tema, suf), "kind": "armor",
                               "stackable": False, "color": cor, "slot": "hand", "visual": "shield",
                               "rarity": rar, "block": sblock, "value": price}
                ids.append(sidh)
            sets.append({"class_id": cid, "items": ids}); ids_all.update(ids)
        TIER_SETS[pfx] = sets; TIER_ITEMS[pfx] = ids_all; TIER_PRICE[pfx] = price
_gen_tier_sets()
TIER_LABEL = {"t1": "Mascate Errante", "t2": "Nômade Raiz", "t3": "Coveiro Mórbido"}

# atributo principal de cada classe (pro bonus do set Necrótico)
_CLASS_ATTR = {
    "barbaro": "FOR", "guerreiro": "FOR", "paladino": "CON",
    "ladino": "DES", "monge": "DES", "patrulheiro": "DES",
    "mago": "INT", "feiticeiro": "CAR", "bruxo": "CAR", "bardo": "CAR",
    "clerigo": "SAB", "druida": "SAB",
}

def _gen_necrotico_set():
    """O set Necrótico da Goblin do Cofre (escondida na câmara de Varth): armadura/
    escudo UM tier acima do Coveiro (t3), ARMA DOIS tiers acima, e TODA peça soma
    +2 no atributo principal da classe. Continua épico (roxo, igual ao Coveiro).
    Prefixo 'Necrótico' no nome. Custa 800.000 de bronze + 5 Símbolos de Varth a peça."""
    pfx, suf, rar, price = "necro", "Necrótico", "epico", 800000
    # ARMA (2 tiers acima de t3): dano e acerto bem altos
    w_mdice, w_mflat, w_matk = 15, 35, 34      # marcial: dados, dano fixo, +acerto
    w_cdice, w_cpow, w_catk = 5, 40, 14        # caster: dados, +poder mágico, +acerto
    acb, sblock = 6, 16                         # armadura/escudo (1 tier acima)
    attr_bonus = 2                             # +2 no atributo da classe na ARMA e no PEITORAL (+4 total, não em cada peça)
    sets = []; ids_all = set()
    for cid, (tema, cor, arq, weap) in _CLASS_GEAR.items():
        wn, wvis, dn, dd, watk, wac = weap
        caster = cid in CASTER_CLASSES
        attr = _CLASS_ATTR.get(cid, "FOR")
        ids = []
        wid = "necro_%s_arma" % cid
        wdmg = {"n": (w_cdice if caster else w_mdice), "d": dd}
        if (not caster) and w_mflat:
            wdmg["flat"] = w_mflat
        W = {"name": "%s %s" % (suf, wn), "kind": "weapon", "stackable": False,
             "color": cor, "slot": "hand", "visual": wvis, "rarity": rar,
             "dmg": wdmg, "atk": watk + (w_catk if caster else w_matk), "value": price,
             "attr": {attr: attr_bonus}}
        if cid in ROBE_CASTERS:                         # manto (frágil): poder mágico altíssimo + acerto (glass cannon)
            W["spell_pow"] = _caster_weapon_pow("necro")
            W["spell_hit"] = _CASTER_HIT["necro"]
        elif cid == "druida":                           # druida (caster de batalha): forte + acerto
            W["spell_pow"] = _druida_weapon_pow("necro")
            W["spell_hit"] = _CASTER_HIT["necro"]
        elif cid in CASTER_CLASSES:                     # clérigo/bardo (tankudos): poder MODESTO + acerto
            W["spell_pow"] = w_cpow
            W["spell_hit"] = _CASTER_HIT["necro"]
        elif (cid in POW_CLASSES) and w_cpow:            # paladino híbrido: poder mágico modesto (Castigo Divino)
            W["spell_pow"] = w_cpow
        if cid in RANGED_RANGE:
            W["rng"] = RANGED_RANGE[cid]
        ITEMS[wid] = W; ids.append(wid)
        a = _ARQ[arq]
        for slot in ("head", "shoulder", "back", "chest", "legs", "feet"):
            vis, slabel = _SLOT_VIS[slot]
            iid = "necro_%s_%s" % (cid, slot)
            it = {"name": "%s %s %s" % (suf, slabel, tema), "kind": "armor",
                  "stackable": False, "color": cor, "slot": slot, "visual": vis,
                  "rarity": rar, "value": price}
            it.update(_piece_defense(arq, slot, "necro"))
            if slot == "chest":                       # so o peitoral concede atributo (+ a arma) = +4 no total
                it["attr"] = {attr: attr_bonus}
            ITEMS[iid] = it
            ids.append(iid)
        if arq in _SHIELD_AC:
            sidh = "necro_%s_escudo" % cid
            ITEMS[sidh] = {"name": "%s Escudo %s" % (suf, tema), "kind": "armor",
                           "stackable": False, "color": cor, "slot": "hand", "visual": "shield",
                           "rarity": rar, "block": sblock,
                           "value": price}
            ids.append(sidh)
        sets.append({"class_id": cid, "items": ids}); ids_all.update(ids)
    TIER_SETS["necro"] = sets; TIER_ITEMS["necro"] = ids_all; TIER_PRICE["necro"] = price
    TIER_LABEL["necro"] = "Goblin do Cofre"
_gen_necrotico_set()

# todos os ids vendidos pelos mercadores (pra validar compra)
ALL_TIER_ITEMS = set().union(*TIER_ITEMS.values())




# ===========================================================================
#  CONVERSÃO TIBIA: toda arma do catálogo ganha classe de skill (wclass),
#  Atk e Def no padrão Tibia, derivados dos dados antigos. Arcos passam a
#  usar flechas. Escudos ganham Def alto (defendem no lugar da arma).
# ===========================================================================
def _guess_wclass(iid, i):
    nome = (i.get("name", "") + " " + iid).lower()
    vis = i.get("visual", "")
    if any(t in nome for t in ("machado",)):
        return "axe"
    if vis == "hammer" or any(t in nome for t in ("martelo", "maça", "maca_", "clava",
                                                  "porrete", "mangual", "marreta")):
        return "club"
    if vis == "staff" or any(t in nome for t in ("cajado", "báculo", "baculo", "bastão", "bastao")):
        return "club"
    if vis == "bow" or any(t in nome for t in ("arco", "besta")):
        return "distance"
    if any(t in nome for t in ("lança", "lanca", "azagaia", "tridente", "arpão", "arpao")):
        return "distance"
    if any(t in nome for t in ("soco", "manopla", "punho")):
        return "fist"
    return "sword"


for _iid, _i in list(ITEMS.items()):
    if _i.get("kind") != "weapon":
        if "escudo" in (_i.get("name", "") + _iid).lower() and not _i.get("def"):
            _i["def"] = max(14, min(38, int(_i.get("value", 1000)) // 400 + 12))
            _i["wclass"] = "shield"
            _i["atk"] = 0
        continue
    if _i.get("wclass"):
        continue                       # as novas já vêm prontas
    d = _i.get("dmg") or {"n": 1, "d": 6, "flat": 0}
    avg = d.get("n", 1) * (d.get("d", 6) + 1) / 2.0 + d.get("flat", 0)
    _i["wclass"] = _guess_wclass(_iid, _i)
    _i["atk"] = max(7, min(60, int(round(7 + avg * 0.75))))
    _i["def"] = max(4, int(_i["atk"] * 0.6)) if _i["wclass"] != "distance" else max(2, int(_i["atk"] * 0.15))
    if _i["wclass"] == "distance" and _i.get("visual") == "bow" and not _i.get("ammo"):
        _i["ammo"] = "flecha"
        _i["range"] = _i.get("range", 5)
    elif _i["wclass"] == "distance" and not _i.get("range"):
        _i["range"] = 4


# ===========================================================================
#  FORJA DO BRAGAN: variantes +1/+2/+3 geradas do catálogo (nunca dropam:
#  só nascem na bigorna). Stats sobem 15%% / 30%% / 50%% com ganho mínimo.
# ===========================================================================
_FORGE_MULT = {1: 1.15, 2: 1.30, 3: 1.50}


def _forge_variants():
    base = [(iid, i) for iid, i in list(ITEMS.items())
            if i.get("kind") in ("weapon", "armor", "trinket")
            and int(i.get("value", 0)) >= 500 and not i.get("stackable")]
    for iid, i in base:
        for n, mult in _FORGE_MULT.items():
            v = dict(i)
            v["name"] = "%s +%d" % (i.get("name", iid), n)
            v["value"] = int(int(i.get("value", 0)) * (1 + 0.4 * n))
            v["forged"] = n
            v["base"] = iid
            if isinstance(i.get("dmg"), dict):
                d = dict(i["dmg"])
                d["flat"] = int(round(d.get("flat", 0) * mult)) + n * 2
                v["dmg"] = d
            for st in ("atk", "armor", "ward", "spell_pow", "dmg_flat", "def"):
                if i.get(st):
                    v[st] = max(int(round(int(i[st]) * mult)), int(i[st]) + n)
            yield "%s_p%d" % (iid, n), v


ITEMS.update(dict(_forge_variants()))


# ===========================================================================
#  DESCRIÇÕES TÉCNICAS AUTOGERADAS: toda arma/munição/runa carrega a ficha.
# ===========================================================================
_WCLASS_PT = {"sword": "Espada", "axe": "Machado", "club": "Maça",
              "distance": "Distância", "fist": "Punhos", "shield": "Escudo"}
for _iid, _i in ITEMS.items():
    if _i.get("kind") == "weapon" and _i.get("wclass"):
        extra = " [Atk %d · Def %d · %s" % (int(_i.get("atk", 0)), int(_i.get("def", 0)),
                                            _WCLASS_PT.get(_i["wclass"], _i["wclass"]))
        if _i.get("ammo"):
            extra += " · usa %s" % (ITEMS.get(_i["ammo"], {}).get("name", _i["ammo"]))
        if _i.get("range"):
            extra += " · alcance %d" % int(_i["range"])
        extra += "]"
        if extra not in (_i.get("desc") or ""):
            _i["desc"] = (_i.get("desc") or "").rstrip() + extra
    elif _i.get("kind") == "municao":
        extra = " [Munição · Atk +%d]" % int(_i.get("atk_bonus", 0))
        if extra not in (_i.get("desc") or ""):
            _i["desc"] = (_i.get("desc") or "").rstrip() + extra
    elif _i.get("kind") == "runa":
        extra = " [Runa · exige Nível Mágico %d]" % int(_i.get("ml_req", 0))
        if extra not in (_i.get("desc") or ""):
            _i["desc"] = (_i.get("desc") or "").rstrip() + extra
    elif _i.get("wclass") == "shield":
        extra = " [Def %d · Escudo]" % int(_i.get("def", 0))
        if extra not in (_i.get("desc") or ""):
            _i["desc"] = (_i.get("desc") or "").rstrip() + extra
