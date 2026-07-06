"""
MAGIAS (camada C). Biblioteca por niveis (Fase 4 / Leva 1: truques + 1 a 3).
A infra de espacos (slots) ja escala ate o nivel 9 em leveling.py; aqui mora a
lista de magias e que classe aprende o que, conforme o nivel.

Cada magia: name, level (0 = truque), kind, range, e os dados do efeito.
  kind:
    'attack'  rolagem de ataque magico (d20 + bonus) vs CA; no acerto, dano.
    'save'    o alvo testa resistencia vs a CD; falhou sofre dano
              (save_effect 'half' = metade no sucesso, 'none' = nada no sucesso).
    'auto'    acerta automatico (ex.: Misseis Magicos), 'darts' dardos de dano.
    'heal'    cura o proprio conjurador.
    'mark'    concentra: marca um alvo; +mark_die de dano nos ataques contra ele.
    'buff'    concentra em si: +buff_die nas jogadas de ataque.
  range: 'melee' (alcance 1), 'ranged' (qualquer alvo do confronto) ou 'self'.

Truques escalam o numero de dados com o nivel do conjurador (1/5/11/17).
Magia de nivel gasta um espaco daquele nivel (ou maior).
"""

SPELLS = {
    # ====================== TRUQUES (nivel 0, a vontade) ======================
    "raio_de_fogo":      {"name": "Raio de Fogo", "level": 0, "kind": "attack", "range": "ranged", "dmg": {"n": 1, "d": 10}, "dtype": "fogo",
                          "desc": "Ataque mágico à distância. 1d10 de fogo (escala com o nível)."},
    "rajada_mistica":    {"name": "Rajada Mística", "level": 0, "kind": "attack", "range": "ranged", "dmg": {"n": 1, "d": 10}, "dtype": "energia",
                          "desc": "Ataque mágico à distância. 1d10 de energia (escala)."},
    "toque_chocante":    {"name": "Toque Chocante", "level": 0, "kind": "attack", "range": "melee", "dmg": {"n": 1, "d": 8}, "dtype": "raio",
                          "desc": "Toque elétrico. 1d8 de raio corpo a corpo (escala)."},
    "chama_sagrada":     {"name": "Chama Sagrada", "level": 0, "kind": "save", "save": "DES", "save_effect": "none", "range": "ranged", "dmg": {"n": 1, "d": 8}, "dtype": "radiante",
                          "desc": "O alvo testa Destreza ou sofre 1d8 radiante (escala)."},
    "chicote_espinhos":  {"name": "Chicote de Espinhos", "level": 0, "kind": "attack", "range": "ranged", "dmg": {"n": 1, "d": 6}, "dtype": "perfurante",
                          "desc": "Ataque mágico à distância. 1d6 perfurante (escala)."},
    "zombaria_viciosa":  {"name": "Zombaria Viciosa", "level": 0, "kind": "save", "save": "SAB", "save_effect": "none", "range": "ranged", "dmg": {"n": 1, "d": 4}, "dtype": "psíquico",
                          "desc": "O alvo testa Sabedoria ou sofre 1d4 psíquico (escala)."},
    "respingo_acido":    {"name": "Respingo Ácido", "level": 0, "kind": "save", "save": "DES", "save_effect": "none", "range": "ranged", "dmg": {"n": 1, "d": 6}, "dtype": "ácido",
                          "desc": "O alvo testa Destreza ou sofre 1d6 de ácido (escala)."},
    "sopro_gelido":      {"name": "Sopro Gélido", "level": 0, "kind": "save", "save": "CON", "save_effect": "none", "range": "ranged", "dmg": {"n": 1, "d": 6}, "dtype": "gelo",
                          "desc": "O alvo testa Constituição ou sofre 1d6 de gelo (escala)."},

    # =========================== MAGIAS DE NIVEL 1 ===========================
    "misseis_magicos":   {"name": "Mísseis Mágicos", "level": 1, "kind": "auto", "range": "ranged", "darts": 3, "dmg": {"n": 1, "d": 4, "flat": 1}, "dtype": "energia",
                          "desc": "3 dardos automáticos de 1d4+1 de energia."},
    "maos_flamejantes":  {"name": "Mãos Flamejantes", "level": 1, "kind": "save", "save": "DES", "save_effect": "half", "range": "ranged", "dmg": {"n": 3, "d": 6}, "dtype": "fogo",
                          "desc": "O alvo testa Destreza; 3d6 de fogo (metade no sucesso)."},
    "clarao_direcionador": {"name": "Clarão Direcionador", "level": 1, "kind": "attack", "range": "ranged", "dmg": {"n": 4, "d": 6}, "dtype": "radiante",
                          "desc": "Ataque mágico à distância. 4d6 radiante."},
    "raio_bruxas":       {"name": "Raio das Bruxas", "level": 1, "kind": "attack", "range": "ranged", "dmg": {"n": 1, "d": 12}, "dtype": "energia",
                          "desc": "Ataque mágico à distância. 1d12 de energia."},
    "investida_trovejante": {"name": "Investida Trovejante", "level": 1, "kind": "save", "save": "CON", "save_effect": "half", "range": "ranged", "dmg": {"n": 2, "d": 8}, "dtype": "trovão",
                          "desc": "O alvo testa Constituição; 2d8 de trovão (metade no sucesso)."},
    "sussurros_dissonantes": {"name": "Sussurros Dissonantes", "level": 1, "kind": "save", "save": "SAB", "save_effect": "half", "range": "ranged", "dmg": {"n": 3, "d": 6}, "dtype": "psíquico",
                          "desc": "O alvo testa Sabedoria; 3d6 psíquico (metade no sucesso)."},
    "inflingir_ferimentos": {"name": "Infligir Ferimentos", "level": 1, "kind": "attack", "range": "melee", "dmg": {"n": 3, "d": 10}, "dtype": "necrótico",
                          "desc": "Toque necrótico. 3d10 corpo a corpo no acerto."},
    "curar_ferimentos":  {"name": "Curar Ferimentos", "level": 1, "kind": "heal", "range": "self", "heal": {"n": 1, "d": 8, "mod": True},
                          "desc": "Cura 1d8 + modificador de conjuração."},
    "palavra_curativa":  {"name": "Palavra Curativa", "level": 1, "kind": "heal", "range": "self", "heal": {"n": 1, "d": 4, "mod": True},
                          "desc": "Cura 1d4 + modificador de conjuração."},
    "maldicao":          {"name": "Maldição", "level": 1, "kind": "mark", "range": "ranged", "mark_die": {"n": 1, "d": 6}, "dtype": "necrótico",
                          "desc": "Marca o alvo: +1d6 necrótico nos seus ataques contra ele."},
    "marca_cacador":     {"name": "Marca do Caçador", "level": 1, "kind": "mark", "range": "ranged", "mark_die": {"n": 1, "d": 6}, "dtype": "perfurante",
                          "desc": "Marca o alvo: +1d6 nos seus ataques contra ele."},
    "bencao":            {"name": "Bênção", "level": 1, "kind": "buff", "range": "self", "buff_die": {"n": 1, "d": 4},
                          "desc": "+1d4 nas suas jogadas de ataque (concentração)."},

    # =========================== MAGIAS DE NIVEL 2 ===========================
    "flecha_acida":      {"name": "Flecha Ácida", "level": 2, "kind": "attack", "range": "ranged", "dmg": {"n": 4, "d": 4}, "dtype": "ácido",
                          "desc": "Ataque mágico à distância. 4d4 de ácido."},
    "estilhacar":        {"area": 1, "name": "Estilhaçar", "level": 2, "kind": "save", "save": "CON", "save_effect": "half", "range": "ranged", "dmg": {"n": 3, "d": 8}, "dtype": "trovão",
                          "desc": "O alvo testa Constituição; 3d8 de trovão (metade no sucesso)."},
    "raio_lunar":        {"name": "Raio Lunar", "level": 2, "kind": "save", "save": "CON", "save_effect": "half", "range": "ranged", "dmg": {"n": 2, "d": 10}, "dtype": "radiante",
                          "desc": "O alvo testa Constituição; 2d10 radiante (metade no sucesso)."},
    "esfera_flamejante": {"area": 1, "name": "Esfera Flamejante", "level": 2, "kind": "save", "save": "DES", "save_effect": "half", "range": "ranged", "dmg": {"n": 2, "d": 6}, "dtype": "fogo",
                          "desc": "O alvo testa Destreza; 2d6 de fogo (metade no sucesso)."},
    "nuvem_adagas":      {"area": 1, "name": "Nuvem de Adagas", "level": 2, "kind": "save", "save": "DES", "save_effect": "half", "range": "ranged", "dmg": {"n": 4, "d": 4}, "dtype": "cortante",
                          "desc": "O alvo testa Destreza; 4d4 cortante (metade no sucesso)."},
    "arma_espiritual":   {"name": "Arma Espiritual", "level": 2, "kind": "attack", "range": "ranged", "dmg": {"n": 2, "d": 8}, "dtype": "energia",
                          "desc": "Ataque mágico à distância. 2d8 de energia."},

    # =========================== MAGIAS DE NIVEL 3 ===========================
    "bola_de_fogo":      {"area": 2, "name": "Bola de Fogo", "level": 3, "kind": "save", "save": "DES", "save_effect": "half", "range": "ranged", "dmg": {"n": 8, "d": 6}, "dtype": "fogo",
                          "desc": "O alvo testa Destreza; 8d6 de fogo (metade no sucesso)."},
    "relampago":         {"area": 1, "name": "Relâmpago", "level": 3, "kind": "save", "save": "DES", "save_effect": "half", "range": "ranged", "dmg": {"n": 8, "d": 6}, "dtype": "raio",
                          "desc": "O alvo testa Destreza; 8d6 de raio (metade no sucesso)."},
    "chamado_relampago": {"area": 1, "name": "Chamado do Relâmpago", "level": 3, "kind": "save", "save": "DES", "save_effect": "half", "range": "ranged", "dmg": {"n": 3, "d": 10}, "dtype": "raio",
                          "desc": "O alvo testa Destreza; 3d10 de raio (metade no sucesso)."},
    "tempestade_gelo":   {"area": 2, "name": "Tempestade de Gelo", "level": 3, "kind": "save", "save": "DES", "save_effect": "half", "range": "ranged", "dmg": {"n": 6, "d": 6}, "dtype": "gelo",
                          "desc": "O alvo testa Destreza; 6d6 de gelo (metade no sucesso)."},
    "toque_vampirico":   {"name": "Toque Vampírico", "level": 3, "kind": "attack", "range": "melee", "dmg": {"n": 3, "d": 6}, "dtype": "necrótico",
                          "desc": "Toque necrótico. 3d6 corpo a corpo no acerto."},

    # =========================== MAGIAS DE NIVEL 4 ===========================
    "esfera_vitriolica": {"area": 1, "name": "Esfera Vitriólica", "level": 4, "kind": "save", "save": "DES", "save_effect": "half", "range": "ranged", "dmg": {"n": 10, "d": 4}, "dtype": "ácido",
                          "desc": "O alvo testa Destreza; 10d4 de ácido (metade no sucesso)."},
    "murchar":           {"name": "Murchar", "level": 4, "kind": "save", "save": "CON", "save_effect": "half", "range": "ranged", "dmg": {"n": 8, "d": 8}, "dtype": "necrótico",
                          "desc": "O alvo testa Constituição; 8d8 necrótico (metade no sucesso)."},
    "invocar_relampagos": {"area": 1, "name": "Invocar Relâmpagos", "level": 4, "kind": "save", "save": "DES", "save_effect": "half", "range": "ranged", "dmg": {"n": 4, "d": 10}, "dtype": "raio",
                          "desc": "O alvo testa Destreza; 4d10 de raio (metade no sucesso)."},
    "confusao":          {"name": "Confusão", "level": 4, "kind": "control", "save": "SAB", "status": "stunned", "turns": 2, "range": "ranged", "dtype": "psíquico",
                          "desc": "O alvo testa Sabedoria ou fica confuso, perdendo 2 turnos."},

    # =========================== MAGIAS DE NIVEL 5 ===========================
    "cone_de_frio":      {"area": 2, "name": "Cone de Frio", "level": 5, "kind": "save", "save": "CON", "save_effect": "half", "range": "ranged", "dmg": {"n": 8, "d": 8}, "dtype": "gelo",
                          "desc": "O alvo testa Constituição; 8d8 de gelo (metade no sucesso)."},
    "nuvem_mortal":      {"area": 2, "name": "Nuvem Mortal", "level": 5, "kind": "control", "save": "CON", "save_effect": "half", "status": "poison", "turns": 3, "dot": {"n": 2, "d": 8}, "range": "ranged", "dmg": {"n": 5, "d": 8}, "dtype": "veneno",
                          "desc": "O alvo testa Constituição; 5d8 de veneno e, se falhar, envenenado (2d8/turno por 3 turnos)."},
    "imobilizar_monstro": {"name": "Imobilizar Monstro", "level": 5, "kind": "control", "save": "SAB", "status": "stunned", "turns": 3, "range": "ranged", "dtype": "energia",
                          "desc": "O alvo testa Sabedoria ou fica imóvel e indefeso por 3 turnos."},

    # =========================== MAGIAS DE NIVEL 6 ===========================
    "corrente_relampagos": {"area": 2, "name": "Corrente de Relâmpagos", "level": 6, "kind": "save", "save": "DES", "save_effect": "half", "range": "ranged", "dmg": {"n": 10, "d": 8}, "dtype": "raio",
                          "desc": "O alvo testa Destreza; 10d8 de raio (metade no sucesso)."},
    "desintegrar":       {"name": "Desintegrar", "level": 6, "kind": "save", "save": "DES", "save_effect": "none", "range": "ranged", "dmg": {"n": 10, "d": 6, "flat": 40}, "dtype": "energia",
                          "desc": "O alvo testa Destreza; 10d6+40 de energia pura (nada no sucesso)."},
    "circulo_da_morte":  {"name": "Círculo da Morte", "level": 6, "kind": "save", "save": "CON", "save_effect": "half", "range": "ranged", "dmg": {"n": 8, "d": 6}, "dtype": "necrótico",
                          "desc": "O alvo testa Constituição; 8d6 necrótico (metade no sucesso)."},

    # =========================== MAGIAS DE NIVEL 7 ===========================
    "dedo_da_morte":     {"name": "Dedo da Morte", "level": 7, "kind": "save", "save": "CON", "save_effect": "half", "range": "ranged", "dmg": {"n": 7, "d": 8, "flat": 30}, "dtype": "necrótico",
                          "desc": "O alvo testa Constituição; 7d8+30 necrótico (metade no sucesso)."},
    "explosao_tardia":   {"name": "Explosão Tardia", "level": 7, "kind": "save", "save": "DES", "save_effect": "half", "range": "ranged", "dmg": {"n": 12, "d": 6}, "dtype": "fogo",
                          "desc": "O alvo testa Destreza; 12d6 de fogo (metade no sucesso)."},
    "prisao_forca":      {"name": "Prisão de Força", "level": 7, "kind": "control", "save": "DES", "status": "restrained", "turns": 3, "range": "ranged", "dtype": "energia",
                          "desc": "O alvo testa Destreza ou fica preso por uma jaula de força por 3 turnos."},

    # =========================== MAGIAS DE NIVEL 8 ===========================
    "nuvem_incendiaria": {"name": "Nuvem Incendiária", "level": 8, "kind": "control", "save": "DES", "save_effect": "half", "status": "burning", "turns": 3, "dot": {"n": 2, "d": 6}, "range": "ranged", "dmg": {"n": 6, "d": 8}, "dtype": "fogo",
                          "desc": "O alvo testa Destreza; 6d8 de fogo e, se falhar, queimando (2d6/turno por 3 turnos)."},
    "explosao_solar":    {"name": "Explosão Solar", "level": 8, "kind": "control", "save": "CON", "save_effect": "half", "status": "blinded", "turns": 2, "range": "ranged", "dmg": {"n": 12, "d": 6}, "dtype": "radiante",
                          "desc": "O alvo testa Constituição; 12d6 radiante e, se falhar, cego por 2 turnos."},
    "palavra_atordoar":  {"name": "Palavra de Poder: Atordoar", "level": 8, "kind": "control", "save": "CON", "status": "stunned", "turns": 2, "range": "ranged", "dtype": "psíquico",
                          "desc": "O alvo testa Constituição ou fica atordoado por 2 turnos."},

    # =========================== MAGIAS DE NIVEL 9 ===========================
    "chuva_meteoros":    {"name": "Chuva de Meteoros", "level": 9, "kind": "save", "save": "DES", "save_effect": "half", "range": "ranged", "dmg": {"n": 20, "d": 6}, "dtype": "fogo",
                          "desc": "O alvo testa Destreza; 20d6 de fogo devastador (metade no sucesso)."},
    "palavra_morte":     {"name": "Palavra de Poder: Matar", "level": 9, "kind": "save", "save": "CON", "save_effect": "none", "range": "ranged", "dmg": {"n": 15, "d": 12}, "dtype": "necrótico",
                          "desc": "O alvo testa Constituição; 15d12 necrótico fatal (nada no sucesso)."},
    "aprisionamento":    {"name": "Aprisionamento", "level": 9, "kind": "control", "save": "SAB", "status": "stunned", "turns": 4, "range": "ranged", "dtype": "energia",
                          "desc": "O alvo testa Sabedoria ou é aprisionado, perdendo 4 turnos."},
}

