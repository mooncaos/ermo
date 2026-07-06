"""
A REDE — servidor Flask + Socket.IO, agora com contas.

Continua fininha: rotas HTTP pra criar conta / entrar / sair, e os eventos de
socket pra entrar no mundo e andar. A inteligencia mora em game/:
    game/db.py        -> Postgres (contas, posicao, sessoes)
    game/accounts.py  -> regras de conta (hash de senha, token)
    game/world.py     -> estado vivo do mundo
    game/rules.py     -> colisao e movimento

Fluxo de entrada
----------------
1) cliente faz POST /api/register ou /api/login  -> recebe um token
2) cliente abre o socket com auth={token}
3) no 'connect', validamos o token, carregamos a conta do banco e colocamos
   o viajante no mundo na posicao salva

Contrato de socket
-------------------
Servidor -> Cliente:
    init          {id, map, players}          so pra quem entrou
    player_joined {id,x,y,facing,name,look}   pros outros
    player_moved  {id,x,y,facing}             pra todos
    player_left   {id}                        pra todos
    auth_error    {reason}                     token invalido/expirado
Cliente -> Servidor:
    move {dir}    ("up"|"down"|"left"|"right")
"""

# IMPORTANTE: o monkey patch do gevent tem que vir antes de tudo.
from gevent import monkey
monkey.patch_all()

# Faz o psycopg2 cooperar com o gevent (uma consulta nao trava os outros).
try:
    from psycogreen.gevent import patch_psycopg
    patch_psycopg()
except Exception as exc:  # pragma: no cover
    print("aviso: psycogreen nao aplicado:", exc)

import os
import random
import time
import json

from flask import Flask, render_template, request, jsonify, make_response
from flask_socketio import SocketIO, emit, join_room, leave_room

from game import (db, accounts, items, npcs, rules, valdris, classes, races, professions,
                  leveling, feats, class_features, monsters as monsters_def, combat,
                  spells as spells_def, abilities as abilities_def, gm)
from game import secret_worlds, world_map as wm
from game import quests as quests_def
from game import skills
from game.world import World, public
from game.world_map import (MAP_ROWS, map_rows, EDGE_LINKS,
                            DOOR_INTERIORS, INTERIOR_MAPS, INTERIOR_SPAWN)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "troque-isto-em-producao")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="gevent")

world = World()

SAVE_EVERY = 5  # segundos entre gravacoes de posicao no banco

# Ciclo de dia e noite: duracao de UM ciclo completo, em segundos.
# O horario do mundo sai do relogio (time.time()), entao todo mundo ve o
# mesmo entardecer ao mesmo tempo, sem precisar de loop nem estado.
# 480 = 8 minutos. Quer ver mudar rapido pra testar? Baixa esse numero.
DAY_LENGTH = 900
COMBAT_RT = True     # COMBATE EM TEMPO REAL (estilo Tibia). False = volta aos turnos.
RT_ATK_CD = 2.0      # segundos entre golpes (1 "rodada")

# -------- MUNDO VIVO: eventos globais, loot de raridade, guerra de facções --------
WORLD_EVENT = {"id": None, "map": None, "until": 0, "name": ""}
WORLD_EVENTS_DEF = [
    ("lua_sangue",    "umbraval",      "🌕 LUA DE SANGUE: os lobisomens do Umbraval enlouquecem! Drops em dobro por 10 minutos."),
    ("mare_viva",     "costa_maravai", "🌊 MARÉ VIVA: a Costa de Maravaí ferve de vida! Drops em dobro por 10 minutos."),
    ("furia_brasal",  "brasal",        "🔥 FÚRIA DO BRASAL: a Ferida arde! Drops em dobro no Brasal por 10 minutos."),
    ("noite_morcegos","vespera",       "🦇 NOITE DOS MORCEGOS: Véspera desperta faminta! Drops em dobro por 10 minutos."),
]
RARE_CHANCES = [("lendario", 0.004), ("epico", 0.025), ("raro", 0.10)]
RARE_COLORS = {"raro": "#6db3ff", "epico": "#c98aff", "lendario": "#ffb84a"}
_RARITY_POOLS = {}
def _rarity_pool(r):
    if r not in _RARITY_POOLS:
        _RARITY_POOLS[r] = [iid for iid, it in items.ITEMS.items()
                            if it.get("rarity") == r and not it.get("forged")
                            and it.get("kind") in ("weapon", "armor", "trinket")]
    return _RARITY_POOLS[r]

FACTIONS = {"cria_vampirica": "vampiro", "vampiro_nobre": "vampiro", "vampiro_anciao": "vampiro",
            "enxame_morcegos": "vampiro", "lobisomem_ferino": "lobisomem",
            "lobisomem_uivador": "lobisomem", "lobisomem_ancestral": "lobisomem"}


# -------- GLÓRIA: janela de bosses, despertar anunciado e primeira-kill --------
BOSS_RESPAWN_MIN = 3600      # bosses grandes renascem entre 1 e 2 horas REAIS
BOSS_RESPAWN_MAX = 7200
MAP_TITLES = {"ermo": "Ermo", "descampado": "Descampado", "costa_maravai": "Costa de Maravaí",
              "umbraval": "Umbraval", "vespera": "Véspera", "brasal": "Brasal",
              "floresta_ermo": "Floresta do Ermo", "repouso_dama": "Repouso da Dama",
              "avasham": "Avasham", "cova_colosso": "Cova do Colosso",
              "valdarkram": "Valdarkram", "mina_avhur": "Mina de Avhur",
              "camara_avhur": "Câmara de Avhur", "torre_varth": "Torre de Varth"}
FIRST_KILL = {
    "maraja":          {"item": "juba_do_maraja",        "title": "Domador do Marajá"},
    "lorde_varth":     {"item": "cetro_de_varth",        "title": "Carrasco da Torre"},
    "krezath":         {"item": "presa_de_krezath",      "title": "Devorador do Devorador"},
    "farao_avhur":     {"item": "ankh_do_farao",         "title": "Quebra-Faraó"},
    "colosso_avasham": {"item": "nucleo_do_colosso",     "title": "Derrubador do Colosso"},
    "urso_rei":        {"item": "garra_do_urso_rei",     "title": "Regicida do Bosque"},
    "vulkar":          {"item": "coracao_de_vulkar",     "title": "Apagador do Brasal"},
    "dama_noite":      {"item": "veu_da_dama",           "title": "Viúvo da Dama"},
    "velho_bob":       {"item": "anzol_do_velho_bob",    "title": "Pioneiro: Velho Bob"},
    "maurao":          {"item": "soco_ingles_do_maurao", "title": "Pioneiro: Maurão"},
}

BOSS_RECORDS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "boss_records.json")
try:
    with open(BOSS_RECORDS_PATH) as _bf:
        BOSS_RECORDS = json.load(_bf)
except Exception:
    BOSS_RECORDS = {}
def _save_boss_records():
    try:
        os.makedirs(os.path.dirname(BOSS_RECORDS_PATH), exist_ok=True)
        with open(BOSS_RECORDS_PATH, "w") as _bf:
            json.dump(BOSS_RECORDS, _bf)
    except Exception as exc:
        print("erro salvando recordes:", exc)


def _world_event_loop():
    """Sorteia um evento mundial de tempos em tempos (drop 2x por 10 min)."""
    while True:
        socketio.sleep(60)
        now = time.time()
        if WORLD_EVENT["id"]:
            if now >= WORLD_EVENT["until"]:
                socketio.emit("toast", {"text": "O evento '%s' terminou. O mundo respira." % WORLD_EVENT["name"]})
                socketio.emit("world_event", {"id": None})
                WORLD_EVENT.update({"id": None, "map": None, "until": 0, "name": ""})
            continue
        if random.random() < 0.042:            # ~1 evento a cada ~24 min
            eid, emap, msg = random.choice(WORLD_EVENTS_DEF)
            WORLD_EVENT.update({"id": eid, "map": emap, "until": now + 600, "name": msg.split(":")[0]})
            socketio.emit("toast", {"text": msg})
            socketio.emit("world_event", {"id": eid, "map": emap, "until": WORLD_EVENT["until"]})

# ----- NPCs (o elenco) -----
# Ritmo e falas de cada NPC vivem no registro dele em npcs.ROSTER.
TALK_RADIUS = 1          # precisa estar colado num NPC pra conversar
HEAR_RADIUS = 4          # xingou a ate tantos tiles do Valdris -> ele te frita
FLEE_RADIUS = 3          # NPC medroso a ate tantos tiles do Valdris -> ele recua


# ----- A aparicao do Pofnir: "O Gato Branco e Grande" -----
# O unico deus que se manifesta por enquanto. Aparece de noite, raramente, anda
# pelo mapa e SOME assim que um jogador chega perto. Os numeros sao de tunar.
GATO_ID       = "gato_branco"            # id interno da entidade
GATO_NOME     = "O Gato Branco e Grande" # nome que paira sobre ele
GATO_SUMICO   = 5     # some quando um jogador chega a ate tantos tiles
GATO_LONGE    = 7     # nasce a no MINIMO tantos tiles de todo jogador
GATO_VIDA     = 75    # segundos no mundo antes de sumir sozinho (se ninguem chega)
GATO_RAIO     = 7     # o quanto ele perambula em volta de onde nasceu
GATO_CHANCE   = 0.10  # chance de surgir a cada verificacao (de noite)
GATO_ESPERA   = 20    # segundos de descanso depois de sumir, antes de poder voltar


# ----------------------------------------------------------------- paginas

def _asset_version():
    """Carimbo de versao dos estaticos = data de modificacao do game.js. Muda a
    cada deploy, entao a URL do script muda e o navegador busca a versao nova em
    vez de servir a velha do cache (foi isso que travou o 2o PC)."""
    try:
        path = os.path.join(app.static_folder, "game.js")
        return str(int(os.path.getmtime(path)))
    except Exception:
        return "1"


@app.route("/")
def index():
    resp = make_response(render_template("index.html", asset_v=_asset_version()))
    # a pagina nunca fica em cache: assim ela sempre traz o ?v= novo do game.js
    resp.headers["Cache-Control"] = "no-store, must-revalidate"
    return resp


@app.route("/healthz")
def healthz():
    return {"ok": True, "online": len(world.players)}


# ------------------------------------------------------------ contas (HTTP)

@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.get_json(silent=True) or {}
    ok, result = accounts.register(
        data.get("email"),
        data.get("name"),
        data.get("password"),
        data.get("look"),
        data.get("race"),
    )
    if not ok:
        return jsonify(error=result), 400
    return jsonify(token=result)


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    ok, result = accounts.login(data.get("email"), data.get("password"))
    if not ok:
        return jsonify(error=result), 401
    return jsonify(token=result)


@app.route("/api/logout", methods=["POST"])
def api_logout():
    data = request.get_json(silent=True) or {}
    try:
        accounts.logout(data.get("token"))
    except Exception:
        pass
    return jsonify(ok=True)


# ----------------------------------------------------------------- socket

# Sockets que conectaram mas ainda precisam escolher uma raca (contas antigas).
_pending_race = {}

# Classe oferecida ao jogador pelo ultimo mestre com quem ele falou (sid -> class_id).
# So da pra setar a classe que um mestre ofereceu (anti-trapaca).
_pending_class = {}


def _enter_world(player_id, row):
    """Coloca a conta (ja com raca definida) no mundo e envia o estado inicial."""
    # Se a mesma conta ja estava conectada (outra aba), derruba a antiga.
    old_sid = world.sid_for_player(player_id)
    if old_sid and old_sid != request.sid:
        old = world.remove_player(old_sid)
        if old:
            try:
                db.save_positions([(old["player_id"], old["x"],
                                    old["y"], old["facing"])])
            except Exception:
                pass
            emit("player_left", {"id": old_sid},
                 room=old.get("map", "ermo"), include_self=False)
        try:
            socketio.emit("kicked", {"reason": "elsewhere"}, to=old_sid)
        except Exception:
            pass
        try:
            socketio.server.disconnect(old_sid)
        except Exception:
            pass

    player = world.add_player(
        request.sid, player_id,
        row["name"], row["look"], row["x"], row["y"], row.get("facing", "down"),
        row.get("inventory"), row.get("equipment"), row.get("wallet", 0),
    )

    # se a regra do item unico cortou copias (ex.: Portuz), grava o conserto
    if player.pop("_needs_save", False):
        _persist_loadout(player)

    # migracao: moedas que ja estavam na mochila viram saldo da carteira.
    _gained, player["inventory"] = items.extract_currency(player["inventory"])
    if _gained:
        player["wallet"] = int(player.get("wallet", 0)) + _gained
        try:
            db.save_wallet(player_id, player["wallet"])
            db.save_inventory(player_id, player["inventory"])
        except Exception as exc:
            print("erro migrando moedas pra carteira:", exc)

    mp = player.get("map", "ermo")
    join_room(mp)   # passa a receber so os eventos do mapa onde esta

    # Conta antiga pode ter raca mas ficha SEM atributos (pegou a raca antes de a
    # ficha carregar os atributos). Se for o caso, reconstroi da raca e grava, pra
    # o preview da classe e o set_class funcionarem.
    ficha = row.get("ficha") or {}
    if not ficha.get("attrs") and row.get("race") and races.is_valid_race(row["race"]):
        ficha = races.build_ficha(row["race"]) or ficha
        try:
            db.save_ficha(player_id, ficha)
        except Exception as exc:
            print("aviso reconstruindo ficha:", exc)
    player["ficha"] = ficha   # guarda na memoria (saber se ja tem classe etc.)
    leveling.recompute(ficha)  # garante nivel/vida/proficiencia coerentes com o XP

    emit("init", {
        "id": request.sid,
        "map": world.map_payload(mp),
        "players": world.entities_in(mp),
        "inventory": player["inventory"],
        "equipment": player["equipment"],
        "wallet": player.get("wallet", 0),
        "items": items.catalog(),
        "ground": world.ground_snapshot() if mp == "ermo" else [],
        "ficha": ficha,
        "feats": feats.catalog(),
        "class_features": class_features.FEATURES,
        "transforms": classes.TRANSFORMS,
        "postures": classes.POSTURES,
        "day_length": DAY_LENGTH,
        "server_now": time.time(),
        "is_gm": gm.is_gm(player),                      # painel de GM só aparece pra conta GM
        "gm_monsters": gm.monster_catalog() if gm.is_gm(player) else [],
    })
    emit("player_joined", public(player), room=mp, include_self=False)


_MAP_NAMES = {
    "salao": "o Salao das Classes", "rasharan": "Rasharan", "valoran": "Valoran",
    "fundamento": "o Fundamento", "falanor": "Falanor",
    "fadrakor_litoral": "o litoral de Fadrakor", "fadrakor_selva": "a selva de Fadrakor",
    "fadrakor_vulcao": "o vulcao de Fadrakor",
}


def _map_label(mp):
    if mp.startswith("casa_"):
        return "uma casa"
    return _MAP_NAMES.get(mp, mp)


def _award_xp(player, amount, reason=""):
    """Da XP, salva a ficha e avisa o cliente (barra de XP + popup de nivel)."""
    if not player or amount <= 0:
        return
    ficha = player.get("ficha") or {}
    ficha, leveled, lvl, gained = leveling.grant_xp(ficha, amount)
    player["ficha"] = ficha
    try:
        db.save_ficha(player["player_id"], ficha)
    except Exception as exc:
        print("erro salvando ficha (xp):", exc)
    socketio.emit("xp", {
        "xp": ficha.get("xp", 0), "level": ficha.get("level", 1),
        "hp": ficha.get("hp"), "hp_max": ficha.get("hp_max"),
        "prof": ficha.get("prof"), "gained": gained, "reason": reason,
        "pending_asi": ficha.get("pending_asi", []),
    }, to=player["id"])
    if leveled:
        socketio.emit("levelup", {
            "level": lvl, "hp_max": ficha.get("hp_max"), "prof": ficha.get("prof"),
            "pending_asi": ficha.get("pending_asi", []),
        }, to=player["id"])


def _discover_map(player, mp):
    """XP de descoberta na 1a visita a um mapa."""
    amount = leveling.map_xp(mp)
    if amount <= 0:
        return
    ficha = player.get("ficha") or {}
    seen = ficha.setdefault("seen_maps", [])
    if mp in seen:
        return
    seen.append(mp)
    player["ficha"] = ficha
    _award_xp(player, amount, "Descobriu " + _map_label(mp))


def _encounter_gods(player):
    """XP na 1a vez que chega perto de cada deus (so nos mundos secretos)."""
    mp = player.get("map", "ermo")
    if mp in ("ermo", "salao") or mp.startswith("casa_"):
        return
    ficha = player.get("ficha") or {}
    met = ficha.setdefault("met_gods", [])
    for ent in list(world.players.values()):
        gid = ent.get("id", "")
        if not gid.startswith("god:") or ent.get("map") != mp or gid in met:
            continue
        if world.near_entity(player, gid, 4):
            met.append(gid)
            player["ficha"] = ficha
            _award_xp(player, leveling.GOD_XP, "Encontrou " + ent.get("name", "um deus"))


def _go_to(sid, target_map, x, y, facing=None):
    """Move um jogador de mapa: sai da sala antiga, entra na nova, e recebe o
    mapa + as entidades de la. Os outros do mapa antigo o veem sair; os do novo,
    chegar. Usa a API direta do servidor (sid explicito) pra funcionar TAMBEM
    fora de um contexto de requisicao (ex.: a partir de uma tarefa de fundo)."""
    player = world.players.get(sid)
    if not player:
        return
    old_map = player.get("map", "ermo")
    if target_map != old_map:
        if old_map == "arena" and player.get("duel_foe"):
            _duel_end(player.get("duel_foe"), sid, wo=True)
        _quest_bump(sid, player, "visit", target_map)
        _fx = player.get("ficha") or {}
        if _fx.get("class_id"):
            _cod = _fx.setdefault("codex", {"m": {}, "i": {}, "l": {}})
            if target_map not in _cod.setdefault("l", {}):
                _cod["l"][target_map] = 1
                player["ficha"] = _fx
                socketio.emit("toast", {"text": "📖 Codex: %s registrado no seu mapa-múndi!" %
                                        MAP_TITLES.get(target_map, target_map.replace("_", " ").title())},
                              to=sid)
                _check_titles(sid, player)
                _quest_save(player)
    _party_remove(sid)              # trocou de mapa: sai do lobby da Mesa
    socketio.emit("player_left", {"id": sid}, room=old_map, skip_sid=sid)
    try:
        socketio.server.leave_room(sid, old_map, namespace="/")
    except Exception as exc:
        print("aviso leave_room:", exc)

    world.set_map(sid, target_map, x, y)
    if facing:
        player["facing"] = facing
    _discover_map(player, target_map)   # XP de descoberta na 1a visita
    try:
        socketio.server.enter_room(sid, target_map, namespace="/")
    except Exception as exc:
        print("aviso enter_room:", exc)

    socketio.emit("map_change", {
        "map": world.map_payload(target_map),
        "players": world.entities_in(target_map),
        "ground": world.ground_snapshot() if target_map == "ermo" else [],
        "nodes": world.nodes_in(target_map),
        "edges": {d: dst[0] for d, dst in wm.EDGE_LINKS.get(target_map, {}).items()},
        "you": {"id": sid, "x": player["x"], "y": player["y"],
                "facing": player["facing"]},
    }, to=sid)
    socketio.emit("player_joined", public(player), room=target_map, skip_sid=sid)


@socketio.on("connect")
def on_connect(auth):
    # manda a versao logo de cara: cliente velho (deploy novo no ar) recarrega.
    emit("version", {"v": _asset_version()})
    token = auth.get("token") if isinstance(auth, dict) else None

    try:
        player_id = accounts.validate(token)
    except Exception as exc:
        print("erro validando token:", exc)
        emit("auth_error", {"reason": "server"})
        return

    if not player_id:
        emit("auth_error", {"reason": "invalid"})
        return

    # so uma sessao ativa por conta: mata os outros tokens (anti-clone robusto).
    try:
        db.invalidate_other_sessions(player_id, token)
    except Exception as exc:
        print("aviso invalidando outras sessoes:", exc)

    try:
        row = db.get_player(player_id)
    except Exception as exc:
        print("erro carregando conta:", exc)
        emit("auth_error", {"reason": "server"})
        return

    if not row:
        emit("auth_error", {"reason": "invalid"})
        return

    # Conta sem raca (contas antigas): manda escolher a raca antes de entrar.
    if not row.get("race"):
        _pending_race[request.sid] = player_id
        emit("need_race", {
            "name": row["name"],
            "look": row["look"],
            "inventory": row.get("inventory") or [],
            "items": items.catalog(),
        })
        return

    _enter_world(player_id, row)


@socketio.on("choose_race")
def on_choose_race(data):
    """Conta antiga escolheu a raca no menu: salva, monta a ficha e entra."""
    race = (data or {}).get("race")
    player_id = _pending_race.get(request.sid)
    if not player_id:
        emit("auth_error", {"reason": "invalid"})
        return

    ok, result = accounts.set_race(player_id, race)
    if not ok:
        emit("race_error", {"reason": result})
        return

    _pending_race.pop(request.sid, None)
    try:
        row = db.get_player(player_id)
    except Exception as exc:
        print("erro recarregando conta:", exc)
        emit("auth_error", {"reason": "server"})
        return
    if not row:
        emit("auth_error", {"reason": "invalid"})
        return

    _enter_world(player_id, row)


# ===========================================================================
#  COMBATE POR TURNOS (tatico, 5e). Solo por enquanto: um jogador + os monstros
#  que entrarem. A luta e instanciada; o resto do mundo segue em tempo real.
# ===========================================================================
COMBAT = {}              # sid -> confronto (enc) ativo
COMBAT_AGGRO = 3         # distancia (tiles) em que um monstro inicia a luta
_MONSTER_RESPAWNS = []   # [(monster_id, quando_revive)]
_SUMMON_SEQ = [0]        # contador dos reforcos invocados pelo chefe


def _summon_minions(enc, boss, count):
    """O chefe chama reforço: cria 'count' lacaios. summon_type pode ser uma LISTA
    (o bonde da Torre) -> cada reforço sorteia um tipo, pra vir variado."""
    stype = boss.get("summon_type") or "capanga"
    types = stype if isinstance(stype, list) else [stype]
    mp = enc["map"]
    occ = {(c["x"], c["y"]) for c in enc["combs"].values() if c.get("alive", True)}
    placed = 0
    for r in range(1, 6):
        if placed >= count:
            break
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if placed >= count:
                    break
                x, y = boss["x"] + dx, boss["y"] + dy
                if (x, y) in occ or not rules.is_walkable(x, y, mp):
                    continue
                t = random.choice(types)                          # variedade: cada reforço de um tipo da torre
                spec = dict(monsters_def.get(t) or {}); spec["_type"] = t
                _SUMMON_SEQ[0] += 1
                cid = "lacaio:%d" % _SUMMON_SEQ[0]
                combat.add_combatant(enc, combat.make_summon_combatant(spec, cid, x, y))
                occ.add((x, y))
                placed += 1
    return placed


def _maybe_boss_hurt(enc, sid, target):
    """De vez em quando o chefe solta uma provocacao ao levar dano."""
    if target and target.get("boss") and target.get("alive") and random.random() < 0.35:
        line = monsters_def.bark("hurt", target.get("mtype"))
        if line:
            socketio.emit("speech", {"id": target["cid"], "text": line}, to=sid)


def _sync_monsters_to_world(enc):
    """Reflete posicao/vida dos monstros do confronto nas entidades do mundo."""
    for c in enc["combs"].values():
        if c["kind"] == "monster":
            m = enc["_monsters"].get(c["cid"])
            if m:
                m["x"], m["y"] = c["x"], c["y"]
                m["hp"] = c["hp"]
                m["alive"] = c.get("alive", True)


def _world_refresh(mp, sid=None):
    """Manda a lista de entidades atualizada (monstros que sumiram/voltaram/curaram)."""
    payload = {"map": mp, "entities": world.entities_in(mp)}
    if sid:
        socketio.emit("world_refresh", payload, to=sid)
    else:
        socketio.emit("world_refresh", payload, room=mp)


PARTY_JOIN_RADIUS = 8     # parceiros de grupo a até 8 tiles entram na mesma luta


def _combat_push(enc, extra=None):
    """Manda o estado da luta pra TODOS os jogadores do encounter (cada um com o
    SEU snapshot e o SEU your_turn). `extra` (dict) é a ação que acabou de rolar,
    igual pra todos (player_action / spell_result / ability_result). Devolve o
    outcome ('victory' / 'defeat' / None)."""
    oc = combat.outcome(enc)
    cur = combat.current(enc)
    for s in list(enc.get("players", [])):
        payload = {"snapshot": combat.snapshot(enc, s), "outcome": oc,
                   "your_turn": (oc is None and cur["kind"] == "player"
                                 and cur["cid"] == s and not combat.is_incapacitated(cur))}
        if extra:
            payload.update(extra)
        socketio.emit("combat_state", payload, to=s)
    return oc


def _combat_party_members(sid, player):
    """Sids que entram na luta junto com quem iniciou: ele + os parceiros de grupo
    no MESMO mapa, perto, com classe e que ainda não estão em combate."""
    pid = _player_party.get(sid)
    if not pid:
        return [sid]
    out = [sid]
    mp = player.get("map")
    px, py = player["x"], player["y"]
    for s in _parties.get(pid, []):
        if s == sid or s in COMBAT:
            continue
        pl = world.players.get(s)
        if not pl or pl.get("map") != mp:
            continue
        if not (pl.get("ficha") or {}).get("class_id"):
            continue
        if max(abs(pl["x"] - px), abs(pl["y"] - py)) > PARTY_JOIN_RADIUS:
            continue
        out.append(s)
    return out[:PARTY_MAX]



# ===========================================================================
#  COMBATE EM TEMPO REAL (estilo Tibia): 1 rodada = 2s, mundo nunca pausa.
#  A matemática d20/CA/dano é a MESMA dos turnos (make_player_combatant).
#  Monstros vivos não-passivos batem em quem estiver no alcance; o jogador
#  marca um alvo (clique/Tab) e o golpe sai sozinho a cada 2s.
# ===========================================================================

# ===========================================================================
#  MAGIA EM TEMPO REAL: mana, conjuração e habilidades de monstro no RT.
#  Custo: cantrip 0 | nível N: 8 + 6N. Regen: 2%% da mana máxima por segundo.
# ===========================================================================
RT_CAST_CD = 1.5

