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
from flask_socketio import SocketIO, emit

from game import db, accounts, items, npcs, rules
from game.world import World, public

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

@socketio.on("connect")
def on_connect(auth):
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
        emit("player_left", {"id": old_sid}, broadcast=True, include_self=False)
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

    emit("init", {
        "id": request.sid,
        "map": world.map_payload(),
        "players": world.snapshot(),
        "inventory": player["inventory"],
        "equipment": player["equipment"],
        "items": items.catalog(),
        "ground": world.ground_snapshot(),
        "day_length": DAY_LENGTH,
        "server_now": time.time(),
    })
    emit("player_joined", public(player), broadcast=True, include_self=False)


@socketio.on("move")
def on_move(data):
    direction = (data or {}).get("dir")
    player = world.try_move(request.sid, direction)
    if not player:
        return

    emit("player_moved", {
        "id": player["id"],
        "x": player["x"],
        "y": player["y"],
        "facing": player["facing"],
    }, broadcast=True)

    # pisou sobre um item? pega.
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
        emit("item_taken", {"x": picked["x"], "y": picked["y"]}, broadcast=True)


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
        emit("player_look", {"id": player["id"], "look": player["look"]}, broadcast=True)


@socketio.on("unequip")
def on_unequip(data):
    player = world.players.get(request.sid)
    if not player:
        return
    slot = (data or {}).get("slot")
    if world.unequip(player, slot):
        _persist_loadout(player)
        emit("loadout", {"bag": player["inventory"], "equipment": player["equipment"]})
        emit("player_look", {"id": player["id"], "look": player["look"]}, broadcast=True)


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
    npc["facing"] = _face_to(npc, player)
    socketio.emit("player_moved", _npc_moved_payload(npc))
    lines = npc.get("_spec", {}).get("smite_lines") or ["..."]
    socketio.emit("speech", {"id": npc["id"], "text": random.choice(lines)})
    color = npc.get("_spec", {}).get("smite_color", "#9b6dff")
    socketio.emit("smite", {"target": player["id"], "by": npc["id"], "color": color})
    sx, sy = rules.pick_spawn(world)
    player["x"], player["y"], player["facing"] = sx, sy, "down"
    player["_dirty"] = True  # a nova posicao sera salva no proximo flush
    socketio.emit("player_moved", {"id": player["id"], "x": sx, "y": sy, "facing": "down"})


@socketio.on("interact")
def on_interact(_data=None):
    """Jogador apertou pra falar: responde o NPC em que ele estiver colado."""
    player = world.players.get(request.sid)
    if not player:
        return
    npc = world.nearest_npc(player, TALK_RADIUS)
    if not npc:
        return
    npc["facing"] = _face_to(npc, player)   # ele te olha
    socketio.emit("player_moved", _npc_moved_payload(npc))
    greetings = npc.get("_spec", {}).get("greetings") or ["..."]
    socketio.emit("speech", {"id": npc["id"], "text": random.choice(greetings)})


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
    socketio.emit("speech", {"id": player["id"], "text": text})


@socketio.on("disconnect")
def on_disconnect():
    player = world.remove_player(request.sid)
    if player:
        # salva a posicao final na hora de sair
        try:
            db.save_positions([(player["player_id"], player["x"],
                                player["y"], player["facing"])])
        except Exception as exc:
            print("erro salvando saida:", exc)
        emit("player_left", {"id": request.sid}, broadcast=True)


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
                socketio.emit("item_spawned", {"x": x, "y": y, "item": item_id})
        except Exception as exc:
            print("erro no respawn:", exc)


def _npc_wander_loop(spec):
    """Um NPC perambula no ritmo dele; cada passo vai pra todos."""
    nid = spec["id"]
    every = spec.get("step_every", 0.9)
    while True:
        socketio.sleep(every)
        try:
            npc = world.wander_npc(nid)
            if npc:
                socketio.emit("player_moved", _npc_moved_payload(npc))
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
                socketio.emit("speech", {"id": nid, "text": random.choice(lines)})
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
                    socketio.emit("player_moved", _npc_moved_payload(npc))
        except Exception as exc:
            print("erro no olhar de", nid, exc)


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
        if spec.get("wanders", True):
            socketio.start_background_task(_npc_wander_loop, spec)
        if spec.get("murmurs"):
            socketio.start_background_task(_npc_murmur_loop, spec)
        if spec.get("gazes"):
            socketio.start_background_task(_npc_gaze_loop, spec)


_startup()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # socketio.run usa o servidor do gevent-websocket (WebSocket de verdade).
    socketio.run(app, host="0.0.0.0", port=port)