# --- magias de ÁREA: estouram no ponto-alvo e atingem TODOS os inimigos no raio (em tiles).
# cada inimigo faz a propria salvaguarda; o dano e rolado uma vez e dividido pra quem passa.
_AOE_SPELLS = {
    "maos_flamejantes": 2, "investida_trovejante": 2,
    "estilhacar": 2, "raio_lunar": 1, "esfera_flamejante": 1, "nuvem_adagas": 1,
    "bola_de_fogo": 3, "relampago": 3, "chamado_relampago": 2, "tempestade_gelo": 2,
    "esfera_vitriolica": 2, "invocar_relampagos": 2,
    "cone_de_frio": 3, "circulo_da_morte": 3, "corrente_relampagos": 3,
    "explosao_tardia": 3, "chuva_meteoros": 4,
}
for _sid, _r in _AOE_SPELLS.items():
    if _sid in SPELLS:
        SPELLS[_sid]["aoe"] = _r

# atributo de conjuracao por classe
CASTING = {
    "mago": "INT", "clerigo": "SAB", "druida": "SAB", "patrulheiro": "SAB",
    "feiticeiro": "CAR", "bruxo": "CAR", "bardo": "CAR", "paladino": "CAR",
}

# preparadores escolhem da lista (mago/clerigo/druida/paladino); o resto conhece fixo.
# (a ESCOLHA de preparar e a distincao real vem na Leva 2; aqui o repertorio ja cresce.)
PREPARERS = {"mago", "clerigo", "druida", "paladino"}
KNOWERS = {"feiticeiro", "bruxo", "bardo", "patrulheiro"}

