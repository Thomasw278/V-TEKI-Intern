"""Profil perusahaan, fasilitas, dan produk.

Diubah oleh akun perusahaan sendiri; admin peninjau dapat melihat (hanya baca).
"""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import Ctx, company_ctx, ctx_roles
from ..models import AdminCompany, Company, Facility, Product, User
from ..schemas import CompanyIn, CompanyOut, FacilityIn, FacilityOut, ProductIn, ProductOut
from ..services import audit

router = APIRouter(prefix="/api/company", tags=["perusahaan"])
owner = ctx_roles("company")


@router.get("", response_model=CompanyOut)
def get_company(ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    return db.get(Company, ctx.company_id)


@router.get("/reviewers")
def list_reviewers(ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    """Admin peninjau yang ditugaskan untuk perusahaan ini (diatur oleh superuser)."""
    rows = db.execute(
        select(User.name, User.email, AdminCompany.assigned_at).join(AdminCompany, AdminCompany.admin_id == User.id)
        .where(AdminCompany.company_id == ctx.company_id, User.is_active.is_(True)).order_by(User.name)
    ).all()
    return [{"name": n, "email": e, "assigned_at": a.isoformat() if a else None} for n, e, a in rows]


@router.put("", response_model=CompanyOut)
def update_company(data: CompanyIn, ctx: Ctx = Depends(owner), db: Session = Depends(get_db)):
    c = db.get(Company, ctx.company_id)
    before = CompanyIn.model_validate(c, from_attributes=True).model_dump(mode="json")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    audit.log(db, ctx.user, c.id, "company", c.id, "update", "Profil & parameter perusahaan diperbarui",
              before, data.model_dump(mode="json"))
    db.commit()
    return c


# ---------------------------------------------------------------- fasilitas
@router.get("/facilities", response_model=list[FacilityOut])
def list_facilities(ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    return db.scalars(select(Facility).where(Facility.company_id == ctx.company_id).order_by(Facility.id)).all()


@router.post("/facilities", response_model=FacilityOut, status_code=201)
def add_facility(data: FacilityIn, ctx: Ctx = Depends(owner), db: Session = Depends(get_db)):
    f = Facility(company_id=ctx.company_id, **data.model_dump())
    db.add(f)
    db.flush()
    audit.log(db, ctx.user, ctx.company_id, "facility", f.id, "create", f"Fasilitas {f.name} ditambahkan")
    db.commit()
    return f


def _facility(fid: int, ctx: Ctx, db: Session) -> Facility:
    f = db.scalar(select(Facility).where(Facility.id == fid, Facility.company_id == ctx.company_id))
    if not f:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fasilitas tidak ditemukan")
    return f


@router.put("/facilities/{fid}", response_model=FacilityOut)
def update_facility(fid: int, data: FacilityIn, ctx: Ctx = Depends(owner), db: Session = Depends(get_db)):
    f = _facility(fid, ctx, db)
    for k, v in data.model_dump().items():
        setattr(f, k, v)
    audit.log(db, ctx.user, ctx.company_id, "facility", f.id, "update", f"Fasilitas {f.name} diperbarui")
    db.commit()
    return f


@router.delete("/facilities/{fid}", status_code=204)
def delete_facility(fid: int, ctx: Ctx = Depends(owner), db: Session = Depends(get_db)):
    f = _facility(fid, ctx, db)
    audit.log(db, ctx.user, ctx.company_id, "facility", f.id, "delete", f"Fasilitas {f.name} dihapus")
    db.delete(f)
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- produk
@router.get("/products", response_model=list[ProductOut])
def list_products(ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    return db.scalars(select(Product).where(Product.company_id == ctx.company_id).order_by(Product.id)).all()


@router.post("/products", response_model=ProductOut, status_code=201)
def add_product(data: ProductIn, ctx: Ctx = Depends(owner), db: Session = Depends(get_db)):
    if db.scalar(select(Product.id).where(Product.company_id == ctx.company_id, Product.code == data.code)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Kode produk {data.code} sudah ada")
    p = Product(company_id=ctx.company_id, **data.model_dump())
    db.add(p)
    db.flush()
    audit.log(db, ctx.user, ctx.company_id, "product", p.id, "create", f"Produk {p.code} ditambahkan")
    db.commit()
    return p


def _product(pid: int, ctx: Ctx, db: Session) -> Product:
    p = db.scalar(select(Product).where(Product.id == pid, Product.company_id == ctx.company_id))
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Produk tidak ditemukan")
    return p


@router.put("/products/{pid}", response_model=ProductOut)
def update_product(pid: int, data: ProductIn, ctx: Ctx = Depends(owner), db: Session = Depends(get_db)):
    p = _product(pid, ctx, db)
    if data.code != p.code and db.scalar(select(Product.id).where(Product.company_id == ctx.company_id,
                                                                    Product.code == data.code)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Kode produk {data.code} sudah ada")
    for k, v in data.model_dump().items():
        setattr(p, k, v)
    audit.log(db, ctx.user, ctx.company_id, "product", p.id, "update", f"Produk {p.code} diperbarui")
    db.commit()
    return p


@router.delete("/products/{pid}", status_code=204)
def delete_product(pid: int, ctx: Ctx = Depends(owner), db: Session = Depends(get_db)):
    p = _product(pid, ctx, db)
    if db.scalar(select(Product.id).where(Product.company_id == ctx.company_id).limit(2).offset(1)) is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Minimal harus ada satu produk untuk alokasi emisi")
    audit.log(db, ctx.user, ctx.company_id, "product", p.id, "delete", f"Produk {p.code} dihapus")
    db.delete(p)
    db.commit()
    return Response(status_code=204)
