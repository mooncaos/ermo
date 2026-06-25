"""
O BANCO — persistência em Postgres.

Tudo que precisa sobreviver a um reinício do servidor mora aqui: contas,
a posição salva de cada viajante, e (já preparado pro futuro) inventário e
equipamento. O resto do jogo não fala SQL: chama estas funções.

A conexão vem da variável DATABASE_URL (o Render injeta quando você cria o
banco). Sob gevent, as chamadas ao banco cooperam com o loop graças ao
psycogreen (aplicado no app.py), então uma consulta não congela os outros
jogadores.
"""

import os
import hashlib
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

_pool = None


def _dsn():
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL nao definida. Crie o Postgres no Render e ligue a "
            "variavel de ambiente DATABASE_URL ao servico."
        )
    # O Render entrega 'postgres://'; o libpq/psycopg preferem 'postgresql://'.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


def init_pool(minconn=1, maxconn=10):
    """Cria o pool de conexoes uma vez. Idempotente."""
    global _pool
    if _pool is None:
        _pool = ThreadedConnectionPool(minconn, maxconn, dsn=_dsn())
    return _pool


@contextmanager
def cursor(dict_rows=False):
    """Empresta uma conexao do pool, entrega um cursor e devolve no fim.

    Faz commit se tudo correu bem, rollback se deu erro. Cada greenlet pega
    a sua propria conexao, entao nao ha disputa pela mesma conexao.
    """
    if _pool is None:
        init_pool()
    conn = _pool.getconn()
    try:
        factory = psycopg2.extras.RealDictCursor if dict_rows else None
        cur = conn.cursor(cursor_factory=factory)
        try:
            yield cur
            conn.commit()
        finally:
            cur.close()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


def init_schema():
    """Cria as tabelas se ainda nao existem. Roda uma vez, no boot.

    As colunas inventory e equipment ja entram aqui (vazias) pra que as
    proximas features nao precisem mexer no schema depois.
    """
    with cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS players (
                id          SERIAL PRIMARY KEY,
                email       TEXT UNIQUE NOT NULL,
                name        TEXT NOT NULL,
                pass_hash   TEXT NOT NULL,
                look        JSONB NOT NULL,
                x           INTEGER NOT NULL,
                y           INTEGER NOT NULL,
                facing      TEXT NOT NULL DEFAULT 'down',
                inventory   JSONB NOT NULL DEFAULT '[]'::jsonb,
                equipment   JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash  TEXT PRIMARY KEY,
                player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """
        )


# ------------------------------------------------------------------ contas

def email_exists(email):
    with cursor() as cur:
        cur.execute("SELECT 1 FROM players WHERE email=%s", (email,))
        return cur.fetchone() is not None


def create_player(email, name, pass_hash, look, x, y, facing="down"):
    """Insere um jogador novo e devolve o id. Levanta se o email ja existe."""
    with cursor() as cur:
        cur.execute(
            """INSERT INTO players (email, name, pass_hash, look, x, y, facing)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               RETURNING id""",
            (email, name, pass_hash, psycopg2.extras.Json(look), x, y, facing),
        )
        return cur.fetchone()[0]


def get_by_email(email):
    """Linha completa (inclui pass_hash) pra validar o login. None se nao existe."""
    with cursor(dict_rows=True) as cur:
        cur.execute("SELECT * FROM players WHERE email=%s", (email,))
        return cur.fetchone()


def get_player(player_id):
    """Estado salvo do jogador pra carregar no mundo (sem o pass_hash)."""
    with cursor(dict_rows=True) as cur:
        cur.execute(
            """SELECT id, email, name, look, x, y, facing, inventory, equipment
               FROM players WHERE id=%s""",
            (player_id,),
        )
        return cur.fetchone()


def save_positions(rows):
    """rows = lista de (player_id, x, y, facing). Salva em lote."""
    if not rows:
        return
    with cursor() as cur:
        cur.executemany(
            """UPDATE players SET x=%s, y=%s, facing=%s, last_seen=now()
               WHERE id=%s""",
            [(x, y, facing, pid) for (pid, x, y, facing) in rows],
        )


def save_inventory(player_id, bag):
    """Grava a mochila do jogador (lista de pilhas) na coluna inventory."""
    with cursor() as cur:
        cur.execute(
            "UPDATE players SET inventory=%s, last_seen=now() WHERE id=%s",
            (psycopg2.extras.Json(bag), player_id),
        )


def save_loadout(player_id, inventory, equipment, look):
    """Grava mochila, equipamento e aparencia juntos (equipar muda os tres)."""
    with cursor() as cur:
        cur.execute(
            """UPDATE players SET inventory=%s, equipment=%s, look=%s, last_seen=now()
               WHERE id=%s""",
            (psycopg2.extras.Json(inventory), psycopg2.extras.Json(equipment),
             psycopg2.extras.Json(look), player_id),
        )


# ----------------------------------------------------------------- sessoes

def _hash_token(token):
    # Guardamos so o hash do token, nunca o token em si.
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(player_id, token):
    with cursor() as cur:
        cur.execute(
            "INSERT INTO sessions (token_hash, player_id) VALUES (%s, %s)",
            (_hash_token(token), player_id),
        )


def player_id_for_token(token):
    if not token:
        return None
    with cursor() as cur:
        cur.execute(
            "SELECT player_id FROM sessions WHERE token_hash=%s",
            (_hash_token(token),),
        )
        row = cur.fetchone()
        return row[0] if row else None


def delete_session(token):
    if not token:
        return
    with cursor() as cur:
        cur.execute("DELETE FROM sessions WHERE token_hash=%s", (_hash_token(token),))