# lista da classe por nivel de magia (0 = truques). So conjuradores aparecem.
CLASS_LIST = {
    "mago": {
        0: ["raio_de_fogo", "toque_chocante", "respingo_acido"],
        1: ["misseis_magicos", "maos_flamejantes", "raio_bruxas"],
        2: ["flecha_acida", "estilhacar", "nuvem_adagas", "esfera_flamejante"],
        3: ["bola_de_fogo", "relampago", "tempestade_gelo", "toque_vampirico"],
        4: ["esfera_vitriolica", "confusao"],
        5: ["cone_de_frio", "imobilizar_monstro"],
        6: ["corrente_relampagos", "desintegrar"],
        7: ["explosao_tardia", "prisao_forca"],
        8: ["nuvem_incendiaria", "palavra_atordoar"],
        9: ["chuva_meteoros", "palavra_morte"],
    },
    "feiticeiro": {
        0: ["raio_de_fogo", "toque_chocante", "sopro_gelido"],
        1: ["misseis_magicos", "maos_flamejantes", "investida_trovejante"],
        2: ["estilhacar", "esfera_flamejante", "flecha_acida"],
        3: ["bola_de_fogo", "relampago", "tempestade_gelo"],
        4: ["esfera_vitriolica", "invocar_relampagos"],
        5: ["cone_de_frio", "nuvem_mortal"],
        6: ["corrente_relampagos", "desintegrar"],
        7: ["dedo_da_morte", "explosao_tardia"],
        8: ["explosao_solar"],
        9: ["chuva_meteoros"],
    },
    "bruxo": {
        0: ["rajada_mistica", "respingo_acido"],
        1: ["maldicao", "raio_bruxas"],
        2: ["flecha_acida", "nuvem_adagas"],
        3: ["toque_vampirico", "relampago"],
        4: ["murchar"],
        5: ["nuvem_mortal"],
    },
    "clerigo": {
        0: ["chama_sagrada"],
        1: ["curar_ferimentos", "palavra_curativa", "inflingir_ferimentos", "clarao_direcionador"],
        2: ["raio_lunar", "arma_espiritual"],
        3: ["chamado_relampago"],
        4: ["murchar"],
        5: ["nuvem_mortal"],
        6: ["circulo_da_morte"],
        7: ["dedo_da_morte"],
        8: ["explosao_solar"],
        9: ["palavra_morte"],
    },
    "druida": {
        0: ["chicote_espinhos", "sopro_gelido"],
        1: ["curar_ferimentos", "palavra_curativa", "investida_trovejante"],
        2: ["raio_lunar", "esfera_flamejante"],
        3: ["chamado_relampago", "tempestade_gelo"],
        4: ["invocar_relampagos"],
        5: ["cone_de_frio"],
        6: ["circulo_da_morte"],
        7: ["explosao_tardia"],
        8: ["nuvem_incendiaria"],
        9: ["chuva_meteoros"],
    },
    "bardo": {
        0: ["zombaria_viciosa"],
        1: ["curar_ferimentos", "palavra_curativa", "sussurros_dissonantes", "bencao"],
        2: ["estilhacar", "nuvem_adagas"],
        3: ["bola_de_fogo"],
        4: ["confusao"],
        5: ["imobilizar_monstro"],
        6: ["desintegrar"],
        7: ["prisao_forca"],
        8: ["palavra_atordoar"],
        9: ["aprisionamento"],
    },
    "paladino": {
        0: [],
        1: ["bencao", "curar_ferimentos"],
        2: ["arma_espiritual"],
        3: [],
        4: ["murchar"],
        5: ["circulo_da_morte"],
    },
    "patrulheiro": {
        0: [],
        1: ["marca_cacador", "curar_ferimentos"],
        2: ["raio_lunar"],
        3: [],
        4: ["invocar_relampagos"],
        5: ["cone_de_frio"],
    },
}

