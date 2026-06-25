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

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit

from game import db, accounts
from game.world import World, public

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "troque-isto-em-producao")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="gevent")

world = World()

SAVE_EVERY = 5  # segundos entre gravacoes de posicao no banco


# ----------------------------------------------------------------- paginas

@app.route("/")
def index():
    return render_template("index.html")


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
    )

    emit("init", {
        "id": request.sid,
        "map": world.map_payload(),
        "players": world.snapshot(),
    })
    emit("player_joined", public(player), broadcast=True, include_self=False)


@socketio.on("move")
def on_move(data):
    direction = (data or {}).get("dir")
    player = world.try_move(request.sid, direction)
    if player:
        emit("player_moved", {
            "id": player["id"],
            "x": player["x"],
            "y": player["y"],
            "facing": player["facing"],
        }, broadcast=True)


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


# ------------------------------------------------------------------- boot

def _startup():
    try:
        db.init_pool()
        db.init_schema()
        print("banco pronto.")
    except Exception as exc:
        print("AVISO: banco nao inicializado:", exc)
    socketio.start_background_task(_saver_loop)


_startup()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # socketio.run usa o servidor do gevent-websocket (WebSocket de verdade).
    socketio.run(app, host="0.0.0.0", port=port)
