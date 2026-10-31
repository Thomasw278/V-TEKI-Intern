"""Katalog jenis dokumen, faktor emisi bawaan, dan pendaftaran perusahaan baru."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.catalog import DEFAULT_FACTORS, DOC_TYPES
from ..i18n import EXACT
from ..models import Company, DocumentType, EmissionFactor, Facility, Product, ReportingPeriod, User
from ..schemas import RegisterIn
from ..security import hash_password
from . import audit


def seed_document_types(db: Session) -> None:
    """Sinkronkan 10 jenis bawaan dari core/catalog.py.

    Metadata (nama, skema field, aturan pengaman) selalu mengikuti kode. `default_status` dan deskripsi hanya
    diisi bila masih kosong (database baru / hasil migrasi), karena setelah itu nilainya milik superadmin.
    """
    existing = {c for (c,) in db.execute(select(DocumentType.code))}
    for dt in DOC_TYPES:
        schema = [{"key": f.key, "label": f.label, "unit": f.unit, "kind": f.kind, "required": f.required, "default": f.default} for f in dt.fields]
        row = db.get(DocumentType, dt.code) if dt.code in existing else None
        if not row:
            row = DocumentType(code=dt.code)
            db.add(row)
        row.name, row.no, row.scope, row.field_schema = dt.name, dt.no, dt.scope, schema
        row.name_en = EXACT.get(dt.name)
        # deskripsi boleh diubah superadmin → hanya diisi dari katalog bila masih kosong
        if not row.description:
            row.description = dt.description
        if row.description_en is None:
            row.description_en = EXACT.get(dt.description)
        row.builtin, row.active = True, True
        row.can_exclude, row.has_default, row.scope12 = dt.can_exclude, dt.has_default, dt.scope12
        if not row.default_status:
            row.default_status = dt.default_status
        row.required = row.default_status == "required"
    db.commit()


def create_company_factors(db: Session, company: Company) -> None:
    have = {c for (c,) in db.execute(select(EmissionFactor.code).where(EmissionFactor.company_id == company.id))}
    for f in DEFAULT_FACTORS:
        if f.code in have:
            continue
        source = f.source
        if f.code == "grid_ef":
            source = f"{f.source} · sistem {company.grid_system}"
        db.add(EmissionFactor(company_id=company.id, code=f.code, name=f.name, value=f.value, unit=f.unit,
                              source=source, status="approved" if f.approved else "draft"))


def register_company(db: Session, data: RegisterIn) -> tuple[User, Company]:
    company = Company(**data.company.model_dump())
    db.add(company)
    db.flush()
    for fac in data.facilities:
        db.add(Facility(company_id=company.id, **fac.model_dump()))
    seen = set()
    for p in data.products:
        if p.code in seen:
            continue
        seen.add(p.code)
        db.add(Product(company_id=company.id, **p.model_dump()))
    user = User(company_id=company.id, name=data.account.name, email=data.account.email.lower(),
                password_hash=hash_password(data.account.password), role="company")
    db.add(user)
    db.add(ReportingPeriod(company_id=company.id, year=data.first_year))
    create_company_factors(db, company)
    db.flush()
    audit.log(db, user, company.id, "company", company.id, "register", f"Perusahaan {company.name} terdaftar")
    return user, company
