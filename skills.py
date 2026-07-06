"""
TALENTOS (FEATS) — selecao curada estilo Baldur's Gate 3 (~15).

No feat-or-ASI, o jogador escolhe um destes OU um aumento de atributo. Alguns dao
efeito JA (campo no dict):
  - "plus1": lista de atributos; +1 num deles (se a lista tiver 1, e fixo; se mais,
    o jogador escolhe qual).
  - "hp_per_level": vida maxima extra por nivel (ex.: Robusto = +2/nivel).
Os demais sao de COMBATE (so ficam registrados e aparecem na ficha; o efeito ativo
entra na leva de combate).
"""

FEATS = {
    "alerta": {
        "name": "Alerta",
        "desc": "+5 de iniciativa, você não pode ser surpreendido e criaturas escondidas não ganham vantagem contra você.",
    },
    "atleta": {
        "name": "Atleta",
        "desc": "Levanta-se gastando só metade do movimento e escala sem custo extra.",
        "plus1": ["FOR", "DES"],
    },
    "ator": {
        "name": "Ator",
        "desc": "Vantagem em Enganação e Atuação ao se passar por outra pessoa, e imita vozes que ouviu.",
        "plus1": ["CAR"],
    },
    "duravel": {
        "name": "Durável",
        "desc": "Recupera muito mais vida em descansos.",
        "plus1": ["CON"],
    },
    "sortudo": {
        "name": "Sortudo",
        "desc": "3 pontos de sorte por descanso longo para rerrolar um ataque, teste ou salvaguarda.",
    },
    "atacante_pesado": {
        "name": "Atacante Pesado",
        "desc": "Abate ou crítico concede um ataque bônus; pode trocar precisão por muito dano com armas pesadas.",
    },
    "atirador_elite": {
        "name": "Atirador de Elite",
        "desc": "Ignora cobertura parcial e a penalidade de longo alcance; pode trocar precisão por dano à distância.",
    },
    "conjurador_guerra": {
        "name": "Conjurador de Guerra",
        "desc": "Vantagem para manter concentração, conjura de mãos ocupadas e pode conjurar num ataque de oportunidade.",
    },
    "iniciado_magia": {
        "name": "Iniciado em Magia",
        "desc": "Aprende dois truques e uma magia de 1º nível de uma classe à escolha.",
    },
    "resiliente": {
        "name": "Resiliente",
        "desc": "Ganha proficiência na salvaguarda do atributo escolhido.",
        "plus1": ["FOR", "DES", "CON", "INT", "SAB", "CAR"],
    },
    "robusto": {
        "name": "Robusto",
        "desc": "Sua vida máxima aumenta em 2 por nível.",
        "hp_per_level": 2,
    },
    "movel": {
        "name": "Móvel",
        "desc": "+3 m de deslocamento; ignora terreno difícil ao Disparar e não provoca ataques de quem você atacou.",
    },
    "sentinela": {
        "name": "Sentinela",
        "desc": "Seus ataques de oportunidade param o alvo, e você reage quando ignoram você por perto.",
    },
    "mestre_armas": {
        "name": "Mestre em Armas",
        "desc": "Ganha proficiência com quatro armas à escolha.",
        "plus1": ["FOR", "DES"],
    },
    "duas_armas": {
        "name": "Combatente com Duas Armas",
        "desc": "+1 de CA empunhando duas armas e pode usar armas não-leves nas duas mãos.",
    },
}


def get(feat_id):
    return FEATS.get(feat_id)


def catalog():
    """Lista pro cliente: [{id, name, desc, plus1?}]."""
    out = []
    for fid, f in FEATS.items():
        item = {"id": fid, "name": f["name"], "desc": f["desc"]}
        if "plus1" in f:
            item["plus1"] = f["plus1"]
        if "hp_per_level" in f:
            item["hp_per_level"] = f["hp_per_level"]
        out.append(item)
    return out