def _mana_max(ficha):
    cid = ficha.get("class_id")
    if cid not in spells_def.CLASS_LIST:
        return 0
    final = ficha.get("attrs_final") or ficha.get("attrs") or {}
    cattr = spells_def.CASTING.get(cid)
    cmod = ((int(final.get(cattr, 10)) - 10) // 2) if cattr else 0
    return 20 + int(ficha.get("level", 1)) * 6 + max(0, cmod) * 4


def _cast_mod(ficha):
    cid = ficha.get("class_id")
    final = ficha.get("attrs_final") or ficha.get("attrs") or {}
    cattr = spells_def.CASTING.get(cid)
    return ((int(final.get(cattr, 10)) - 10) // 2) if cattr else 0


def _spell_cost(sp):
    lv = int(sp.get("level", 0))
    return 0 if lv == 0 else 8 + 6 * lv


def _cantrip_mult(level):
    return 1 + (1 if level >= 5 else 0) + (1 if level >= 11 else 0) + (1 if level >= 17 else 0)


@socketio.on("rt_cast")
def on_rt_cast(data):
    """Conjuração em tempo real: valida mana/alcance/recarga e aplica o efeito."""
    sid = request.sid
    player = world.players.get(sid)
    if not player:
        return
    f = player.get("ficha") or {}
    if int(f.get("hp", 0)) <= 0:
        return
    spell_id = (data or {}).get("spell")
    sp = spells_def.get(spell_id) or {}
    if not sp:
        return
    lo = spells_def.loadout_for(f)
    conhecidas = set((lo.get("cantrips") or []) + (lo.get("spells") or []))
    if spell_id not in conhecidas:
        emit("toast", {"text": "Você não preparou essa magia no Grimório."})
        return
    now = time.time()
    if player.get("_rt_fear_until", 0) > now:
        emit("toast", {"text": "😱 Você está amedrontado demais pra conjurar!"})
        return
    if player.get("_rt_cast_next", 0) > now:
        return
    mana_max = _mana_max(f)
    mana = int(f.get("mana", mana_max))
    custo = _spell_cost(sp)
    if mana < custo:
        emit("toast", {"text": "✨ Mana insuficiente (%d/%d)." % (mana, custo)})
        return
    kind = sp.get("kind")
    if kind not in ("attack", "save", "auto", "heal"):
        emit("toast", {"text": "Essa magia ainda não funciona no combate em tempo real."})
        return
    lvl = int(f.get("level", 1))
    cmod = _cast_mod(f)
    player["_rt_cast_next"] = now + RT_CAST_CD

    # ---- CURA (em si mesmo) ----
    if kind == "heal":
        h = sp.get("heal") or {"n": 1, "d": 8}
        cura = sum(random.randint(1, h.get("d", 8)) for _ in range(h.get("n", 1)))
        if h.get("mod"):
            cura += max(0, cmod)
        f["mana"] = mana - custo
        f["hp"] = min(int(f.get("hp_max", 1)), int(f.get("hp", 1)) + cura)
        player["ficha"] = f
        emit("mana", {"mana": f["mana"], "max": mana_max})
        emit("rt_selfheal", {"amount": cura, "hp": f["hp"], "hp_max": f.get("hp_max")})
        emit("xp", {"xp": f.get("xp", 0), "level": lvl, "hp": f["hp"], "hp_max": f.get("hp_max"),
                    "prof": f.get("prof"), "gained": 0, "pending_asi": f.get("pending_asi", [])})
        return

    # ---- OFENSIVAS: precisa de alvo vivo no alcance ----
    tid = (data or {}).get("target") or player.get("rt_target")
    # MAGIA DE DUELO: o alvo é o oponente da Arena
    foe_sid = player.get("duel_foe")
    if foe_sid:
        foe = world.players.get(foe_sid)
        if foe and foe.get("map") == "arena":
            ff = foe.get("ficha") or {}
            alcance = 6 if sp.get("range") == "ranged" else 1
            if max(abs(foe["x"] - player["x"]), abs(foe["y"] - player["y"])) > alcance:
                emit("toast", {"text": "Oponente fora do alcance da magia."})
                player["_rt_cast_next"] = now
                return
            f["mana"] = mana - custo
            _mup = skills.add_tries(f, "magic", custo)
            player["ficha"] = f
            emit("mana", {"mana": f["mana"], "max": mana_max})
            if _mup:
                _skill_up_toast(request.sid, "Nível Mágico", _mup)
            lvl = int(f.get("level", 1))
            _ml = skills.get_lvl(f, "magic")
            dmg = skills.magic_roll(lvl, _ml, *skills.SPELL_FORMULAS.get(int(sp.get("level", 0)),
                                                                         skills.SPELL_FORMULAS[1]))
            dmg = max(0, dmg - skills.armor_reduce(_player_armor(foe)))
            crit = False
            _pf = _posture_of(ff)
            if _pf == "soldado":
                dmg = max(1, dmg // 4)
            elif _pf == "mao":
                dmg = max(1, int(dmg * 0.8))
            novo_hp = int(ff.get("hp", 1)) - dmg
            fim = novo_hp <= 0
            ff["hp"] = max(1, novo_hp) if fim else novo_hp
            foe["ficha"] = ff
            socketio.emit("rt_hit", {"id": foe_sid, "dmg": dmg, "crit": crit, "magic": True,
                                     "by": request.sid, "spell": sp.get("name"), "sid": spell_id,
                                     "dtype": sp.get("dtype", "energia"),
                                     "fx": [player["x"], player["y"], foe["x"], foe["y"]],
                                     "hp": ff["hp"], "hp_max": ff.get("hp_max")}, room="arena")
            socketio.emit("rt_phit", {"dmg": dmg, "crit": crit, "by": player.get("name", "?"),
                                      "hp": ff["hp"], "hp_max": ff.get("hp_max")}, to=foe_sid)
            socketio.emit("xp", {"xp": ff.get("xp", 0), "level": ff.get("level", 1),
                                 "hp": ff["hp"], "hp_max": ff.get("hp_max"),
                                 "prof": ff.get("prof"), "gained": 0,
                                 "pending_asi": ff.get("pending_asi", [])}, to=foe_sid)
            if fim:
                _duel_end(request.sid, foe_sid)
            return
    m = world.monsters.get(tid)
    if not m or not m.get("alive") or m.get("map") != player.get("map"):
        emit("toast", {"text": "Sem alvo. Clique num monstro ou aperte Tab."})
        player["_rt_cast_next"] = now
        return
    alcance = 6 if sp.get("range") == "ranged" else 1
    if max(abs(m["x"] - player["x"]), abs(m["y"] - player["y"])) > alcance:
        emit("toast", {"text": "Alvo fora do alcance da magia."})
        player["_rt_cast_next"] = now
        return
    f["mana"] = mana - custo
    _mup = skills.add_tries(f, "magic", custo)       # mana gasta TREINA o Nível Mágico
    player["ficha"] = f
    emit("mana", {"mana": f["mana"], "max": mana_max})
    if _mup:
        _skill_up_toast(request.sid, "Nível Mágico", _mup)
    player["rt_target"] = tid

    _ml = skills.get_lvl(f, "magic")
    _tier = int(sp.get("level", 0))
    dmg = skills.magic_roll(lvl, _ml, *skills.SPELL_FORMULAS.get(_tier, skills.SPELL_FORMULAS[1]))
    crit = False                              # magia no padrão Tibia: não erra, não crita

    if m.get("_rt_aegis_until", 0) > time.time():
        dmg = max(1, dmg // 2)
    m["hp"] = max(0, int(m["hp"]) - dmg)
    socketio.emit("rt_hit", {"id": tid, "dmg": dmg, "crit": crit, "magic": True, "by": sid,
                             "spell": sp.get("name"), "sid": spell_id, "dtype": sp.get("dtype", "energia"),
                             "fx": [player["x"], player["y"], m["x"], m["y"]],
                             "hp": m["hp"], "hp_max": m["hp_max"]},
                  room=player["map"])
    _mob_aggro(m, sid)
    _ar = int(sp.get("area", 0))
    if _ar > 0:
        socketio.emit("rt_aoe", {"x": m["x"], "y": m["y"], "r": _ar,
                                 "dtype": sp.get("dtype", "energia")}, room=player["map"])
        for mm in list(world.monsters.values()):
            if mm is m or not mm.get("alive") or mm.get("map") != player.get("map"):
                continue
            if max(abs(mm["x"] - m["x"]), abs(mm["y"] - m["y"])) > _ar:
                continue
            d2 = skills.magic_roll(lvl, _ml, *skills.SPELL_FORMULAS.get(_tier, skills.SPELL_FORMULAS[1]))
            if mm.get("_rt_aegis_until", 0) > time.time():
                d2 = max(1, d2 // 2)
            mm["hp"] = max(0, int(mm["hp"]) - d2)
            socketio.emit("rt_hit", {"id": mm["id"], "dmg": d2, "magic": True, "by": sid,
                                     "dtype": sp.get("dtype", "energia"),
                                     "hp": mm["hp"], "hp_max": mm["hp_max"]}, room=player["map"])
            if mm["hp"] <= 0:
                _rt_kill(sid, player, mm)
    if m["hp"] <= 0:
        _rt_kill(sid, player, m)




# ===========================================================================
#  MISSÕES: NPCs com histórias, objetivos rastreados e relíquias exclusivas.
# ===========================================================================

def _player_armor(pl):
    """Soma a armadura de tudo equipado (padrão Tibia)."""
    tot = 0
    for iid in (pl.get("equipment") or {}).values():
        tot += int((items.get(iid) or {}).get("armor", 0))
    return tot


def _skill_up_toast(sid, nome, novo):
    socketio.emit("toast", {"text": "📈 %s avançou para %d!" % (nome, novo)}, to=sid)


def _find_ammo(pl, fam):
    """Melhor munição da família (ex: 'virote' pega Virote e Virote Perfurante)."""
    melhor = None
    for s in (pl.get("inventory") or []):
        cat = items.get(s.get("item")) or {}
        if cat.get("kind") != "municao" or not s.get("item", "").startswith(fam):
            continue
        if melhor is None or int(cat.get("atk_bonus", 0)) > int((items.get(melhor) or {}).get("atk_bonus", 0)):
            melhor = s.get("item")
    return melhor


def _npc_display_name(npc_id):
    if npc_id == valdris.NPC_ID:
        return "Valdris"
    for spec in npcs.ROSTER:
        if spec.get("id") == npc_id:
            return spec.get("name", npc_id)
    return npc_id


def _bag_count(player, iid):
    return sum(int(s.get("qty", 1)) for s in (player.get("inventory") or [])
               if s.get("item") == iid)


def _quest_ready(player, qid, q):
    st = ((player.get("ficha") or {}).get("quests") or {}).get(qid)
    if not st or st.get("done"):
        return False
    if int(st.get("s", 0)) < len(q.get("steps") or []):
        return False
    for iid, need in (q.get("collect") or {}).items():
        if _bag_count(player, iid) < int(need):
            return False
    return True


def _quest_payload(player):
    f = player.get("ficha") or {}
    qs = f.get("quests") or {}
    active, done = [], 0
    for qid, st in qs.items():
        q = quests_def.get(qid)
        if not q:
            continue
        if st.get("done"):
            done += 1
            continue
        s = int(st.get("s", 0))
        steps = []
        for i, sp in enumerate(q.get("steps") or []):
            steps.append({"text": sp.get("text", ""), "done": s > i,
                          "n": (int(sp.get("count", 1)) if s > i
                                else (int(st.get("n", 0)) if s == i else 0)),
                          "count": int(sp.get("count", 1))})
        coll = [{"name": (items.get(iid) or {}).get("name", iid),
                 "have": min(_bag_count(player, iid), int(need)), "need": int(need)}
                for iid, need in (q.get("collect") or {}).items()]
        active.append({"id": qid, "name": q["name"], "npc": _npc_display_name(q["npc"]),
                       "story": q["story"], "steps": steps, "collect": coll,
                       "ready": _quest_ready(player, qid, q)})
    return {"active": active, "done": done}


def _quest_marks(player):
    qs = (player.get("ficha") or {}).get("quests") or {}
    marks = {}
    for qid, q in quests_def.QUESTS.items():
        st = qs.get(qid)
        if st and st.get("done"):
            continue
        if st:
            if _quest_ready(player, qid, q):
                marks[q["npc"]] = "?"
        elif not q.get("auto") and marks.get(q["npc"]) != "?":
            marks[q["npc"]] = "!"
    return marks


def _emit_quests(sid, player):
    try:
        socketio.emit("quests", _quest_payload(player), to=sid)
        socketio.emit("quest_marks", {"marks": _quest_marks(player)}, to=sid)
    except Exception:
        pass


def _quest_save(player):
    try:
        db.save_ficha(player["player_id"], player.get("ficha") or {})
    except Exception:
        pass


def _quest_bump(sid, player, kind, target=None):
    """Um evento do mundo (kill/gather/equip/visit) avança as missões ativas."""
    f = player.get("ficha") or {}
    qs = f.get("quests") or {}
    mudou = False
    for qid, st in qs.items():
        if st.get("done"):
            continue
        q = quests_def.get(qid)
        if not q:
            continue
        s = int(st.get("s", 0))
        steps = q.get("steps") or []
        if s >= len(steps):
            continue
        sp = steps[s]
        if sp.get("type") != kind:
            continue
        if kind == "kill" and sp.get("target") not in (None, "any") and sp.get("target") != target:
            continue
        if kind == "visit" and sp.get("target") != target:
            continue
        st["n"] = int(st.get("n", 0)) + 1
        mudou = True
        if st["n"] >= int(sp.get("count", 1)):
            st["s"] = s + 1
            st["n"] = 0
            if st["s"] >= len(steps) and not (q.get("collect") or {}):
                socketio.emit("toast", {"text": "📜 %s: objetivos completos! Fale com %s." %
                                        (q["name"], _npc_display_name(q["npc"]))}, to=sid)
            elif st["s"] < len(steps):
                socketio.emit("toast", {"text": "📜 %s: %s" %
                                        (q["name"], steps[st["s"]].get("text", ""))}, to=sid)
    if mudou:
        player["ficha"] = f
        _quest_save(player)
        _emit_quests(sid, player)


def _quest_start(sid, player, qid, silent=False):
    f = player.get("ficha") or {}
    qs = f.setdefault("quests", {})
    q = quests_def.get(qid)
    if not q or qid in qs:
        return False
    qs[qid] = {"s": 0, "n": 0}
    player["ficha"] = f
    _quest_save(player)
    if not silent:
        socketio.emit("speech", {"id": q["npc"], "text": q["story"]},
                      room=player.get("map", "ermo"))
        socketio.emit("toast", {"text": "📜 Nova missão: %s (Diário: tecla J)" % q["name"]}, to=sid)
    _emit_quests(sid, player)
    return True


def _quest_deliver(sid, player, qid):
    q = quests_def.get(qid)
    if not q or not _quest_ready(player, qid, q):
        return False
    f = player.get("ficha") or {}
    st = f["quests"][qid]
    bag = player.setdefault("inventory", [])
    for iid, need in (q.get("collect") or {}).items():
        items.remove_from_bag(bag, iid, int(need))
    rw = q.get("reward") or {}
    if rw.get("bronze"):
        player["wallet"] = int(player.get("wallet", 0)) + int(rw["bronze"])
    if rw.get("xp"):
        f["xp"] = int(f.get("xp", 0)) + int(rw["xp"])
        leveling.recompute(f)
    it = rw.get("item")
    if it:
        items.add_to_bag(bag, it[0], int(it[1]))
    st["done"] = True
    player["ficha"] = f
    _persist_loadout(player)
    _quest_save(player)
    socketio.emit("speech", {"id": q["npc"], "text": q.get("done_text", "Obrigado, viajante.")},
                  room=player.get("map", "ermo"))
    nome_it = ((" + " + ((items.get(it[0]) or {}).get("name", it[0]))) if it else "")
    socketio.emit("toast", {"text": "✅ Missão concluída: %s! (+%d bronze, +%d XP%s)" %
                            (q["name"], int(rw.get("bronze", 0)), int(rw.get("xp", 0)), nome_it)}, to=sid)
    socketio.emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]}, to=sid)
    socketio.emit("wallet", {"bronze": player.get("wallet", 0)}, to=sid)
    socketio.emit("xp", {"xp": f.get("xp", 0), "level": f.get("level", 1), "hp": f.get("hp"),
                         "hp_max": f.get("hp_max"), "prof": f.get("prof"),
                         "gained": int(rw.get("xp", 0)), "reason": "missão",
                         "pending_asi": f.get("pending_asi", [])}, to=sid)
    _emit_quests(sid, player)
    return True



@socketio.on("rune_use")
def on_rune_use(data):
    """Runas mágicas: quebra a pedra, o Nível Mágico faz o resto (área inclusa)."""
    player = world.players.get(request.sid)
    if not player:
        return
    f = player.get("ficha") or {}
    if not f.get("class_id") or int(f.get("hp", 0)) <= 0:
        return
    iid = (data or {}).get("item")
    cat = items.get(iid) or {}
    rn = cat.get("rune")
    if not rn or _bag_count(player, iid) < 1:
        return
    _ml = skills.get_lvl(f, "magic")
    if _ml < int(cat.get("ml_req", 0)):
        emit("toast", {"text": "🔮 Essa runa exige Nível Mágico %d (você: %d)." %
                       (int(cat.get("ml_req", 0)), _ml)})
        return
    lvl = int(f.get("level", 1))
    tier = int(rn.get("tier", 1))
    if rn.get("heal"):
        items.remove_from_bag(player["inventory"], iid, 1)
        cura = skills.magic_roll(lvl, _ml, *skills.HEAL_FORMULAS.get(tier, skills.HEAL_FORMULAS[2]))
        hp0 = int(f.get("hp", 1))
        f["hp"] = min(int(f.get("hp_max", 1)), hp0 + cura)
        player["ficha"] = f
        _persist_loadout(player)
        emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
        socketio.emit("rt_selfheal", {"amount": f["hp"] - hp0, "hp": f["hp"],
                                      "hp_max": f.get("hp_max")}, to=request.sid)
        socketio.emit("xp", {"xp": f.get("xp", 0), "level": lvl, "hp": f["hp"],
                             "hp_max": f.get("hp_max"), "prof": f.get("prof"), "gained": 0,
                             "pending_asi": f.get("pending_asi", [])}, to=request.sid)
        return
    tid = (data or {}).get("target") or player.get("rt_target")
    m = world.monsters.get(tid)
    if not m or not m.get("alive") or m.get("map") != player.get("map"):
        emit("toast", {"text": "Sem alvo pra runa. Aperte Tab num monstro."})
        return
    if max(abs(m["x"] - player["x"]), abs(m["y"] - player["y"])) > 6:
        emit("toast", {"text": "Alvo fora do alcance da runa."})
        return
    items.remove_from_bag(player["inventory"], iid, 1)
    _persist_loadout(player)
    emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
    area = int(rn.get("area", 0))
    if area > 0:
        socketio.emit("rt_aoe", {"x": m["x"], "y": m["y"], "r": area,
                                 "dtype": rn.get("dtype", "energia")}, room=player["map"])
    alvos = [m]
    if area > 0:
        for mm in world.monsters.values():
            if mm is m or not mm.get("alive") or mm.get("map") != player.get("map"):
                continue
            if max(abs(mm["x"] - m["x"]), abs(mm["y"] - m["y"])) <= area:
                alvos.append(mm)
    for mm in alvos:
        _mob_aggro(mm, request.sid)
        dmg = skills.magic_roll(lvl, _ml, *skills.SPELL_FORMULAS.get(tier, skills.SPELL_FORMULAS[2]))
        if mm.get("_rt_aegis_until", 0) > time.time():
            dmg = max(1, dmg // 2)
        mm["hp"] = max(0, int(mm["hp"]) - dmg)
        socketio.emit("rt_hit", {"id": mm["id"], "dmg": dmg, "crit": False, "magic": True,
                                 "by": request.sid, "spell": cat.get("name"), "sid": iid,
                                 "dtype": rn.get("dtype", "energia"),
                                 "fx": [player["x"], player["y"], mm["x"], mm["y"]],
                                 "hp": mm["hp"], "hp_max": mm["hp_max"]}, room=player["map"])
        if mm["hp"] <= 0:
            _rt_kill(request.sid, player, mm)


@socketio.on("fight_mode")
def on_fight_mode(data):
    player = world.players.get(request.sid)
    if not player:
        return
    md = (data or {}).get("mode")
    if md not in ("off", "bal", "def"):
        return
    f = player.get("ficha") or {}
    f["fight_mode"] = md
    player["ficha"] = f
    _quest_save(player)
    emit("fight_mode", {"mode": md})


@socketio.on("skills_get")
def on_skills_get(_data=None):
    player = world.players.get(request.sid)
    f = (player or {}).get("ficha") or {}
    if not player or not f.get("class_id"):
        return
    sk = skills.ensure(f)
    out = []
    for s in list(skills.SKILLS) + ["magic"]:
        st = sk.get(s) or {}
        lvl0 = int(st.get("lvl", 0))
        need = skills.tries_needed(f.get("class_id"), s, lvl0)
        out.append({"id": s, "name": skills.SKILL_NAMES.get(s, s), "lvl": lvl0,
                    "pct": min(99, int(100 * int(st.get("t", 0)) / max(1, need)))})
    emit("skills", {"skills": out, "mode": f.get("fight_mode", "bal")})


@socketio.on("quests_get")
def on_quests_get(_data=None):
    """O cliente pede o Diário: garante o Chamado do Valdris na primeira vez."""
    player = world.players.get(request.sid)
    if not player or not (player.get("ficha") or {}).get("class_id"):
        return
    _market_payout(request.sid, player)
    if not ((player.get("ficha") or {}).get("skills") or {}).get("magic"):
        skills.ensure(player.get("ficha") or {})
        _quest_save(player)
    elif skills.recalibrate(player.get("ficha") or {}):
        _quest_save(player)
        socketio.emit("toast", {"text": "\U0001F52E Seu Nivel Magico foi recalibrado pela sua vocacao! (tecla L)"},
                      to=request.sid)
    _ft = (player.get("ficha") or {}).get("title")
    if _ft and player.get("title") != _ft:
        player["title"] = _ft
        socketio.emit("player_title", {"id": request.sid, "title": _ft},
                      room=player.get("map", "ermo"))
    f = player.get("ficha") or {}
    if "chamado_valdris" not in (f.get("quests") or {}):
        _quest_start(request.sid, player, "chamado_valdris", silent=True)
        socketio.emit("toast", {"text": "📜 Nova missão: O Chamado do Feiticeiro (Diário: tecla J)"},
                      to=request.sid)
    _emit_quests(request.sid, player)




# ===========================================================================
#  MESA DE NEGÓCIOS (taverna): Mercado assíncrono (taxa de 5%% pro Cofre da
#  Cidade) + ofertas diretas cara a cara (sem taxa). Itens listados ficam em
#  ESCROW: saem da mochila ao listar e voltam se cancelar.
# ===========================================================================
MARKET_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "market.json")
try:
    with open(MARKET_PATH) as _mf:
        MARKET = json.load(_mf)
except Exception:
    MARKET = {"seq": 0, "listings": [], "payouts": {}, "chest": 0}


def _market_save():
    try:
        os.makedirs(os.path.dirname(MARKET_PATH), exist_ok=True)
        with open(MARKET_PATH, "w") as _mf:
            json.dump(MARKET, _mf)
    except Exception as exc:
        print("erro salvando mercado:", exc)


def _market_payload(sid, player):
    pid = player.get("player_id")
    listings = []
    for l in MARKET["listings"]:
        listings.append({"id": l["id"], "item": l["item"],
                         "name": (items.get(l["item"]) or {}).get("name", l["item"]),
                         "qty": l["qty"], "price": l["price"], "seller": l["seller"],
                         "mine": (l.get("pid") == pid)})
    bag_sale = []
    for s in (player.get("inventory") or []):
        cat = items.get(s.get("item")) or {}
        if cat.get("kind") == "currency":
            continue
        bag_sale.append({"item": s["item"], "name": cat.get("name", s["item"]),
                         "qty": int(s.get("qty", 1))})
    near = []
    for s2, p2 in world.players.items():
        if s2 == sid or not p2.get("player_id"):
            continue
        if p2.get("map") != player.get("map"):
            continue
        near.append({"id": s2, "name": p2.get("name", "?")})
    return {"listings": listings, "bag": bag_sale, "near": near,
            "chest": int(MARKET.get("chest", 0)), "wallet": int(player.get("wallet", 0))}


def _market_refresh_room():
    for s2, p2 in list(world.players.items()):
        if p2.get("map") == "taverna" and p2.get("player_id"):
            socketio.emit("market_update", _market_payload(s2, p2), to=s2)


def _market_payout(sid, player):
    """Vendas feitas enquanto você estava fora: paga na entrada."""
    pid = str(player.get("player_id") or "")
    devido = int((MARKET.get("payouts") or {}).get(pid, 0))
    if not devido:
        return
    MARKET["payouts"].pop(pid, None)
    player["wallet"] = int(player.get("wallet", 0)) + devido
    _market_save()
    socketio.emit("wallet", {"bronze": player.get("wallet", 0)}, to=sid)
    socketio.emit("toast", {"text": "💰 Suas vendas no Mercado renderam %d de bronze!" % devido}, to=sid)


@socketio.on("market_list")
def on_market_list(data):
    player = world.players.get(request.sid)
    if not player or player.get("map") != "taverna" or not player.get("player_id"):
        return
    iid = (data or {}).get("item")
    qty = max(1, int((data or {}).get("qty") or 1))
    price = int((data or {}).get("price") or 0)
    cat = items.get(iid)
    if not cat or cat.get("kind") == "currency" or price < 1 or price > 9999999:
        emit("toast", {"text": "Anúncio inválido."})
        return
    if _bag_count(player, iid) < qty:
        emit("toast", {"text": "Você não tem tudo isso na mochila."})
        return
    items.remove_from_bag(player["inventory"], iid, qty)     # ESCROW
    _persist_loadout(player)
    MARKET["seq"] = int(MARKET.get("seq", 0)) + 1
    MARKET["listings"].append({"id": MARKET["seq"], "pid": player["player_id"],
                               "seller": player.get("name", "?"), "item": iid,
                               "qty": qty, "price": price})
    _market_save()
    emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
    emit("toast", {"text": "📋 Anunciado: %dx %s por %d de bronze." %
                   (qty, cat.get("name", iid), price)})
    _market_refresh_room()


@socketio.on("market_cancel")
def on_market_cancel(data):
    player = world.players.get(request.sid)
    if not player:
        return
    lid = int((data or {}).get("id") or 0)
    for l in list(MARKET["listings"]):
        if l["id"] == lid and l.get("pid") == player.get("player_id"):
            MARKET["listings"].remove(l)
            items.add_to_bag(player.setdefault("inventory", []), l["item"], l["qty"])
            _persist_loadout(player)
            _market_save()
            emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
            emit("toast", {"text": "Anúncio cancelado: os itens voltaram pra mochila."})
            _market_refresh_room()
            return


@socketio.on("market_buy")
def on_market_buy(data):
    player = world.players.get(request.sid)
    if not player or player.get("map") != "taverna":
        return
    lid = int((data or {}).get("id") or 0)
    l = next((x for x in MARKET["listings"] if x["id"] == lid), None)
    if not l:
        emit("toast", {"text": "Esse anúncio já foi vendido."})
        _market_refresh_room()
        return
    if l.get("pid") == player.get("player_id"):
        emit("toast", {"text": "É o seu próprio anúncio: cancele pra reaver os itens."})
        return
    price = int(l["price"])
    if int(player.get("wallet", 0)) < price:
        emit("toast", {"text": "Bronze insuficiente (%d)." % price})
        return
    MARKET["listings"].remove(l)
    player["wallet"] = int(player.get("wallet", 0)) - price
    items.add_to_bag(player.setdefault("inventory", []), l["item"], l["qty"])
    _persist_loadout(player)
    taxa = price * 5 // 100
    liquido = price - taxa
    MARKET["chest"] = int(MARKET.get("chest", 0)) + taxa
    vendedor_online = None
    for s2, p2 in world.players.items():
        if p2.get("player_id") == l.get("pid"):
            vendedor_online = (s2, p2)
            break
    nome_item = (items.get(l["item"]) or {}).get("name", l["item"])
    if vendedor_online:
        s2, p2 = vendedor_online
        p2["wallet"] = int(p2.get("wallet", 0)) + liquido
        socketio.emit("wallet", {"bronze": p2.get("wallet", 0)}, to=s2)
        socketio.emit("toast", {"text": "💰 %s comprou %dx %s: +%d de bronze (taxa 5%%%%)." %
                                (player.get("name", "?"), l["qty"], nome_item, liquido)}, to=s2)
    else:
        pk = str(l.get("pid"))
        MARKET.setdefault("payouts", {})[pk] = int(MARKET["payouts"].get(pk, 0)) + liquido
    _market_save()
    emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
    emit("wallet", {"bronze": player.get("wallet", 0)})
    emit("toast", {"text": "✅ Comprado: %dx %s por %d de bronze." % (l["qty"], nome_item, price)})
    _market_refresh_room()


# ---------- OFERTA DIRETA (cara a cara, sem taxa) ----------
_offers = {}
_offer_seq = [0]


@socketio.on("offer_send")
def on_offer_send(data):
    player = world.players.get(request.sid)
    if not player:
        return
    alvo_sid = (data or {}).get("to")
    alvo = world.players.get(alvo_sid)
    iid = (data or {}).get("item")
    qty = max(1, int((data or {}).get("qty") or 1))
    price = max(0, int((data or {}).get("price") or 0))
    cat = items.get(iid)
    if not alvo or alvo_sid == request.sid or not alvo.get("player_id") or \
       alvo.get("map") != player.get("map") or not cat or cat.get("kind") == "currency":
        emit("toast", {"text": "Oferta inválida."})
        return
    if _bag_count(player, iid) < qty:
        emit("toast", {"text": "Você não tem tudo isso na mochila."})
        return
    _offer_seq[0] += 1
    oid = _offer_seq[0]
    _offers[oid] = {"from": request.sid, "to": alvo_sid, "item": iid, "qty": qty,
                    "price": price, "ts": time.time()}
    socketio.emit("trade_offer", {"id": oid, "from_name": player.get("name", "?"),
                                  "item_name": cat.get("name", iid), "qty": qty,
                                  "price": price}, to=alvo_sid)
    emit("toast", {"text": "🤝 Oferta enviada pra %s. Aguardando..." % alvo.get("name", "?")})


@socketio.on("offer_answer")
def on_offer_answer(data):
    oid = int((data or {}).get("id") or 0)
    aceitar = bool((data or {}).get("accept"))
    of = _offers.pop(oid, None)
    if not of or of.get("to") != request.sid or time.time() - of.get("ts", 0) > 90:
        emit("toast", {"text": "Essa oferta expirou."})
        return
    de = world.players.get(of["from"])
    para = world.players.get(of["to"])
    if not de or not para:
        return
    if not aceitar:
        socketio.emit("toast", {"text": "%s recusou a oferta." % para.get("name", "?")},
                      to=of["from"])
        return
    if _bag_count(de, of["item"]) < of["qty"]:
        socketio.emit("toast", {"text": "A oferta caducou: o vendedor não tem mais os itens."},
                      to=of["to"])
        return
    if int(para.get("wallet", 0)) < of["price"]:
        emit("toast", {"text": "Bronze insuficiente pra aceitar."})
        return
    items.remove_from_bag(de["inventory"], of["item"], of["qty"])
    items.add_to_bag(para.setdefault("inventory", []), of["item"], of["qty"])
    para["wallet"] = int(para.get("wallet", 0)) - of["price"]
    de["wallet"] = int(de.get("wallet", 0)) + of["price"]
    _persist_loadout(de)
    _persist_loadout(para)
    nome_item = (items.get(of["item"]) or {}).get("name", of["item"])
    for s3, p3 in ((of["from"], de), (of["to"], para)):
        socketio.emit("loadout", {"bag": p3["inventory"], "equipment": p3["equipment"]}, to=s3)
        socketio.emit("wallet", {"bronze": p3.get("wallet", 0)}, to=s3)
    socketio.emit("toast", {"text": "🤝 Negócio fechado: %dx %s por %d de bronze com %s!" %
                            (of["qty"], nome_item, of["price"], para.get("name", "?"))}, to=of["from"])
    socketio.emit("toast", {"text": "🤝 Negócio fechado: %dx %s por %d de bronze!" %
                            (of["qty"], nome_item, of["price"])}, to=of["to"])



# ===========================================================================
#  CODEX: a memória da jornada (monstros, itens, lugares) + TÍTULOS por feito.
# ===========================================================================
_TITLE_MARCOS = [
    ("kills", 100,  "Caçador"), ("kills", 500, "Matador"), ("kills", 2000, "Lenda Viva"),
    ("lugares", 15, "Andarilho"), ("lugares", 35, "Cartógrafo"),
    ("itens", 100, "Colecionador"), ("itens", 300, "Curador do Ermo"),
]


def _check_titles(sid, player):
    """Confere os marcos do Codex e concede títulos novos. True se ganhou algum."""
    f = player.get("ficha") or {}
    cod = f.get("codex") or {}
    stats = {"kills": sum((cod.get("m") or {}).values()),
             "lugares": len(cod.get("l") or {}),
             "itens": len(cod.get("i") or {})}
    titles = f.setdefault("titles", [])
    ganhou = False
    for (chave, minimo, titulo) in _TITLE_MARCOS:
        if stats.get(chave, 0) >= minimo and titulo not in titles:
            titles.append(titulo)
            ganhou = True
            socketio.emit("toast", {"text": "🏅 Novo título conquistado: %s! "
                                    "(escolha no Codex: tecla K)" % titulo}, to=sid)
    if ganhou:
        player["ficha"] = f
    return ganhou


@socketio.on("codex_get")
def on_codex_get(_data=None):
    player = world.players.get(request.sid)
    f = (player or {}).get("ficha") or {}
    if not player or not f.get("class_id"):
        return
    cod = f.get("codex") or {"m": {}, "i": {}, "l": {}}
    ms = sorted([{"name": (monsters_def.MONSTERS.get(t) or {}).get("name", t), "kills": int(k)}
                 for t, k in (cod.get("m") or {}).items()], key=lambda x: -x["kills"])
    its = sorted([{"name": (items.get(i) or {}).get("name", i),
                   "rarity": (items.get(i) or {}).get("rarity") or "comum"}
                  for i in (cod.get("i") or {})], key=lambda x: x["name"])
    ls = sorted([MAP_TITLES.get(l, l.replace("_", " ").title()) for l in (cod.get("l") or {})])
    emit("codex", {"m": ms, "tot_m": len(monsters_def.MONSTERS),
                   "i": its, "tot_i": len(items.ITEMS),
                   "l": ls, "tot_l": len(wm.MAPS),
                   "titles": f.get("titles") or [], "title": f.get("title") or ""})


@socketio.on("set_title")
def on_set_title(data):
    player = world.players.get(request.sid)
    if not player:
        return
    f = player.get("ficha") or {}
    t = ((data or {}).get("title") or "").strip()
    if t and t not in (f.get("titles") or []):
        emit("toast", {"text": "Você não conquistou esse título."})
        return
    f["title"] = t
    player["ficha"] = f
    player["title"] = t
    _quest_save(player)
    socketio.emit("player_title", {"id": request.sid, "title": t},
                  room=player.get("map", "ermo"))
    emit("toast", {"text": ("🏅 Título ativo: %s" % t) if t else "Título removido."})



# ===========================================================================
#  A FENDA DO CAOS: chave abre, andares infinitos, ranking de profundidade.
#  A BIGORNA DO BRAGAN: +1/+2/+3 com risco real. O ALTAR: fortuna paga.
# ===========================================================================
FENDA_MAP = "ossuario"        # o portal vive no fundo do Ossuário
FENDA_POS = (9, 3)
OSSUARIO_DESCE = (3, 12)      # o alçapão, no canto sudoeste do templo
FENDA_POCO = (8, 2)           # o poço de descida, no fundo da câmara
FENDA = {"floor": 0, "open": False}
FENDA_RECORDS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                  "data", "fenda_records.json")
try:
    with open(FENDA_RECORDS_PATH) as _ff:
        FENDA_RECORDS = json.load(_ff)
except Exception:
    FENDA_RECORDS = {}


def _save_fenda_records():
    try:
        os.makedirs(os.path.dirname(FENDA_RECORDS_PATH), exist_ok=True)
        with open(FENDA_RECORDS_PATH, "w") as _ff:
            json.dump(FENDA_RECORDS, _ff)
    except Exception as exc:
        print("erro salvando recordes da fenda:", exc)


def _fenda_players():
    return [(s, p) for s, p in world.players.items()
            if p.get("map") == "fenda" and p.get("player_id")]


def _fenda_reset():
    FENDA["floor"] = 0
    FENDA["open"] = False
    for mid in [k for k, mm in list(world.monsters.items()) if mm.get("fenda")]:
        world.monsters.pop(mid, None)


def _fenda_spawn_floor(n):
    """Popula o andar n: pack escalado pela profundidade (+ Eco de chefe a cada 5)."""
    import uuid
    FENDA["floor"] = n
    FENDA["open"] = False
    for mid in [k for k, mm in list(world.monsters.items()) if mm.get("fenda")]:
        world.monsters.pop(mid, None)
    alvo = 60 * (1.32 ** n)
    pool = [t for t, s in monsters_def.MONSTERS.items()
            if not s.get("passive") and not s.get("boss")
            and alvo * 0.45 <= int(s.get("hp", 0)) <= alvo * 2.2]
    if not pool:
        forte = sorted(monsters_def.MONSTERS,
                       key=lambda t: -int(monsters_def.MONSTERS[t].get("hp", 0)))
        pool = [t for t in forte if not monsters_def.MONSTERS[t].get("passive")
                and not monsters_def.MONSTERS[t].get("boss")][:6]
    count = min(3 + n // 2, 8)
    for _ in range(count):
        t = random.choice(pool)
        s = monsters_def.MONSTERS[t]
        nid = "fnd:" + uuid.uuid4().hex[:8]
        world.monsters[nid] = {"id": nid, "type": t, "name": s.get("name", t),
            "map": "fenda", "x": random.randint(3, 13), "y": random.randint(3, 8),
            "hp": int(s.get("hp", 50)), "hp_max": int(s.get("hp", 50)),
            "ac": int(s.get("ac", 12)), "size": int(s.get("size", 1)),
            "atk": int(s.get("atk", 3)), "dmg": dict(s.get("dmg") or {"n": 1, "d": 6}),
            "xp": int(s.get("xp", 0)), "speed": int(s.get("speed", 5)),
            "reach": int(s.get("reach", 1)), "boss": False,
            "glyph": s.get("glyph"), "alive": True, "in_combat": False,
            "temp": True, "fenda": True, "_spawn": (t, 8, 5), "_rt_next": 0, "_rt_next_f": 0}
    if n % 5 == 0:
        bosses = [t for t, s in monsters_def.MONSTERS.items() if s.get("boss")]
        t = random.choice(bosses)
        s = monsters_def.MONSTERS[t]
        nid = "fnd:" + uuid.uuid4().hex[:8]
        world.monsters[nid] = {"id": nid, "type": t, "name": "Eco de %s" % s.get("name", t),
            "map": "fenda", "x": 8, "y": 4,
            "hp": int(int(s.get("hp", 500)) * 0.7), "hp_max": int(int(s.get("hp", 500)) * 0.7),
            "ac": int(s.get("ac", 14)), "size": int(s.get("size", 2)),
            "atk": int(s.get("atk", 6)), "dmg": dict(s.get("dmg") or {"n": 2, "d": 8}),
            "xp": int(int(s.get("xp", 0)) * 0.7), "speed": int(s.get("speed", 5)),
            "reach": int(s.get("reach", 1)), "boss": False,
            "glyph": s.get("glyph"), "alive": True, "in_combat": False,
            "temp": True, "fenda": True, "_spawn": (t, 8, 4), "_rt_next": 0, "_rt_next_f": 0}
    try:
        _world_refresh("fenda")
    except Exception:
        pass
    socketio.emit("toast", {"text": "🌀 Fenda: andar %d. Limpe a câmara pra abrir o poço." % n},
                  room="fenda")


def _try_ossuario(player):
    """A escada do templo desce pro Ossuário; a do Ossuário volta pro templo."""
    if player.get("map") == "templo_doze" and \
       max(abs(player["x"] - OSSUARIO_DESCE[0]), abs(player["y"] - OSSUARIO_DESCE[1])) <= 2:
        _go_to(request.sid, "ossuario", 9, 10)
        socketio.emit("toast", {"text": "🦴 Você desce a escada fria. O Ossuário dos Doze "
                                "guarda os que vieram antes... e a FENDA, no fundo."},
                      to=request.sid)
        return True
    if player.get("map") == "ossuario" and player.get("y", 0) >= 10 and \
       max(abs(player["x"] - FENDA_POS[0]), abs(player["y"] - FENDA_POS[1])) > 2:
        _go_to(request.sid, "templo_doze", OSSUARIO_DESCE[0], OSSUARIO_DESCE[1])
        socketio.emit("toast", {"text": "⛪ Você sobe de volta ao Templo dos Doze."},
                      to=request.sid)
        return True
    return False


def _try_fenda(player):
    """No fundo do Ossuário, diante do portal: consome uma Chave e mergulha."""
    if player.get("map") != FENDA_MAP:
        return False
    if max(abs(player["x"] - FENDA_POS[0]), abs(player["y"] - FENDA_POS[1])) > 2:
        return False
    if FENDA["floor"] > 0 and not _fenda_players():
        _fenda_reset()                       # a fenda esfriou: recomeça do 1
    if _bag_count(player, "chave_da_fenda") < 1:
        emit("toast", {"text": "🌀 O portal murmura... exige uma CHAVE DA FENDA (o joalheiro forja no nível 3; os chefes carregam)."})
        return True
    items.remove_from_bag(player["inventory"], "chave_da_fenda", 1)
    _persist_loadout(player)
    emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
    if FENDA["floor"] == 0:
        _fenda_spawn_floor(1)
    _go_to(request.sid, "fenda", 8, 10)
    emit("toast", {"text": "🌀 Você mergulhou na Fenda do Caos (andar %d)." % FENDA["floor"]})
    return True


def _try_fenda_inside(player):
    """Dentro da Fenda: o poço desce (se aberto); a borda de baixo emerge."""
    if player.get("map") != "fenda":
        return False
    px, py = player["x"], player["y"]
    if max(abs(px - FENDA_POCO[0]), abs(py - FENDA_POCO[1])) <= 2:
        if not FENDA["open"]:
            emit("toast", {"text": "O poço está selado. Limpe a câmara primeiro."})
            return True
        prox = FENDA["floor"] + 1
        _fenda_spawn_floor(prox)
        for (s2, _p2) in _fenda_players():
            _go_to(s2, "fenda", 8, 10)
        return True
    if py >= 9:
        best = int((player.get("ficha") or {}).get("fenda_best", 0))
        _go_to(request.sid, "ossuario", 9, 9)
        socketio.emit("toast", {"text": "🌀 Você emergiu da Fenda. Seu recorde: andar %d." % best},
                      to=request.sid)
        if not _fenda_players():
            _fenda_reset()
        return True
    return False


# ---------- A BIGORNA DO BRAGAN: forja +1/+2/+3 ----------
FORGE_LEVELS = {
    1: {"bronze": 2000,  "mats": {"gema_lapidada": 1}, "chance": 1.0,  "quebra": False},
    2: {"bronze": 6000,  "mats": {"gema_lapidada": 1, "essencia_lunar": 1}, "chance": 0.75, "quebra": False},
    3: {"bronze": 15000, "mats": {"fragmento_estelar": 1}, "chance": 0.5,  "quebra": True},
}


def _forge_payload(player):
    lista = []
    vistos = set()
    for s in (player.get("inventory") or []):
        iid = s.get("item")
        cat = items.get(iid) or {}
        if cat.get("forged"):
            plus, base = int(cat["forged"]), cat.get("base", iid)
        elif cat.get("kind") in ("weapon", "armor", "trinket") and                 int(cat.get("value", 0)) >= 500 and not cat.get("stackable"):
            plus, base = 0, iid
        else:
            continue
        if plus >= 3 or iid in vistos:
            continue
        vistos.add(iid)
        nx = FORGE_LEVELS[plus + 1]
        lista.append({"item": iid, "name": cat.get("name", iid), "plus": plus,
                      "next": plus + 1, "bronze": nx["bronze"],
                      "chance": int(nx["chance"] * 100), "quebra": nx["quebra"],
                      "mats": [{"name": (items.get(mi) or {}).get("name", mi),
                                "have": _bag_count(player, mi), "need": mq}
                               for mi, mq in nx["mats"].items()]})
    return {"items": lista, "wallet": int(player.get("wallet", 0))}


def _try_bigorna(player):
    if player.get("map") != "oficina_ferreiro":
        return False
    if max(abs(player["x"] - 5), abs(player["y"] - 3)) > 2:
        return False
    emit("forge_open", _forge_payload(player))
    return True


@socketio.on("forge_try")
def on_forge_try(data):
    player = world.players.get(request.sid)
    if not player or player.get("map") != "oficina_ferreiro":
        return
    iid = (data or {}).get("item")
    cat = items.get(iid) or {}
    if not cat or _bag_count(player, iid) < 1:
        return
    plus = int(cat.get("forged", 0))
    base = cat.get("base", iid)
    if plus >= 3:
        return
    nx = FORGE_LEVELS[plus + 1]
    if int(player.get("wallet", 0)) < nx["bronze"]:
        emit("toast", {"text": "Bronze insuficiente (%d)." % nx["bronze"]})
        return
    for mi, mq in nx["mats"].items():
        if _bag_count(player, mi) < mq:
            emit("toast", {"text": "Falta material: %s." % (items.get(mi) or {}).get("name", mi)})
            return
    player["wallet"] = int(player.get("wallet", 0)) - nx["bronze"]
    for mi, mq in nx["mats"].items():
        items.remove_from_bag(player["inventory"], mi, mq)
    sucesso = random.random() < nx["chance"]
    nome = cat.get("name", iid)
    if sucesso:
        items.remove_from_bag(player["inventory"], iid, 1)
        novo = "%s_p%d" % (base, plus + 1)
        items.add_to_bag(player["inventory"], novo, 1)
        emit("toast", {"text": "🔨✨ A bigorna canta: %s!" %
                       (items.get(novo) or {}).get("name", novo)})
        if plus + 1 == 3:
            socketio.emit("toast", {"text": "🔨🌟 %s forjou %s na bigorna do Bragan!" %
                                    (player.get("name", "Alguém"),
                                     (items.get(novo) or {}).get("name", novo))})
    elif nx["quebra"]:
        items.remove_from_bag(player["inventory"], iid, 1)
        emit("toast", {"text": "💔 A bigorna range... %s SE PARTIU. O Bragan desvia o olhar." % nome})
        socketio.emit("toast", {"text": "💔 %s viu %s se partir na bigorna. Um minuto de silêncio." %
                                (player.get("name", "Alguém"), nome)})
    else:
        emit("toast", {"text": "🔨 A forja falhou: %s resistiu, mas os materiais viraram fumaça." % nome})
    _persist_loadout(player)
    emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
    emit("wallet", {"bronze": player.get("wallet", 0)})
    emit("forge_open", _forge_payload(player))


def _try_altar(player):
    """No Templo, diante do altar: a Oferenda de Fortuna (1000 de bronze)."""
    if player.get("map") != "templo_doze":
        return False
    if max(abs(player["x"] - 10), abs(player["y"] - 3)) > 2:
        return False
    emit("confirm", {
        "action": "altar_fortuna",
        "title": "Oferenda de Fortuna aos Doze? (1000 de bronze)",
        "body": "A chama aceita seu bronze e devolve SORTE: +50%% de chance de "
                "drops raros por 30 minutos. Os Doze gostam de quem arrisca.",
        "ok": "Ofertar 1000", "cancel": "Hoje não",
    })
    return True



# ===========================================================================
#  A ARENA DO ERMO: duelos consensuais no ringue (amistoso ou aposta),
#  ranking eterno e o prêmio pago pelo Cofre da Cidade (as taxas do Mercado).
# ===========================================================================
ARENA_MASTRO = (10, 7)
ARENA_CANTOS = ((6, 7), (14, 7))
ARENA_RECORDS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                  "data", "arena_records.json")
try:
    with open(ARENA_RECORDS_PATH) as _af:
        ARENA_RECORDS = json.load(_af)
except Exception:
    ARENA_RECORDS = {}
_duels = {}
_duel_seq = [0]


def _save_arena_records():
    try:
        os.makedirs(os.path.dirname(ARENA_RECORDS_PATH), exist_ok=True)
        with open(ARENA_RECORDS_PATH, "w") as _af:
            json.dump(ARENA_RECORDS, _af)
    except Exception as exc:
        print("erro salvando ranking da arena:", exc)


def _arena_payload(sid, player):
    near = [{"id": s2, "name": p2.get("name", "?")}
            for s2, p2 in world.players.items()
            if s2 != sid and p2.get("player_id") and p2.get("map") == "arena"
            and not p2.get("duel_foe")]
    rank = sorted(([n, r.get("w", 0), r.get("l", 0)] for n, r in ARENA_RECORDS.items()),
                  key=lambda x: -x[1])[:10]
    me = ARENA_RECORDS.get(player.get("name", ""), {})
    return {"near": near, "ranking": rank, "chest": int(MARKET.get("chest", 0)),
            "me": {"w": me.get("w", 0), "l": me.get("l", 0)},
            "wallet": int(player.get("wallet", 0))}


def _try_mastro(player):
    if player.get("map") != "arena":
        return False
    if max(abs(player["x"] - ARENA_MASTRO[0]), abs(player["y"] - ARENA_MASTRO[1])) > 2:
        return False
    if player.get("duel_foe"):
        emit("toast", {"text": "Você está DUELANDO. Resolve isso primeiro."})
        return True
    emit("arena_open", _arena_payload(request.sid, player))
    return True


@socketio.on("duel_send")
def on_duel_send(data):
    player = world.players.get(request.sid)
    if not player or player.get("map") != "arena" or player.get("duel_foe"):
        return
    alvo_sid = (data or {}).get("to")
    bet = max(0, int((data or {}).get("bet") or 0))
    alvo = world.players.get(alvo_sid)
    if not alvo or alvo.get("map") != "arena" or alvo.get("duel_foe") or alvo_sid == request.sid:
        emit("toast", {"text": "Esse oponente não está disponível."})
        return
    if bet and (int(player.get("wallet", 0)) < bet or int(alvo.get("wallet", 0)) < bet):
        emit("toast", {"text": "Um dos dois não cobre essa aposta."})
        return
    _duel_seq[0] += 1
    did = _duel_seq[0]
    _duels[did] = {"a": request.sid, "b": alvo_sid, "bet": bet, "ts": time.time(), "on": False}
    socketio.emit("duel_offer", {"id": did, "from_name": player.get("name", "?"), "bet": bet},
                  to=alvo_sid)
    emit("toast", {"text": "⚔️ Desafio enviado pra %s%s." %
                   (alvo.get("name", "?"), (" (aposta: %d)" % bet) if bet else " (amistoso)")})


@socketio.on("duel_answer")
def on_duel_answer(data):
    did = int((data or {}).get("id") or 0)
    d = _duels.get(did)
    if not d or d.get("b") != request.sid or d.get("on") or time.time() - d.get("ts", 0) > 90:
        _duels.pop(did, None)
        emit("toast", {"text": "Esse desafio expirou."})
        return
    if not (data or {}).get("accept"):
        _duels.pop(did, None)
        socketio.emit("toast", {"text": "O desafio foi recusado."}, to=d["a"])
        return
    pa, pb = world.players.get(d["a"]), world.players.get(d["b"])
    if not pa or not pb or pa.get("map") != "arena" or pb.get("map") != "arena":
        _duels.pop(did, None)
        return
    bet = int(d.get("bet", 0))
    if bet and (int(pa.get("wallet", 0)) < bet or int(pb.get("wallet", 0)) < bet):
        _duels.pop(did, None)
        socketio.emit("toast", {"text": "A aposta não fecha mais. Duelo cancelado."}, to=d["a"])
        return
    if bet:
        pa["wallet"] = int(pa.get("wallet", 0)) - bet
        pb["wallet"] = int(pb.get("wallet", 0)) - bet
        for s3, p3 in ((d["a"], pa), (d["b"], pb)):
            socketio.emit("wallet", {"bronze": p3.get("wallet", 0)}, to=s3)
    d["on"] = True
    pa["duel_foe"] = d["b"]
    pb["duel_foe"] = d["a"]
    pa["_duel_id"] = did
    pb["_duel_id"] = did
    _go_to(d["a"], "arena", ARENA_CANTOS[0][0], ARENA_CANTOS[0][1])
    _go_to(d["b"], "arena", ARENA_CANTOS[1][0], ARENA_CANTOS[1][1])
    socketio.emit("toast", {"text": "🏟️ DUELO: %s vs %s%s! Que vença o melhor." %
                            (pa.get("name", "?"), pb.get("name", "?"),
                             (" (pote: %d)" % (bet * 2)) if bet else "")}, room="arena")
    socketio.emit("duel_start", {"foe": pb.get("name", "?"), "bet": bet}, to=d["a"])
    socketio.emit("duel_start", {"foe": pa.get("name", "?"), "bet": bet}, to=d["b"])


def _duel_end(win_sid, lose_sid, wo=False):
    pw, pl2 = world.players.get(win_sid), world.players.get(lose_sid)
    did = (pw or pl2 or {}).get("_duel_id")
    d = _duels.pop(did, None) or {}
    bet = int(d.get("bet", 0))
    for p3 in (pw, pl2):
        if p3:
            p3.pop("duel_foe", None)
            p3.pop("_duel_id", None)
    if not pw:
        return
    ganho = []
    if bet:
        pw["wallet"] = int(pw.get("wallet", 0)) + bet * 2
        ganho.append("%d do pote" % (bet * 2))
    premio = int(MARKET.get("chest", 0)) // 5
    if premio > 0:
        MARKET["chest"] = int(MARKET.get("chest", 0)) - premio
        pw["wallet"] = int(pw.get("wallet", 0)) + premio
        _market_save()
        ganho.append("%d do Cofre da Cidade" % premio)
    socketio.emit("wallet", {"bronze": pw.get("wallet", 0)}, to=win_sid)
    nw, nl = pw.get("name", "?"), (pl2 or {}).get("name", "?")
    rw = ARENA_RECORDS.setdefault(nw, {"w": 0, "l": 0})
    rw["w"] = int(rw.get("w", 0)) + 1
    rl = ARENA_RECORDS.setdefault(nl, {"w": 0, "l": 0})
    rl["l"] = int(rl.get("l", 0)) + 1
    _save_arena_records()
    fw = pw.get("ficha") or {}
    fw.setdefault("titles", [])
    for (minimo, titulo) in ((10, "Gladiador do Ermo"), (50, "Campeão da Arena")):
        if rw["w"] >= minimo and titulo not in fw["titles"]:
            fw["titles"].append(titulo)
            socketio.emit("toast", {"text": "🏅 Novo título conquistado: %s!" % titulo}, to=win_sid)
    pw["ficha"] = fw
    _quest_save(pw)
    socketio.emit("toast", {"text": "🏟️ %s venceu %s na Arena%s%s!" %
                            (nw, nl, " por W.O." if wo else "",
                             (" e leva " + " + ".join(ganho)) if ganho else "")})
    socketio.emit("duel_end", {"win": True}, to=win_sid)
    if pl2:
        socketio.emit("duel_end", {"win": False}, to=lose_sid)



# ===========================================================================
#  CÉREBRO DE CHEFE (tempo real): falas, invocação e perseguição.
# ===========================================================================
BOSS_LINES = {
    "velho_bob":       ["GRUNF! Minha praia, minhas regras!", "Os filhos da mata ouvem o velho... VEM, CRIANÇADA!", "Você tem cheiro de almoço.", "Tem os ovão bem grandão, o nome dele é BOB."],
    "maraja":          ["CURVE-SE. A savana inteira já se curvou.", "Minha juba já viu cem como você virarem poeira.", "RUGIDO é aviso. Só dou UM."],
    "lorde_varth":     ["A Torre não recebe visitas. Recebe SÚDITOS.", "Atalech sussurra seu nome... e ri.", "Eu já morri uma vez. Foi TÉDIO."],
    "krezath":         ["FOME. Sempre a FOME.", "Você não é inimigo. É PRATO.", "O Devorador agradece a entrega."],
    "farao_avhur":     ["Mil anos de areia, e VOCÊ me acorda?", "Meus mineiros cavam até no além.", "A eternidade é MINHA por direito."],
    "colosso_avasham": ["A MONTANHA. ANDA.", "Pequeno. Tão... pequeno.", "Avasham lembra. Avasham ESMAGA."],
    "urso_rei":        ["O bosque tem UM rei. Ajoelhe.", "Minhas garras escreveram a lei daqui.", "GRRRAAAH! Fora do meu reino!"],
    "vulkar":          ["O Brasal arde em MIM.", "Cinzas. É o que sobra de heróis.", "Sinta o calor da Ferida."],
    "dama_noite":      ["Shhh... a noite é um veludo, e eu sou a costureira.", "Que olhos lindos. Serão meus.", "Dance comigo. A última dança."],
    "maurao":          ["Ô, chegou o corajoso. SEGURA ESSA.", "Aqui embaixo quem manda é o MAURÃO.", "Vou te ensinar a nadar. No chão."],
    "_":               ["Você OUSA?!", "Mais um pro monte.", "GRRRAAAH!"],
}



def _mob_aggro(m, sid, prop=True):
    """O bicho memoriza quem o feriu (20s) e o bando escuta o chamado."""
    if not m or not sid:
        return
    m["_aggro_sid"] = sid
    m["_aggro_until"] = time.time() + 20
    if not prop:
        return
    for x in world.monsters.values():
        if x is m or not x.get("alive") or x.get("passive"):
            continue
        if x.get("type") != m.get("type") or x.get("map") != m.get("map"):
            continue
        if max(abs(x["x"] - m["x"]), abs(x["y"] - m["y"])) <= 4:
            _mob_aggro(x, sid, prop=False)


def _rt_boss_summon(m, spec, n):
    """O chefe chama reforço em tempo real (lacaios temporários marcados)."""
    import uuid
    stype = spec.get("summon_type") or "capanga"
    types = stype if isinstance(stype, list) else [stype]
    novos = 0
    for _ in range(n * 4):
        if novos >= n:
            break
        t = random.choice(types)
        s2 = monsters_def.MONSTERS.get(t)
        if not s2:
            continue
        tx = m["x"] + random.randint(-2, 2)
        ty = m["y"] + random.randint(-2, 2)
        if not rules.is_walkable(tx, ty, m.get("map")):
            continue
        nid = "smn:" + uuid.uuid4().hex[:8]
        world.monsters[nid] = {"id": nid, "type": t, "name": s2.get("name", t),
            "map": m.get("map"), "x": tx, "y": ty,
            "hp": int(s2.get("hp", 20)), "hp_max": int(s2.get("hp", 20)),
            "ac": int(s2.get("ac", 12)), "size": int(s2.get("size", 1)),
            "glyph": s2.get("glyph"), "alive": True, "in_combat": False,
            "temp": True, "_minion_of": m.get("id"),
            "_spawn": (t, tx, ty), "_rt_next": 0, "_rt_next_f": 0}
        novos += 1
    if novos:
        socketio.emit("speech", {"id": m.get("id"),
                      "text": "%s chama reforços!" % m.get("name", "O chefe")},
                      room=m.get("map"))
        try:
            _world_refresh(m.get("map"))
        except Exception:
            pass


def _rt_party_allies(sid, pl):
    """Membros do grupo no MESMO mapa a até 10 tiles (inclui o próprio jogador)."""
    pid = _player_party.get(sid)
    if not pid:
        return [sid]
    out = []
    for s in _parties.get(pid, []):
        p2 = world.players.get(s)
        if not p2 or p2.get("map") != pl.get("map"):
            continue
        if max(abs(p2.get("x", 0) - pl.get("x", 0)), abs(p2.get("y", 0) - pl.get("y", 0))) > 10:
            continue
        out.append(s)
    return out or [sid]


def _posture_of(f):
    """Postura ativa do Paladino: passiva FIXA aplicada no combate em tempo real."""
    if (f or {}).get("class_id") != "paladino":
        return None
    return f.get("posture") or None


@socketio.on("set_posture")
def on_set_posture(data=None):
    """Paladino assume uma postura de Valíria FIXA (mesmo padrão da Forma Selvagem):
    fica gravada na ficha, vale como passiva em todo combate e troca quando quiser."""
    player = world.players.get(request.sid)
    if not player:
        return
    f = player.get("ficha") or {}
    if f.get("class_id") != "paladino":
        emit("toast", {"text": "Só os paladinos de Valíria dominam as posturas."})
        return
    pid = (data or {}).get("posture")
    post = classes.get_posture("paladino", pid) if pid else None
    if pid and not post:
        emit("toast", {"text": "Essa postura não existe."})
        return
    f["posture"] = (pid if post else None)
    player["ficha"] = f
    try:
        db.save_ficha(player["player_id"], f)
    except Exception:
        pass
    emit("posture_set", {"posture": f.get("posture"),
                         "name": (post["name"] if post else None),
                         "icon": (post.get("icon") if post else None)})
    if post:
        emit("toast", {"text": "Postura assumida: %s %s (fica FIXA até você trocar)" %
                       (post.get("icon", ""), post["name"])})
    else:
        emit("toast", {"text": "Você voltou à postura neutra."})


def _rt_engage(sid, monster_list):
    """Qualquer gatilho antigo de combate (clique, aggro) vira: mirar o alvo."""
    player = world.players.get(sid)
    if not player or not monster_list:
        return
    alvo = monster_list[0]
    player["rt_target"] = alvo.get("id")
    socketio.emit("rt_engage", {"target": alvo.get("id"), "boss": bool((monsters_def.MONSTERS.get(alvo.get("type"), {}) or {}).get("boss"))}, to=sid)


@socketio.on("rt_target")
def on_rt_target(data):
    """Tab / clique: escolhe (ou troca) o alvo do auto-ataque."""
    player = world.players.get(request.sid)
    if not player:
        return
    tid = (data or {}).get("target")
    if not tid:
        player["rt_target"] = None
        return
    m = world.monsters.get(tid)
    if m and m.get("alive") and m.get("map") == player.get("map"):
        player["rt_target"] = tid
        emit("rt_engage", {"target": tid, "boss": bool((monsters_def.MONSTERS.get((world.monsters.get(tid) or {}).get("type"), {}) or {}).get("boss"))})


def _rt_roll_dmg(dmg, crit):
    n = int(dmg.get("n", 1)) * (2 if crit else 1)
    return sum(random.randint(1, int(dmg.get("d", 4))) for _ in range(n)) + int(dmg.get("flat", 0))



def _rt_summon(invocador, minion_type, count):
    """Invoca reforços temporários ao lado do monstro (somem ao morrer)."""
    spec = monsters_def.MONSTERS.get(minion_type)
    if not spec:
        return
    import uuid
    for _ in range(max(1, count)):
        nid = "rtm:" + uuid.uuid4().hex[:8]
        novo = dict(invocador)
        novo.pop("_rt_abcd", None)
        novo.update({
            "id": nid, "type": minion_type, "name": spec.get("name", minion_type),
            "hp": int(spec.get("hp", 100)), "hp_max": int(spec.get("hp", 100)),
            "ac": int(spec.get("ac", 12)), "size": int(spec.get("size", 1)),
            "atk": int(spec.get("atk", 3)), "dmg": dict(spec.get("dmg") or {"n": 1, "d": 6}),
            "xp": int(spec.get("xp", 0)), "speed": int(spec.get("speed", 5)),
            "reach": int(spec.get("reach", 1)), "boss": False, "passive": bool(spec.get("passive")),
            "glyph": spec.get("glyph"), "alive": True, "in_combat": False, "temp": True,
            "x": invocador["x"] + random.randint(-1, 1),
            "y": invocador["y"] + random.randint(-1, 1),
            "_spawn": (minion_type, invocador["x"], invocador["y"]),
            "_rt_next": 0, "_rt_next_f": 0,
        })
        world.monsters[nid] = novo
    try:
        _world_refresh(invocador.get("map", "ermo"))
    except Exception:
        pass


def _rt_kill(sid, pl, m):
    """Monstro caiu em tempo real: XP, drops, bronze, respawn agendado."""
    m["alive"] = False
    m["hp"] = 0
    socketio.emit("rt_dead", {"id": m["id"]}, room=m.get("map"))
    if m.get("temp"):
        world.monsters.pop(m["id"], None)     # invocado: some pra sempre
        if m.get("fenda") and not any(mm.get("fenda") and mm.get("alive")
                                      for mm in world.monsters.values()):
            FENDA["open"] = True
            _flr = int(FENDA.get("floor", 1))
            socketio.emit("toast", {"text": "🌀 Andar %d LIMPO! O poço se abriu." % _flr},
                          room="fenda")
            socketio.emit("fenda_open", {"floor": _flr}, room="fenda")
            for (_fs, _fp) in _fenda_players():
                _fp["wallet"] = int(_fp.get("wallet", 0)) + 50 * _flr
                socketio.emit("wallet", {"bronze": _fp.get("wallet", 0)}, to=_fs)
                _ffi = _fp.get("ficha") or {}
                if _flr > int(_ffi.get("fenda_best", 0)):
                    _ffi["fenda_best"] = _flr
                    _fp["ficha"] = _ffi
                    _quest_save(_fp)
                    _nm = _fp.get("name", "Alguém")
                    if _flr > int(FENDA_RECORDS.get(_nm, 0)):
                        FENDA_RECORDS[_nm] = _flr
                        _save_fenda_records()
                _rmf = 1.0 + _flr / 3.0
                for (_rar, _ch) in RARE_CHANCES:
                    if random.random() < _ch * _rmf:
                        _pool = _rarity_pool(_rar)
                        if _pool:
                            _rid = random.choice(_pool)
                            items.add_to_bag(_fp.setdefault("inventory", []), _rid, 1)
                            socketio.emit("rare_drop", {"rarity": _rar, "item": _rid,
                                "name": (items.get(_rid) or {}).get("name", _rid),
                                "color": RARE_COLORS.get(_rar)}, to=_fs)
                            socketio.emit("loadout", {"bag": _fp["inventory"],
                                "equipment": _fp["equipment"]}, to=_fs)
                        break
    elif (monsters_def.MONSTERS.get(m.get("type"), {}) or {}).get("boss"):
        _MONSTER_RESPAWNS.append((m["id"], time.time() +
                                  random.randint(BOSS_RESPAWN_MIN, BOSS_RESPAWN_MAX)))
    else:
        _MONSTER_RESPAWNS.append((m["id"], time.time() + 90))
    spec = monsters_def.MONSTERS.get(m.get("type"), {}) or {}
    f = pl.get("ficha") or {}
    ganho = int(spec.get("xp", 0))
    _aliados = _rt_party_allies(sid, pl)
    if len(_aliados) > 1:
        ganho = int(ganho * (1 + 0.10 * (len(_aliados) - 1)))   # caçar junto rende mais
    lvl_antes = int(f.get("level", 1))
    f["xp"] = int(f.get("xp", 0)) + ganho
    leveling.recompute(f)
    pl["ficha"] = f
    bag = pl.setdefault("inventory", [])
    loot, bronze = monsters_def.roll_drops(m.get("type"))
    got = []
    for (iid, qty) in loot:
        if not items.exists(iid):
            continue
        cat = items.get(iid)
        if cat.get("kind") == "currency":
            bronze += int(cat.get("value", 1)) * qty
            continue
        items.add_to_bag(bag, iid, qty)
        got.append("%dx %s" % (qty, cat.get("name", iid)))
    if bronze:
        pl["wallet"] = int(pl.get("wallet", 0)) + bronze
    try:
        if pl.get("player_id"):
            db.save_ficha(pl["player_id"], f)
            db.save_loadout(pl["player_id"], pl["inventory"], pl["equipment"], pl.get("look"))
            db.save_wallet(pl["player_id"], pl["wallet"])
    except Exception as exc:
        print("erro salvando caça RT:", exc)
    # EVENTO MUNDIAL ativo neste mapa: drops em DOBRO (+50%% de XP)
    if WORLD_EVENT["id"] and WORLD_EVENT["map"] == m.get("map") and time.time() < WORLD_EVENT["until"]:
        loot2, br2 = monsters_def.roll_drops(m.get("type"))
        for (iid, qty) in loot2:
            if items.exists(iid) and (items.get(iid) or {}).get("kind") != "currency":
                items.add_to_bag(bag, iid, qty)
                got.append("%dx %s" % (qty, (items.get(iid) or {}).get("name", iid)))
        if br2:
            pl["wallet"] = int(pl.get("wallet", 0)) + br2
        extra_xp = ganho // 2
        f["xp"] = int(f.get("xp", 0)) + extra_xp
        ganho += extra_xp
        leveling.recompute(f)

    # LOOT DE RARIDADE: chance universal escalada pela força do monstro
    _rmult = 1.0 + int(spec.get("xp", 0)) / 4000.0
    if float(f.get("fortune_until", 0)) > time.time():
        _rmult *= 1.5                          # a Fortuna dos Doze sorri
    for (_rar, _ch) in RARE_CHANCES:
        if random.random() < _ch * _rmult:
            _pool = _rarity_pool(_rar)
            if _pool:
                _riid = random.choice(_pool)
                items.add_to_bag(bag, _riid, 1)
                _rnome = (items.get(_riid) or {}).get("name", _riid)
                socketio.emit("rare_drop", {"rarity": _rar, "item": _riid, "name": _rnome,
                                            "color": RARE_COLORS.get(_rar)}, to=sid)
                if _rar == "lendario":
                    socketio.emit("toast", {"text": "🌟 %s encontrou um item LENDÁRIO: %s!" %
                                            (pl.get("name", "Alguém"), _rnome)})
            break

    _cod = f.setdefault("codex", {"m": {}, "i": {}, "l": {}})
    _cod.setdefault("m", {})[m.get("type")] = int(_cod["m"].get(m.get("type"), 0)) + 1
    _check_titles(sid, pl)
    _quest_bump(sid, pl, "kill", m.get("type"))

    # XP DE GRUPO: quem caçou junto leva o mesmo ganho (e a missão conta pra todos)
    for _al in _aliados:
        if _al == sid:
            continue
        _p2 = world.players.get(_al)
        if not _p2:
            continue
        _f2 = _p2.get("ficha") or {}
        if int(_f2.get("hp", 0)) <= 0:
            continue
        _f2["xp"] = int(_f2.get("xp", 0)) + ganho
        leveling.recompute(_f2)
        _p2["ficha"] = _f2
        socketio.emit("xp", {"xp": _f2.get("xp", 0), "level": _f2.get("level", 1),
                             "hp": _f2.get("hp"), "hp_max": _f2.get("hp_max"),
                             "prof": _f2.get("prof"), "gained": ganho, "reason": "caça em grupo",
                             "pending_asi": _f2.get("pending_asi", [])}, to=_al)
        _quest_bump(_al, _p2, "kill", m.get("type"))

    # RECORDES DE BOSS: o mundo inteiro fica sabendo
    if spec.get("boss"):
        if random.random() < 0.25:
            items.add_to_bag(bag, "chave_da_fenda", 1)
            socketio.emit("toast", {"text": "🗝️ O chefe carregava uma CHAVE DA FENDA!"}, to=sid)
        if random.random() < 0.15:
            items.add_to_bag(bag, "fragmento_estelar", 1)
            socketio.emit("toast", {"text": "🌟 Um FRAGMENTO ESTELAR caiu do chefe!"}, to=sid)
        if m.get("type") not in BOSS_RECORDS:          # PRIMEIRA KILL DO SERVIDOR!
            fk = FIRST_KILL.get(m.get("type")) or {}
            partes = []
            if fk.get("item") and items.exists(fk["item"]):
                items.add_to_bag(bag, fk["item"], 1)
                partes.append("a relíquia %s" % (items.get(fk["item"]) or {}).get("name", fk["item"]))
            else:
                pl["wallet"] = int(pl.get("wallet", 0)) + 5000
                partes.append("5000 de bronze")
            titulo = fk.get("title") or ("Pioneiro: %s" % m.get("name", "?"))
            f.setdefault("titles", [])
            if titulo not in f["titles"]:
                f["titles"].append(titulo)
                partes.append("o título '%s'" % titulo)
            if not f.get("primeira_lenda"):
                f["primeira_lenda"] = True             # a MARCA do pioneiro
                partes.append("a marca Pioneiro das Lendas")
            pl["ficha"] = f
            _persist_loadout(pl)
            _quest_save(pl)
            socketio.emit("toast", {"text": "🏆🥇 PRIMEIRA KILL DO SERVIDOR: %s derrubou %s "
                                    "e leva %s! Isso NUNCA vai se repetir." %
                                    (pl.get("name", "Alguém"), m.get("name", "?"),
                                     " + ".join(partes))})
        BOSS_RECORDS[m.get("type")] = {"player": pl.get("name", "Alguém"),
                                       "boss": m.get("name", "?"), "when": int(time.time()),
                                       "count": int((BOSS_RECORDS.get(m.get("type")) or {}).get("count", 0)) + 1}
        _save_boss_records()
        socketio.emit("toast", {"text": "🏆 %s derrubou %s! A lenda cresce." %
                                (pl.get("name", "Alguém"), m.get("name", "?"))})

    socketio.emit("xp", {"xp": f["xp"], "level": f["level"], "hp": f.get("hp"),
                         "hp_max": f.get("hp_max"), "prof": f.get("prof"),
                         "gained": ganho, "reason": "caça",
                         "pending_asi": f.get("pending_asi", [])}, to=sid)
    if int(f.get("level", 1)) > lvl_antes:
        socketio.emit("levelup", {"level": f["level"], "hp_max": f.get("hp_max"),
                                  "pending_asi": f.get("pending_asi", [])}, to=sid)
    socketio.emit("loadout", {"bag": pl["inventory"], "equipment": pl["equipment"]}, to=sid)
    socketio.emit("wallet", {"bronze": pl.get("wallet", 0)}, to=sid)
    extra = (" · " + ", ".join(got)) if got else ""
    socketio.emit("toast", {"text": "☠️ %s caiu! +%d XP%s" % (m.get("name", "?"), ganho, extra)}, to=sid)
    pl["rt_target"] = None


def _rt_combat_loop():
    """O coração do tempo real: a cada 0.4s, resolve quem está pronto pra bater."""
    while True:
        socketio.sleep(0.4)
        if not COMBAT_RT:
            continue
        now = time.time()
        try:
            # -------- regen de mana + DOTs nos jogadores (1x por segundo) --------
            for sid, pl in list(world.players.items()):
                if pl.get("_rt_sec", 0) > now:
                    continue
                pl["_rt_sec"] = now + 1.0
                _ppid = _player_party.get(sid)
                if _ppid:
                    _snap = []
                    for _s2 in _parties.get(_ppid, []):
                        _p2 = world.players.get(_s2)
                        if not _p2:
                            continue
                        _f2 = _p2.get("ficha") or {}
                        _snap.append({"id": _s2, "name": _p2.get("name", "?"),
                                      "hp": _f2.get("hp"), "hp_max": _f2.get("hp_max"),
                                      "map": _p2.get("map")})
                    if len(_snap) > 1:
                        socketio.emit("party_hp", {"members": _snap}, to=sid)
                _cf = pl.get("ficha") or {}
                if _cf.get("class_id"):
                    _cod = _cf.setdefault("codex", {"m": {}, "i": {}, "l": {}})
                    _ci = _cod.setdefault("i", {})
                    _novos = []
                    for _slot in (pl.get("inventory") or []):
                        _ii = _slot.get("item")
                        if _ii and _ii not in _ci:
                            _ci[_ii] = 1
                            _novos.append(_ii)
                    for _ii in (pl.get("equipment") or {}).values():
                        if _ii and _ii not in _ci:
                            _ci[_ii] = 1
                            _novos.append(_ii)
                    if _novos:
                        pl["ficha"] = _cf
                        for _ii in _novos:
                            _cat = items.get(_ii) or {}
                            if _cat.get("rarity") in ("epico", "lendario"):
                                socketio.emit("toast", {"text": "📖 Codex: %s registrado!" %
                                                        _cat.get("name", _ii)}, to=sid)
                        _check_titles(sid, pl)
                        _quest_save(pl)
                f = pl.get("ficha") or {}
                mm = _mana_max(f)
                if mm:
                    atual = int(f.get("mana", mm))
                    if atual < mm:
                        f["mana"] = min(mm, atual + max(1, mm // 50))
                        pl["ficha"] = f
                        socketio.emit("mana", {"mana": f["mana"], "max": mm}, to=sid)
                if _posture_of(f) == "mao":               # a Mão de Valíria cura o GRUPO
                    for _hs in _rt_party_allies(sid, pl):
                        _hp2 = world.players.get(_hs)
                        if not _hp2:
                            continue
                        _hf = _hp2.get("ficha") or {}
                        hp0 = int(_hf.get("hp", 0))
                        if not (0 < hp0 < int(_hf.get("hp_max", 1))):
                            continue
                        cura_mao = max(1, int(_hf.get("hp_max", 1)) * 3 // 100)
                        _hf["hp"] = min(int(_hf.get("hp_max", 1)), hp0 + cura_mao)
                        _hp2["ficha"] = _hf
                        socketio.emit("rt_selfheal", {"amount": _hf["hp"] - hp0, "hp": _hf["hp"],
                                                      "hp_max": _hf.get("hp_max")}, to=_hs)
                        if _hs != sid:
                            socketio.emit("xp", {"xp": _hf.get("xp", 0), "level": _hf.get("level", 1),
                                                 "hp": _hf["hp"], "hp_max": _hf.get("hp_max"),
                                                 "prof": _hf.get("prof"), "gained": 0,
                                                 "pending_asi": _hf.get("pending_asi", [])}, to=_hs)
                    hp0 = int(f.get("hp", 0))
                    if False:
                        pass
                        socketio.emit("xp", {"xp": f.get("xp", 0), "level": f.get("level", 1),
                                             "hp": f["hp"], "hp_max": f.get("hp_max"),
                                             "prof": f.get("prof"), "gained": 0,
                                             "pending_asi": f.get("pending_asi", [])}, to=sid)
                dot = pl.get("_rt_dot")
                if dot and int(f.get("hp", 0)) > 0:
                    dd = dot.get("dmg") or {"n": 1, "d": 4}
                    dano = sum(random.randint(1, dd.get("d", 4)) for _ in range(dd.get("n", 1)))
                    if _posture_of(f) == "soldado":
                        dano = max(1, dano // 4)          # até os debuffs minguam na fortaleza
                    f["hp"] = max(0, int(f.get("hp", 1)) - dano)
                    pl["ficha"] = f
                    dot["ticks"] = int(dot.get("ticks", 1)) - 1
                    if dot["ticks"] <= 0:
                        pl.pop("_rt_dot", None)
                    socketio.emit("rt_phit", {"dmg": dano, "dot": True, "by": dot.get("nome", "ferida"),
                                              "hp": f["hp"], "hp_max": f.get("hp_max")}, to=sid)
                    socketio.emit("xp", {"xp": f.get("xp", 0), "level": f.get("level", 1),
                                         "hp": f["hp"], "hp_max": f.get("hp_max"), "prof": f.get("prof"),
                                         "gained": 0, "pending_asi": f.get("pending_asi", [])}, to=sid)
                    if f["hp"] <= 0:
                        pl.pop("rt_target", None)
                        pl.pop("_rt_dot", None)
                        _player_death(sid)

            # -------- jogadores golpeiam o alvo marcado --------
            for sid, pl in list(world.players.items()):
                tid = pl.get("rt_target")
                if not tid:
                    continue
                m = world.monsters.get(tid)
                if not m or not m.get("alive") or m.get("map") != pl.get("map"):
                    pl["rt_target"] = None
                    continue
                f = pl.get("ficha") or {}
                if int(f.get("hp", 0)) <= 0:
                    continue
                if pl.get("_rt_next", 0) > now:
                    continue
                if pl.get("_rt_fear_until", 0) > now:
                    continue                              # amedrontado: braço não obedece
                try:
                    pc = combat.make_player_combatant(sid, pl, f)
                except Exception:
                    continue
                # ===== TIBIA: a arma na mão define a skill, o Atk e o alcance =====
                _wit = items.get((pl.get("equipment") or {}).get("hand")) or {}
                _wcl = _wit.get("wclass") or "fist"
                _watk = int(_wit.get("atk", 4))
                _mode = f.get("fight_mode", "bal")
                _lv = int(f.get("level", 1))
                if _wcl == "shield":
                    _wcl, _watk = "fist", 4           # escudo na mão: soca com o punho
                reach = int(_wit.get("range", 4)) if _wcl == "distance" else max(1, int(pc.get("reach", 1)))
                if max(abs(m["x"] - pl["x"]), abs(m["y"] - pl["y"])) > reach:
                    continue                      # fora de alcance: aproxima que o golpe sai
                pl["_rt_next"] = now + RT_ATK_CD
                post = _posture_of(f)
                if post == "mao":
                    continue                          # A Mão de Valíria não fere: protege e cura
                if _wcl == "distance":
                    _fam = _wit.get("ammo")
                    _ab = 0
                    if _fam:
                        _mun = _find_ammo(pl, _fam)
                        if not _mun:
                            if pl.get("_rt_noammo", 0) < now:
                                pl["_rt_noammo"] = now + 3
                                socketio.emit("toast", {"text": "🏹 Sem %s! Compre no armeiro." %
                                                        (items.get(_fam) or {}).get("name", _fam)}, to=sid)
                            continue
                        items.remove_from_bag(pl["inventory"], _mun, 1)
                        _ab = int((items.get(_mun) or {}).get("atk_bonus", 0))
                    _skl = skills.get_lvl(f, "distance")
                    _maxd = skills.dist_max(_watk + _ab, _skl, _lv, _mode)
                    _sk_used = "distance"
                else:
                    _skl = skills.get_lvl(f, _wcl)
                    _maxd = skills.melee_max(_watk, _skl, _lv, _mode)
                    _sk_used = _wcl
                _up = skills.add_tries(f, _sk_used, 1)
                pl["ficha"] = f
                if _up:
                    _skill_up_toast(sid, skills.SKILL_NAMES.get(_sk_used, _sk_used), _up)
                dmg = skills.roll_hit(_maxd)
                crit = dmg > 0 and dmg >= int(_maxd * 0.92)
                if post == "combatente" and dmg == 0:
                    dmg = max(1, int(_maxd * 0.3))    # fúria sagrada: nunca erra de verdade
                if dmg == 0:
                    socketio.emit("rt_hit", {"id": tid, "dmg": 0, "miss": True, "by": sid,
                                             "hp": m["hp"], "hp_max": m["hp_max"]}, room=pl["map"])
                    continue
                if post == "soldado":
                    dmg = max(1, dmg // 4)                # o muro de Valíria fere pouco
                elif post == "martir":
                    dmg *= 2                              # Luz da Criação: dano radiante dobrado
                elif post == "combatente":
                    dmg += sum(random.randint(1, 8) for _ in range(2))   # +2 Castigos Divinos
                _mob_aggro(m, sid)
                if m.get("_rt_aegis_until", 0) > now:
                    dmg = max(1, dmg // 2)                # forma de névoa / escamas: 50%%
                m["hp"] = max(0, int(m["hp"]) - dmg)
                if post in ("martir", "combatente") and int(f.get("hp", 0)) > 0:
                    cura = (dmg // 2) if post == "martir" else max(2, int(f.get("hp_max", 1)) // 20)
                    if cura > 0 and int(f.get("hp", 0)) < int(f.get("hp_max", 1)):
                        f["hp"] = min(int(f.get("hp_max", 1)), int(f.get("hp", 1)) + cura)
                        pl["ficha"] = f
                        socketio.emit("rt_selfheal", {"amount": cura, "hp": f["hp"],
                                                      "hp_max": f.get("hp_max")}, to=sid)
                        socketio.emit("xp", {"xp": f.get("xp", 0), "level": f.get("level", 1),
                                             "hp": f["hp"], "hp_max": f.get("hp_max"),
                                             "prof": f.get("prof"), "gained": 0,
                                             "pending_asi": f.get("pending_asi", [])}, to=sid)
                socketio.emit("rt_hit", {"id": tid, "dmg": dmg, "crit": crit, "by": sid,
                                         "hp": m["hp"], "hp_max": m["hp_max"]}, room=pl["map"])
                if m["hp"] <= 0:
                    _rt_kill(sid, pl, m)

            # -------- DUELOS DA ARENA: os golpes entre duelistas --------
            for sid, pl in list(world.players.items()):
                foe_sid = pl.get("duel_foe")
                if not foe_sid:
                    continue
                foe = world.players.get(foe_sid)
                if not foe or foe.get("map") != "arena" or pl.get("map") != "arena":
                    _duel_end(sid, foe_sid, wo=True)      # oponente sumiu: W.O.
                    continue
                f = pl.get("ficha") or {}
                ff = foe.get("ficha") or {}
                if int(f.get("hp", 0)) <= 0 or pl.get("_rt_next", 0) > now:
                    continue
                _wit = items.get((pl.get("equipment") or {}).get("hand")) or {}
                _wcl = _wit.get("wclass") or "fist"
                _watk = int(_wit.get("atk", 4))
                if _wcl == "shield":
                    _wcl, _watk = "fist", 4
                reach = int(_wit.get("range", 4)) if _wcl == "distance" else 1
                if max(abs(foe["x"] - pl["x"]), abs(foe["y"] - pl["y"])) > reach:
                    continue
                pl["_rt_next"] = now + RT_ATK_CD
                post = _posture_of(f)
                post_f = _posture_of(ff)
                if post == "mao":
                    continue
                _lv = int(f.get("level", 1))
                _mode = f.get("fight_mode", "bal")
                _skname = "distance" if _wcl == "distance" else _wcl
                _skl = skills.get_lvl(f, _skname)
                _maxd = (skills.dist_max if _wcl == "distance" else skills.melee_max)(_watk, _skl, _lv, _mode)
                _up = skills.add_tries(f, _skname, 1)
                pl["ficha"] = f
                if _up:
                    _skill_up_toast(sid, skills.SKILL_NAMES.get(_skname, _skname), _up)
                dmg = skills.roll_hit(_maxd)
                crit = dmg > 0 and dmg >= int(_maxd * 0.92)
                if post == "combatente" and dmg == 0:
                    dmg = max(1, int(_maxd * 0.3))
                # a defesa do oponente: bloqueio + armadura (padrão Tibia)
                _dit = items.get((foe.get("equipment") or {}).get("hand")) or {}
                if int(_dit.get("def", 0)) > 0 and post_f != "martir":
                    dmg = max(0, dmg - skills.block_value(int(_dit["def"]),
                                                          skills.get_lvl(ff, "shielding"),
                                                          ff.get("fight_mode", "bal")))
                    _sup = skills.add_tries(ff, "shielding", 1)
                    foe["ficha"] = ff
                    if _sup:
                        _skill_up_toast(foe_sid, "Escudo", _sup)
                dmg = max(0, dmg - skills.armor_reduce(_player_armor(foe)))
                if dmg <= 0:
                    socketio.emit("rt_hit", {"id": foe_sid, "dmg": 0, "miss": True, "by": sid,
                                             "hp": ff.get("hp"), "hp_max": ff.get("hp_max")},
                                  room="arena")
                    continue
                if post == "soldado":
                    dmg = max(1, dmg // 4)
                elif post == "martir":
                    dmg *= 2
                elif post == "combatente":
                    dmg += sum(random.randint(1, 8) for _ in range(2))
                if post_f == "soldado":
                    dmg = max(1, dmg // 4)
                elif post_f == "mao":
                    dmg = max(1, int(dmg * 0.8))
                novo_hp = int(ff.get("hp", 1)) - dmg
                fim = novo_hp <= 0
                ff["hp"] = max(1, novo_hp) if fim else novo_hp
                foe["ficha"] = ff
                if post in ("martir", "combatente") and int(f.get("hp", 0)) > 0:
                    cura = (dmg // 2) if post == "martir" else max(2, int(f.get("hp_max", 1)) // 20)
                    f["hp"] = min(int(f.get("hp_max", 1)), int(f.get("hp", 1)) + cura)
                    pl["ficha"] = f
                    socketio.emit("rt_selfheal", {"amount": cura, "hp": f["hp"],
                                                  "hp_max": f.get("hp_max")}, to=sid)
                socketio.emit("rt_hit", {"id": foe_sid, "dmg": dmg, "crit": crit, "by": sid,
                                         "hp": ff["hp"], "hp_max": ff.get("hp_max")}, room="arena")
                socketio.emit("rt_phit", {"dmg": dmg, "crit": crit, "by": pl.get("name", "?"),
                                          "hp": ff["hp"], "hp_max": ff.get("hp_max")}, to=foe_sid)
                socketio.emit("xp", {"xp": ff.get("xp", 0), "level": ff.get("level", 1),
                                     "hp": ff["hp"], "hp_max": ff.get("hp_max"),
                                     "prof": ff.get("prof"), "gained": 0,
                                     "pending_asi": ff.get("pending_asi", [])}, to=foe_sid)
                if fim:
                    _duel_end(sid, foe_sid)

            # -------- GUERRA ETERNA: vampiros x lobisomens se enfrentam --------
            for mid, m in list(world.monsters.items()):
                fac = FACTIONS.get(m.get("type"))
                if not fac or not m.get("alive") or m.get("_rt_next_f", 0) > now:
                    continue
                rival = None
                for mid2, m2 in world.monsters.items():
                    if mid2 == mid or not m2.get("alive") or m2.get("map") != m.get("map"):
                        continue
                    f2 = FACTIONS.get(m2.get("type"))
                    if f2 and f2 != fac and max(abs(m["x"] - m2["x"]), abs(m["y"] - m2["y"])) <= 1:
                        rival = m2
                        break
                if not rival:
                    continue
                m["_rt_next_f"] = now + RT_ATK_CD
                spec_a = monsters_def.MONSTERS.get(m.get("type"), {}) or {}
                roll = random.randint(1, 20)
                crit = (roll == 20)
                if not (crit or (roll != 1 and roll + int(spec_a.get("atk", 3)) >= int(rival.get("ac", 12)))):
                    continue
                dmg = _rt_roll_dmg(spec_a.get("dmg") or {"n": 1, "d": 4}, crit)
                rival["hp"] = max(0, int(rival["hp"]) - dmg)
                socketio.emit("rt_hit", {"id": rival["id"], "dmg": dmg, "crit": crit, "by": mid,
                                         "hp": rival["hp"], "hp_max": rival["hp_max"]}, room=m.get("map"))
                if rival["hp"] <= 0:
                    rival["alive"] = False
                    socketio.emit("rt_dead", {"id": rival["id"]}, room=m.get("map"))
                    _MONSTER_RESPAWNS.append((rival["id"], time.time() + 90))

            # -------- monstros CAÇAM: aggro, perseguição, invocação e falas --------
            for mid, m in list(world.monsters.items()):
                if not m.get("alive") or m.get("passive") or m.get("in_combat"):
                    continue
                spec = monsters_def.MONSTERS.get(m.get("type"), {}) or {}
                eh_boss = bool(spec.get("boss"))
                reach_m = max(1, int(spec.get("reach", 1)))
                aggro = 8 if eh_boss else 5
                alvo_sid = None
                alvo_pl = None
                alvo_d = 999
                _ag = m.get("_aggro_sid")
                if _ag and m.get("_aggro_until", 0) > now:
                    _p3 = world.players.get(_ag)
                    _f3 = (_p3 or {}).get("ficha") or {}
                    if _p3 and _p3.get("map") == m.get("map") and int(_f3.get("hp", 0)) > 0 and \
                       not _p3.get("invisible") and \
                       max(abs(m["x"] - _p3["x"]), abs(m["y"] - _p3["y"])) <= 14:
                        alvo_sid, alvo_pl = _ag, _p3
                        alvo_d = max(abs(m["x"] - _p3["x"]), abs(m["y"] - _p3["y"]))
                if not alvo_sid:
                    for sid, pl in world.players.items():
                        if pl.get("map") != m.get("map") or pl.get("invisible"):
                            continue
                        fp = pl.get("ficha") or {}
                        if int(fp.get("hp", 0)) <= 0:
                            continue
                        dd = max(abs(m["x"] - pl["x"]), abs(m["y"] - pl["y"]))
                        if dd <= aggro and dd < alvo_d:
                            alvo_sid, alvo_pl, alvo_d = sid, pl, dd
                if not alvo_sid:
                    # sem alvo: machucado ou perdido volta pro ponto de origem (e sara)
                    sp0 = m.get("_spawn")
                    if sp0 and len(sp0) >= 3:
                        _hx, _hy = int(sp0[1]), int(sp0[2])
                        _dh = max(abs(m["x"] - _hx), abs(m["y"] - _hy))
                        if _dh <= 2:
                            if int(m["hp"]) < int(m["hp_max"]):
                                m["hp"] = int(m["hp_max"])
                                m.pop("_aggro_sid", None)
                                m.pop("_enraged", None)
                                socketio.emit("rt_mheal", {"id": mid, "amount": 0, "hp": m["hp"],
                                              "hp_max": m["hp_max"]}, room=m.get("map"))
                        elif (int(m["hp"]) < int(m["hp_max"]) or _dh > 10) and \
                                m.get("_rt_step", 0) <= now:
                            m["_rt_step"] = now + max(0.28, 4.2 / max(1, int(spec.get("speed", 5))))
                            dx = (1 if _hx > m["x"] else (-1 if _hx < m["x"] else 0))
                            dy = (1 if _hy > m["y"] else (-1 if _hy < m["y"] else 0))
                            tent = []
                            if dx:
                                tent.append((m["x"] + dx, m["y"], "right" if dx > 0 else "left"))
                            if dy:
                                tent.append((m["x"], m["y"] + dy, "down" if dy > 0 else "up"))
                            random.shuffle(tent)
                            for (tx, ty, fc) in tent:
                                if not rules.is_walkable(tx, ty, m.get("map")):
                                    continue
                                m["x"], m["y"], m["facing"] = tx, ty, fc
                                socketio.emit("monsters_moved", {"map": m.get("map"),
                                              "moves": [{"id": mid, "x": tx, "y": ty, "facing": fc}]},
                                              room=m.get("map"))
                                break
                    continue
                if eh_boss:
                    if int(m["hp"]) < int(m["hp_max"]) * 0.3 and not m.get("_enraged"):
                        m["_enraged"] = True
                        socketio.emit("toast", {"text": "🩸 %s entra em FÚRIA!" % m.get("name", "?")},
                                      room=m.get("map"))
                        socketio.emit("speech", {"id": mid, "text": "AGORA VOCÊ ME IRRITOU."},
                                      room=m.get("map"))
                    if m.get("_rt_say", 0) <= now:
                        m["_rt_say"] = now + 8
                        if random.random() < 0.45:
                            _ln = BOSS_LINES.get(m.get("type")) or BOSS_LINES["_"]
                            socketio.emit("speech", {"id": mid, "text": random.choice(_ln)},
                                          room=m.get("map"))
                    if spec.get("summon_type") and m.get("_rt_summon", 0) <= now:
                        m["_rt_summon"] = now + 12
                        _viv = sum(1 for x in world.monsters.values()
                                   if x.get("alive") and x.get("_minion_of") == mid)
                        _maxs = int(spec.get("summons", 2))
                        if _viv < _maxs:
                            _rt_boss_summon(m, spec, min(2, _maxs - _viv))
                if alvo_d > reach_m:
                    # longe: PERSEGUE (um passo por vez, na velocidade do bicho)
                    if m.get("_rt_step", 0) <= now:
                        m["_rt_step"] = now + max(0.28, 4.2 / max(1, int(spec.get("speed", 5))))
                        dx = (1 if alvo_pl["x"] > m["x"] else (-1 if alvo_pl["x"] < m["x"] else 0))
                        dy = (1 if alvo_pl["y"] > m["y"] else (-1 if alvo_pl["y"] < m["y"] else 0))
                        tent = []
                        if dx:
                            tent.append((m["x"] + dx, m["y"], "right" if dx > 0 else "left"))
                        if dy:
                            tent.append((m["x"], m["y"] + dy, "down" if dy > 0 else "up"))
                        random.shuffle(tent)
                        for (tx, ty, fc) in tent:
                            if not rules.is_walkable(tx, ty, m.get("map")):
                                continue
                            if any(x.get("alive") and x.get("map") == m.get("map")
                                   and x["x"] == tx and x["y"] == ty
                                   for x in world.monsters.values()):
                                continue
                            if any(p.get("map") == m.get("map") and p["x"] == tx and p["y"] == ty
                                   for p in world.players.values()):
                                continue
                            m["x"], m["y"], m["facing"] = tx, ty, fc
                            socketio.emit("monsters_moved", {"map": m.get("map"),
                                          "moves": [{"id": mid, "x": tx, "y": ty, "facing": fc}]},
                                          room=m.get("map"))
                            break
                    continue
                if m.get("_rt_next", 0) > now:
                    continue
                m["_rt_next"] = now + RT_ATK_CD
                f = alvo_pl.get("ficha") or {}
                try:
                    pc = combat.make_player_combatant(alvo_sid, alvo_pl, f)
                except Exception:
                    continue
                # HABILIDADES do monstro em tempo real (heavy / heal / inflict+DOT)
                habs = monsters_def.MONSTER_ABILITIES.get(m.get("type")) or []
                usada = None
                cds = m.setdefault("_rt_abcd", {})
                for ab in habs:
                    if ab.get("type") not in ("heavy", "heal", "inflict", "fear", "gaze",
                                              "selfbuff", "summon", "drain", "blast", "trueblast"):
                        continue
                    if cds.get(ab["id"], 0) > now or random.random() > float(ab.get("chance", 0.3)):
                        continue
                    usada = ab
                    cds[ab["id"]] = now + int(ab.get("cd", 2)) * RT_ATK_CD
                    break
                # FEAR / GAZE: o jogador salva ou congela de medo
                if usada and usada["type"] in ("fear", "gaze"):
                    dc = int(usada.get("dc", 14))
                    bonus = 2 + (int(f.get("level", 1)) - 1) // 4
                    if random.randint(1, 20) + bonus < dc:
                        dur = int(usada.get("turns", 2)) * RT_ATK_CD
                        alvo_pl["_rt_fear_until"] = now + dur
                        socketio.emit("toast", {"text": "😱 %s usa %s! Você trava de medo por %ds." %
                                                (m.get("name", "?"), usada.get("name", "?"), int(dur))},
                                      to=alvo_sid)
                    else:
                        socketio.emit("toast", {"text": "Você resistiu a %s de %s!" %
                                                (usada.get("name", "?"), m.get("name", "?"))}, to=alvo_sid)
                    continue
                # SELFBUFF: forma de névoa / escamas / frenesi (50%% de redução)
                if usada and usada["type"] == "selfbuff":
                    m["_rt_aegis_until"] = now + int(usada.get("turns", 2)) * RT_ATK_CD
                    socketio.emit("rt_mheal", {"id": mid, "amount": 0, "hp": m["hp"],
                                               "hp_max": m["hp_max"],
                                               "ab": "🛡️ " + usada.get("name", "?")}, room=m.get("map"))
                    continue
                # SUMMON: reforços entram no campo (temporários, não renascem)
                if usada and usada["type"] == "summon":
                    _rt_summon(m, usada.get("minion"), int(usada.get("count", 2)))
                    socketio.emit("toast", {"text": "⚠️ %s usa %s!" % (m.get("name", "?"),
                                            usada.get("name", "?"))}, to=alvo_sid)
                    continue
                if usada and usada["type"] == "heal":
                    hh = usada.get("heal") or {"n": 4, "d": 8}
                    cura = sum(random.randint(1, hh.get("d", 8)) for _ in range(hh.get("n", 4)))
                    m["hp"] = min(int(m["hp_max"]), int(m["hp"]) + cura)
                    socketio.emit("rt_mheal", {"id": mid, "amount": cura, "hp": m["hp"],
                                               "hp_max": m["hp_max"], "ab": usada.get("name")},
                                  room=m.get("map"))
                    continue
                post_alvo = _posture_of(f)
                roll = random.randint(1, 20)
                crit = (roll == 20)
                ac_alvo = int(pc.get("ac", 10))
                if post_alvo == "martir":
                    ac_alvo = 0                           # o Mártir não se defende de nada
                elif post_alvo == "combatente":
                    ac_alvo = max(0, ac_alvo - 4)         # largou o escudo
                hit = crit or (roll != 1 and roll + int(spec.get("atk", 3)) >= ac_alvo)
                if not hit:
                    socketio.emit("rt_phit", {"dmg": 0, "miss": True, "by": m.get("name", "?"),
                                              "hp": f.get("hp"), "hp_max": f.get("hp_max")}, to=alvo_sid)
                    continue
                dmg = _rt_roll_dmg(spec.get("dmg") or {"n": 1, "d": 4}, crit)
                if m.get("_enraged"):
                    dmg = int(dmg * 1.5)                  # a FÚRIA morde mais fundo
                if usada and usada["type"] in ("heavy", "inflict", "drain", "blast", "trueblast"):
                    bx = usada.get("dmg_bonus") or usada.get("dmg") or {"n": 2, "d": 8}
                    extra = sum(random.randint(1, bx.get("d", 8)) for _ in range(bx.get("n", 2)))
                    dmg += extra
                    if usada["type"] == "drain":          # vampírico: cura o que drena
                        m["hp"] = min(int(m["hp_max"]), int(m["hp"]) + extra)
                        socketio.emit("rt_mheal", {"id": mid, "amount": extra, "hp": m["hp"],
                                                   "hp_max": m["hp_max"]}, room=m.get("map"))
                    if usada["type"] == "inflict" and usada.get("dot"):
                        alvo_pl["_rt_dot"] = {"dmg": usada["dot"], "ticks": int(usada.get("turns", 2)),
                                              "nome": usada.get("name", "ferida")}
                    socketio.emit("toast", {"text": "⚠️ %s usa %s!" % (m.get("name", "?"),
                                            usada.get("name", "?"))}, to=alvo_sid)
                # ===== TIBIA: escudo/arma bloqueia + armadura amortece =====
                _dit = items.get((alvo_pl.get("equipment") or {}).get("hand")) or {}
                _defv = int(_dit.get("def", 0))
                if _defv > 0:
                    _shl = skills.get_lvl(f, "shielding")
                    _dmode = f.get("fight_mode", "bal")
                    dmg = max(0, dmg - skills.block_value(_defv, _shl, _dmode))
                    _sup = skills.add_tries(f, "shielding", 1)
                    if _sup:
                        _skill_up_toast(alvo_sid, "Escudo", _sup)
                dmg = max(0, dmg - skills.armor_reduce(_player_armor(alvo_pl)))
                alvo_pl["ficha"] = f
                if dmg <= 0:
                    socketio.emit("rt_phit", {"dmg": 0, "block": True, "by": m.get("name", "?"),
                                              "hp": f.get("hp"), "hp_max": f.get("hp_max")},
                                  to=alvo_sid)
                    continue
                # POSTURA DE GRUPO: o Mártir toma o golpe no lugar do aliado
                _mrt = None
                if post_alvo != "martir":
                    for _s2 in _rt_party_allies(alvo_sid, alvo_pl):
                        if _s2 == alvo_sid:
                            continue
                        _p2 = world.players.get(_s2)
                        _f2 = (_p2 or {}).get("ficha") or {}
                        if _p2 and int(_f2.get("hp", 0)) > 0 and _posture_of(_f2) == "martir":
                            _mrt = (_s2, _p2, _f2)
                            break
                if _mrt:
                    _ms, _mp2, _mf = _mrt
                    _mf["hp"] = max(0, int(_mf.get("hp", 1)) - dmg)
                    _mp2["ficha"] = _mf
                    socketio.emit("rt_phit", {"dmg": dmg, "crit": crit, "by": m.get("name", "?"),
                                              "hp": _mf["hp"], "hp_max": _mf.get("hp_max")}, to=_ms)
                    socketio.emit("toast", {"text": "✨ %s absorveu o golpe no seu lugar!" %
                                            _mp2.get("name", "o Mártir")}, to=alvo_sid)
                    socketio.emit("xp", {"xp": _mf.get("xp", 0), "level": _mf.get("level", 1),
                                         "hp": _mf["hp"], "hp_max": _mf.get("hp_max"),
                                         "prof": _mf.get("prof"), "gained": 0,
                                         "pending_asi": _mf.get("pending_asi", [])}, to=_ms)
                    if _mf["hp"] <= 0:
                        _mp2.pop("rt_target", None)
                        _player_death(_ms)
                    continue
                # a Mão de um aliado por perto protege o grupo (20%% a menos)
                if post_alvo != "mao":
                    for _s2 in _rt_party_allies(alvo_sid, alvo_pl):
                        if _s2 == alvo_sid:
                            continue
                        _f2 = ((world.players.get(_s2) or {}).get("ficha") or {})
                        if int(_f2.get("hp", 0)) > 0 and _posture_of(_f2) == "mao":
                            dmg = max(1, int(dmg * 0.8))
                            break
                if post_alvo == "soldado":
                    dmg = max(1, dmg // 4)                # a fortaleza de Valíria: 75%% a menos
                elif post_alvo == "mao":
                    dmg = max(1, int(dmg * 0.8))          # a proteção da Mão: 20%% a menos
                f["hp"] = max(0, int(f.get("hp", 1)) - dmg)
                alvo_pl["ficha"] = f
                socketio.emit("rt_phit", {"dmg": dmg, "crit": crit, "by": m.get("name", "?"),
                                          "hp": f["hp"], "hp_max": f.get("hp_max")}, to=alvo_sid)
                if reach_m > 1:
                    socketio.emit("rt_hit", {"id": alvo_sid, "dmg": dmg, "magic": True, "by": mid,
                                             "dtype": spec.get("dtype", "energia"),
                                             "fx": [m["x"], m["y"], alvo_pl["x"], alvo_pl["y"]],
                                             "hp": f["hp"], "hp_max": f.get("hp_max")},
                                  room=m.get("map"), skip_sid=alvo_sid)
                socketio.emit("xp", {"xp": f.get("xp", 0), "level": f.get("level", 1),
                                     "hp": f["hp"], "hp_max": f.get("hp_max"),
                                     "prof": f.get("prof"), "gained": 0,
                                     "pending_asi": f.get("pending_asi", [])}, to=alvo_sid)
                if f["hp"] <= 0:
                    alvo_pl.pop("rt_target", None)
                    _player_death(alvo_sid)
        except Exception as exc:
            print("erro no loop RT:", exc)


def _start_combat(sid, monster_list):
    if COMBAT_RT:
        return _rt_engage(sid, monster_list)
    player = world.players.get(sid)
    if not player or sid in COMBAT:
        return
    ficha = player.get("ficha") or {}
    if not ficha.get("class_id"):
        return   # sem classe ainda nao tem stats de combate
    if "res" not in ficha:
        leveling.compute_resources(ficha)   # garante recursos (fichas antigas)
    monster_list = [m for m in monster_list if m.get("alive", True) and not m.get("in_combat")]
    if not monster_list:
        return
    if player.get("invisible"):                          # atacou estando invisivel (lebre) -> revela e desfaz
        ficha["form"] = None
        ficha["form_bonus"] = None
        ficha["form_regen"] = 0
        player["ficha"] = ficha
        player["wild_form"] = None
        player["invisible"] = False
        socketio.emit("player_form", {"id": sid, "form": None}, room=player.get("map", "ermo"))
        socketio.emit("form_set", {"form": None}, to=sid)
    # quem entra na luta: quem iniciou + parceiros de grupo perto (mesmo mapa)
    pcs, psids = [], []
    for s in _combat_party_members(sid, player):
        pl = world.players.get(s)
        f = pl.get("ficha") or {}
        if not f.get("class_id"):
            continue
        if "res" not in f:
            leveling.compute_resources(f)   # garante recursos (fichas antigas)
        pcs.append(combat.make_player_combatant(s, pl, f))
        psids.append(s)
    mcs = [combat.make_monster_combatant(m) for m in monster_list]
    enc = combat.start(pcs, mcs, player.get("map", "descampado"))
    enc["_monsters"] = {m["id"]: m for m in monster_list}
    enc["players"] = psids
    for s in psids:
        COMBAT[s] = enc
        pl = world.players.get(s)
        if pl:
            pl["in_combat"] = True
    for m in monster_list:
        m["in_combat"] = True
    boss = next((c for c in enc["combs"].values() if c.get("boss")), None)
    line = monsters_def.bark("intro", boss.get("mtype")) if boss else None
    for s in psids:
        socketio.emit("combat_start", {"snapshot": combat.snapshot(enc, s)}, to=s)
        if line:
            socketio.emit("speech", {"id": boss["cid"], "text": line}, to=s)
    _resume(sid)


def _resume(sid):
    """Roda os turnos dos monstros ate cair no turno JOGAVEL do jogador (ou a luta
    acabar). Aplica o DoT/expira de status no inicio de cada turno e PULA o turno
    do jogador se ele estiver atordoado (ou bebendo poção)."""
    enc = COMBAT.get(sid)
    if not enc:
        return
    actions = []
    def _fx():
        fx = enc.pop("_turn_fx", None)
        if fx and fx.get("fx"):
            actions.append({"cid": fx["cid"], "name": fx["name"], "steps": [],
                            "attack": None, "status_fx": fx})
        return fx
    while combat.outcome(enc) is None:
        cur = combat.current(enc)
        fx = _fx()                                          # DoT/expira no inicio do turno
        if fx and fx.get("killed"):
            _sync_monsters_to_world(enc)
            if cur["kind"] == "monster":
                combat.advance(enc); continue
            break                                           # jogador morto por DoT -> derrota
        if cur["kind"] != "monster":
            incap = combat.is_incapacitated(cur)
            sk = cur.get("skip_next", 0) > 0
            if incap or sk:
                if sk:
                    cur["skip_next"] -= 1
                    actions.append({"cid": cur["cid"], "name": cur["name"],
                                    "steps": [], "attack": None, "skipped": cur.get("_skip_reason", "poção")})
                    if cur.get("skip_next", 0) <= 0:
                        cur.pop("_skip_reason", None)
                else:
                    actions.append({"cid": cur["cid"], "name": cur["name"],
                                    "steps": [], "attack": None, "skipped": "atordoado"})
                combat.advance(enc)
                continue
            break                                           # turno jogavel do jogador
        say = None
        if cur.get("boss"):
            r = combat.boss_turn(enc, cur)
            steps, atk = r["steps"], r["atk"]
            if r.get("summon"):
                _summon_minions(enc, cur, r.get("summon_count", 1))
            if atk and atk.get("killed"):
                say = monsters_def.bark("win", cur.get("mtype"))
            elif r.get("say_cat"):
                if r["say_cat"] != "taunt" or random.random() < 0.5:
                    say = monsters_def.bark(r["say_cat"], cur.get("mtype"))
        else:
            steps, atk = combat.monster_decide(enc, cur)
            if atk and atk.get("summon"):
                _summon_minions(enc, cur, atk.get("summon_count", 1))
        _sync_monsters_to_world(enc)
        actions.append({"cid": cur["cid"], "name": cur["name"], "steps": steps, "attack": atk})
        if say:
            socketio.emit("speech", {"id": cur["cid"], "text": say}, to=sid)
        if atk and atk.get("killed"):
            break
        combat.advance(enc)
    oc = combat.outcome(enc)
    cur = combat.current(enc)
    for s in list(enc.get("players", [])):
        socketio.emit("combat_state", {
            "enemy_actions": actions, "snapshot": combat.snapshot(enc, s),
            "your_turn": (oc is None and cur["kind"] == "player"
                          and cur["cid"] == s and not combat.is_incapacitated(cur)),
            "outcome": oc,
        }, to=s)
    if oc:
        _end_combat(enc, oc)


def _reset_monster(m):
    _t, x, y = m["_spawn"]
    m["x"], m["y"] = x, y
    m["hp"] = m["hp_max"]
    m["alive"] = True
    m["in_combat"] = False


def _player_death(sid):
    player = world.players.get(sid)
    if not player:
        return
    f = player.get("ficha") or {}
    # Penalidade de morte: perde METADE do progresso DENTRO do nivel atual. Nunca
    # rebaixa de nivel (so come parte do que ja juntou pro proximo). Renasce no inicio.
    xp = int(f.get("xp", 0))
    lvl = int(f.get("level", 1))
    thr = leveling.xp_for_level(max(lvl, 1))
    within = max(0, xp - thr)
    protect = int(f.get("death_protect", 0))          # benção da Xamã Miranda (vale 1 morte)
    eff_pct = max(0, 50 - protect)                    # 50% base menos a proteção
    loss = within * eff_pct // 100
    f["xp"] = xp - loss
    if protect:
        f["death_protect"] = 0                        # consumida nesta morte
    leveling.recompute(f)                 # nivel se mantem; recalcula a vida
    f["hp"] = f.get("hp_max", 1)          # renasce com vida cheia
    player["ficha"] = f
    try:
        db.save_ficha(player["player_id"], f)
    except Exception as exc:
        print("erro salvando morte:", exc)
    socketio.emit("xp", {
        "xp": f["xp"], "level": f["level"], "hp": f["hp"], "hp_max": f["hp_max"],
        "prof": f.get("prof"), "gained": -loss, "reason": "morte",
        "protected": protect, "pending_asi": f.get("pending_asi", []),
    }, to=sid)
    sx, sy = rules.pick_spawn(world, "ermo")
    _go_to(sid, "ermo", sx, sy)            # renasce no inicio


def _collect_drops(player, enc):
    """Rola o espolio dos monstros derrotados, joga na mochila e o bronze na carteira.
    Devolve (lista [{item,name,qty}], bronze_ganho)."""
    if not player:
        return [], 0
    bag = player.setdefault("inventory", [])
    got = {}
    bronze = 0
    for c in enc["combs"].values():
        if c["kind"] != "monster" or c.get("alive"):
            continue
        loot, br = monsters_def.roll_drops(c.get("mtype"))
        bronze += br
        for (item_id, qty) in loot:
            if not items.exists(item_id):
                continue
            cat = items.get(item_id)
            if cat.get("kind") == "currency":     # moeda dropada cai na carteira
                bronze += int(cat.get("value", 1)) * qty
                continue
            items.add_to_bag(bag, item_id, qty)
            got[item_id] = got.get(item_id, 0) + qty
    if bronze:
        player["wallet"] = int(player.get("wallet", 0)) + bronze
    out = [{"item": k, "name": (items.get(k) or {}).get("name", k), "qty": v}
           for k, v in got.items()]
    return out, bronze


def _end_combat(enc, oc):
    if not enc or enc.get("_ended"):
        return
    enc["_ended"] = True
    players = list(enc.get("players", []))
    for s in players:
        COMBAT.pop(s, None)
        pl = world.players.get(s)
        if pl:
            pl["in_combat"] = False
    mp = enc["map"]
    for c in enc["combs"].values():        # libera todos os monstros do confronto
        if c["kind"] == "monster":
            m = enc["_monsters"].get(c["cid"])
            if m:
                m["in_combat"] = False
    # devolve os recursos gastos na luta pra ficha de cada jogador (recarga e por andar)
    for s in players:
        pl = world.players.get(s)
        pcomb = enc["combs"].get(s)
        if pl and pcomb is not None and pcomb.get("res") is not None:
            f0 = pl.get("ficha") or {}
            f0["res"] = pcomb["res"]
            pl["ficha"] = f0
    if oc == "victory":
        xp = sum(c.get("xp", 0) for c in enc["combs"].values()
                 if c["kind"] == "monster" and not c.get("alive"))
        varth_slain = any(c.get("mtype") == "lorde_varth" for c in enc["combs"].values()
                          if c["kind"] == "monster" and not c.get("alive"))   # marca Flagelo de Varth
        for c in enc["combs"].values():
            if c["kind"] == "monster" and not c.get("alive"):
                m = enc["_monsters"].get(c["cid"])
                if m:
                    m["alive"] = False
                    _MONSTER_RESPAWNS.append((m["id"], time.time() + 90))
        for s in players:                  # cada jogador: cura/revive, espólio próprio, XP cheio
            pl = world.players.get(s)
            if not pl:
                continue
            f = pl.get("ficha") or {}
            f["hp"] = f.get("hp_max", f.get("hp", 1))   # cura/revive após a vitória
            if varth_slain and not f.get("slayer_varth"):
                f["slayer_varth"] = True                # ganhou a marca "Flagelo de Varth"
            pl["ficha"] = f
            drops, bronze = _collect_drops(pl, enc)      # cada um rola o seu espólio
            try:
                db.save_ficha(pl["player_id"], f)
                if drops or bronze:
                    db.save_inventory(pl["player_id"], pl["inventory"])
                    db.save_wallet(pl["player_id"], pl.get("wallet", 0))
            except Exception:
                pass
            if drops or bronze:
                socketio.emit("inventory", {"bag": pl["inventory"]}, to=s)
                socketio.emit("wallet", {"bronze": pl.get("wallet", 0)}, to=s)
            socketio.emit("combat_over", {"outcome": "victory", "xp": xp,
                                          "drops": drops, "bronze": bronze,
                                          "hp": f.get("hp"), "hp_max": f.get("hp_max")}, to=s)
            if xp > 0:
                _award_xp(pl, xp, "vitória")
        _world_refresh(mp)
    elif oc == "defeat":
        for c in enc["combs"].values():     # sobreviventes (monstros) voltam curados
            if c["kind"] == "monster" and c.get("alive"):
                m = enc["_monsters"].get(c["cid"])
                if m:
                    _reset_monster(m)
        for s in players:
            socketio.emit("combat_over", {"outcome": "defeat"}, to=s)
            _player_death(s)
        _world_refresh(mp)


def _monster_respawn_loop():
    while True:
        socketio.sleep(6)
        now = time.time()
        for r in [r for r in _MONSTER_RESPAWNS if r[1] <= now]:
            try:
                _MONSTER_RESPAWNS.remove(r)
            except ValueError:
                pass
            m = world.monsters.get(r[0])
            if m and not m.get("alive"):
                _reset_monster(m)
                _world_refresh(m["map"])
                if (monsters_def.MONSTERS.get(m.get("type"), {}) or {}).get("boss"):
                    socketio.emit("toast", {"text": "👑 %s DESPERTOU! (%s)" %
                                            (m.get("name", "?"),
                                             MAP_TITLES.get(m.get("map"), m.get("map", "?")))})


def _monster_wander_loop():
    """Faz os monstros vagarem pelos mapas de caca quando nao estao em combate.
    Quem perambula pra perto de um jogador parado tambem inicia a luta."""
    while True:
        socketio.sleep(1.2)
        for mp in ("descampado", "repouso_dama", "avasham", "cova_colosso", "valdarkram", "mina_avhur", "camara_avhur",
                   "torre_andar1", "torre_andar2", "torre_andar3", "camara_varth", "floresta_ermo", "planaltos_ermais",
                   "brasal", "goela_1", "goela_2", "covil_krezath", "costa_maravai", "umbraval", "vespera"):
            moved = world.wander_monsters(mp)
            if moved:
                socketio.emit("monsters_moved", {"map": mp, "moves": moved}, room=mp)
            for sid, pl in list(world.players.items()):
                if pl.get("map") != mp or pl.get("in_combat") or pl.get("invisible"):
                    continue
                near = [m for m in world.monsters_near(mp, pl["x"], pl["y"], COMBAT_AGGRO)
                        if not m.get("in_combat") and not m.get("passive")]
                if near:
                    _start_combat(sid, near)


@socketio.on("combat_engage")
def on_combat_engage(data):
    """Clicou num monstro pra iniciar a luta (alem do aggro automatico)."""
    sid = request.sid
    player = world.players.get(sid)
    if not player or sid in COMBAT:
        return
    m = world.monsters.get((data or {}).get("target"))
    if not m or not m.get("alive") or m.get("in_combat") or m["map"] != player.get("map"):
        return
    if max(abs(m["x"] - player["x"]), abs(m["y"] - player["y"])) > COMBAT_AGGRO + 1:
        return   # longe demais pra engajar clicando
    near = [mm for mm in world.monsters_near(m["map"], player["x"], player["y"], COMBAT_AGGRO)
            if not mm.get("in_combat") and not mm.get("passive")]
    if m not in near:
        near.append(m)              # o bicho clicado entra na luta mesmo sendo passivo (caça)
    _start_combat(sid, near)


@socketio.on("combat_move")
def on_combat_move(data):
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc or combat.current(enc)["kind"] != "player" or combat.current(enc)["cid"] != sid:
        return
    dxy = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}.get((data or {}).get("dir"))
    if not dxy:
        return
    cur = combat.current(enc)
    nx, ny = cur["x"] + dxy[0], cur["y"] + dxy[1]
    if not combat.can_step(enc, cur, nx, ny):
        return
    combat.step(enc, cur, nx, ny)
    player = world.players.get(sid)
    if player:
        player["x"], player["y"] = nx, ny
        player["facing"] = (data or {}).get("dir")
    _combat_push(enc)


@socketio.on("combat_attack")
def on_combat_attack(data):
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc or combat.current(enc)["kind"] != "player" or combat.current(enc)["cid"] != sid:
        return
    if enc["action_used"]:
        emit("combat_msg", {"text": "Você já agiu neste turno."})
        return
    cur = combat.current(enc)
    tgt = enc["combs"].get((data or {}).get("target"))
    if not tgt or not tgt.get("alive") or tgt["kind"] != "monster":
        return
    if not combat.in_reach(cur, tgt):
        emit("combat_msg", {"text": "Fora de alcance."})
        return
    res = combat.attack(enc, cur, tgt)
    enc["action_used"] = True
    _sync_monsters_to_world(enc)
    _maybe_boss_hurt(enc, sid, tgt)
    oc = _combat_push(enc, {"player_action": res})
    if oc:
        _end_combat(enc, oc)


@socketio.on("combat_cast")
def on_combat_cast(data):
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc or combat.current(enc)["kind"] != "player" or combat.current(enc)["cid"] != sid:
        return
    if enc["action_used"]:
        emit("combat_msg", {"text": "Você já agiu neste turno."})
        return
    me = combat.current(enc)
    if me.get("no_spells"):
        emit("combat_msg", {"text": "Na forma de Coruja Demoníaca você não consegue conjurar magias."})
        return
    spell_id = (data or {}).get("spell")
    sp = spells_def.get(spell_id)
    if not sp or (spell_id not in (me.get("cantrips") or []) and
                  spell_id not in (me.get("spells_known") or [])):
        return
    rng = sp.get("range", "ranged")
    if rng == "self":
        target = me
    else:
        target = enc["combs"].get((data or {}).get("target"))
        if not target or not target.get("alive") or target["kind"] != "monster":
            return
        if rng == "melee" and not combat.in_reach(me, target):
            emit("combat_msg", {"text": "Fora de alcance."})
            return
    res = combat.cast_spell(enc, me, spell_id, target)
    if res.get("no_slot"):
        emit("combat_msg", {"text": "Sem espaço de magia para isso."})
        return
    if res.get("error"):
        return
    enc["action_used"] = True
    _sync_monsters_to_world(enc)
    _maybe_boss_hurt(enc, sid, target)
    oc = _combat_push(enc, {"spell_result": res})
    if oc:
        _end_combat(enc, oc)


@socketio.on("combat_ability")
def on_combat_ability(data):
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc or combat.current(enc)["kind"] != "player" or combat.current(enc)["cid"] != sid:
        return
    me = combat.current(enc)
    aid = (data or {}).get("ability")
    meta = abilities_def.get(aid)
    if not meta or aid not in (me.get("abilities") or []):
        return
    slot = meta.get("slot", "action")
    if slot == "bonus" and enc.get("bonus_used"):
        emit("combat_msg", {"text": "Ação bônus já usada neste turno."})
        return
    if slot == "action" and enc["action_used"]:
        emit("combat_msg", {"text": "Você já agiu neste turno."})
        return
    target = None
    if meta.get("target"):
        target = enc["combs"].get((data or {}).get("target"))
        if not target or not target.get("alive") or target["kind"] != "monster":
            return
        if not meta.get("ranged") and not combat.in_reach(me, target):
            emit("combat_msg", {"text": "Fora de alcance."})
            return
    res = combat.use_ability(enc, me, aid, target)
    if res.get("fail"):
        emit("combat_msg", {"text": "Não foi possível usar isso agora."})
        return
    if slot == "bonus":
        enc["bonus_used"] = True
    elif slot == "action":
        enc["action_used"] = True
    # 'special' (Surto de Ação / armar Castigo) nao consome acao nem bonus
    _sync_monsters_to_world(enc)
    _maybe_boss_hurt(enc, sid, target)
    oc = _combat_push(enc, {"ability_result": res})
    if oc:
        _end_combat(enc, oc)


@socketio.on("combat_end_turn")
def on_combat_end_turn(data):
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc or combat.current(enc)["kind"] != "player" or combat.current(enc)["cid"] != sid:
        return
    combat.advance(enc)
    _resume(sid)


@socketio.on("combat_use_potion")
def on_combat_use_potion(data=None):
    """Bebe uma Poção de Vida no combate: cura 100%, gasta o turno E o proximo
    (skip_next) -> o inimigo ganha 2 ataques. A ficha tambem cura (persiste)."""
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc or combat.current(enc)["kind"] != "player" or combat.current(enc)["cid"] != sid:
        return
    if enc["action_used"]:
        emit("combat_msg", {"text": "Você já agiu neste turno."})
        return
    me = combat.current(enc)
    player = world.players.get(sid)
    if not player:
        return
    bag = player.setdefault("inventory", [])
    if not items.remove_from_bag(bag, "pocao_vida", 1):
        emit("combat_msg", {"text": "Você não tem Poção de Vida."})
        return
    me["hp"] = me["hp_max"]
    f = player.get("ficha") or {}
    f["hp"] = f.get("hp_max", f.get("hp", 1))
    player["ficha"] = f
    if player.get("player_id"):
        try:
            db.save_ficha(player["player_id"], f)
            db.save_inventory(player["player_id"], bag)
        except Exception:
            pass
    me["skip_next"] = me.get("skip_next", 0) + 1
    enc["action_used"] = True
    emit("loadout", {"bag": bag, "equipment": player.get("equipment")})
    emit("combat_msg", {"text": "Você virou a Poção de Vida! Vida cheia, mas perde 2 turnos bebendo."})
    combat.advance(enc)
    _resume(sid)


@socketio.on("combat_use_divine")
def on_combat_use_divine(data=None):
    """Bebe uma Pocao Divina no combate: cura 100 de vida na hora e ARMA o dobro de
    dano no proximo acerto. Gasta so a acao (sem perder 2 turnos como a de vida)."""
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc or combat.current(enc)["kind"] != "player" or combat.current(enc)["cid"] != sid:
        return
    if enc["action_used"]:
        emit("combat_msg", {"text": "Você já agiu neste turno."})
        return
    me = combat.current(enc)
    player = world.players.get(sid)
    if not player:
        return
    bag = player.setdefault("inventory", [])
    if not items.remove_from_bag(bag, "pocao_divina", 1):
        emit("combat_msg", {"text": "Você não tem Poção Divina."})
        return
    before = me["hp"]
    me["hp"] = min(me["hp_max"], me["hp"] + 100)
    me["double_next"] = True
    healed = me["hp"] - before
    f = player.get("ficha") or {}
    f["hp"] = me["hp"]
    player["ficha"] = f
    if player.get("player_id"):
        try:
            db.save_ficha(player["player_id"], f)
            db.save_inventory(player["player_id"], bag)
        except Exception:
            pass
    enc["action_used"] = True
    emit("loadout", {"bag": bag, "equipment": player.get("equipment")})
    emit("combat_msg", {"text": "Você bebeu a Poção Divina! +%d de vida e o próximo golpe vale o DOBRO." % healed})
    _combat_push(enc)


@socketio.on("set_form")
def on_set_form(data=None):
    """Assume/desfaz uma forma (Forma Selvagem etc.). Guarda na ficha o bonus e o
    regen (que o combate aplica), marca o boneco pra transmitir e avisa a sala.
    Mandar form=None volta ao normal. Valida requisitos (ex: benção do Pof)."""
    player = world.players.get(request.sid)
    if not player:
        return
    f = player.get("ficha") or {}
    fid = (data or {}).get("form")
    form = classes.get_form(f.get("class_id"), fid) if fid else None
    if fid and (not form or not classes.can_use_form(f, fid)):
        emit("toast", {"text": "Essa forma não está disponível pra você."})
        return
    f["form"] = (fid if form else None)
    f["form_bonus"] = (dict(form["bonus"]) if form else None)
    f["form_regen"] = (int(form.get("regen", 0)) if form else 0)
    f["form_no_spells"] = bool(form and form.get("no_spells"))
    player["ficha"] = f
    player["wild_form"] = (fid if form else None)        # transmitido: muda o boneco na tela
    player["invisible"] = bool(form and form.get("invisible"))   # lebre de Nharé: some pra todos
    try:
        db.save_ficha(player["player_id"], f)
    except Exception:
        pass
    emit("form_set", {"form": f.get("form"), "name": (form["name"] if form else None),
                      "icon": (form.get("icon") if form else None)})
    socketio.emit("player_form", {"id": request.sid, "form": (fid if form else None)},
                  room=player.get("map", "ermo"))
    if form:
        emit("toast", {"text": "Você assumiu a forma: %s %s" % (form.get("icon", ""), form["name"])})
    else:
        emit("toast", {"text": "Você voltou à forma normal."})


@socketio.on("combat_transform")
def on_combat_transform(data=None):
    """Transformar DURANTE o combate (ação livre): troca a forma do combatente ao vivo,
    persiste na ficha e atualiza o snapshot. Só no próprio turno."""
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc:
        return
    if combat.current(enc).get("kind") != "player" or combat.current(enc).get("cid") != sid:
        emit("combat_msg", {"text": "Só dá pra se transformar no seu turno."})
        return
    player = world.players.get(sid)
    if not player:
        return
    f = player.get("ficha") or {}
    fid = (data or {}).get("form")
    form = classes.get_form(f.get("class_id"), fid) if fid else None
    if fid and (not form or not classes.can_use_form(f, fid)):
        emit("toast", {"text": "Essa forma não está disponível pra você."})
        return
    pc = enc["combs"].get(sid) or combat.current(enc)
    combat.apply_form(pc, form["bonus"] if form else None, form.get("regen", 0) if form else 0)
    pc["no_spells"] = bool(form and form.get("no_spells"))   # Coruja: trava magia ao vivo
    pc["form_id"] = (fid if form else None)
    f["form"] = (fid if form else None)
    f["form_bonus"] = (dict(form["bonus"]) if form else None)
    f["form_regen"] = (int(form.get("regen", 0)) if form else 0)
    f["form_no_spells"] = bool(form and form.get("no_spells"))
    player["ficha"] = f
    player["wild_form"] = (fid if form else None)
    player["invisible"] = bool(form and form.get("invisible"))
    try:
        db.save_ficha(player["player_id"], f)
    except Exception:
        pass
    socketio.emit("player_form", {"id": sid, "form": (fid if form else None)},
                  room=player.get("map", "ermo"))
    nm = ("%s %s" % (form.get("icon", ""), form["name"])) if form else "forma normal"
    _combat_push(enc, {"player_action": {"transform": nm}})


@socketio.on("combat_posture")
def on_combat_posture(data=None):
    """POSTURAS do Paladino (devoção a Valíria): troca a postura de combate ao vivo,
    só no próprio turno. As posturas existem só dentro da luta (não persistem)."""
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc:
        return
    if combat.current(enc).get("kind") != "player" or combat.current(enc).get("cid") != sid:
        emit("combat_msg", {"text": "Só dá pra mudar de postura no seu turno."})
        return
    player = world.players.get(sid)
    if not player:
        return
    cid = (player.get("ficha") or {}).get("class_id")
    pid = (data or {}).get("posture")
    post = classes.get_posture(cid, pid) if pid else None
    if pid and not post:
        emit("toast", {"text": "Essa postura não está disponível pra você."})
        return
    pc = enc["combs"].get(sid) or combat.current(enc)
    old = pc.get("posture")
    pc["posture"] = (pid if post else None)
    # CA/bloqueio: o Mártir zera (não defende mais golpes); o resto volta ao base
    if pc["posture"] == "martir":
        pc["ac"] = 0
        pc["block"] = 0
        if "luz_criacao" not in pc.get("abilities", []):
            pc.setdefault("abilities", []).append("luz_criacao")
    elif pc["posture"] == "combatente":              # Combatente Valiriano: larga o escudo (CA + bloqueio)
        pc["ac"] = int(pc.get("_ac0", pc.get("ac", 10))) - int(pc.get("_shield_ac", 0))
        pc["block"] = 0
        if "luz_criacao" in pc.get("abilities", []):
            pc["abilities"].remove("luz_criacao")
    else:
        pc["ac"] = int(pc.get("_ac0", pc.get("ac", 10)))
        pc["block"] = int(pc.get("_block0", 0))
        if "luz_criacao" in pc.get("abilities", []):
            pc["abilities"].remove("luz_criacao")
    # aura da Mão de Valíria: -20% de dano pra TODO o grupo (entra ao assumir, sai ao trocar)
    allies = [c for c in enc["combs"].values() if c.get("kind") == "player"]
    if pc["posture"] == "mao":
        for c in allies:
            combat.apply_status(c, "mao_aura", 999)
    elif old == "mao":
        for c in allies:
            (c.get("status") or {}).pop("mao_aura", None)
    nm = (("%s %s" % (post.get("icon", ""), post["name"])) if post else "postura normal")
    emit("combat_msg", {"text": "Postura: %s" % nm})
    _combat_push(enc, {"player_action": {"posture": nm}})


@socketio.on("move")
def on_move(data):
    pre = world.players.get(request.sid)
    if pre and pre.get("in_combat"):
        return   # em combate o movimento vai pelo combat_move (1 passo por turno)
    direction = (data or {}).get("dir")
    player = world.try_move(request.sid, direction)
    if not player:
        return

    mp = player.get("map", "ermo")
    _mv = {"id": player["id"], "x": player["x"], "y": player["y"], "facing": player["facing"]}
    if player.get("invisible"):                          # lebre de Nharé: ninguém mais vê o movimento
        emit("player_moved", _mv, to=request.sid)
    else:
        emit("player_moved", _mv, room=mp)

    _encounter_gods(player)   # XP ao chegar perto de um deus (1a vez)

    # pisou no portal do Salao? volta pro Ermo (no ponto de onde saiu).
    if mp == "salao" and map_rows("salao")[player["y"]][player["x"]] == "O":
        ret = world.ermo_return(request.sid) or rules.pick_spawn(world, "ermo")
        _go_to(request.sid, "ermo", ret[0], ret[1])
        return

    # pisou no portal-estrela? volta pra Rasharan (o hub dos mundos secretos).
    if map_rows(mp)[player["y"]][player["x"]] == "*":
        sx, sy = rules.pick_spawn(world, "rasharan")
        _go_to(request.sid, "rasharan", sx, sy)
        return

    # pisou na PORTA da Piramide de Avhur (no deserto)? desce pra Mina Fechada de Avhur.
    if mp == "avasham" and map_rows("avasham")[player["y"]][player["x"]] == "p":
        _go_to(request.sid, "mina_avhur", 50, 7, "down")
        return
    # pisou na boca da Mina de Avhur? sobe de volta pro deserto, em frente a piramide.
    if mp == "mina_avhur" and map_rows("mina_avhur")[player["y"]][player["x"]] == "p":
        _go_to(request.sid, "avasham", 76, 46, "up")
        return

    # pisou na PORTA da Torre do Lorde Necrotico (no cemiterio)? sobe pro andar 1.
    if mp == "valdarkram" and map_rows("valdarkram")[player["y"]][player["x"]] == "Z":
        _go_to(request.sid, "torre_andar1", 22, 43, "up")
        return

    # pisou numa passagem de borda? cai no mapa vizinho, virado pra dentro.
    if map_rows(mp)[player["y"]][player["x"]] == "+":
        _rows = map_rows(mp); _W = len(_rows[0]); _H = len(_rows)
        _x, _y = player["x"], player["y"]
        edge = ("north" if _y <= 2 else
                "south" if _y >= _H - 3 else
                "west" if _x <= 2 else
                "east" if _x >= _W - 3 else None)
        link = EDGE_LINKS.get(mp, {}).get(edge)
        if link:
            tmap, tx, ty, face = link
            _go_to(request.sid, tmap, tx, ty, face)
            return
    # pisou numa porta 'D'? entra ou sai de casa.
    if map_rows(mp)[player["y"]][player["x"]] == "D":
        if mp == "ermo":
            dest = DOOR_INTERIORS.get((player["x"], player["y"]))
            if dest == "LOCKED":
                emit("toast", {"text": "A porta esta trancada."})
            elif dest:
                _sp = (wm.MAPS.get(dest, {}).get("spawns") or INTERIOR_SPAWN)
                sx, sy = _sp[0]
                _go_to(request.sid, dest, sx, sy, "up")
            return
        if mp in INTERIOR_MAPS:
            ret = world.ermo_return(request.sid) or rules.pick_spawn(world, "ermo")
            _go_to(request.sid, "ermo", ret[0], ret[1], "down")
            return

    # pisou no portal dos Ermos (em Rasharan)? volta pro Ermo.
    if mp == "rasharan" and map_rows("rasharan")[player["y"]][player["x"]] == "@":
        ret = world.ermo_return(request.sid) or rules.pick_spawn(world, "ermo")
        _go_to(request.sid, "ermo", ret[0], ret[1])
        return

    # pisou sobre um item? pega. (so existe item no chao no Ermo)
    picked = world.try_pickup(player)
    if picked:
        cat = items.get(picked["item"]) or {}
        if picked.get("currency"):
            # moeda foi pra carteira: salva o saldo e avisa o cliente (HUD).
            try:
                db.save_wallet(player["player_id"], picked["wallet"])
            except Exception as exc:
                print("erro salvando carteira:", exc)
            emit("wallet", {"bronze": picked["wallet"],
                            "picked": {"item": picked["item"], "name": cat.get("name", ""),
                                       "value": cat.get("value", 1)}})
        else:
            try:
                db.save_inventory(player["player_id"], player["inventory"])
            except Exception as exc:
                print("erro salvando inventario:", exc)
            emit("inventory", {
                "bag": player["inventory"],
                "picked": {"item": picked["item"], "name": cat.get("name", ""), "qty": 1},
            })
        emit("item_taken", {"x": picked["x"], "y": picked["y"]}, room=mp)

    # recarrega recursos de classe conforme anda (temporario; depois vira descanso).
    f = player.get("ficha")
    if f and f.get("res"):
        player["_steps"] = int(player.get("_steps", 0)) + 1
        if player["_steps"] % 5 == 0 and leveling.regen_resources(f, 1):
            emit("res", {"res": f["res"]})
            try:
                db.save_ficha(player["player_id"], f)
            except Exception:
                pass

    # aggro: andou perto de um monstro em O Descampado -> a luta comeca.
    if mp == "descampado" and not player.get("in_combat") and not player.get("invisible"):
        near = [m for m in world.monsters_near("descampado", player["x"], player["y"], COMBAT_AGGRO)
                if not m.get("in_combat")]
        if near:
            _start_combat(request.sid, near)


def _persist_loadout(player):
    try:
        db.save_loadout(player["player_id"], player["inventory"],
                        player["equipment"], player["look"])
    except Exception as exc:
        print("erro salvando equipamento:", exc)


@socketio.on("equip")
def on_equip(data):
    player = world.players.get(request.sid)
    if not player:
        return
    item_id = (data or {}).get("item")
    if world.equip(player, item_id):
        _persist_loadout(player)
        _quest_bump(request.sid, player, "equip")
        emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
        emit("player_look", {"id": player["id"], "look": player["look"]},
             room=player.get("map", "ermo"))


@socketio.on("asi_choice")
def on_asi_choice(data):
    """Aplica a escolha de ASI/talento de um nivel pendente (feat-or-ASI)."""
    player = world.players.get(request.sid)
    if not player:
        return
    ficha = player.get("ficha") or {}
    pend = ficha.get("pending_asi") or []
    if not pend:
        return
    kind = (data or {}).get("kind")
    final = dict(ficha.get("attrs_final") or {})
    applied = False

    if kind == "asi":
        adds = (data or {}).get("attrs") or {}
        clean = {a: int(v) for a, v in adds.items()
                 if a in races.BASE_ATTR_ORDER and isinstance(v, int) and v > 0}
        vals = list(clean.values())
        valid = (sum(vals) == 2 and 1 <= len(clean) <= 2 and all(0 < v <= 2 for v in vals)
                 and (len(clean) == 1 or all(v == 1 for v in vals)))
        if valid:
            for a, v in clean.items():
                final[a] = min(20, int(final.get(a, 10)) + v)
            applied = True

    elif kind == "feat":
        fid = (data or {}).get("feat_id")
        fd = feats.get(fid)
        if fd and fid not in ficha.get("feats", []):
            plus = fd.get("plus1")
            if plus:
                attr = (data or {}).get("attr")
                if attr not in plus:
                    attr = plus[0]
                final[attr] = min(20, int(final.get(attr, 10)) + 1)
            ficha.setdefault("feats", []).append(fid)
            applied = True

    if not applied:
        emit("asi_error", {"reason": "invalid"})
        return

    ficha["attrs_final"] = final
    pend.pop(0)                       # resolve uma escolha pendente
    ficha["pending_asi"] = pend
    leveling.recompute(ficha)         # CON pode ter mudado -> recalcula vida
    player["ficha"] = ficha
    try:
        db.save_ficha(player["player_id"], ficha)
    except Exception as exc:
        print("erro salvando escolha de ASI:", exc)
    emit("ficha", {"ficha": ficha, "asi_applied": True})


@socketio.on("unequip")
def on_unequip(data):
    player = world.players.get(request.sid)
    if not player:
        return
    slot = (data or {}).get("slot")
    if world.unequip(player, slot):
        _persist_loadout(player)
        emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
        emit("player_look", {"id": player["id"], "look": player["look"]},
             room=player.get("map", "ermo"))


# ----------------------------------------------------------------- NPCs

def _npc_moved_payload(npc):
    return {"id": npc["id"], "x": npc["x"], "y": npc["y"], "facing": npc["facing"]}


def _face_to(a, b):
    """Direcao de `a` olhando pra `b` (prioriza o eixo de maior diferenca)."""
    dx, dy = b["x"] - a["x"], b["y"] - a["y"]
    if abs(dx) >= abs(dy):
        return "right" if dx > 0 else "left"
    return "down" if dy > 0 else "up"


def _smite(player, npc):
    """O Valdris apaga quem xingou perto dele: encara, solta a sentenca, dispara
    o raio (todo mundo perto ve) e manda o engracadinho pro spawn.
    NOTA: quando a morte/combate existir, trocar o 'manda pro spawn' por
    dano/morte de verdade (ja anotado pra quando chegar la)."""
    if player.get("gm_god"):     # GM god mode: o Valdris não frita o Mestre
        return
    mp = player.get("map", "ermo")
    npc["facing"] = _face_to(npc, player)
    socketio.emit("player_moved", _npc_moved_payload(npc), room=mp)
    lines = npc.get("_spec", {}).get("smite_lines") or ["..."]
    socketio.emit("speech", {"id": npc["id"], "text": random.choice(lines)}, room=mp)
    color = npc.get("_spec", {}).get("smite_color", "#9b6dff")
    socketio.emit("smite", {"target": player["id"], "by": npc["id"], "color": color},
                  room=mp)
    sx, sy = rules.pick_spawn(world, mp)
    player["x"], player["y"], player["facing"] = sx, sy, "down"
    player["_dirty"] = True  # a nova posicao sera salva no proximo flush
    socketio.emit("player_moved", {"id": player["id"], "x": sx, "y": sy,
                                   "facing": "down"}, room=mp)


@socketio.on("interact")
def on_interact(_data=None):
    """Jogador apertou pra falar: responde o NPC em que ele estiver colado.
    Casos especiais (com confirmacao no cliente):
      - corvo: pergunta se quer ir pro Salao das Classes (e teleporta se confirmar);
      - mestre: oferece a classe dele (confirma + escolhe 2 atributos + aplica)."""
    player = world.players.get(request.sid)
    if not player:
        return
    # O CHAMADO DO VALDRIS: entregar ao encontrá-lo vagando pelo mundo
    _val = world.players.get(valdris.NPC_ID)
    if _val and _val.get("map") == player.get("map") and \
       max(abs(_val.get("x", 0) - player["x"]), abs(_val.get("y", 0) - player["y"])) <= TALK_RADIUS:
        if _quest_deliver(request.sid, player, "chamado_valdris"):
            return
    npc = world.nearest_npc(player, TALK_RADIUS)
    if not npc:
        if not _try_fenda(player) and not _try_fenda_inside(player) and \
           not _try_ossuario(player) and not _try_mastro(player) and \
           not _try_bigorna(player) and not _try_altar(player) and \
           not _try_fish(player):        # no píer? joga a linha!
            _try_gather(player)          # senão, talvez haja um node de coleta
        return
    # MISSÕES DO NPC: entregar > aceitar nova > lembrar em andamento
    _nid = npc.get("id") or npc.get("_spec", {}).get("id")
    _qf = (player.get("ficha") or {}).get("quests") or {}
    for _qid, _q in quests_def.for_npc(_nid):
        if _qid in _qf and not _qf[_qid].get("done") and _quest_ready(player, _qid, _q):
            if _quest_deliver(request.sid, player, _qid):
                return
    for _qid, _q in quests_def.for_npc(_nid):
        if _qid not in _qf and not _q.get("auto"):
            _quest_start(request.sid, player, _qid)
            return
    for _qid, _q in quests_def.for_npc(_nid):
        if _qid in _qf and not _qf[_qid].get("done"):
            socketio.emit("toast", {"text": "📜 %s em andamento (Diário: J)" % _q["name"]},
                          to=request.sid)
            break
    mp = player.get("map", "ermo")
    npc["facing"] = _face_to(npc, player)   # ele te olha
    socketio.emit("player_moved", _npc_moved_payload(npc), room=mp)

    # o corvo (Jeans) e o guia: PERGUNTA se quer ir pro Salao (e teleporta se sim)
    if npc["id"] == "npc:corvo" and mp == "ermo":
        socketio.emit("speech", {"id": npc["id"],
            "text": "Quer ir pro Salao das Classes, forasteiro? Eu te mando num piscar."},
            room=mp)
        emit("confirm", {
            "action": "go_salao",
            "title": "Ir para o Salao das Classes?",
            "body": "O corvo abre caminho. Voce sera levado ao Salao, onde os 12 "
                    "mestres ensinam suas classes.",
            "ok": "Ir", "cancel": "Agora nao",
        })
        return

    # mestre do Salao: oferece a classe dele SE o jogador ainda nao tem classe.
    # Quem ja escolheu (escolha permanente) so ouve a fala padrao.
    cid = npc.get("_spec", {}).get("class_id")
    if cid and mp == "salao" and not (player.get("ficha") or {}).get("class_id"):
        cls = classes.get_class(cid)
        if cls:
            _pending_class[request.sid] = cid
            emit("class_offer", {
                "class_id": cid,
                "name": cls["name"],
                "god": cls.get("god"),       # None = Mago (cosmo e livros)
                "principal": cls["principal"],
                "hd": classes.CLASS_HD.get(cid),
                "master": cls["master"],
            })
            return

    # um deus no seu reino: solta uma fala de lore (+ falas extras se voce for da
    # classe que ele patrona)
    god = npc.get("_god")
    if god:
        falas = list(god.get("falas") or [])
        pc = (player.get("ficha") or {}).get("class_id")
        if pc and pc in (god.get("patron_classes") or []):
            falas = falas + list(god.get("falas_class") or [])
        socketio.emit("speech", {"id": npc["id"],
            "text": random.choice(falas) if falas else "..."}, room=mp)
        return

    # Robetina, a assistente social: na PRIMEIRA conversa entrega o kit inicial.
    if npc["id"] == "npc:robetina":
        ficha = player.get("ficha") or {}
        if not ficha.get("got_starter"):
            items.grant_starter_set(player["inventory"])
            ficha["got_starter"] = True
            player["ficha"] = ficha
            if player.get("player_id"):
                db.save_ficha(player["player_id"], ficha)
                db.save_loadout(player["player_id"], player["inventory"],
                                player["equipment"], player.get("look"))
            socketio.emit("speech", {"id": npc["id"], "text": npcs.ROBETINA_FIRST}, room=mp)
            emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
            return
        # ja recebeu: cai na fala padrao abaixo

    # Vendedor de Arma (Armas Peteco): abre a LOJA (comprar sets / vender itens)
    if npc["id"] == "npc:armeiro":
        _open_shop(player, npc, "Armas Peteco", items.SHOP_SETS, items.SHOP_PRICE)
        return

    # Mercadores premium (Mascate/Nomade/Coveiro): set por classe escalado por mapa
    _tier = npc.get("_spec", {}).get("shop_tier")
    if _tier and _tier in items.TIER_SETS:
        _open_shop(player, npc, items.TIER_LABEL.get(_tier, npc.get("name", "Mercador")),
                   items.TIER_SETS[_tier], items.TIER_PRICE[_tier])
        return

    # Goblin do Cofre (câmara de Varth, canto SE): set Necrótico, custa 800.000 de
    # bronze + 5 Símbolos de Varth por peça
    if npc.get("_spec", {}).get("goblin_cofre"):
        _open_shop(player, npc, "Goblin do Cofre", items.TIER_SETS["necro"],
                   items.TIER_PRICE["necro"],
                   extra={"item": "simbolo_varth", "qty": 5, "name": "Símbolos de Varth"})
        return

    # Cigana Vidente (Itatinga): vende Pocao de Vida por 10 pratas (1000 bronze)
    if npc.get("_spec", {}).get("sells_potion"):
        _open_shop(player, npc, "Cigana Vidente", [], 0,
                   potions=[("pocao_vida", 1000), ("flecha", 5), ("flecha_de_ferro", 12),
                            ("virote", 6), ("virote_perfurante", 16), ("runa_em_branco", 80)])
        return

    # Xamã Miranda (Descampado): troca drops de chefe por proteção contra a morte
    if npc.get("_spec", {}).get("xama"):
        greet = random.choice(npc.get("_spec", {}).get("greetings") or ["..."])
        emit("xama_open", _xama_payload(player, greet))
        return

    # ===== VILA CAIÇARA (Costa de Maravai): os novos comércios =====
    # Peixaria da Dona Maricota: comida fresca do mar (cura barata e gostosa)
    if npc.get("_spec", {}).get("peixaria"):
        _open_shop(player, npc, "Peixaria da Maricota", [], 0,
                   potions=[("peixe_assado", 80), ("espetinho_camarao", 110),
                            ("caldo_de_sururu", 150), ("agua_de_coco", 50),
                            ("moqueca_capixaba", 260),
                            ("filhote_capivara", 5000)])
        return

    # Zé do Remo, o BARQUEIRO: viagem paga de barco pro Ermo (transporte rápido)
    if npc.get("_spec", {}).get("barqueiro"):
        socketio.emit("speech", {"id": npc["id"],
            "text": "Quer carona pro Ermo? Quinhentos de bronze e a maré faz o resto."},
            room=mp)
        emit("confirm", {
            "action": "barco_ermo",
            "title": "Viajar de barco para o Ermo?",
            "body": "O Zé do Remo cobra 500 de bronze pela travessia. O barco "
                    "te deixa direto na cidade do Ermo.",
            "ok": "Pagar e embarcar", "cancel": "Fico por aqui",
        })
        return

    # Seu Milton e o JOGO DO BÚZIO: aposta 200 de bronze, o búzio decide (45%%)
    if npc.get("_spec", {}).get("buzio"):
        socketio.emit("speech", {"id": npc["id"],
            "text": "Duzentos na mesa. Búzio aberto, tu dobra. Fechado... foi bom te ver."},
            room=mp)
        emit("confirm", {
            "action": "buzio_play",
            "title": "Jogar o Búzio? (aposta: 200 de bronze)",
            "body": "Se o búzio cair ABERTO, você leva 400. Se cair fechado, "
                    "perde a aposta. O mar decide.",
            "ok": "Apostar 200", "cancel": "Hoje não",
        })
        return

    # Mestra Conchinha: ESCAMBO caiçara (bronze + 8 Conchas Raras por peça)
    if npc.get("_spec", {}).get("concha_shop"):
        _open_shop(player, npc, "Ateliê da Mestra Conchinha", [], 0,
                   potions=[("colar_de_conchas", 2500), ("anel_de_perola", 3200),
                            ("tridente_do_caicara", 2800), ("chapeu_de_palha", 2200)],
                   extra={"item": "concha_rara", "qty": 8, "name": "Conchas Raras"})
        return

    # MEMORIAL DOS HERÓIS: o Cronista recita os últimos matadores de boss
    if npc.get("_spec", {}).get("memorial"):
        if not BOSS_RECORDS:
            socketio.emit("speech", {"id": npc["id"],
                "text": "O Memorial ainda espera seu primeiro herói. Vai lá fazer história, viajante."},
                room=mp)
            return
        linhas = []
        for rec in sorted(BOSS_RECORDS.values(), key=lambda r: -r.get("when", 0))[:6]:
            linhas.append("%s caiu diante de %s (%dx)" % (rec.get("boss", "?"),
                          rec.get("player", "?"), rec.get("count", 1)))
        if FENDA_RECORDS:
            top = sorted(FENDA_RECORDS.items(), key=lambda kv: -kv[1])[:3]
            linhas.append("🌀 Mais fundo na Fenda: " + ", ".join(
                "%s (andar %d)" % (n, v) for n, v in top))
        socketio.emit("speech", {"id": npc["id"],
            "text": "📜 MEMORIAL DOS HERÓIS: " + " · ".join(linhas)}, room=mp)
        return

    # TEMPLO DOS DOZE: oferenda de 100 de bronze = bênção (vida cheia)
    if npc.get("_spec", {}).get("templo"):
        socketio.emit("speech", {"id": npc["id"],
            "text": "Os Doze escutam quem oferta de coração. Cem de bronze, e tuas feridas se fecham."},
            room=mp)
        emit("confirm", {
            "action": "templo_doar",
            "title": "Fazer uma oferenda aos Doze? (100 de bronze)",
            "body": "A Irmã Solene deposita tua oferenda no altar. Os deuses "
                    "restauram TODA a tua vida.",
            "ok": "Ofertar 100", "cancel": "Hoje não",
        })
        return

    # MESTRES DE OFÍCIO (Ermo): abrem a bancada de criação da profissão deles
    _prof = npc.get("_spec", {}).get("prof")
    if _prof and _prof in professions.PROFESSIONS:
        emit("craft_open", _craft_payload(player, _prof))
        return

    # Couraria do Valdir (Ermo, noroeste): compra couro de bicho por 5x o preço normal
    if npc.get("_spec", {}).get("couraria"):
        greet = random.choice(npc.get("_spec", {}).get("greetings") or ["..."])
        emit("couraria_open", _couraria_payload(player, greet))
        return

    # Marion, a Bruxa (valdarkram, do lado do Coveiro): compra Moeda de Avhur por 2500 cada
    if npc.get("_spec", {}).get("buys_avhur"):
        greet = random.choice(npc.get("_spec", {}).get("greetings") or ["..."])
        emit("couraria_open", _marion_payload(player, greet))
        return

    # Mesa de Negócios (taverna): Mercado + ofertas diretas
    if npc.get("_spec", {}).get("business_table"):
        emit("market_open", _market_payload(request.sid, player))
        return

    # Mesa de Confraternizações (taverna): entra no lobby e abre a interface da party
    if npc.get("_spec", {}).get("party_table"):
        if request.sid not in _party_lobby:
            if len(_party_lobby) >= PARTY_MAX:
                emit("toast", {"text": "A mesa já está cheia (%d na mesa)." % PARTY_MAX})
                return
            _party_lobby.append(request.sid)
            _party_accepts.setdefault(request.sid, set())
        emit("party_open", _party_state_for(request.sid))
        _party_broadcast()
        return

    greetings = npc.get("_spec", {}).get("greetings") or ["..."]
    socketio.emit("speech", {"id": npc["id"], "text": random.choice(greetings)}, room=mp)


def _shop_catalog(sets, price):
    """Monta as secoes da loja: uma por classe, com a arma + armadura completa."""
    secs = []
    for s in sets:
        cls = classes.get_class(s["class_id"]) or {}
        entries = []
        for iid in s["items"]:
            cat = items.get(iid) or {}
            entries.append({
                "item": iid, "name": cat.get("name", iid), "kind": cat.get("kind"),
                "slot": cat.get("slot"), "visual": cat.get("visual"),
                "rarity": cat.get("rarity"), "color": cat.get("color"),
                "ac": cat.get("ac", 0), "atk": cat.get("atk", 0), "dmg": cat.get("dmg"),
                "price": price,
            })
        secs.append({"class_id": s["class_id"], "name": cls.get("name", s["class_id"]),
                     "items": entries})
    return secs


COURARIA_MULT = 5   # Valdir paga 5x o que um mercador normal paga por couro de bicho

def _couraria_payload(player, greet=None):
    """O que a tela da Couraria mostra: os trofeus de animal que o jogador tem + preço 5x."""
    bag = player.get("inventory", [])
    rows = []
    for iid in items.animal_trophies():
        qty = items.count_in_bag(bag, iid)
        if qty <= 0:
            continue
        cat = items.get(iid) or {}
        unit = max(1, int(round(int(cat.get("value", 1)) * items.SHOP_SELL_RATE * COURARIA_MULT)))
        rows.append({"item": iid, "name": cat.get("name", iid), "qty": qty, "unit": unit})
    rows.sort(key=lambda r: -r["unit"])
    return {"title": "Couraria do Valdir", "greet": greet,
            "wallet": int(player.get("wallet", 0)), "items": rows}


@socketio.on("couraria_sell")
def on_couraria_sell(data=None):
    """Vende couro de bicho pro Valdir (5x). Aceita item e all (vender tudo)."""
    player = world.players.get(request.sid)
    if not player:
        return
    item_id = (data or {}).get("item")
    cat = items.get(item_id) or {}
    if not cat.get("animal"):
        emit("toast", {"text": "O Valdir só compra couro de bicho."})
        return
    bag = player.setdefault("inventory", [])
    have = items.count_in_bag(bag, item_id)
    qty = have if (data or {}).get("all") else 1
    if qty < 1 or not items.remove_from_bag(bag, item_id, qty):
        emit("toast", {"text": "Você não tem isso na mochila."})
        return
    unit = max(1, int(round(int(cat.get("value", 1)) * items.SHOP_SELL_RATE * COURARIA_MULT)))
    gain = unit * qty
    player["wallet"] = int(player.get("wallet", 0)) + gain
    _persist_loadout_wallet(player)
    emit("loadout", {"bag": player["inventory"], "equipment": player.get("equipment", {})})
    emit("couraria_open", _couraria_payload(player, "Bom couro. Tá pago: %d bronze." % gain))


MARION_PRICE = 2500   # Marion paga 2500 de bronze por cada Moeda de Avhur (mercador normal: 500)

def _marion_payload(player, greet=None):
    """O que a tela da Marion mostra: as Moedas de Avhur que o jogador tem + preço 2500."""
    bag = player.get("inventory", [])
    qty = items.count_in_bag(bag, "moeda_avhur")
    cat = items.get("moeda_avhur") or {}
    rows = []
    if qty > 0:
        rows.append({"item": "moeda_avhur", "name": cat.get("name", "Moeda de Avhur"),
                     "qty": qty, "unit": MARION_PRICE})
    return {"title": "Marion, a Bruxa", "greet": greet, "accent": "#c9a0ff",
            "header": "Moeda de Avhur · paga 2500 cada", "sellEvent": "marion_sell",
            "empty": 'Você não tem nenhuma <b style="color:#c9a0ff">Moeda de Avhur</b> na mochila. '
                     'A Marion paga <b style="color:#c9a0ff">2500 de bronze</b> por cada uma '
                     '(cinco vezes o que um mercador paga). As moedas caem na Mina de Avhur.',
            "wallet": int(player.get("wallet", 0)), "items": rows}


@socketio.on("marion_sell")
def on_marion_sell(data=None):
    """Vende Moeda de Avhur pra Marion a 2500 cada. Aceita item e all (vender tudo)."""
    player = world.players.get(request.sid)
    if not player:
        return
    item_id = (data or {}).get("item")
    if item_id != "moeda_avhur":
        emit("toast", {"text": "A Marion só compra Moeda de Avhur."})
        return
    bag = player.setdefault("inventory", [])
    have = items.count_in_bag(bag, "moeda_avhur")
    qty = have if (data or {}).get("all") else 1
    if qty < 1 or not items.remove_from_bag(bag, "moeda_avhur", qty):
        emit("toast", {"text": "Você não tem Moeda de Avhur na mochila."})
        return
    gain = MARION_PRICE * qty
    player["wallet"] = int(player.get("wallet", 0)) + gain
    _persist_loadout_wallet(player)
    emit("loadout", {"bag": player["inventory"], "equipment": player.get("equipment", {})})
    emit("couraria_open", _marion_payload(player, "Negócio fechado. Tá pago: %d de bronze." % gain))


# ===========================================================================
#  PARTY — a Mesa de Confraternizações (na taverna). Quem clica na mesa entra
#  num lobby. Cada um clica no nome dos outros (ready check MÚTUO): um jogador
#  passa pro lado do grupo quando TODOS os outros já o aceitaram. Quando todos
#  do lobby se aceitaram (2 a 6), a party é formada e todos veem o grupo.
# ===========================================================================
PARTY_MAX = 6
_party_lobby   = []      # sids na mesa, em ordem de chegada
_party_accepts = {}      # sid -> set de sids que ele já aceitou
_parties       = {}      # party_id -> [sids]
_player_party  = {}      # sid -> party_id
_party_seq     = [0]


def _party_confirmed(sid):
    """sid já passou pro lado do grupo? (foi aceito por TODOS os outros do lobby)"""
    others = [s for s in _party_lobby if s != sid]
    if not others:
        return False
    return all(sid in _party_accepts.get(o, set()) for o in others)


def _party_ready():
    """todo o lobby se aceitou mutuamente (2 a 6 jogadores)?"""
    if not (2 <= len(_party_lobby) <= PARTY_MAX):
        return False
    return all(_party_confirmed(s) for s in _party_lobby)


def _party_state_for(sid):
    """o estado do lobby do ponto de vista de um jogador (quem ele já aceitou)."""
    members = []
    for s in _party_lobby:
        p = world.players.get(s)
        if not p:
            continue
        members.append({
            "id": s,
            "name": p.get("name", "?"),
            "you": (s == sid),
            "confirmed": _party_confirmed(s),                  # já está no lado do grupo
            "accepted": (s in _party_accepts.get(sid, set())),  # você já aceitou esse
        })
    return {"members": members, "max": PARTY_MAX, "ready": _party_ready()}


def _party_broadcast():
    for s in list(_party_lobby):
        socketio.emit("party_update", _party_state_for(s), room=s)


def _party_remove(sid):
    """tira o jogador do lobby (fechou a interface, saiu da taverna ou caiu)."""
    if sid not in _party_lobby and sid not in _party_accepts:
        return
    if sid in _party_lobby:
        _party_lobby.remove(sid)
    _party_accepts.pop(sid, None)
    for accs in _party_accepts.values():
        accs.discard(sid)
    _party_broadcast()


def _party_form():
    members = list(_party_lobby)
    _party_seq[0] += 1
    pid = "pt%d" % _party_seq[0]
    _parties[pid] = members
    for s in members:
        _player_party[s] = pid
    for s in members:
        socketio.emit("party_formed", {"party_id": pid, "members": [
            {"id": m, "name": (world.players.get(m) or {}).get("name", "?"), "you": (m == s)}
            for m in members
        ]}, room=s)
    _party_lobby.clear()
    _party_accepts.clear()


@socketio.on("party_accept")
def on_party_accept(data=None):
    sid = request.sid
    if sid not in _party_lobby:
        return
    target = (data or {}).get("target")
    if not target or target == sid or target not in _party_lobby:
        return
    accs = _party_accepts.setdefault(sid, set())
    if target in accs:
        accs.discard(target)        # toggle: clicou de novo, desfaz
    else:
        accs.add(target)
    if _party_ready():
        _party_form()
    else:
        _party_broadcast()


@socketio.on("party_leave")
def on_party_leave(data=None):
    _party_remove(request.sid)


def _xama_payload(player, greet=None):
    """Monta o que o cliente mostra na tela da Xamã: proteção atual + os itens que
    ela aceita (com quantos o jogador tem)."""
    bag = player.get("inventory", [])
    f = player.get("ficha") or {}
    rows = []
    for (iid, pct) in items.death_protect_items():
        cat = items.get(iid) or {}
        rows.append({"item": iid, "name": cat.get("name", iid),
                     "protect": pct, "qty": items.count_in_bag(bag, iid)})
    rows.sort(key=lambda r: r["protect"])
    return {"title": "Xamã Miranda", "greet": greet,
            "protection": int(f.get("death_protect", 0)), "max": 50, "items": rows}


@socketio.on("xama_offer")
def on_xama_offer(data=None):
    """Oferece UM item de proteção: tira da mochila e soma a % (teto 50). Vale pra 1 morte."""
    player = world.players.get(request.sid)
    if not player:
        return
    item_id = (data or {}).get("item")
    cat = items.get(item_id) or {}
    pct = cat.get("protect")
    if not pct:
        return
    bag = player.setdefault("inventory", [])
    if not items.remove_from_bag(bag, item_id, 1):
        emit("toast", {"text": "Você não tem isso na mochila."})
        return
    f = player.get("ficha") or {}
    new = min(50, int(f.get("death_protect", 0)) + int(pct))
    f["death_protect"] = new
    player["ficha"] = f
    _persist_loadout_wallet(player)
    try:
        db.save_ficha(player["player_id"], f)
    except Exception:
        pass
    emit("loadout", {"bag": player["inventory"], "equipment": player.get("equipment", {})})
    msg = ("A amarração está completa: %d%% de proteção." % new) if new >= 50         else ("A amarração ficou mais forte: %d%% de proteção." % new)
    emit("xama_open", _xama_payload(player, msg))


def _open_shop(player, npc, title, sets, price, potions=None, extra=None):
    """Abre a loja: emite a fala do NPC, monta o catalogo e GUARDA os precos no
    player (pra validar a compra depois, ja que cada mercador cobra diferente)."""
    mp = player.get("map", "ermo")
    greet = npc.get("_spec", {}).get("greetings") or ["Da uma olhada na mercadoria."]
    socketio.emit("speech", {"id": npc["id"], "text": random.choice(greet)}, room=mp)
    cat = _shop_catalog(sets, price) if sets else []
    prices = {}
    for sec in cat:
        for it in sec["items"]:
            prices[it["item"]] = price
    pots = []
    for (pid, pprice) in (potions or []):
        c = items.get(pid) or {}
        pots.append({"item": pid, "name": c.get("name", pid), "price": pprice,
                     "color": c.get("color"), "heal": c.get("heal")})
        prices[pid] = pprice
    player["_shop_prices"] = prices
    player["_shop_extra"] = extra        # moeda extra: {"item": id, "qty": n, "name": ...} ou None
    emit("shop_open", {
        "title": title, "sets": cat, "potions": pots,
        "wallet": int(player.get("wallet", 0)), "sell_rate": items.SHOP_SELL_RATE,
        "extra": extra,
    })


def _persist_loadout_wallet(player):
    if player.get("player_id"):
        try:
            db.save_wallet(player["player_id"], player["wallet"])
            db.save_loadout(player["player_id"], player["inventory"],
                            player["equipment"], player.get("look"))
        except Exception as exc:
            print("erro salvando loja:", exc)


def _craft_payload(player, prof):
    """Monta a tela da bancada: nível/xp do ofício + receitas com have/need."""
    ficha = player.get("ficha") or {}
    profs = ficha.get("profs") or {}
    xp = int(profs.get(prof, 0))
    lvl = professions.level_of(xp)
    bag = player.setdefault("inventory", [])
    meta = professions.PROFESSIONS[prof]
    recs = []
    for r in professions.RECIPES.get(prof, []):
        cat = items.get(r["out"]) or {}
        need = []
        can = lvl >= r["lvl"]
        for (iid, q) in r["need"].items():
            have = items.count_in_bag(bag, iid)
            need.append({"item": iid, "name": (items.get(iid) or {}).get("name", iid),
                         "qty": q, "have": have})
            if have < q:
                can = False
        recs.append({"out": r["out"], "name": cat.get("name", r["out"]),
                     "rarity": cat.get("rarity", "comum"), "lvl": r["lvl"],
                     "xp": r["xp"], "can": can, "need": need,
                     "desc": items.describe(r["out"]) if hasattr(items, "describe") else ""})
    return {"prof": prof, "name": meta["name"], "icon": meta["icon"],
            "master": meta["master"], "level": lvl, "xp": xp,
            "level_cap": professions.LEVEL_CAP,
            "next_xp": professions.LEVEL_XP * lvl if lvl < professions.LEVEL_CAP else None,
            "recipes": recs}


def _try_gather(player):
    """Interagiu sem NPC por perto: procura um node de coleta encostado e colhe."""
    import time as _t
    mp = player.get("map", "ermo")
    px, py = player.get("x", 0), player.get("y", 0)
    alvo = None
    for nd in getattr(world, "nodes", {}).values():
        if nd["map"] != mp:
            continue
        if abs(nd["x"] - px) <= 1 and abs(nd["y"] - py) <= 1:
            alvo = nd
            break
    if not alvo:
        for nd in getattr(world, "nodes", {}).values():
            if nd["map"] == mp and abs(nd["x"] - px) <= 3 and abs(nd["y"] - py) <= 3:
                nome = professions.NODES[nd["type"]]["name"]
                emit("toast", {"text": "⛏️ Chegue colado no %s e aperte E pra coletar." % nome})
                return
        return
    spec = professions.NODES[alvo["type"]]
    now = _t.time()
    if alvo["until"] > now:
        falta = int(alvo["until"] - now) + 1
        emit("toast", {"text": "%s esgotado. Volta em ~%ds." % (spec["name"], falta)})
        return
    qmin, qmax = spec["gather"]
    qty = random.randint(qmin, qmax)
    bag = player.setdefault("inventory", [])
    items.add_to_bag(bag, spec["item"], qty)
    ganho = "+%d %s" % (qty, (items.get(spec["item"]) or {}).get("name", spec["item"]))
    bonus = spec.get("bonus")
    if bonus and random.random() < bonus[1]:
        items.add_to_bag(bag, bonus[0], 1)
        ganho += " (+1 %s!)" % (items.get(bonus[0]) or {}).get("name", bonus[0])
    alvo["until"] = now + spec["cd"]
    if player.get("player_id"):
        db.save_loadout(player["player_id"], player["inventory"],
                        player["equipment"], player.get("look"))
    emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
    emit("toast", {"text": "⛏️ Você conseguiu %s ao %s." % (ganho, spec["verb"])})
    _quest_bump(request.sid, player, "gather")
    socketio.emit("node_update", {"id": alvo["id"], "depleted": True,
                                  "cd": spec["cd"]}, room=mp)


def _try_fish(player):
    """Parado no píer da Vila Caiçara? Joga a linha e abre o minigame."""
    if player.get("map") != "costa_maravai":
        return False
    rows = wm.MAPS["costa_maravai"]["rows"]
    x, y = player.get("x", 0), player.get("y", 0)
    if not (0 <= y < len(rows)) or rows[y][x] != "=":
        return False
    player["_fishing"] = time.time()
    emit("fish_start", {})
    return True


@socketio.on("fish_hit")
def on_fish_hit(data):
    """O jogador cravou a barra: perto do centro = peixe no balaio."""
    player = world.players.get(request.sid)
    if not player or time.time() - player.get("_fishing", 0) > 12:
        return
    player["_fishing"] = 0
    pos = float((data or {}).get("pos", 0))
    if abs(pos - 0.5) <= 0.17:
        raro = random.random() < 0.15
        iid = "peixe_dourado" if raro else "peixe_fresco"
        bag = player.setdefault("inventory", [])
        items.add_to_bag(bag, iid, 1)
        if player.get("player_id"):
            db.save_loadout(player["player_id"], player["inventory"],
                            player["equipment"], player.get("look"))
        emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
        emit("toast", {"text": ("🌟 Um PEIXE DOURADO! Que dia!" if raro
                                 else "🎣 Fisgou um Peixe Fresco!")})
    else:
        emit("toast", {"text": "🎣 Ele escapou... a maré leva, a maré traz."})


# ROTINA DOS NPCs: certos moradores mudam de lugar entre dia e noite
_NPC_ROUTINE = {
    "npc:seu_milton":     {"day": (272, 220), "night": (262, 226)},
    "npc:maricota":       {"day": (232, 208), "night": (251, 243)},
}
def _npc_routine_loop():
    while True:
        socketio.sleep(30)
        noite = _is_night()
        try:
            for spec in npcs.ROSTER:
                rot = _NPC_ROUTINE.get(spec.get("id"))
                if not rot:
                    continue
                alvo = rot["night" if noite else "day"]
                spec["home"] = alvo
                ent = world.players.get(spec["id"])
                if ent and max(abs(ent["x"] - alvo[0]), abs(ent["y"] - alvo[1])) > 6:
                    ent["x"], ent["y"] = alvo
                    socketio.emit("player_moved", _npc_moved_payload(ent),
                                  room=spec.get("map", "ermo"))
        except Exception as exc:
            print("erro na rotina dos NPCs:", exc)


@socketio.on("craft_make")
def on_craft_make(data):
    """Bancada: tenta criar uma receita (consome ingredientes, dá o produto + XP)."""
    player = world.players.get(request.sid)
    if not player:
        return
    prof = (data or {}).get("prof")
    out = (data or {}).get("out")
    if prof not in professions.PROFESSIONS:
        return
    receita = next((r for r in professions.RECIPES.get(prof, []) if r["out"] == out), None)
    if not receita:
        return
    ficha = player.get("ficha") or {}
    profs = ficha.setdefault("profs", {})
    xp = int(profs.get(prof, 0))
    lvl = professions.level_of(xp)
    if lvl < receita["lvl"]:
        emit("toast", {"text": "Nível %d de %s necessário." % (receita["lvl"], professions.PROFESSIONS[prof]["name"])})
        return
    bag = player.setdefault("inventory", [])
    for (iid, q) in receita["need"].items():
        if items.count_in_bag(bag, iid) < q:
            emit("toast", {"text": "Falta material: %s." % (items.get(iid) or {}).get("name", iid)})
            return
    for (iid, q) in receita["need"].items():
        items.remove_from_bag(bag, iid, q)
    items.add_to_bag(bag, out, 1)
    novo_xp = xp + receita["xp"]
    profs[prof] = novo_xp
    player["ficha"] = ficha
    novo_lvl = professions.level_of(novo_xp)
    if player.get("player_id"):
        db.save_ficha(player["player_id"], ficha)
        db.save_loadout(player["player_id"], player["inventory"],
                        player["equipment"], player.get("look"))
    emit("ficha", {"ficha": ficha})
    emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
    nome = (items.get(out) or {}).get("name", out)
    if novo_lvl > lvl:
        emit("toast", {"text": "✨ %s criado! %s subiu pro nível %d!" % (nome, professions.PROFESSIONS[prof]["name"], novo_lvl)})
    else:
        emit("toast", {"text": "✨ Você criou: %s (+%d XP de ofício)." % (nome, receita["xp"])})
    emit("craft_open", _craft_payload(player, prof))


@socketio.on("shop_buy")
def on_shop_buy(data):
    """Compra uma peca da loja por SHOP_PRICE (3000) de bronze."""
    player = world.players.get(request.sid)
    if not player:
        return
    item_id = (data or {}).get("item")
    prices = player.get("_shop_prices") or {}
    price = prices.get(item_id)
    if price is None:
        emit("toast", {"text": "Isso nao esta a venda."})
        return
    wallet = int(player.get("wallet", 0))
    if wallet < price:
        emit("toast", {"text": "Bronze insuficiente (custa %d)." % price})
        return
    extra = player.get("_shop_extra")
    if extra and extra.get("item"):                      # moeda extra (ex: 5 Símbolos de Varth)
        need = int(extra.get("qty", 0))
        have = items.count_in_bag(player.get("inventory", []), extra["item"])
        if have < need:
            emit("toast", {"text": "Faltam %s (precisa de %d, você tem %d)."
                                   % (extra.get("name", "símbolos"), need, have)})
            return
    player["wallet"] = wallet - price
    if extra and extra.get("item"):
        items.remove_from_bag(player.setdefault("inventory", []), extra["item"], int(extra.get("qty", 0)))
    items.add_to_bag(player.setdefault("inventory", []), item_id, 1)
    _persist_loadout_wallet(player)
    emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
    emit("wallet", {"bronze": player["wallet"]})
    emit("toast", {"text": "Comprou: %s" % (items.get(item_id) or {}).get("name", item_id)})


@socketio.on("shop_sell")
def on_shop_sell(data):
    """Vende uma peca da mochila (trofeus inclusos) por uma fracao do valor."""
    player = world.players.get(request.sid)
    if not player:
        return
    item_id = (data or {}).get("item")
    cat = items.get(item_id)
    if not cat:
        return
    if cat.get("couraria_only"):
        emit("toast", {"text": "Isso so o coureiro Valdir compra. Leva pra Couraria."})
        return
    bag = player.setdefault("inventory", [])
    sell_all = bool((data or {}).get("all"))
    have = items.count_in_bag(bag, item_id)
    qty = have if sell_all else 1
    if qty < 1 or not items.remove_from_bag(bag, item_id, qty):
        emit("toast", {"text": "Voce nao tem isso na mochila."})
        return
    unit = (int(cat["sell_value"]) if "sell_value" in cat
            else max(1, int(round(int(cat.get("value", 1)) * items.SHOP_SELL_RATE))))
    gain = unit * qty
    player["wallet"] = int(player.get("wallet", 0)) + gain
    _persist_loadout_wallet(player)
    emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
    emit("wallet", {"bronze": player["wallet"]})
    _lbl = ("%dx %s" % (qty, cat.get("name", item_id))) if qty > 1 else cat.get("name", item_id)
    emit("toast", {"text": "Vendeu %s por %d bronze" % (_lbl, gain)})


@socketio.on("confirm_ok")
def on_confirm_ok(data):
    """Cliente confirmou um popup. Por enquanto: a ida do corvo pro Salao."""
    player = world.players.get(request.sid)
    if not player:
        return
    action = (data or {}).get("action")
    if action == "go_salao" and player.get("map", "ermo") == "ermo":
        sx, sy = rules.pick_spawn(world, "salao")
        _go_to(request.sid, "salao", sx, sy)
        return

    # Oferenda no Templo dos Doze: 100 de bronze -> vida cheia
    if action == "altar_fortuna" and player.get("map") == "templo_doze":
        if int(player.get("wallet", 0)) < 1000:
            emit("toast", {"text": "A Fortuna custa 1000 de bronze. Os Doze esperam."})
            return
        player["wallet"] = int(player.get("wallet", 0)) - 1000
        f = player.get("ficha") or {}
        f["fortune_until"] = time.time() + 1800
        player["ficha"] = f
        _quest_save(player)
        emit("wallet", {"bronze": player.get("wallet", 0)})
        emit("toast", {"text": "✨ A Fortuna dos Doze te acompanha: +50%% de sorte nos drops raros por 30 minutos!"})
        return

    if action == "templo_doar" and player.get("map") in ("ermo", "templo_doze"):
        preco = 100
        if int(player.get("wallet", 0)) < preco:
            socketio.emit("speech", {"id": "npc:irma_solene",
                "text": "Os deuses não cobram, mas o templo tem goteiras. Volta com o bronze, filho."},
                room="ermo")
            return
        player["wallet"] = int(player.get("wallet", 0)) - preco
        f = player.get("ficha") or {}
        f["hp"] = f.get("hp_max", f.get("hp", 1))
        player["ficha"] = f
        try:
            if player.get("player_id"):
                db.save_wallet(player["player_id"], player["wallet"])
                db.save_ficha(player["player_id"], f)
        except Exception:
            pass
        emit("wallet", {"bronze": player["wallet"]})
        emit("xp", {"xp": f.get("xp", 0), "level": f.get("level", 1), "hp": f["hp"],
                    "hp_max": f.get("hp_max"), "prof": f.get("prof"), "gained": 0,
                    "pending_asi": f.get("pending_asi", [])})
        emit("toast", {"text": "✨ Os Doze ouviram a tua oferenda. Vida restaurada!"})
        return

    # Barco do Zé do Remo: Vila Caiçara -> Ermo por 500 de bronze
    if action == "barco_ermo" and player.get("map") == "costa_maravai":
        preco = 500
        if int(player.get("wallet", 0)) < preco:
            socketio.emit("speech", {"id": "npc:ze_do_remo",
                "text": "Sem bronze não tem maré, amigo. Volta quando o bolso pesar."},
                room="costa_maravai")
            return
        player["wallet"] = int(player.get("wallet", 0)) - preco
        try:
            if player.get("player_id"):
                db.save_wallet(player["player_id"], player["wallet"])
        except Exception:
            pass
        emit("wallet", {"bronze": player["wallet"]})
        sx, sy = rules.pick_spawn(world, "ermo")
        _go_to(request.sid, "ermo", sx, sy)
        emit("toast", {"text": "⛵ O barco do Zé corta a costa... e te deixa no Ermo."})
        return

    # Jogo do Búzio do Seu Milton: 200 de bronze, 45%% de dobrar
    if action == "buzio_play" and player.get("map") == "costa_maravai":
        aposta = 200
        if int(player.get("wallet", 0)) < aposta:
            socketio.emit("speech", {"id": "npc:seu_milton",
                "text": "Mesa é pra quem tem bronze, meu chapa. O búzio não fia."},
                room="costa_maravai")
            return
        player["wallet"] = int(player.get("wallet", 0)) - aposta
        if random.random() < 0.45:
            player["wallet"] += aposta * 2
            socketio.emit("speech", {"id": "npc:seu_milton",
                "text": "ABERTO! O mar te sorriu hoje. Leva teus 400 e some antes que eu chore."},
                room="costa_maravai")
            emit("toast", {"text": "🐚 O búzio caiu ABERTO! Você ganhou 400 de bronze."})
        else:
            socketio.emit("speech", {"id": "npc:seu_milton",
                "text": "Fechado... o búzio é assim: honesto e cruel. Mais uma?"},
                room="costa_maravai")
            emit("toast", {"text": "🐚 O búzio caiu fechado. 200 de bronze pro mar."})
        try:
            if player.get("player_id"):
                db.save_wallet(player["player_id"], player["wallet"])
        except Exception:
            pass
        emit("wallet", {"bronze": player["wallet"]})
        return

    # mundos secretos: viagem confirmada
    if action and action.startswith("secret_go:"):
        target = action.split(":", 1)[1]
        if target == "valoran" and (player.get("ficha") or {}).get("banned_valoran"):
            socketio.emit("speech", {"id": "god:jeans",
                "text": "O Gato Branco nao te recebe mais. Voce o desafiou."},
                room=player.get("map", "ermo"))
            return
        if (target in wm.MAPS
                and secret_worlds.FROM_OF.get(target) == player.get("map", "ermo")):
            sx, sy = rules.pick_spawn(world, target)
            _go_to(request.sid, target, sx, sy)
        return
    # Valoran: segunda confirmacao (a casa do Gato Branco de Olhos Verdes)
    if action == "secret_dbl:valoran" and player.get("map", "ermo") == "rasharan":
        if (player.get("ficha") or {}).get("banned_valoran"):
            socketio.emit("speech", {"id": "god:jeans",
                "text": "O Gato Branco nao te recebe mais. Voce o desafiou."},
                room="rasharan")
            return
        emit("confirm", {
            "action": "secret_go:valoran",
            "title": "Voce quer ver mesmo o Gato Branco de Olhos Verdes?",
            "body": "Nao desvie os olhos depois. Confirma a entrada em Valoran?",
            "ok": "Confirmo", "cancel": "Recuo"})
        return


@socketio.on("set_class")
def on_set_class(data):
    """Cliente confirmou a classe e escolheu os 2 atributos do +2. Aplica o bonus,
    calcula a vida, grava e devolve a ficha. So aceita a classe que um mestre
    ofereceu (esta em _pending_class)."""
    player = world.players.get(request.sid)
    if not player or player.get("map", "ermo") != "salao":
        return
    cid = _pending_class.get(request.sid)
    if not cid:
        emit("class_error", {"reason": "fale com um mestre primeiro"})
        return
    plus2 = (data or {}).get("plus2") or []
    if not isinstance(plus2, list):
        plus2 = []
    ok, result = accounts.set_class(player["player_id"], cid, plus2)
    if not ok:
        emit("class_error", {"reason": result})
        return
    _pending_class.pop(request.sid, None)
    player["ficha"] = result   # memoria: a partir de agora ja tem classe
    cls = classes.get_class(cid) or {}
    # o mestre confirma com uma fala
    mid = "npc:mestre_" + cid
    if mid in world.players:
        socketio.emit("speech", {"id": mid,
            "text": "Esta feito. Agora voce e um " + cls.get("name", "iniciado") + "."},
            room="salao")
    emit("ficha", {"ficha": result, "just_set": True})


def _grimoire_view(ficha):
    """Monta os dados do Grimorio pro cliente: pool selecionavel, limites, o que
    esta escolhido (validado) e os espacos atuais."""
    cid = ficha.get("class_id")
    if cid not in spells_def.CLASS_LIST:
        return {"caster": False}
    if not ficha.get("res"):
        leveling.compute_resources(ficha)   # fichas antigas: garante os espacos
    level = int(ficha.get("level", 1))
    final = ficha.get("attrs_final") or ficha.get("attrs") or {}
    cattr = spells_def.CASTING.get(cid)
    cmod = ((int(final.get(cattr, 10)) - 10) // 2) if cattr else 0
    pool = spells_def.pool_for(cid, level)

    def detail(sid):
        sp = spells_def.get(sid) or {}
        return {"id": sid, "name": sp.get("name", sid), "level": sp.get("level", 0),
                "kind": sp.get("kind"), "range": sp.get("range"), "desc": sp.get("desc", "")}

    return {
        "caster": True, "class_id": cid, "kind": spells_def.caster_kind(cid), "cast_attr": cattr,
        "cantrip_limit": spells_def.cantrip_limit(cid, level),
        "spell_limit": spells_def.spell_limit(cid, level, cmod),
        "max_spell_level": min(spells_def.max_spell_level(cid, level), spells_def.MAX_LIB_LEVEL),
        "pool": {"cantrips": [detail(i) for i in pool["cantrips"]],
                 "by_level": {str(lv): [detail(i) for i in ids] for lv, ids in pool["by_level"].items()}},
        "chosen": spells_def.loadout_for(ficha),
        "slots": (ficha.get("res") or {}).get("slots", {}),
    }


@socketio.on("grimoire_get")
def on_grimoire_get(_data=None):
    player = world.players.get(request.sid)
    if not player:
        return
    emit("grimoire", _grimoire_view(player.get("ficha") or {}))


@socketio.on("set_grimoire")
def on_set_grimoire(data):
    """Salva as magias escolhidas/preparadas (validadas contra a lista e os limites)."""
    player = world.players.get(request.sid)
    if not player:
        return
    ficha = player.get("ficha") or {}
    cid = ficha.get("class_id")
    if cid not in spells_def.CLASS_LIST:
        emit("grimoire", _grimoire_view(ficha))
        return
    level = int(ficha.get("level", 1))
    final = ficha.get("attrs_final") or ficha.get("attrs") or {}
    cattr = spells_def.CASTING.get(cid)
    cmod = ((int(final.get(cattr, 10)) - 10) // 2) if cattr else 0
    chosen = spells_def.validate_loadout(cid, level, cmod,
                                         (data or {}).get("cantrips"), (data or {}).get("spells"))
    ficha["grimoire"] = chosen
    player["ficha"] = ficha
    if player.get("player_id"):
        db.save_ficha(player["player_id"], ficha)
    emit("grimoire", _grimoire_view(ficha))


def _gatekeeper_near(player):
    """True se o jogador esta a <=5 tiles do guia que abre os mundos secretos:
    o corvo no Ermo, o Jeans (deus) em Rasharan."""
    mp = player.get("map", "ermo")
    gid = {"ermo": "npc:corvo", "rasharan": "god:jeans"}.get(mp)
    return bool(gid and world.near_entity(player, gid, 5))


def _offer_secret_trip(player, ph):
    """O guia confirma a viagem. Valoran pede confirmacao DUPLA."""
    mp = player.get("map", "ermo")
    guide = "npc:corvo" if mp == "ermo" else "god:jeans"
    if ph.get("double"):   # Valoran
        if (player.get("ficha") or {}).get("banned_valoran"):
            socketio.emit("speech", {"id": guide,
                "text": "O Gato Branco nao te recebe mais. Voce o desafiou no castelo do Criador."},
                room=mp)
            return
        socketio.emit("speech", {"id": guide,
            "text": secret_worlds.VALORAN_JEANS_LINE}, room=mp)
        emit("confirm", {
            "action": "secret_dbl:valoran",
            "title": "A alcova do Gato Branco",
            "body": "Valoran e o reino do Pofnir. La dentro nem o Jeans te ajuda. "
                    "Quer mesmo ir?",
            "ok": "Quero ir", "cancel": "Agora nao"})
        return
    socketio.emit("speech", {"id": guide, "text": "Podemos ir, caro amigo?"}, room=mp)
    emit("confirm", {
        "action": "secret_go:" + ph["map"],
        "title": "Atravessar?",
        "body": "A palavra abriu o caminho. Vamos juntos ao reino?",
        "ok": "Vamos", "cancel": "Fico"})


def _grant_pofnir_blessing(player):
    """A bencao maxima: +5 de vida maxima, definitiva e so uma vez."""
    ficha = player.get("ficha") or {}
    if not ficha.get("class_id") or "hp_max" not in ficha:
        socketio.emit("speech", {"id": "god:pofnir",
            "text": "Voce ainda nao trilhou um caminho. Volte com uma classe, e eu te abencoo."},
            room="valoran")
        return
    if ficha.get("blessing_pofnir"):
        socketio.emit("speech", {"id": "god:pofnir",
            "text": "Voce ja carrega a minha bencao, amigo. Uma vez basta entre nos."},
            room="valoran")
        return
    ficha["blessing_pofnir"] = True
    player["ficha"] = ficha
    leveling.recompute(ficha)   # aplica o +5 permanente (e cura o ganho)
    try:
        if player.get("player_id"):
            db.save_ficha(player["player_id"], ficha)
    except Exception as exc:
        print("erro salvando bencao do Pofnir:", exc)
    socketio.emit("speech", {"id": "god:pofnir",
        "text": "Entao esta dito: voce e meu amigo. Leve um pedaco da minha luz, "
                "que a sua vida seja mais longa."}, room="valoran")
    emit("ficha", {"ficha": ficha, "blessed": True})
    emit("toast", {"text": "Pofnir te abencoou: +5 de vida maxima!"})
    _award_xp(player, leveling.SECRET_XP, "Recebeu a bencao do Pofnir")


# ---------------------------------------------------------------------------
#  O TRONO DO CRIADOR (Fundamento): tocar -> aviso do Pofnir -> insistir ->
#  OBLITERACAO (perde a moeda + banido de Valoran + morte comum -> respawn).
# ---------------------------------------------------------------------------
def _throne_center():
    rows = map_rows("fundamento")
    pts = [(x, y) for y, row in enumerate(rows)
           for x, ch in enumerate(row) if ch == "Y"]
    if not pts:
        return (50.0, 12.0)
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0)


_FUND_THRONE = _throne_center()
_THRONE_WINDOW = 12.0   # segundos pra "insistir" depois do aviso


def _obliterate(sid):
    """A ira do Pofnir sobre quem insistiu no trono do Criador: zera a moeda,
    bane de Valoran pra sempre, dispara a morte (raio) e respawna no Ermo."""
    player = world.players.get(sid)
    if not player:
        return
    mp = player.get("map", "ermo")
    # 1) perde TODA moeda (hoje: itens kind 'currency'; gancho pra economia futura)
    bag = player.get("inventory") or []
    kept = [s for s in bag
            if (items.get(s.get("item")) or {}).get("kind") != "currency"]
    player["inventory"] = kept
    try:
        if player.get("player_id"):
            db.save_inventory(player["player_id"], kept)
    except Exception as exc:
        print("erro zerando moeda na obliteracao:", exc)
    socketio.emit("inventory", {"bag": kept}, to=sid)
    # 2) banido de Valoran pra sempre (marcado na ficha, persiste)
    ficha = player.get("ficha") or {}
    ficha["banned_valoran"] = True
    player["ficha"] = ficha
    try:
        if player.get("player_id"):
            db.save_ficha(player["player_id"], ficha)
    except Exception as exc:
        print("erro salvando banimento de Valoran:", exc)
    # 3) a sentenca + a morte (raio dourado do Gato Branco)
    socketio.emit("speech", {"id": "god:pofnir",
        "text": "Eu avisei. Voce tocou no que e dele. Volte ao po."}, room=mp)
    socketio.emit("smite", {"target": player["id"], "by": "god:pofnir",
        "color": "#f6e6ad"}, room=mp)
    player["_throne_t"] = 0.0
    # 4) morte comum -> respawn no Ermo (depois da animacao) + o aviso
    def _resp():
        socketio.sleep(1.4)
        sx, sy = rules.pick_spawn(world, "ermo")
        _go_to(sid, "ermo", sx, sy)
        socketio.emit("toast", {"text": "O Pofnir te obliterou. Voce perdeu suas "
                                "moedas e foi banido de Valoran para sempre."}, to=sid)
    socketio.start_background_task(_resp)


@socketio.on("throne")
def on_throne(_data=None):
    """Cliente tocou no trono (so no Fundamento). 1o toque: o Pofnir aparece e
    avisa. 2o toque dentro da janela: obliteracao. Sair/esperar: nada acontece."""
    player = world.players.get(request.sid)
    if not player or player.get("map") != "fundamento":
        return
    cx, cy = _FUND_THRONE
    if abs(player["x"] - cx) > 12 or abs(player["y"] - cy) > 12:
        return  # longe demais do trono pra "tocar"
    now = time.time()
    last = player.get("_throne_t", 0.0)
    if 0.0 < now - last <= _THRONE_WINDOW:   # insistiu
        _obliterate(request.sid)
        return
    player["_throne_t"] = now                 # primeiro aviso
    socketio.emit("throne_warn", {"cx": cx, "cy": cy,
        "text": "Sai de perto do cheiro dele."}, to=request.sid)


# ============================ FAGULHA -> DEUSES ============================
# O jogador chega perto de um deus, diz que tem uma Fagulha de Divindade, e a
# entrega. Cada deus so concede o seu DOM (habilidade/bola) na PRIMEIRA fagulha
# daquele personagem. Deus patrono ensina sua habilidade (so pra a classe dele);
# o Pofnir da a Bola de La. Classe errada (ou deus ainda sem dom) ganha uma
# Pocao Divina (o deus engole a fagulha mesmo assim, pois todos as desejam).
# Quem recebe o dom ganha uma MARCA na ficha. Falas e recompensas ficam aqui.
GOD_FAGULHA = {
    "god:pofnir": {
        "item": "bola_la_pofnir", "flag": "bola_pofnir",
        "mark": "Pofnir deixou você brincar",
        "line": "Hmmmrrr... uma Fagulha. Da aqui. *o gato branco a engole inteira e ronrona fundo* Toma essa bola de la, amassei eu mesmo com as patas. Brinca com ela. Agora tu es meu amigo, humano.",
        "line_repeat": "Ja te dei minha bola de la e ja engoli tua oferta. Guarda a proxima Fagulha pra outro deus.",
        "line_none": "Tu vens ate o gato branco de maos vazias? Volta quando tiver uma Fagulha de verdade.",
    },
    "god:nhare": {
        "ability": "milesima_saida", "class": "ladino", "flag": "dom_nhare",
        "mark": "Nharé sabe se esconder",
        "line": "Uma Fagulha! Pra MIM?! *a lebre da um salto no ar* Entao recebe a Milesima Saida: quando te encurralarem sem nenhuma porta, sempre vai existir mais uma. E aprende a virar lebre e sumir do mundo inteiro. Corre, ladino, e ninguem nunca te acha.",
        "line_repeat": "Ja te ensinei a Milesima Saida e a forma de lebre. Guarda tua Fagulha, eu ja corri com a minha.",
        "line_none": "Frase bonita, mas cade a Fagulha? Lebre nao corre atras de promessa.",
        "line_other": "Hmm... essa Fagulha nao casa com tuas pernas, tu nao es ladino. Mas eu nunca recuso uma. *a lebre a engole num pulo* Toma essa pocao em troca, e segue teu caminho.",
    },
    "god:valiria": {
        "ability": "aurora_valiria", "class": "paladino", "flag": "dom_valiria",
        "mark": "Aurora de Valíria",
        "line": "*a elfa serena ergue a mao e uma luz de amanhecer desce sobre voce* Uma Fagulha. Aceito-a com gratidao. Recebe a Aurora de Valiria: quando a tua gente precisar, eu desco, todos os olhos do inimigo se voltam pra ti e nenhum golpe te derruba. Mas a luz cobra seu preco no teu braco. Carrega-a com honra, paladino.",
        "line_repeat": "A Aurora ja e tua, paladino. Guarda tua Fagulha; a mesma luz nao desce duas vezes sobre o mesmo escudo.",
        "line_none": "Vens me falar de Fagulha sem trazer nenhuma? A aurora nao nasce de promessa.",
        "line_other": "*a luz hesita por um instante* Essa Fagulha nao foi talhada pra tua classe, mas eu a recebo com carinho. Leva esta pocao abencoada em troca, e segue em paz.",
    },
    "god:facalan": {
        "ability": "forma_facalan", "class": "druida", "flag": "dom_facalan",
        "mark": "A onça reconhece você",
        "line": "*a onca dourada te encara sem piscar e aceita a Fagulha com um rosnado fundo* ...entao tu es dos meus. Recebe a Forma de Facalan: quando a luta apertar, vira o que eu sou. Ouro, garra e furia. E enquanto fores pantera, a morte vai ter que esperar a tua vez.",
        "line_repeat": "Ja corre o meu sangue em ti, druida. A pantera ja e tua. Guarda tua Fagulha pra outro deus.",
        "line_none": "Chegas na minha selva falando de Fagulha de maos vazias? A onca nao perde tempo com quem vem sem nada.",
        "line_other": "*a onca cheira a Fagulha e rosna* Nao es da minha matilha, esse dom nao e teu. Mas eu nao recuso uma Fagulha. *a engole* Toma essa pocao e some da minha selva.",
    },
    "god:nherith": {
        "ability": "golpe_morte_alada", "class": "bruxo", "flag": "dom_nherith",
        "mark": "O pacto da coruja",
        "line": "*a coruja gigante gira a cabeca e te encara com olhos que nao piscam* Uma Fagulha... entao o pacto esta selado. Recebe a forma da Coruja Demoniaca e o Golpe da Morte Alada. Mas saiba: enquanto vestires minhas asas, tuas magias dormem. Garra ou feitico, escolhe bem, bruxo.",
        "line_repeat": "O pacto ja foi selado entre nos, e a coruja ja e tua. Guarda tua Fagulha pra outro deus.",
        "line_none": "Tu sussurras 'fagulha' mas tuas maos estao vazias. A coruja nao sela pacto com promessa.",
        "line_other": "*a coruja inclina a cabeca lentamente* Esse pacto nao foi feito pra ti, nao es bruxo. Mas a Fagulha eu aceito. *a engole* Leva esta pocao e some da minha arvore.",
    },
    "god:jose": {
        "ability": "cancao_cabare", "class": "bardo", "flag": "dom_jose",
        "mark": "José trapaceia a seu favor",
        "line": "*o gato preto abre um olho dourado no escuro do cabare* Ahh... uma Fagulha. Ha quanto tempo ninguem me trazia uma dessas. *se espreguica todo* Senta ai, bardo. Vou te ensinar a Cancao do Cabare: enquanto tu cantares, nenhum inimigo te toca com fogo, veneno ou maldicao. E quem tentar... aprende na carne que aqui quem trapaceia sou eu.",
        "line_repeat": "*o gato boceja* A cancao eu ja te ensinei, bardo. Ninguem aprende a mesma musica duas vezes. Leva tua Fagulha pra outro deus.",
        "line_none": "*o gato fecha o olho de novo* Vens cantar 'fagulha' de maos vazias? Some, bardo. O Jose nao da nota fiada.",
        "line_other": "*o gato preto te mede de cima a baixo* Tu nao tens voz de bardo, forasteiro, essa cancao nao e pra ti. *estica a pata pra Fagulha* Mas isso aqui... isso eu fico. Toma tua pocao e cai fora do meu cabare.",
    },
}
# falas genericas pros deuses que ainda nao tem dom coordenado
GENERIC_FAGULHA = {
    "line_other": "*o deus encara a Fagulha com fome e a recebe* Eu ainda nao tenho um dom feito pra ti, mas tua oferta nunca fica sem resposta. Leva esta pocao divina.",
    "line_none": "Voce nao tem nenhuma Fagulha pra me oferecer.",
    "line_repeat": "Ja recebeste de mim o que eu tinha pra dar. Guarda tua Fagulha.",
}


def _nearest_deity(player, radius):
    """(god_id, entidade) do deus mais perto do jogador no mesmo mapa, ou None."""
    mp = player.get("map", "ermo")
    best, bestd = None, radius + 1
    for gid, ent in world.players.items():
        if ent.get("kind") != "deity" or ent.get("map", "ermo") != mp:
            continue
        dd = max(abs(player["x"] - ent["x"]), abs(player["y"] - ent["y"]))
        if dd <= radius and dd < bestd:
            best, bestd = (gid, ent), dd
    return best


def _is_fagulha_phrase(text):
    n = secret_worlds.norm(text)
    return "fagulha" in n and any(w in n for w in ("tenho", "toma", "tome", "pega", "aceita", "quer", "trago"))


def _fagulha_exchange(player, god_id):
    """Entrega de uma Fagulha a um deus. O dom (habilidade/bola) so na 1a vez por
    deus; classe errada ou deus sem dom -> Pocao Divina (consome a fagulha mesmo)."""
    mp = player.get("map", "ermo")
    sid = player.get("id")
    f = player.setdefault("ficha", {})
    given = f.setdefault("fagulhas_dadas", [])
    bag = player.setdefault("inventory", [])
    spec = GOD_FAGULHA.get(god_id, {})

    def say(txt):
        socketio.emit("speech", {"id": god_id, "text": txt}, room=mp)

    if items.count_in_bag(bag, "fagulha_divindade") <= 0:                 # nao tem fagulha
        say(spec.get("line_none") or GENERIC_FAGULHA["line_none"])
        return
    if god_id in given:                                                   # ja recebeu o DOM desse deus
        say(spec.get("line_repeat") or GENERIC_FAGULHA["line_repeat"])
        return

    # --- 1a vez: decide a recompensa ---
    reward_txt, line, dom = "", "", False
    if spec.get("item"):                                                  # Pofnir -> bola de la
        items.add_to_bag(bag, spec["item"], 1)
        if spec.get("flag"):
            f[spec["flag"]] = True                                        # marca na ficha (ex: bola_pofnir)
        reward_txt = "Recebeu: " + ((items.get(spec["item"]) or {}).get("name", spec["item"]))
        line, dom = spec.get("line", ""), True
    elif spec.get("ability") and (f.get("class_id") or "") == spec.get("class"):   # classe certa -> habilidade
        ga = f.setdefault("god_abilities", [])
        if spec["ability"] not in ga:
            ga.append(spec["ability"])
        if spec.get("flag"):
            f[spec["flag"]] = True                                        # libera a forma (ex: a lebre)
        reward_txt = "Aprendeu: " + ((abilities_def.get(spec["ability"]) or {}).get("name", spec["ability"]))
        line, dom = spec.get("line", ""), True
    else:                                                                 # classe errada / deus sem dom -> pocao
        items.add_to_bag(bag, "pocao_divina", 1)
        reward_txt = "Recebeu: Poção Divina"
        line = spec.get("line_other") or GENERIC_FAGULHA["line_other"]

    items.remove_from_bag(bag, "fagulha_divindade", 1)                    # consome sempre
    if dom:                                                               # so o dom marca o deus como ja-dado
        given.append(god_id)
    pid = player.get("player_id")
    if pid:
        try: db.save_inventory(pid, bag)
        except Exception as exc: print("aviso save_inventory fagulha:", exc)
        try: db.save_ficha(pid, f)
        except Exception as exc: print("aviso save_ficha fagulha:", exc)
    say(line)
    if sid:
        socketio.emit("loadout", {"bag": bag, "equipment": player.get("equipment", {})}, to=sid)
        socketio.emit("ficha", {"ficha": f}, to=sid)                     # atualiza marcas + forma no painel
        if reward_txt:
            socketio.emit("toast", {"text": reward_txt}, to=sid)
@socketio.on("gm_command")
def on_gm_command(data):
    """Comandos do Mestre (GM). SEMPRE revalida is_gm no servidor: o cliente nunca
    decide sozinho. Cobre god mode, voar, teleporte, dar item, invocar monstro,
    grana, cura, nível, e gestão de jogadores (ir até, trazer, kickar)."""
    player = world.players.get(request.sid)
    if not player or not gm.is_gm(player):
        return
    action = (data or {}).get("action")
    p = (data or {}).get("params") or {}
    mp = player.get("map", "ermo")
    sid = request.sid

    def _emit_self_hp(reason):
        f = player.get("ficha") or {}
        emit("xp", {"xp": f.get("xp", 0), "level": f.get("level", 1),
                    "hp": f.get("hp"), "hp_max": f.get("hp_max"), "prof": f.get("prof"),
                    "gained": 0, "reason": reason, "pending_asi": f.get("pending_asi", [])})

    if action == "god":                                   # 🛡️ invencível
        player["gm_god"] = not player.get("gm_god")
        enc = COMBAT.get(sid)
        if enc and enc["combs"].get(sid):
            enc["combs"][sid]["gm_god"] = player["gm_god"]
        emit("gm_state", {"god": player["gm_god"]})
        emit("toast", {"text": "🛡️ God mode " + ("LIGADO" if player["gm_god"] else "desligado")})

    elif action == "fly":                                 # ✈️ noclip
        player["gm_fly"] = not player.get("gm_fly")
        emit("gm_state", {"fly": player["gm_fly"]})
        emit("toast", {"text": "✈️ Voar " + ("LIGADO" if player["gm_fly"] else "desligado")})

    elif action == "tp":                                  # 📍 teleporte no mapa atual
        if player.get("in_combat"):
            return
        try:
            x = int(p.get("x")); y = int(p.get("y"))
        except (TypeError, ValueError):
            return
        if not rules.in_bounds(x, y, mp):
            return
        player["x"], player["y"] = x, y
        player["_dirty"] = True
        if not player.get("invisible"):
            socketio.emit("player_moved",
                          {"id": player["id"], "x": x, "y": y, "facing": player["facing"]},
                          room=mp, skip_sid=sid)
        emit("gm_tp", {"x": x, "y": y})                   # cliente do GM dá o snap + recentraliza
        _world_refresh(mp, sid)

    elif action == "give":                                # 🎁 dar item
        item_id = p.get("item")
        if not item_id or item_id not in items.ITEMS:
            return
        try:
            qty = max(1, min(99, int(p.get("qty", 1) or 1)))
        except (TypeError, ValueError):
            qty = 1
        items.add_to_bag(player.setdefault("inventory", []), item_id, qty)
        _persist_loadout(player)
        emit("loadout", {"bag": player["inventory"], "equipment": player.get("equipment", {})})
        emit("toast", {"text": "🎁 +%dx %s" % (qty, (items.get(item_id) or {}).get("name", item_id))})

    elif action == "spawn":                               # 👹 invocar monstro
        if player.get("in_combat"):
            emit("toast", {"text": "Saia do combate pra invocar."}); return
        type_id = p.get("monster")
        if not type_id or not monsters_def.get(type_id):
            return
        mid = world.spawn_one(type_id, player["x"], player["y"], mp)
        if mid:
            _world_refresh(mp)
            emit("toast", {"text": "👹 Invocado: %s" % world.monsters[mid]["name"]})

    elif action == "money":                               # 💰 carteira infinita
        player["wallet"] = 999999999
        if player.get("player_id"):
            try: db.save_wallet(player["player_id"], player["wallet"])
            except Exception: pass
        emit("wallet", {"bronze": player["wallet"]})
        emit("toast", {"text": "💰 Carteira infinita"})

    elif action == "heal":                                # 💚 vida cheia
        f = player.get("ficha") or {}
        f["hp"] = int(f.get("hp_max", 1))
        if player.get("player_id"):
            try: db.save_ficha(player["player_id"], f)
            except Exception: pass
        enc = COMBAT.get(sid)
        if enc and enc["combs"].get(sid):
            c = enc["combs"][sid]; c["hp"] = c.get("hp_max", c.get("hp", 1))
            _combat_push(enc)
        _emit_self_hp("gm_heal")
        emit("toast", {"text": "💚 Vida cheia"})

    elif action == "setlevel":                            # ⚡ definir nível
        try:
            lvl = max(1, int(p.get("level")))
        except (TypeError, ValueError):
            return
        f = player.get("ficha") or {}
        f["xp"] = leveling.XP_TABLE[lvl]
        leveling.recompute(f)
        f["hp"] = int(f.get("hp_max", 1))
        player["ficha"] = f
        if player.get("player_id"):
            try: db.save_ficha(player["player_id"], f)
            except Exception: pass
        _emit_self_hp("gm_level")
        emit("ficha", {"ficha": f})
        emit("toast", {"text": "⚡ Nível %d" % f.get("level", lvl)})

    elif action == "players":                             # 👁️ lista de jogadores online
        lst = [{"id": q["id"], "name": q.get("name", "?"), "map": q.get("map", "ermo")}
               for q in world.players.values()
               if not q.get("is_npc") and q.get("kind") != "monster"]
        emit("gm_players", {"players": lst})

    elif action == "goto":                                # 👁️ teleporta VOCÊ pro jogador
        if player.get("in_combat"):
            return
        tgt = world.players.get(p.get("id"))
        if tgt and not tgt.get("is_npc") and tgt.get("kind") != "monster":
            _go_to(sid, tgt.get("map", "ermo"), tgt["x"], tgt["y"])

    elif action == "bring":                               # 👁️ traz o jogador até VOCÊ
        tsid = p.get("id")
        tgt = world.players.get(tsid)
        if tgt and tsid != sid and not tgt.get("is_npc") and tgt.get("kind") != "monster":
            if tgt.get("in_combat"):
                emit("toast", {"text": "Esse jogador está em combate."}); return
            _go_to(tsid, mp, player["x"], player["y"])
            socketio.emit("toast", {"text": "✨ Um GM te trouxe."}, to=tsid)

    elif action == "kick":                                # 🦶 expulsa o jogador
        tsid = p.get("id")
        tgt = world.players.get(tsid)
        if tgt and tsid != sid and not tgt.get("is_npc") and tgt.get("kind") != "monster":
            socketio.emit("kicked", {"reason": "gm"}, to=tsid)
            emit("toast", {"text": "🦶 Expulso: %s" % tgt.get("name", "?")})

    elif action == "killall":                             # 🧹 limpa monstros do mapa
        gone = [mid for mid, m in list(world.monsters.items())
                if m.get("map") == mp and not m.get("in_combat")]
        for mid in gone:
            world.monsters.pop(mid, None)
        if gone:
            _world_refresh(mp)
        emit("toast", {"text": "🧹 Limpou %d monstros" % len(gone)})


@socketio.on("chat")
def on_chat(data):
    """Mensagem de chat. Vira balao acima do jogador pra todo mundo perto.
    Mas se contiver palavrao E o jogador estiver perto de um NPC justiceiro
    (o Valdris), ele frita."""
    player = world.players.get(request.sid)
    if not player:
        return
    text = (data or {}).get("text", "")
    if not isinstance(text, str):
        return
    text = text.strip()[:120]
    if not text:
        return
    smiter = world.nearest_smiter(player, HEAR_RADIUS)
    if smiter and npcs.contains_curse(text):
        _smite(player, smiter)
        return

    # --- mundos secretos: a frase certa perto do guia abre o caminho ---
    ph = secret_worlds.match_phrase(text)
    if (ph and player.get("map", "ermo") == ph["from"]
            and ph["map"] in wm.MAPS and _gatekeeper_near(player)):
        _offer_secret_trip(player, ph)
        return
    # --- bencao do Pofnir: dita perto dele, em Valoran ---
    if (secret_worlds.is_blessing(text) and player.get("map") == "valoran"
            and world.near_entity(player, "god:pofnir", 7)):
        _grant_pofnir_blessing(player)
        return

    # --- entregar uma Fagulha de Divindade ao deus que estiver perto ---
    if _is_fagulha_phrase(text):
        nd = _nearest_deity(player, 7)
        if nd:
            _fagulha_exchange(player, nd[0])
            return

    socketio.emit("speech", {"id": player["id"], "text": text},
                  room=player.get("map", "ermo"))


@socketio.on("disconnect")
def on_disconnect():
    _pending_race.pop(request.sid, None)
    _pending_class.pop(request.sid, None)
    _party_remove(request.sid)
    # se caiu no meio de uma luta: tira ele do confronto. Se ainda sobrar gente no
    # grupo, a luta continua (ele vira "caído"); se era o último/solo, libera os monstros.
    enc = COMBAT.pop(request.sid, None)
    if enc:
        if request.sid in enc.get("players", []):
            enc["players"].remove(request.sid)
        pc = enc["combs"].get(request.sid)
        if pc:
            pc["alive"] = False
        others = list(enc.get("players", []))
        if others:
            try:
                if combat.current(enc)["cid"] == request.sid:
                    combat.advance(enc)
                _resume(others[0])
            except Exception:
                pass
        else:
            for c in enc["combs"].values():
                if c["kind"] == "monster":
                    m = enc["_monsters"].get(c["cid"])
                    if m:
                        m["in_combat"] = False
                        if m.get("alive"):
                            _reset_monster(m)
    player = world.remove_player(request.sid)
    if player:
        mp = player.get("map", "ermo")
        # salva a posicao final do ERMO. Se saiu estando no Salao, grava o ponto
        # de onde ele entrou (nunca coordenada do Salao).
        if mp == "ermo":
            px, py = player["x"], player["y"]
        else:
            ret = player.get("_ermo_return")
            px, py = ret if ret else rules.pick_spawn(world, "ermo")
        try:
            db.save_positions([(player["player_id"], px, py, player["facing"])])
        except Exception as exc:
            print("erro salvando saida:", exc)
        emit("player_left", {"id": request.sid}, room=mp, include_self=False)


# --------------------------------------------------------------- salvador

def _saver_loop():
    """Grava periodicamente a posicao de quem se moveu, em lote."""
    while True:
        socketio.sleep(SAVE_EVERY)
        try:
            db.save_positions(world.pop_dirty())
        except Exception as exc:
            print("erro no salvamento periodico:", exc)


def _respawn_loop():
    """Faz os itens pegos reaparecerem no chao e avisa todos os clientes."""
    while True:
        socketio.sleep(2)
        try:
            for (x, y, item_id) in world.due_respawns(time.time()):
                socketio.emit("item_spawned", {"x": x, "y": y, "item": item_id},
                              room="ermo")
        except Exception as exc:
            print("erro no respawn:", exc)


def _npc_wander_loop(spec):
    """Um NPC perambula no ritmo dele; cada passo vai pra todos. Se for medroso
    (nao-fearless) e o Valdris chegar perto, ele FOGE em vez de perambular."""
    nid = spec["id"]
    every = spec.get("step_every", 0.9)
    fearless = spec.get("fearless", False)
    while True:
        socketio.sleep(every)
        try:
            npc = None
            if not fearless:
                val = world.players.get(valdris.NPC_ID)
                if val and world.near_entity(val, nid, FLEE_RADIUS):
                    npc = world.flee_step(nid, valdris.NPC_ID)
            if npc is None:
                npc = world.wander_npc(nid)
            if npc:
                socketio.emit("player_moved", _npc_moved_payload(npc),
                              room=spec.get("map", "ermo"))
        except Exception as exc:
            print("erro no passo de", nid, exc)


def _npc_murmur_loop(spec):
    """De tempos em tempos o NPC murmura uma frase sua, sozinho."""
    nid = spec["id"]
    lo, hi = spec.get("murmur_min", 15), spec.get("murmur_max", 22)
    lines = spec.get("murmurs") or []
    while True:
        socketio.sleep(random.uniform(lo, hi))
        try:
            npc = world.players.get(nid)
            if lines and npc and not npc.get("_inside") and not npc.get("_going_home"):
                socketio.emit("speech", {"id": nid, "text": random.choice(lines)},
                              room=spec.get("map", "ermo"))
        except Exception as exc:
            print("erro no murmurio de", nid, exc)


def _npc_gaze_loop(spec):
    """NPCs com gazes=True viram pra encarar o jogador mais proximo (o Guilherme
    te segue com o olhar, mudo). So emite quando a direcao muda."""
    nid = spec["id"]
    while True:
        socketio.sleep(0.5)
        try:
            npc = world.players.get(nid)
            if not npc:
                continue
            if npc.get("_inside") or npc.get("_going_home"):
                continue   # dormindo ou indo dormir: nao encara
            target = world.nearest_player_to(npc, radius=8)
            if target:
                face = _face_to(npc, target)
                if face != npc["facing"]:
                    npc["facing"] = face
                    socketio.emit("player_moved", _npc_moved_payload(npc),
                                  room=spec.get("map", "ermo"))
        except Exception as exc:
            print("erro no olhar de", nid, exc)


# --------------------------------------------------- a aparicao do Pofnir

def _is_night(now=None):
    """True se o relogio compartilhado do mundo esta na faixa da noite. Usa a
    MESMA conta do cliente (phaseName): noite = comeco e fim do ciclo."""
    now = time.time() if now is None else now
    t = (now % DAY_LENGTH) / DAY_LENGTH
    return t < 0.23 or t >= 0.88


def _far_spawn(players):
    """Um tile passavel a no minimo GATO_LONGE de TODO jogador (pra ele surgir
    a distancia, misterioso). Tenta varias vezes; None se nao achar."""
    h = len(MAP_ROWS)
    w = len(MAP_ROWS[0])
    for _ in range(60):
        x = random.randint(1, w - 2)
        y = random.randint(1, h - 2)
        if not rules.is_walkable(x, y):
            continue
        if all(max(abs(x - p["x"]), abs(y - p["y"])) >= GATO_LONGE for p in players):
            return (x, y)
    return None


def _make_gato(spot):
    """Monta a entidade da aparicao (so mais uma entidade no mundo, is_npc,
    kind 'apparition' -> o cliente desenha o gato branco grande com placa)."""
    return {
        "id": GATO_ID,
        "player_id": None,
        "x": spot[0],
        "y": spot[1],
        "facing": "down",
        "name": GATO_NOME,
        "look": {"giant": True},
        "map": "ermo",
        "inventory": [],
        "equipment": {},
        "is_npc": True,
        "solid": False,            # ninguem chega perto o bastante pra esbarrar
        "kind": "apparition",
        "_home": spot,
        "_radius": GATO_RAIO,
        "_wanders": True,
        "_spec": {},
        "_born": time.time(),
    }


def _pofnir_loop():
    """O Gato Branco e Grande: de noite, raramente, surge longe; perambula; e
    SOME assim que um jogador se aproxima (ou amanhece, ou da o tempo dele)."""
    tick = 0
    proximo_ok = 0.0
    while True:
        socketio.sleep(0.6)
        tick += 1
        try:
            ent = world.players.get(GATO_ID)
            jogadores = [p for p in world.players.values()
                         if not p.get("is_npc") and p.get("map", "ermo") == "ermo"]
            if ent is None:
                # tenta surgir (so de noite, com gente online, no descanso vencido)
                if (tick % 10 == 0 and jogadores and _is_night()
                        and time.time() >= proximo_ok
                        and random.random() < GATO_CHANCE):
                    spot = _far_spawn(jogadores)
                    if spot:
                        world.players[GATO_ID] = _make_gato(spot)
                        socketio.emit("player_joined",
                                      public(world.players[GATO_ID]), room="ermo")
            else:
                perto = any(world.near_entity(p, GATO_ID, GATO_SUMICO)
                            for p in jogadores)
                venceu = (time.time() - ent.get("_born", 0)) > GATO_VIDA
                if perto or venceu or not _is_night() or not jogadores:
                    world.players.pop(GATO_ID, None)
                    socketio.emit("player_left", {"id": GATO_ID}, room="ermo")
                    proximo_ok = time.time() + GATO_ESPERA
                elif tick % 2 == 0:
                    npc = world.wander_npc(GATO_ID)   # reusa _home/_radio/_wanders
                    if npc:
                        socketio.emit("player_moved", _npc_moved_payload(npc),
                                      room="ermo")
        except Exception as exc:
            print("erro no gato branco:", exc)


# --------------------------------------------------- a vida noturna da vila
# Ao anoitecer, ~metade dos moradores comuns caminha ate a porta de casa e some
# la dentro; ao amanhecer, reaparecem na porta. O pessoal do cabare (NE) nao
# dorme (a noite e o expediente), e as meninas ja moram nos interiores.

def _eligible_sleepers():
    out = []
    for sid, p in list(world.players.items()):
        if not p.get("is_npc") or p.get("map", "ermo") != "ermo":
            continue
        spec = p.get("_spec", {})
        if spec.get("kind") != "person" or not spec.get("wanders") or spec.get("smiter"):
            continue
        hx, hy = p.get("_home", (p["x"], p["y"]))
        if hx >= 23 and hy <= 14:
            continue   # zona do cabare
        out.append(sid)
    return out


def _bed_target(p):
    """A porta 'D' do Ermo mais perto de casa (ate dist 8); senao a propria casa."""
    hx, hy = p.get("_home", (p["x"], p["y"]))
    best, bestd = None, 9
    for (dx, dy) in DOOR_INTERIORS:
        d = abs(dx - hx) + abs(dy - hy)
        if d < bestd:
            best, bestd = (dx, dy), d
    return best or (hx, hy)


def _night_loop():
    was_night = _is_night()
    while True:
        socketio.sleep(2)
        try:
            now_night = _is_night()
            if now_night and not was_night:                 # anoiteceu
                elig = _eligible_sleepers()
                random.shuffle(elig)
                for sid in elig[: max(1, len(elig) // 2)]:
                    p = world.players.get(sid)
                    if not p:
                        continue
                    p["_going_home"] = True
                    p["_bed"] = _bed_target(p)
                    p["_home_tries"] = 0
            elif was_night and not now_night:               # amanheceu
                for sid, p in list(world.players.items()):
                    if p.get("_inside"):
                        bx, by = p.get("_bed", p.get("_home", (p["x"], p["y"])))
                        p["x"], p["y"], p["facing"] = bx, by, "down"
                        p["_inside"] = False
                        socketio.emit("player_joined", public(p), room="ermo")
                    p.pop("_going_home", None)               # cancela quem vinha vindo
            if now_night:                                   # caminhada ate a porta
                for sid, p in list(world.players.items()):
                    if not p.get("_going_home"):
                        continue
                    bx, by = p.get("_bed", p.get("_home", (p["x"], p["y"])))
                    if world.step_toward(sid, bx, by):
                        socketio.emit("player_moved", _npc_moved_payload(p), room="ermo")
                    p["_home_tries"] = p.get("_home_tries", 0) + 1
                    if abs(p["x"] - bx) + abs(p["y"] - by) <= 1 or p["_home_tries"] > 45:
                        p["_going_home"] = False
                        p["_inside"] = True
                        socketio.emit("player_left", {"id": sid}, room="ermo")
            was_night = now_night
        except Exception as exc:
            print("erro na vida noturna:", exc)


# ------------------------------------------------------------------- boot

def _startup():
    try:
        db.init_pool()
        db.init_schema()
        print("banco pronto.")
    except Exception as exc:
        print("AVISO: banco nao inicializado:", exc)
    world.spawn_npcs()   # o elenco inteiro entra em cena
    world.spawn_monsters()   # os bichos e capangas surgem em O Descampado
    for dspec in world.spawn_deities():   # os deuses nos seus reinos secretos
        socketio.start_background_task(_npc_wander_loop, dspec)
    socketio.start_background_task(_saver_loop)
    socketio.start_background_task(_respawn_loop)
    for spec in npcs.ROSTER:
        if not spec.get("active", True):
            continue   # dormente: sem loops ate ser ativado
        if spec.get("wanders", True):
            socketio.start_background_task(_npc_wander_loop, spec)
        if spec.get("murmurs"):
            socketio.start_background_task(_npc_murmur_loop, spec)
        if spec.get("gazes"):
            socketio.start_background_task(_npc_gaze_loop, spec)
    socketio.start_background_task(_pofnir_loop)   # a aparicao do Pofnir
    socketio.start_background_task(_rt_combat_loop)  # COMBATE TEMPO REAL (Tibia)
    socketio.start_background_task(_world_event_loop)  # eventos mundiais
    socketio.start_background_task(_npc_routine_loop)  # rotina dia/noite dos moradores
    socketio.start_background_task(_night_loop)     # a vila dorme a noite
    socketio.start_background_task(_monster_respawn_loop)   # monstros voltam apos um tempo
    socketio.start_background_task(_monster_wander_loop)     # e perambulam pelo Descampado


_startup()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # socketio.run usa o servidor do gevent-websocket (WebSocket de verdade).
    socketio.run(app, host="0.0.0.0", port=port)
