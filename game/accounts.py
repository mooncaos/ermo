"""
CONTAS — registro, login e validacao de sessao.

Fica entre a rede (app.py) e o banco (db.py). Cuida das regras de conta:
formato de email, tamanho minimo de senha, hash da senha (NUNCA em texto
puro) e emissao do token de sessao. Sempre devolve (ok, valor_ou_erro), pra
rede poder responder bonitinho pro cliente.
"""

import re
import secrets

from werkzeug.security import generate_password_hash, check_password_hash

from . import db, races, classes
from .world import sanitize_look
from .world_map import SPAWN_POINTS

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASS = 6
MAX_NAME = 16


def _new_token():
    return secrets.token_urlsafe(32)


def _default_spawn():
    # Conta nova nasce na praca central (primeiro ponto de spawn).
    return SPAWN_POINTS[0]


def register(email, name, password, look, race=None):
    """Cria uma conta. Devolve (True, token) ou (False, mensagem_de_erro)."""
    email = (email or "").strip().lower()
    name = (name or "").strip()[:MAX_NAME]
    password = password or ""

    if not EMAIL_RE.match(email):
        return False, "Email invalido."
    if len(password) < MIN_PASS:
        return False, "A senha precisa de pelo menos %d caracteres." % MIN_PASS
    if not name:
        name = "Viajante"
    if not races.is_valid_race(race):
        return False, "Escolha uma raca valida."
    if db.email_exists(email):
        return False, "Ja existe uma conta com esse email."

    pass_hash = generate_password_hash(password, method="pbkdf2:sha256")
    clean_look = sanitize_look(look)
    ficha = races.build_ficha(race)
    x, y = _default_spawn()
    try:
        player_id = db.create_player(
            email, name, pass_hash, clean_look, x, y, race=race, ficha=ficha
        )
    except Exception:
        return False, "Nao consegui criar a conta. Tente de novo."

    token = _new_token()
    db.create_session(player_id, token)
    return True, token


def set_race(player_id, race):
    """Define a raca de uma conta ja existente (fluxo forcado de escolha).

    Devolve (True, ficha) ou (False, mensagem). Os itens/posicao da conta nao
    sao tocados: so a raca e a ficha derivada dela entram.
    """
    if not races.is_valid_race(race):
        return False, "Escolha uma raca valida."
    ficha = races.build_ficha(race)
    try:
        db.save_race(player_id, race, ficha)
    except Exception:
        return False, "Nao consegui salvar a raca. Tente de novo."
    return True, ficha


def set_class(player_id, class_id, plus2):
    """Define a CLASSE da conta: aplica o bonus (+4/+2/+1) na ficha, calcula a
    vida e grava. Devolve (True, ficha_atualizada) ou (False, mensagem)."""
    row = db.get_player(player_id)
    if not row:
        return False, "Conta nao encontrada."
    ficha = row.get("ficha") or {}
    if not ficha.get("attrs"):
        return False, "Escolha uma raca antes da classe."
    new_ficha, err = classes.apply_class(ficha, class_id, plus2)
    if err:
        return False, err
    try:
        db.save_ficha(player_id, new_ficha)
    except Exception:
        return False, "Nao consegui salvar a classe. Tente de novo."
    return True, new_ficha


def login(email, password):
    """Valida email + senha. Devolve (True, token) ou (False, mensagem)."""
    email = (email or "").strip().lower()
    password = password or ""

    row = db.get_by_email(email)
    if not row or not check_password_hash(row["pass_hash"], password):
        return False, "Email ou senha incorretos."

    token = _new_token()
    db.create_session(row["id"], token)
    return True, token


def validate(token):
    """Devolve o player_id se o token for valido, senao None."""
    return db.player_id_for_token(token)


def logout(token):
    db.delete_session(token)
