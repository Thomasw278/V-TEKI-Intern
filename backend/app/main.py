import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (registrasi tabel)
from .config import get_settings
from .database import Base, SessionLocal, engine, ensure_columns, migrate_legacy
from .i18n import LanguageMiddleware
from .routers import admin, auth, company, documents, factors, periods, superadmin
from .services.requirements import migrate_requirements
from .services.setup import seed_document_types

logging.basicConfig(level=logging.INFO)
settings = get_settings()
if settings.tesseract_cmd:
    os.environ.setdefault("TESSERACT_CMD", settings.tesseract_cmd)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Membuat tabel bila belum ada + mengisi katalog 10 jenis dokumen
    Base.metadata.create_all(bind=engine)
    added = ensure_columns()
    if added:
        logging.getLogger(__name__).info("Kolom baru ditambahkan: %s", ", ".join(added))
    migrated = migrate_legacy()
    if migrated:
        logging.getLogger(__name__).info("Migrasi skema peran: %s", "; ".join(migrated))
    with SessionLocal() as db:
        seed_document_types(db)
        for msg in migrate_requirements(db):
            logging.getLogger(__name__).info("Migrasi kebutuhan dokumen: %s", msg)
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="API perhitungan emisi tertanam produk (metodologi gaya CBAM) dari 10 kategori dokumen.",
    lifespan=lifespan,
)
# Terjemahan respons JSON (Accept-Language: en). Ditambahkan sebelum CORS agar CORS menjadi lapisan terluar.
app.add_middleware(LanguageMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

for r in (auth.router, company.router, periods.router, documents.router, factors.router, admin.router, superadmin.router):
    app.include_router(r)


@app.get("/api/health", tags=["sistem"])
def health():
    return {"status": "ok"}
