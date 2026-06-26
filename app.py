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

from game import db, accounts, items, npcs, rules, valdris
from game.world import World, public
from game.world_map import MAP_ROWS, map_rows

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "troque-isto-em-producao")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="gevent")

world = World()

SAVE_EVERY = 5  # segundos entre gravacoes de posicao no banco

# Ciclo de dia e noite: duracao de UM ciclo completo, em segundos.
# O horario do mundo sai do relogio (time.time()), entao todo mundo ve o
# mesmo entardecer ao mesmo tempo, sem precisar de loop nem estado.
# 480 = 8 minutos. Quer ver mudar rapido pra testar? Baixa esse numero.
DAY_LENGTH = 480

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
            socketio.server.disconnect(old_sid)
        except Exception:
            pass

    player = world.add_player(
        request.sid, player_id,
        row["name"], row["look"], row["x"], row["y"], row.get("facing", "down"),
        row.get("inventory"), row.get("equipment"),
    )

    # se a regra do item unico cortou copias (ex.: Portuz), grava o conserto
    if player.pop("_needs_save", False):
        _persist_loadout(player)

    mp = player.get("map", "ermo")
    join_room(mp)   # passa a receber so os eventos do mapa onde esta

    emit("init", {
        "id": request.sid,
        "map": world.map_payload(mp),
        "players": world.entities_in(mp),
        "inventory": player["inventory"],
        "equipment": player["equipment"],
        "items": items.catalog(),
        "ground": world.ground_snapshot() if mp == "ermo" else [],
        "ficha": row.get("ficha") or {},
        "day_length": DAY_LENGTH,
        "server_now": time.time(),
    })
    emit("player_joined", public(player), room=mp, include_self=False)


def _go_to(sid, target_map, x, y):
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


def _corvo_portal(sid):
    """Mostra a fala do corvo e, um instante depois, abre o portal pro Salao.
    Roda em tarefa de fundo (fora do contexto de requisicao), por isso chama o
    _go_to direto, que ja e independente de contexto."""
    socketio.sleep(0.5)
    try:
        sx, sy = rules.pick_spawn(world, "salao")
        _go_to(sid, "salao", sx, sy)
    except Exception as exc:
        print("erro na entrada do Salao pelo corvo:", exc)


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


@socketio.on("move")
def on_move(data):
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

    # pisou no portal do Salao? volta pro Ermo (no ponto de onde saiu).
    if mp == "salao" and map_rows("salao")[player["y"]][player["x"]] == "O":
        ret = world.ermo_return(request.sid) or rules.pick_spawn(world, "ermo")
        _go_to(request.sid, "ermo", ret[0], ret[1])
        return

    # pisou sobre um item? pega. (so existe item no chao no Ermo)
    picked = world.try_pickup(player)
    if picked:
        try:
            db.save_inventory(player["player_id"], player["inventory"])
        except Exception as exc:
            print("erro salvando inventario:", exc)
        cat = items.get(picked["item"]) or {}
        emit("inventory", {
            "bag": player["inventory"],
            "picked": {"item": picked["item"], "name": cat.get("name", ""), "qty": 1},
        })
        emit("item_taken", {"x": picked["x"], "y": picked["y"]}, room=mp)


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
    Caso especial: falar com o corvo no Ermo abre o portal pro Salao das Classes
    (entrada provisoria; depois o corvo abre dialogo sozinho)."""
    player = world.players.get(request.sid)
    if not player:
        return
    npc = world.nearest_npc(player, TALK_RADIUS)
    if not npc:
        return
    mp = player.get("map", "ermo")
    npc["facing"] = _face_to(npc, player)   # ele te olha
    socketio.emit("player_moved", _npc_moved_payload(npc), room=mp)

    # o corvo (Jeans) e o guia: te leva ao Salao das Classes
    if npc["id"] == "npc:corvo" and mp == "ermo":
        socketio.emit("speech", {"id": npc["id"],
            "text": "Vem comigo, forasteiro. O Salao das Classes te espera. Atravessa o portal."},
            room=mp)
        socketio.start_background_task(_corvo_portal, request.sid)
        return

    greetings = npc.get("_spec", {}).get("greetings") or ["..."]
    socketio.emit("speech", {"id": npc["id"], "text": random.choice(greetings)}, room=mp)


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
    socketio.emit("speech", {"id": player["id"], "text": text},
                  room=player.get("map", "ermo"))


@socketio.on("disconnect")
def on_disconnect():
    _pending_race.pop(request.sid, None)
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
            if lines and nid in world.players:
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


# ------------------------------------------------------------------- boot

def _startup():
    try:
        db.init_pool()
        db.init_schema()
        print("banco pronto.")
    except Exception as exc:
        print("AVISO: banco nao inicializado:", exc)
    world.spawn_npcs()   # o elenco inteiro entra em cena
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


_startup()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # socketio.run usa o servidor do gevent-websocket (WebSocket de verdade).
    socketio.run(app, host="0.0.0.0", port=port)
