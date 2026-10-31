"""Login, pendaftaran perusahaan, profil & kata sandi.

Hanya perusahaan yang bisa mendaftar sendiri. Akun admin (peninjau) dibuat oleh superadmin, dan akun
superadmin hanya lewat `python -m app.cli create-superadmin`; keduanya tidak bisa didaftarkan dari sini.
"""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import admin_company_ids, current_user
from ..models import Company, ReportingPeriod, User, utcnow
from ..schemas import (
    CompanyBrief, CompanyOut, LoginIn, PasswordChange, PeriodOut, ProfileUpdate, RegisterIn, TokenOut, UserOut,
)
from ..security import create_token, hash_password, verify_password
from ..services import audit
from ..services.setup import register_company

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_payload(db: Session, user: User) -> TokenOut:
    out = TokenOut(access_token=create_token(user.id, user.company_id, user.role), user=UserOut.model_validate(user))
    if user.role == "company" and user.company_id:
        company = db.get(Company, user.company_id)
        periods = db.scalars(select(ReportingPeriod).where(ReportingPeriod.company_id == company.id)
                             .order_by(ReportingPeriod.year.desc())).all()
        out.company = CompanyOut.model_validate(company)
        out.periods = [PeriodOut.model_validate(p) for p in periods]
    elif user.role == "admin":
        ids = admin_company_ids(db, user.id)
        rows = db.scalars(select(Company).where(Company.id.in_(ids)).order_by(Company.name)).all() if ids else []
        out.companies = [CompanyBrief.model_validate(c) for c in rows]
    return out


@router.post("/register", response_model=TokenOut, status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    """Mendaftarkan perusahaan baru beserta fasilitas, produk, akun login, dan periode pertama."""
    if db.scalar(select(User.id).where(User.email == data.account.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email sudah terdaftar. Silakan login.")
    user, _ = register_company(db, data)
    db.commit()
    return _token_payload(db, user)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email atau kata sandi salah")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Akun dinonaktifkan. Hubungi pengelola sistem.")
    user.last_login_at = utcnow()
    if user.company_id:
        audit.log(db, user, user.company_id, "user", user.id, "login", f"{user.name} masuk")
    db.commit()
    return _token_payload(db, user)


@router.get("/me", response_model=TokenOut)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Profil pengguna + token baru (memperpanjang sesi)."""
    return _token_payload(db, user)


@router.put("/profile", response_model=UserOut)
def update_profile(data: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.name = data.name.strip()
    db.commit()
    return user


@router.post("/password", status_code=204)
def change_password(data: PasswordChange, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Kata sandi saat ini salah")
    user.password_hash = hash_password(data.new_password)
    if user.company_id:
        audit.log(db, user, user.company_id, "user", user.id, "password", "Kata sandi akun diganti")
    db.commit()
    return Response(status_code=204)
