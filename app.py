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

from flask import Flask, render_template, request, jsonify, make_response
from flask_socketio import SocketIO, emit, join_room, leave_room

from game import (db, accounts, items, npcs, rules, valdris, classes, races,
                  leveling, feats, class_features, monsters as monsters_def, combat,
                  spells as spells_def, abilities as abilities_def)
from game import secret_worlds, world_map as wm
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
        "day_length": DAY_LENGTH,
        "server_now": time.time(),
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
    """O chefe chama reforço: cria 'count' lacaios do tipo dele (bonde/manada)."""
    stype = boss.get("summon_type") or "capanga"
    spec = dict(monsters_def.get(stype) or {})
    spec["_type"] = stype
    mp = enc["map"]
    occ = {(c["x"], c["y"]) for c in enc["combs"].values() if c.get("alive", True)}
    placed = 0
    for r in range(1, 4):
        if placed >= count:
            break
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if placed >= count:
                    break
                x, y = boss["x"] + dx, boss["y"] + dy
                if (x, y) in occ or not rules.is_walkable(x, y, mp):
                    continue
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


def _start_combat(sid, monster_list):
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
    pc = combat.make_player_combatant(sid, player, ficha)
    mcs = [combat.make_monster_combatant(m) for m in monster_list]
    enc = combat.start(pc, mcs, player.get("map", "descampado"))
    enc["_monsters"] = {m["id"]: m for m in monster_list}
    COMBAT[sid] = enc
    player["in_combat"] = True
    for m in monster_list:
        m["in_combat"] = True
    socketio.emit("combat_start", {"snapshot": combat.snapshot(enc, sid)}, to=sid)
    boss = next((c for c in enc["combs"].values() if c.get("boss")), None)
    if boss:
        line = monsters_def.bark("intro", boss.get("mtype"))
        if line:
            socketio.emit("speech", {"id": boss["cid"], "text": line}, to=sid)
    _resume(sid)


def _resume(sid):
    """Roda os turnos dos monstros ate cair no turno do jogador (ou a luta acabar)."""
    enc = COMBAT.get(sid)
    if not enc:
        return
    actions = []
    while combat.current(enc)["kind"] == "monster" and combat.outcome(enc) is None:
        cur = combat.current(enc)
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
        _sync_monsters_to_world(enc)
        actions.append({"cid": cur["cid"], "name": cur["name"], "steps": steps, "attack": atk})
        if say:
            socketio.emit("speech", {"id": cur["cid"], "text": say}, to=sid)
        if atk and atk.get("killed"):
            break
        combat.advance(enc)
    oc = combat.outcome(enc)
    socketio.emit("combat_state", {
        "enemy_actions": actions, "snapshot": combat.snapshot(enc, sid),
        "your_turn": (oc is None and combat.current(enc)["kind"] == "player"),
        "outcome": oc,
    }, to=sid)
    if oc:
        _end_combat(sid, oc)


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
    xp = int(f.get("xp", 0))
    lvl = int(f.get("level", 1))
    thr = leveling.XP_TABLE[min(max(lvl, 1), leveling.MAX_LEVEL)]
    within = max(0, xp - thr)
    loss = within // 2
    f["xp"] = xp - loss
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
        "pending_asi": f.get("pending_asi", []),
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


def _end_combat(sid, oc):
    enc = COMBAT.pop(sid, None)
    player = world.players.get(sid)
    if player:
        player["in_combat"] = False
    if not enc:
        return
    mp = enc["map"]
    for c in enc["combs"].values():        # libera todos os monstros do confronto
        if c["kind"] == "monster":
            m = enc["_monsters"].get(c["cid"])
            if m:
                m["in_combat"] = False
    # devolve os recursos gastos na luta pra ficha (a recarga e por andar, nao cura aqui)
    pcomb = enc["combs"].get(sid)
    if player and pcomb is not None and pcomb.get("res") is not None:
        f0 = player.get("ficha") or {}
        f0["res"] = pcomb["res"]
        player["ficha"] = f0
    if oc == "victory":
        xp = sum(c.get("xp", 0) for c in enc["combs"].values()
                 if c["kind"] == "monster" and not c.get("alive"))
        for c in enc["combs"].values():
            if c["kind"] == "monster" and not c.get("alive"):
                m = enc["_monsters"].get(c["cid"])
                if m:
                    m["alive"] = False
                    _MONSTER_RESPAWNS.append((m["id"], time.time() + 90))
        if player:
            f = player.get("ficha") or {}
            f["hp"] = f.get("hp_max", f.get("hp", 1))   # cura apos a vitoria
            player["ficha"] = f
            drops, bronze = _collect_drops(player, enc)   # espolio dos caidos
            try:
                db.save_ficha(player["player_id"], f)
                if drops or bronze:
                    db.save_inventory(player["player_id"], player["inventory"])
                    db.save_wallet(player["player_id"], player.get("wallet", 0))
            except Exception:
                pass
            if drops or bronze:
                socketio.emit("inventory", {"bag": player["inventory"]}, to=sid)
                socketio.emit("wallet", {"bronze": player.get("wallet", 0)}, to=sid)
            socketio.emit("combat_over", {"outcome": "victory", "xp": xp,
                                          "drops": drops, "bronze": bronze,
                                          "hp": f.get("hp"), "hp_max": f.get("hp_max")}, to=sid)
            if xp > 0:
                _award_xp(player, xp, "vitória")
        _world_refresh(mp, sid)
    elif oc == "defeat":
        for c in enc["combs"].values():     # sobreviventes voltam curados
            if c["kind"] == "monster" and c.get("alive"):
                m = enc["_monsters"].get(c["cid"])
                if m:
                    _reset_monster(m)
        socketio.emit("combat_over", {"outcome": "defeat"}, to=sid)
        _player_death(sid)
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


