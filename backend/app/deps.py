"""Dependensi FastAPI: pengguna aktif, peran, dan isolasi data per perusahaan.

Setiap permintaan yang menyentuh data perusahaan berjalan dalam sebuah konteks (Ctx):
- akun perusahaan → selalu perusahaannya sendiri;
- akun admin      → perusahaan yang dipilih lewat header `X-Company-Id`, dan hanya bila admin
                    tersebut sudah ditugaskan ke perusahaan itu (tabel admin_companies).
- akun superadmin → tidak punya konteks perusahaan. Superadmin hanya memakai /api/superadmin
                    (katalog, kebutuhan dokumen, admin) dan tidak menyentuh dokumen atau angka emisi.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import AdminCompany, Document, ReportingPeriod, User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)
ROLES = ("company", "admin", "superadmin")


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
    if not user or not user.is_active or user.role not in ROLES:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Akun tidak aktif")
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya admin peninjau yang bisa melakukan aksi ini")
    return user


def superadmin_user(user: User = Depends(current_user)) -> User:
    if user.role != "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya superadmin yang bisa melakukan aksi ini")
    return user


def admin_company_ids(db: Session, admin_id: int) -> list[int]:
    return [c for (c,) in db.execute(select(AdminCompany.company_id).where(AdminCompany.admin_id == admin_id))]


@dataclass
class Ctx:
    """Konteks permintaan: siapa yang bertindak, untuk perusahaan mana."""
    user: User
    company_id: int

    @property
    def role(self) -> str:
        return self.user.role

    @property
    def is_admin(self) -> bool:
        return self.user.role == "admin"


def company_ctx(
    x_company_id: int | None = Header(default=None, alias="X-Company-Id"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Ctx:
    if user.role == "company":
        if not user.company_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Akun ini tidak terhubung ke perusahaan")
        return Ctx(user, user.company_id)
    if user.role == "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Superadmin tidak mengakses data operasional perusahaan. Gunakan halaman superadmin.")
    if not x_company_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pilih perusahaan yang ingin ditinjau terlebih dulu")
    assigned = db.scalar(select(AdminCompany.company_id).where(
        AdminCompany.admin_id == user.id, AdminCompany.company_id == x_company_id))
    if not assigned:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Anda tidak ditugaskan untuk meninjau perusahaan ini")
    return Ctx(user, x_company_id)


def ctx_roles(*roles: str) -> Callable[..., Ctx]:
    """Konteks perusahaan + batasan peran, mis. ctx_roles("company") untuk unggah dokumen."""
    def checker(ctx: Ctx = Depends(company_ctx)) -> Ctx:
        if ctx.role not in roles:
            msg = ("Aksi ini hanya untuk akun perusahaan" if roles == ("company",) else
                   "Aksi ini hanya untuk admin peninjau" if roles == ("admin",) else
                   "Peran Anda tidak diizinkan untuk aksi ini")
            raise HTTPException(status.HTTP_403_FORBIDDEN, msg)
        return ctx
    return checker


def get_period(period_id: int, ctx: Ctx, db: Session, for_write: bool = False) -> ReportingPeriod:
    p = db.scalar(select(ReportingPeriod).where(
        ReportingPeriod.id == period_id, ReportingPeriod.company_id == ctx.company_id))
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Periode tidak ditemukan")
    if for_write and p.status == "locked":
        raise HTTPException(status.HTTP_409_CONFLICT, "Periode sudah dikunci. Buka revisi untuk mengubah data.")
    return p


def get_document(doc_id: int, ctx: Ctx, db: Session) -> Document:
    d = db.scalar(select(Document).where(Document.id == doc_id, Document.company_id == ctx.company_id))
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dokumen tidak ditemukan")
    return d
