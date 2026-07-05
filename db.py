"""
GM (Mestre do Jogo) — poderes de administração liberados SÓ pra contas GM.

Identificação por NOME (escolha do dono do servidor): a conta cujo nome é
"Portuz" é GM. Como nome não é único no banco, o dono garante que ninguém mais
se registre com esse nome. Pra trocar/adicionar GMs, edite GM_NAMES.

Poderes (todos passam pelo evento "gm_command" em app.py, sempre revalidando
is_gm no servidor — o cliente NUNCA decide sozinho):
  god      -> invencível (não toma dano, não morre)
  fly      -> atravessa parede (noclip) no overworld
  tp       -> teleporta pra um tile do mapa atual
  give     -> põe qualquer item na mochila
  spawn    -> invoca qualquer monstro ao seu lado
  money    -> carteira infinita
  heal     -> cura tudo (você ou um alvo)
  setlevel -> define o nível na hora
  goto     -> teleporta VOCÊ pra outro jogador
  bring    -> traz um jogador até VOCÊ
  kick     -> desconecta um jogador
  killall  -> limpa os monstros do mapa atual
"""

from . import monsters as monsters_def

GM_NAMES = {"portuz"}          # nomes (minúsculo) que são GM


def is_gm(player):
    """True se o jogador é um GM (por nome). NPCs e monstros nunca são."""
    if not player or player.get("is_npc") or player.get("kind") == "monster":
        return False
    return (player.get("name") or "").strip().lower() in GM_NAMES


def monster_catalog():
    """Lista (id, nome, chefe?) de todos os monstros invocáveis, pro painel do GM.
    Ordena chefes por último."""
    out = []
    for mid, spec in monsters_def.MONSTERS.items():
        out.append({
            "id": mid,
            "name": spec.get("name", mid),
            "boss": bool(spec.get("boss")),
            "hp": spec.get("hp", 0),
        })
    out.sort(key=lambda m: (m["boss"], m["name"].lower()))
    return out