def _monster_wander_loop():
    """Faz os monstros vagarem por O Descampado quando nao estao em combate. Quem
    perambula pra perto de um jogador parado tambem inicia a luta."""
    while True:
        socketio.sleep(1.2)
        moved = world.wander_monsters("descampado")
        if moved:
            socketio.emit("monsters_moved", {"map": "descampado", "moves": moved},
                          room="descampado")
        for sid, pl in list(world.players.items()):
            if pl.get("map") != "descampado" or pl.get("in_combat"):
                continue
            near = [m for m in world.monsters_near("descampado", pl["x"], pl["y"], COMBAT_AGGRO)
                    if not m.get("in_combat")]
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
            if not mm.get("in_combat")]
    if m not in near:
        near.append(m)
    _start_combat(sid, near)


@socketio.on("combat_move")
def on_combat_move(data):
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc or combat.current(enc)["kind"] != "player":
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
    emit("combat_state", {"snapshot": combat.snapshot(enc, sid), "your_turn": True})


@socketio.on("combat_attack")
def on_combat_attack(data):
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc or combat.current(enc)["kind"] != "player":
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
    oc = combat.outcome(enc)
    emit("combat_state", {"player_action": res, "snapshot": combat.snapshot(enc, sid),
                          "your_turn": oc is None, "outcome": oc})
    if oc == "victory":
        _end_combat(sid, "victory")


@socketio.on("combat_cast")
def on_combat_cast(data):
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc or combat.current(enc)["kind"] != "player":
        return
    if enc["action_used"]:
        emit("combat_msg", {"text": "Você já agiu neste turno."})
        return
    me = combat.current(enc)
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
    oc = combat.outcome(enc)
    emit("combat_state", {"spell_result": res, "snapshot": combat.snapshot(enc, sid),
                          "your_turn": oc is None, "outcome": oc})
    if oc == "victory":
        _end_combat(sid, "victory")


@socketio.on("combat_ability")
def on_combat_ability(data):
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc or combat.current(enc)["kind"] != "player":
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
        if not combat.in_reach(me, target):
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
    oc = combat.outcome(enc)
    emit("combat_state", {"ability_result": res, "snapshot": combat.snapshot(enc, sid),
                          "your_turn": oc is None, "outcome": oc})
    if oc == "victory":
        _end_combat(sid, "victory")


@socketio.on("combat_end_turn")
def on_combat_end_turn(data):
    sid = request.sid
    enc = COMBAT.get(sid)
    if not enc or combat.current(enc)["kind"] != "player":
        return
    combat.advance(enc)
    _resume(sid)


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
    emit("player_moved", {
        "id": player["id"],
        "x": player["x"],
        "y": player["y"],
        "facing": player["facing"],
    }, room=mp)

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

    # pisou numa passagem de borda (Fadrakor)? cai no mapa vizinho, virado pra dentro.
    if map_rows(mp)[player["y"]][player["x"]] == "+":
        edge = ("north" if player["y"] <= 2 else
                "south" if player["y"] >= len(map_rows(mp)) - 3 else None)
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
                sx, sy = INTERIOR_SPAWN[0]
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
    if mp == "descampado" and not player.get("in_combat"):
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
    npc = world.nearest_npc(player, TALK_RADIUS)
    if not npc:
        return
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

    greetings = npc.get("_spec", {}).get("greetings") or ["..."]
    socketio.emit("speech", {"id": npc["id"], "text": random.choice(greetings)}, room=mp)


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

    socketio.emit("speech", {"id": player["id"], "text": text},
                  room=player.get("map", "ermo"))


@socketio.on("disconnect")
def on_disconnect():
    _pending_race.pop(request.sid, None)
    _pending_class.pop(request.sid, None)
    # se caiu no meio de uma luta, libera os monstros do confronto.
    enc = COMBAT.pop(request.sid, None)
    if enc:
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
    socketio.start_background_task(_night_loop)     # a vila dorme a noite
    socketio.start_background_task(_monster_respawn_loop)   # monstros voltam apos um tempo
    socketio.start_background_task(_monster_wander_loop)     # e perambulam pelo Descampado


_startup()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # socketio.run usa o servidor do gevent-websocket (WebSocket de verdade).
    socketio.run(app, host="0.0.0.0", port=port)