MAX_LIB_LEVEL = max((s["level"] for s in SPELLS.values()), default=0)   # ate onde a biblioteca vai hoje

# nivel maximo de magia conjuravel por nivel de personagem
_FULL_MAXSPELL = {1:1,2:1,3:2,4:2,5:3,6:3,7:4,8:4,9:5,10:5,11:6,12:6,13:7,14:7,15:8,16:8,17:9,18:9,19:9,20:9}
_HALF_MAXSPELL = {1:0,2:1,3:1,4:1,5:2,6:2,7:2,8:2,9:3,10:3,11:3,12:3,13:4,14:4,15:4,16:4,17:5,18:5,19:5,20:5}
_PACT_MAXSPELL = {1:1,2:1,3:2,4:2,5:3,6:3,7:4,8:4,9:5,10:5,11:5,12:5,13:5,14:5,15:5,16:5,17:5,18:5,19:5,20:5}
_FULL = {"mago", "clerigo", "druida", "bardo", "feiticeiro"}
_HALF = {"paladino", "patrulheiro"}


def max_spell_level(class_id, level):
    """Maior nivel de magia que a classe conjura naquele nivel de personagem."""
    level = max(1, min(20, int(level)))
    if class_id in _FULL:
        return _FULL_MAXSPELL.get(level, 0)
    if class_id in _HALF:
        return _HALF_MAXSPELL.get(level, 0)
    if class_id == "bruxo":
        return _PACT_MAXSPELL.get(level, 0)
    return 0


