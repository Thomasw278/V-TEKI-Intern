"""Dependensi FastAPI: pengguna aktif, peran, dan isolasi data per perusahaan."""
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Document, ReportingPeriod, User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


def current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not cred:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Silakan login terlebih dulu")
    try:
        payload = decode_token(cred.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesi berakhir, silakan login ulang")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token tidak valid")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Akun tidak aktif")
    return user


def require_roles(*roles: str) -> Callable[[User], User]:
    def checker(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Peran Anda tidak diizinkan untuk aksi ini")
        return user
    return checker


def get_period(period_id: int, user: User, db: Session, for_write: bool = False) -> ReportingPeriod:
    p = db.scalar(select(ReportingPeriod).where(
        ReportingPeriod.id == period_id, ReportingPeriod.company_id == user.company_id))
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Periode tidak ditemukan")
    if for_write and p.status == "locked":
        raise HTTPException(status.HTTP_409_CONFLICT, "Periode sudah dikunci. Buat revisi untuk mengubah data.")
    return p


def get_document(doc_id: int, user: User, db: Session) -> Document:
    d = db.scalar(select(Document).where(Document.id == doc_id, Document.company_id == user.company_id))
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dokumen tidak ditemukan")
    return d
