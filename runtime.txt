# Ermo — fundação de um JRPG multiplayer

Vilarejo top-down onde vários jogadores andam ao mesmo tempo, em tempo real.
Esta é a **Phase 1**: a fundação enxuta, já pensada pra crescer. Você entra,
escolhe um nome, anda pelo mapa e vê os outros viajantes se mexendo ao vivo.

Stack: Flask + Socket.IO no servidor (estado autoritativo), canvas HTML5 puro
no cliente. Mesma família do FVTracking, só que num host com WebSocket.

---

## Arquitetura (por que cresce fácil)

A regra de ouro do multiplayer: separar **o mundo**, **as regras** e **a rede**.
Se nasce organizado, feature nova entra plugando. Aqui está assim:

```
ermo/
├── app.py                 # A REDE  — Socket.IO: recebe eventos, transmite estado
├── game/
│   ├── world.py           # O MUNDO — quem está dentro e onde (estado)
│   ├── rules.py           # AS REGRAS — colisão, movimento, spawn
│   └── world_map.py       # O MAPA   — a grade de tiles (fonte única da verdade)
├── templates/index.html   # tela de entrada + canvas + HUD
├── static/game.js         # motor do cliente (render, tween, input)
├── requirements.txt
├── render.yaml            # blueprint de deploy no Render
└── Procfile               # fallback p/ outros hosts
```

O que isso te dá:
- **Conteúdo novo** (NPC, item, quest, mapa, magia) mexe só em `game/`. A rede nem sente.
- **O mapa é só dado.** Quer um vilarejo maior ou outro cenário? Edite `world_map.py`.
  O servidor manda o mapa pro cliente no evento `init`, então os dois nunca discordam.
- **O servidor manda na verdade.** O cliente só pede "quero andar pra cima"; quem decide
  se pode é `rules.py`. Isso é o que evita trapaça e dessincronização.

### Contrato de eventos (Socket.IO)

| Direção | Evento | Dados |
|---|---|---|
| cliente → servidor | `join` | `{name}` |
| cliente → servidor | `move` | `{dir}` (`up`/`down`/`left`/`right`) |
| servidor → cliente | `init` | `{id, map, players}` (só p/ quem entrou) |
| servidor → cliente | `player_joined` | `{id,x,y,facing,name,color}` |
| servidor → cliente | `player_moved` | `{id,x,y,facing}` |
| servidor → cliente | `player_left` | `{id}` |

---

## Rodar no seu PC

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Abre `http://localhost:5000` em duas abas (ou no celular pela rede local) e veja
os dois bonecos andando ao vivo. O direcional na tela funciona no toque.

---

## Subir no Render (recomendado)

Importante: **PythonAnywhere não serve aqui** — ele não sustenta WebSocket de
verdade. O tempo real precisa de um host com WebSocket. Render e Railway têm,
com tier grátis.

**Pelo blueprint (mais fácil):**
1. Suba esta pasta num repositório no GitHub (`git init`, commit, push).
2. No Render: **New > Blueprint**, aponte pro repositório. Ele lê o `render.yaml`
   e já configura tudo (build, start, health check).
3. Deploy. Em alguns minutos você tem a URL pública. Mande pra um amigo e joguem juntos.

**Manualmente (se preferir):**
- New > **Web Service**, conecte o repositório.
- Build Command: `pip install -r requirements.txt`
- Start Command: `python app.py`
- Pronto. O Render injeta a porta na variável `PORT`, que o `app.py` já lê.

### Caveats honestos (e quando viram problema)
- **Um worker só.** O estado dos jogadores vive na memória do processo, então rode
  com 1 worker (é o que o `python app.py` faz). Pra escalar pra centenas de pessoas
  em várias máquinas, aí entra uma fila Redis (Flask-SocketIO suporta com 1 linha).
  Isso é problema de gente rica; pras primeiras fases, 1 worker segura tranquilo.
- **Tier grátis dorme.** No plano free do Render o serviço hiberna sem uso e demora
  uns segundos pra acordar no primeiro acesso. Normal.
- **Quer Gunicorn?** Dá, mas precisa do worker certo pra WebSocket:
  `gunicorn -k geventwebsocket.gunicorn.workers.GeventWebSocketWorker -w 1 app:app`.
  Pro tamanho de agora, `python app.py` é mais simples e já é production-ready.

---

## Roadmap (pequenamente grande)

1. **[feito] Phase 1** — mapa compartilhado, seu boneco andando, os outros ao vivo, nome em cima.
2. **Phase 2** — predição no cliente (passo instantâneo), comer/colidir, placar, animação de caminhada.
3. **Phase 3** — pele (terror? arena mística?), NPC com diálogo, combate por turno, power-ups.
4. **Phase 4** — salas/matchmaking, contas, persistência em SQLite (de novo seu quintal).

A camada chata (tempo real) você sobe **uma vez**, aqui na Phase 1. Daí pra frente,
crescer volta a parecer FVTracking: adicionar dado e um handler pequeno.

---

Feito com o Claudinho. Renomeie "Ermo" pro nome que você quiser — é só procurar e trocar.