def is_caster(class_id):
    return class_id in CLASS_LIST


def get(spell_id):
    return SPELLS.get(spell_id)


def catalog():
    return SPELLS


def class_full_list(class_id):
    """Toda a lista da classe (todos os niveis presentes na biblioteca)."""
    return CLASS_LIST.get(class_id, {})


def for_class(class_id, level=1):
    """Repertorio disponivel agora: truques da classe + magias da lista ate o
    menor entre (nivel maximo de magia da classe) e (ate onde a biblioteca vai).
    Na Leva 1 expoe a lista inteira ate esse teto; os limites de conhecer/preparar
    entram na Leva 2."""
    cl = CLASS_LIST.get(class_id)
    if not cl:
        return {"cantrips": [], "spells": []}
    top = min(max_spell_level(class_id, level), MAX_LIB_LEVEL)
    cantrips = list(cl.get(0, []))
    spells = []
    for lv in range(1, top + 1):
        spells.extend(cl.get(lv, []))
    return {"cantrips": cantrips, "spells": spells}


# ===========================================================================
#  CONHECER x PREPARAR (Leva 2)
#  - preparadores (mago/clerigo/druida/paladino): conhecem a lista inteira da
#    classe e PREPARAM um numero = mod + nivel (paladino: mod + nivel//2).
#  - conhecedores (feiticeiro/bardo/bruxo/patrulheiro): CONHECEM um numero fixo
#    que cresce com o nivel (tabela). Truques sempre sao "conhecidos".
# ===========================================================================
def _amod(score):
    return (int(score) - 10) // 2


