"""
A REDE — servidor Flask + Socket.IO.

Esta camada é de propósito fininha: recebe eventos do socket, chama o
mundo/regras, e transmite o resultado. Toda a "inteligência" do jogo
mora em game/. Assim, feature nova quase nunca encosta aqui.

Contrato de eventos
-------------------
Cliente -> Servidor:
    join  {name, look}    entra no mundo (look = aparência escolhida)
    move  {dir}           tenta andar ("up"|"down"|"left"|"right")

Servidor -> Cliente:
    init          {id, map, players}            só pra quem acabou de entrar
    player_joined {id,x,y,facing,name,look}     pros outros
    player_moved  {id,x,y,facing}               pra todos
    player_left   {id}                          pra todos
"""

# IMPORTANTE: monkey patch do gevent tem que vir antes de tudo.
from gevent import monkey
monkey.patch_all()

import os

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

from game.world import World, public

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "troque-isto-em-producao")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="gevent")

world = World()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/healthz")
def healthz():
    # Útil pro health check do Render e pra você espiar quanta gente tem online.
    return {"ok": True, "online": len(world.players)}


@socketio.on("join")
def on_join(data):
    name = (data or {}).get("name", "")
    look = (data or {}).get("look")
    player = world.add_player(request.sid, name, look)

    # Manda o estado inicial só pra quem entrou: id, mapa e quem já está dentro.
    emit("init", {
        "id": request.sid,
        "map": world.map_payload(),
        "players": world.snapshot(),
    })

    # Avisa os outros que chegou gente nova.
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
        emit("player_left", {"id": request.sid}, broadcast=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # socketio.run usa o servidor do gevent-websocket (suporta WebSocket de verdade).
    socketio.run(app, host="0.0.0.0", port=port)
