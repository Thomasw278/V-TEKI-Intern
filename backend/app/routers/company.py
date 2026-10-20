from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_roles
from ..models import Company, Facility, Product, User
from ..schemas import (
    CompanyIn, CompanyOut, FacilityIn, FacilityOut, ProductIn, ProductOut, UserCreate, UserOut, UserUpdate,
)
from ..security import hash_password
from ..services import audit

router = APIRouter(prefix="/api/company", tags=["perusahaan"])
admin_only = require_roles("admin")


@router.get("", response_model=CompanyOut)
def get_company(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.get(Company, user.company_id)


@router.put("", response_model=CompanyOut)
def update_company(data: CompanyIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    c = db.get(Company, user.company_id)
    before = CompanyIn.model_validate(c, from_attributes=True).model_dump(mode="json")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    audit.log(db, user, c.id, "company", c.id, "update", "Profil & parameter perusahaan diperbarui",
              before, data.model_dump(mode="json"))
    db.commit()
    return c


# ---------------------------------------------------------------- fasilitas
@router.get("/facilities", response_model=list[FacilityOut])
def list_facilities(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Facility).where(Facility.company_id == user.company_id).order_by(Facility.id)).all()


@router.post("/facilities", response_model=FacilityOut, status_code=201)
def add_facility(data: FacilityIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    f = Facility(company_id=user.company_id, **data.model_dump())
    db.add(f)
    db.flush()
    audit.log(db, user, user.company_id, "facility", f.id, "create", f"Fasilitas {f.name} ditambahkan")
    db.commit()
    return f


def _facility(fid: int, user: User, db: Session) -> Facility:
    f = db.scalar(select(Facility).where(Facility.id == fid, Facility.company_id == user.company_id))
    if not f:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fasilitas tidak ditemukan")
    return f


@router.put("/facilities/{fid}", response_model=FacilityOut)
def update_facility(fid: int, data: FacilityIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    f = _facility(fid, user, db)
    for k, v in data.model_dump().items():
        setattr(f, k, v)
    audit.log(db, user, user.company_id, "facility", f.id, "update", f"Fasilitas {f.name} diperbarui")
    db.commit()
    return f


@router.delete("/facilities/{fid}", status_code=204)
def delete_facility(fid: int, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    f = _facility(fid, user, db)
    audit.log(db, user, user.company_id, "facility", f.id, "delete", f"Fasilitas {f.name} dihapus")
    db.delete(f)
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- produk
@router.get("/products", response_model=list[ProductOut])
def list_products(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Product).where(Product.company_id == user.company_id).order_by(Product.id)).all()


@router.post("/products", response_model=ProductOut, status_code=201)
def add_product(data: ProductIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    if db.scalar(select(Product.id).where(Product.company_id == user.company_id, Product.code == data.code)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Kode produk {data.code} sudah ada")
    p = Product(company_id=user.company_id, **data.model_dump())
    db.add(p)
    db.flush()
    audit.log(db, user, user.company_id, "product", p.id, "create", f"Produk {p.code} ditambahkan")
    db.commit()
    return p


@router.put("/products/{pid}", response_model=ProductOut)
def update_product(pid: int, data: ProductIn, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    p = db.scalar(select(Product).where(Product.id == pid, Product.company_id == user.company_id))
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produk tidak ditemukan")
    for k, v in data.model_dump().items():
        setattr(p, k, v)
    audit.log(db, user, user.company_id, "product", p.id, "update", f"Produk {p.code} diperbarui")
    db.commit()
    return p


@router.delete("/products/{pid}", status_code=204)
def delete_product(pid: int, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    p = db.scalar(select(Product).where(Product.id == pid, Product.company_id == user.company_id))
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produk tidak ditemukan")
    audit.log(db, user, user.company_id, "product", p.id, "delete", f"Produk {p.code} dihapus")
    db.delete(p)
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- pengguna
@router.get("/users", response_model=list[UserOut])
def list_users(user: User = Depends(admin_only), db: Session = Depends(get_db)):
    return db.scalars(select(User).where(User.company_id == user.company_id).order_by(User.id)).all()


@router.post("/users", response_model=UserOut, status_code=201)
def add_user(data: UserCreate, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Admin membuat akun Operator/Reviewer/Viewer dengan kata sandi awal."""
    if db.scalar(select(User.id).where(User.email == data.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email sudah dipakai")
    u = User(company_id=user.company_id, name=data.name, email=data.email.lower(),
             password_hash=hash_password(data.password), role=data.role)
    db.add(u)
    db.flush()
    audit.log(db, user, user.company_id, "user", u.id, "create", f"Akun {u.email} ({u.role}) dibuat")
    db.commit()
    return u


@router.patch("/users/{uid}", response_model=UserOut)
def update_user(uid: int, data: UserUpdate, user: User = Depends(admin_only), db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.id == uid, User.company_id == user.company_id))
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pengguna tidak ditemukan")
    if u.id == user.id and (data.role not in (None, "admin") or data.is_active is False):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tidak bisa menurunkan peran atau menonaktifkan akun sendiri")
    if data.role is not None:
        u.role = data.role
    if data.is_active is not None:
        u.is_active = data.is_active
    audit.log(db, user, user.company_id, "user", u.id, "update", f"Akun {u.email} diperbarui")
    db.commit()
    return u