def caster_kind(class_id):
    if class_id in PREPARERS:
        return "prepare"
    if class_id in KNOWERS:
        return "know"
    return None


_CANTRIP_BASE = {"feiticeiro": 4, "mago": 3, "clerigo": 3, "bardo": 2, "druida": 2, "bruxo": 2}


def cantrip_limit(class_id, level):
    base = _CANTRIP_BASE.get(class_id, 0)
    if base == 0:
        return 0
    n = base + (1 if level >= 4 else 0) + (1 if level >= 10 else 0)
    have = len(CLASS_LIST.get(class_id, {}).get(0, []))
    return min(n, have) if have else n


_KNOWN_TABLE = {  # magias conhecidas por nivel (1..20) dos conjuradores "know"
    "feiticeiro":  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
    "bardo":       [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
    "bruxo":       [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
    "patrulheiro": [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
}


def spell_limit(class_id, level, cast_mod=0):
    """Quantas magias de nivel ficam prontas (conhecidas ou preparadas)."""
    level = max(1, min(20, int(level)))
    if class_id in KNOWERS:
        tbl = _KNOWN_TABLE.get(class_id)
        return tbl[level - 1] if tbl else 0
    if class_id in PREPARERS:
        if class_id == "paladino":
            return max(0, cast_mod + level // 2)
        return max(1, cast_mod + level)
    return 0


def _pool_spell_ids(class_id, level):
    cl = CLASS_LIST.get(class_id, {})
    top = min(max_spell_level(class_id, level), MAX_LIB_LEVEL)
    ids = []
    for lv in range(1, top + 1):
        ids.extend(cl.get(lv, []))
    return ids


def pool_for(class_id, level):
    """Pool selecionavel no Grimorio: truques + magias por nivel (ate o teto)."""
    cl = CLASS_LIST.get(class_id, {})
    top = min(max_spell_level(class_id, level), MAX_LIB_LEVEL)
    return {"cantrips": list(cl.get(0, [])),
            "by_level": {lv: list(cl.get(lv, [])) for lv in range(1, top + 1) if cl.get(lv)}}


def default_loadout(class_id, level, cast_mod=0):
    cants = list(CLASS_LIST.get(class_id, {}).get(0, []))[:cantrip_limit(class_id, level)]
    # prioriza as magias mais ALTAS (o conteudo novo de nivel 4-9) no loadout padrao;
    # quem quiser as baixas escolhe no Grimorio.
    pool = list(reversed(_pool_spell_ids(class_id, level)))
    sp = pool[:spell_limit(class_id, level, cast_mod)]
    return {"cantrips": cants, "spells": sp}


def validate_loadout(class_id, level, cast_mod, cantrips, spells):
    pool_c = set(CLASS_LIST.get(class_id, {}).get(0, []))
    pool_s = set(_pool_spell_ids(class_id, level))

    def keep(seq, allowed, cap):
        out = []
        for x in (seq or []):
            if x in allowed and x not in out:
                out.append(x)
                if len(out) >= cap:
                    break
        return out

    return {"cantrips": keep(cantrips, pool_c, cantrip_limit(class_id, level)),
            "spells": keep(spells, pool_s, spell_limit(class_id, level, cast_mod))}


def loadout_for(ficha):
    """Repertorio efetivo pro combate: o escolhido (grimoire) validado, ou o default."""
    cid = ficha.get("class_id")
    if cid not in CLASS_LIST:
        return {"cantrips": [], "spells": []}
    level = int(ficha.get("level", 1))
    final = ficha.get("attrs_final") or ficha.get("attrs") or {}
    cattr = CASTING.get(cid)
    cmod = _amod(final.get(cattr, 10)) if cattr else 0
    g = ficha.get("grimoire")
    if g and (g.get("cantrips") or g.get("spells")):
        return validate_loadout(cid, level, cmod, g.get("cantrips"), g.get("spells"))
    return default_loadout(cid, level, cmod)
