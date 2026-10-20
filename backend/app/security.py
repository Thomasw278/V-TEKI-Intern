from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import get_settings

ALGO = "HS256"


def hash_password(password: str) -> str:
    # bcrypt hanya membaca 72 byte pertama
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], hashed.encode())
    except ValueError:
        return False


def create_token(user_id: int, company_id: int, role: str) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "cid": company_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(hours=s.jwt_expire_hours),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGO)


def decode_token(token: str) -> dict:
    return jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGO])
