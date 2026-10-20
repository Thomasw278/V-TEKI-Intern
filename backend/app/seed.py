"""Membuat tabel, mengisi katalog, dan (opsional) data demo.

Pemakaian:
    python -m app.seed            # tabel + katalog 10 jenis dokumen
    python -m app.seed --demo     # + perusahaan demo lengkap dengan dokumen contoh
"""
import argparse
import hashlib
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select

from . import models  # noqa: F401
from .config import get_settings
from .database import Base, SessionLocal, engine
from .models import Document, ReportingPeriod, User
from .schemas import AdminIn, CompanyIn, FacilityIn, ProductIn, RegisterIn
from .security import hash_password
from .services.pipeline import process_document
from .services.setup import register_company, seed_document_types
import mimetypes

from .core.demo_data import DEMO_DIR, DEMO_FILES_COUNTED, DEMO_FILES_REVIEW, demo_documents

DEMO_PASSWORD = "Demo12345"
def create_demo(db) -> None:
    if db.scalar(select(User.id).where(User.email == "admin@demo.id")):
        print("Data demo sudah ada (admin@demo.id).")
        return
    year = 2025
    data = RegisterIn(
        company=CompanyIn(name="PT Sawit Lestari Nusantara (Demo)", sector="Kelapa sawit (CPO/PKO)",
                          address="Jl. Lintas Timur Km 12", province="Riau", city="Siak", postal_code="28771"),
        facilities=[FacilityIn(name="Kebun Sei Lestari", type="kebun", area_ha=Decimal("4500"), soil_type="mineral"),
                    FacilityIn(name="PKS Sei Lestari", type="pabrik", capacity_tph=Decimal("45"))],
        products=[ProductIn(code="CPO", name="Crude palm oil", cn_code="1511 10", price_per_kg=Decimal("12000")),
                  ProductIn(code="PKO", name="Palm kernel oil", cn_code="1513 21", price_per_kg=Decimal("19000"))],
        admin=AdminIn(name="Admin Demo", email="admin@demo.id", password=DEMO_PASSWORD),
        first_year=year,
    )
    admin, company = register_company(db, data)
    operator = User(company_id=company.id, name="Operator Demo", email="operator@demo.id",
                    password_hash=hash_password(DEMO_PASSWORD), role="operator")
    reviewer = User(company_id=company.id, name="Reviewer Demo", email="reviewer@demo.id",
                    password_hash=hash_password(DEMO_PASSWORD), role="reviewer")
    db.add_all([operator, reviewer])
    db.commit()

    period = db.scalar(select(ReportingPeriod).where(ReportingPeriod.company_id == company.id))
    folder = Path(get_settings().storage_dir) / str(company.id) / str(period.id)
    folder.mkdir(parents=True, exist_ok=True)
    sources: list[tuple[str, str | None, bytes, bool]] = []
    for name, type_code, text in demo_documents(year):
        sources.append((name, type_code, text.encode("utf-8"), True))
    for name, type_code in DEMO_FILES_COUNTED:
        sources.append((name, type_code, (DEMO_DIR / name).read_bytes(), True))
    for name, type_code in DEMO_FILES_REVIEW:
        sources.append((name, type_code, (DEMO_DIR / name).read_bytes(), False))

    ids, validate_ids = [], []
    for name, type_code, raw, validate in sources:
        path = folder / f"demo_{name}"
        path.write_bytes(raw)
        doc = Document(company_id=company.id, period_id=period.id, type_code=type_code, original_name=name,
                       stored_path=str(path), mime=mimetypes.guess_type(name)[0] or "application/octet-stream",
                       size_bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), status="uploaded",
                       uploaded_by=operator.id)
        db.add(doc)
        db.flush()
        ids.append(doc.id)
        if validate:
            validate_ids.append(doc.id)
    db.commit()
    for i in ids:
        print("  memproses", db.get(Document, i).original_name)
        process_document(i)

    # Operator memvalidasi dokumen inti (agar reviewer bisa mengunci → pemisahan peran);
    # dua dokumen dibiarkan "perlu tinjauan" untuk mencoba alur validasi.
    db.expire_all()
    for doc in db.scalars(select(Document).where(Document.id.in_(validate_ids))):
        for f in doc.fields:
            f.confirmed = True
        if doc.type_code:
            doc.status, doc.validated_by = "validated", operator.id
    db.commit()
    print("Data demo dibuat. Login dengan salah satu akun berikut (kata sandi: %s):" % DEMO_PASSWORD)
    print("  admin@demo.id     → admin")
    print("  operator@demo.id  → operator")
    print("  reviewer@demo.id  → reviewer")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="buat perusahaan & dokumen demo")
    args = parser.parse_args()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_document_types(db)
        print("Tabel & katalog 10 jenis dokumen siap.")
        if args.demo:
            create_demo(db)


if __name__ == "__main__":
    main()
