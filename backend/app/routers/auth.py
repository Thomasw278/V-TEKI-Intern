from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import Company, ReportingPeriod, User, utcnow
from ..schemas import CompanyOut, LoginIn, PeriodOut, RegisterIn, TokenOut, UserOut
from ..security import create_token, verify_password
from ..services import audit
from ..services.setup import register_company

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_payload(db: Session, user: User) -> TokenOut:
    company = db.get(Company, user.company_id)
    periods = db.scalars(select(ReportingPeriod).where(ReportingPeriod.company_id == company.id)
                         .order_by(ReportingPeriod.year.desc())).all()
    return TokenOut(
        access_token=create_token(user.id, company.id, user.role),
        user=UserOut.model_validate(user),
        company=CompanyOut.model_validate(company),
        periods=[PeriodOut.model_validate(p) for p in periods],
    )


@router.post("/register", response_model=TokenOut, status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    """Mendaftarkan perusahaan baru beserta fasilitas, produk, admin, dan periode pertama."""
    if db.scalar(select(User.id).where(User.email == data.admin.email.lower())):
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
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Akun dinonaktifkan oleh admin perusahaan")
    user.last_login_at = utcnow()
    audit.log(db, user, user.company_id, "user", user.id, "login", f"{user.name} masuk")
    db.commit()
    return _token_payload(db, user)


@router.get("/me", response_model=TokenOut)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Profil pengguna + token baru (memperpanjang sesi)."""
    return _token_payload(db, user)
