# ===========================================================================
#  MIGRAÇÃO DO BANCO DO ERMO: Render (que vai expirar) -> Postgres novo (Neon
#  ou qualquer outro). Copia players e sessions PRESERVANDO os IDs, ajusta a
#  sequence, e confere as contagens no final. Pode rodar mais de uma vez sem
#  duplicar nada (ON CONFLICT DO NOTHING).
#
#  USO:
#     pip install psycopg2-binary
#     python migrate_db.py "postgres://...URL_VELHA_RENDER..." "postgres://...URL_NOVA..."
#
#  Dica Neon: se a URL nova não tiver ?sslmode=require no fim, adicione.
# ===========================================================================
import sys

import psycopg2
import psycopg2.extras

SCHEMA = """
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
    race        TEXT,
    ficha       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE players ADD COLUMN IF NOT EXISTS race TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS ficha JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE players ADD COLUMN IF NOT EXISTS wallet BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

PLAYER_COLS = ("id", "email", "name", "pass_hash", "look", "x", "y", "facing",
               "inventory", "equipment", "race", "ficha", "wallet",
               "created_at", "last_seen")


def main():
    if len(sys.argv) != 3:
        print('uso: python migrate_db.py "URL_VELHA" "URL_NOVA"')
        sys.exit(1)
    old_url, new_url = sys.argv[1], sys.argv[2]

    print("conectando no banco VELHO (Render)...")
    old = psycopg2.connect(old_url)
    print("conectando no banco NOVO...")
    new = psycopg2.connect(new_url)
    new.autocommit = False

    with new.cursor() as cur:
        cur.execute(SCHEMA)
    new.commit()
    print("schema criado no banco novo.")

    # ---------------- players (preservando IDs) ----------------
    with old.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as ocur:
        ocur.execute("SELECT * FROM players ORDER BY id;")
        rows = ocur.fetchall()
    print("players no banco velho: %d" % len(rows))

    ins = ("INSERT INTO players (%s) VALUES (%s) ON CONFLICT (id) DO NOTHING;"
           % (", ".join(PLAYER_COLS), ", ".join(["%s"] * len(PLAYER_COLS))))
    copiados = 0
    with new.cursor() as ncur:
        for r in rows:
            vals = []
            for c in PLAYER_COLS:
                v = r.get(c)
                if c in ("look", "inventory", "equipment", "ficha"):
                    v = psycopg2.extras.Json(v if v is not None else {})
                if c == "wallet" and v is None:
                    v = 0
                vals.append(v)
            ncur.execute(ins, vals)
            copiados += ncur.rowcount
        # a sequence precisa apontar pra frente do maior id copiado
        ncur.execute("SELECT setval(pg_get_serial_sequence('players','id'), "
                     "COALESCE((SELECT MAX(id) FROM players), 1));")
    new.commit()
    print("players copiados agora: %d (os já existentes foram pulados)" % copiados)

    # ---------------- sessions (mantém todo mundo logado) ----------------
    with old.cursor() as ocur:
        ocur.execute("SELECT token_hash, player_id, created_at FROM sessions;")
        srows = ocur.fetchall()
    with new.cursor() as ncur:
        for s in srows:
            ncur.execute("INSERT INTO sessions (token_hash, player_id, created_at) "
                         "VALUES (%s, %s, %s) ON CONFLICT (token_hash) DO NOTHING;", s)
    new.commit()
    print("sessions copiadas: %d" % len(srows))

    # ---------------- conferência final ----------------
    with old.cursor() as ocur, new.cursor() as ncur:
        ocur.execute("SELECT COUNT(*) FROM players;")
        ncur.execute("SELECT COUNT(*) FROM players;")
        po, pn = ocur.fetchone()[0], ncur.fetchone()[0]
        ncur.execute("SELECT name FROM players ORDER BY id DESC LIMIT 5;")
        amostra = [x[0] for x in ncur.fetchall()]
    print("\n===== CONFERÊNCIA =====")
    print("players: velho=%d | novo=%d %s" % (po, pn, "✓" if pn >= po else "⚠️ DIFERENTE!"))
    print("últimos nomes no novo:", ", ".join(amostra) if amostra else "(vazio)")
    print("=======================")
    print("se bateu, troque a DATABASE_URL do serviço web no Render pela URL nova.")
    old.close()
    new.close()


if __name__ == "__main__":
    main()
