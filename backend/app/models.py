"""Model tabel MySQL (SQLAlchemy 2.0).

Dua jenis akun:
- company : akun perusahaan yang mendaftar sendiri. Mengunggah dokumen, memeriksa hasil baca,
            mengajukan dokumen, dan menjalankan kalkulasi untuk perusahaannya sendiri.
- admin   : peninjau (reviewer). Hanya dibuat oleh superuser lewat database/CLI (python -m app.cli),
            lalu ditugaskan ke satu atau beberapa perusahaan melalui tabel admin_companies.

Semua tabel bisnis punya company_id sehingga data antarperusahaan terpisah.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON, Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

NUM = Numeric(20, 6)


def utcnow() -> datetime:
    """Waktu UTC tanpa zona (konsisten di Python & MySQL)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Company(TimestampMixin, Base):
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    legal_id: Mapped[str | None] = mapped_column(String(64))  # NPWP / NIB
    sector: Mapped[str] = mapped_column(String(80), default="Kelapa sawit")
    address: Mapped[str | None] = mapped_column(Text)
    province: Mapped[str | None] = mapped_column(String(100))
    city: Mapped[str | None] = mapped_column(String(100))
    postal_code: Mapped[str | None] = mapped_column(String(10))
    phone: Mapped[str | None] = mapped_column(String(40))
    # parameter perhitungan
    gwp_set: Mapped[str] = mapped_column(String(8), default="AR5")
    allocation_method: Mapped[str] = mapped_column(String(16), default="economic")
    grid_system: Mapped[str] = mapped_column(String(40), default="sumatera")
    pome_treatment: Mapped[str] = mapped_column(String(20), default="open")  # open | biogas

    users: Mapped[list[User]] = relationship(back_populates="company")
    facilities: Mapped[list[Facility]] = relationship(back_populates="company", cascade="all, delete-orphan")
    products: Mapped[list[Product]] = relationship(back_populates="company", cascade="all, delete-orphan")


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    # akun perusahaan → id perusahaannya; akun admin → NULL (perusahaan lewat admin_companies)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(190), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default="company")  # company | admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)

    company: Mapped[Company | None] = relationship(back_populates="users")


class AdminCompany(Base):
    """Penugasan admin (peninjau) ke perusahaan. Diisi oleh superuser."""
    __tablename__ = "admin_companies"
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True, index=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Facility(TimestampMixin, Base):
    __tablename__ = "facilities"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(150))
    type: Mapped[str] = mapped_column(String(20), default="pabrik")  # kebun | pabrik | gudang
    area_ha: Mapped[Decimal | None] = mapped_column(NUM)
    capacity_tph: Mapped[Decimal | None] = mapped_column(NUM)  # ton TBS per jam
    soil_type: Mapped[str | None] = mapped_column(String(20))  # mineral | gambut | campuran
    address: Mapped[str | None] = mapped_column(Text)

    company: Mapped[Company] = relationship(back_populates="facilities")


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("company_id", "code", name="uq_product_code"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(20))  # CPO, PKO, ...
    name: Mapped[str] = mapped_column(String(150))
    cn_code: Mapped[str | None] = mapped_column(String(20))
    price_per_kg: Mapped[Decimal] = mapped_column(NUM, default=Decimal("1"))

    company: Mapped[Company] = relationship(back_populates="products")


class ReportingPeriod(TimestampMixin, Base):
    __tablename__ = "reporting_periods"
    __table_args__ = (UniqueConstraint("company_id", "year", name="uq_period_year"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    year: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | calculated | locked
    version: Mapped[int] = mapped_column(Integer, default=1)
    data_changed_at: Mapped[datetime | None] = mapped_column(DateTime, default=utcnow)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime)
    locked_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


class DocumentType(Base):
    __tablename__ = "document_types"
    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    no: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(100))
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    scope: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(Text)
    field_schema: Mapped[list] = mapped_column(JSON)


class Document(TimestampMixin, Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_doc_company_period", "company_id", "period_id"),
        UniqueConstraint("period_id", "sha256", name="uq_doc_hash"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    period_id: Mapped[int] = mapped_column(ForeignKey("reporting_periods.id", ondelete="CASCADE"))
    facility_id: Mapped[int | None] = mapped_column(ForeignKey("facilities.id", ondelete="SET NULL"))
    type_code: Mapped[str | None] = mapped_column(ForeignKey("document_types.code"))
    original_name: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    mime: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20), default="uploaded")
    # uploaded | processing | needs_review (diperiksa perusahaan) | validated (diajukan ke admin)
    # | approved (disetujui admin) | rejected (dikembalikan admin) | failed
    classify_confidence: Mapped[float | None] = mapped_column(Numeric(4, 2, asdecimal=False))
    extract_method: Mapped[str | None] = mapped_column(String(40))
    doc_number: Mapped[str | None] = mapped_column(String(80))
    supplier: Mapped[str | None] = mapped_column(String(200))
    doc_date: Mapped[str | None] = mapped_column(String(10))  # YYYY-MM-DD
    raw_text: Mapped[str | None] = mapped_column(Text().with_variant(LONGTEXT(), "mysql"))
    layout: Mapped[dict | None] = mapped_column(JSON)          # struktur pratinjau (halaman, baris, sel)
    notes: Mapped[list | None] = mapped_column(JSON)           # catatan ekstraksi (total cocok, rotasi, dll.)
    page_count: Mapped[int | None] = mapped_column(Integer)
    extract_mode: Mapped[str | None] = mapped_column(String(20))  # tabel | item | kunci-nilai | kosong
    error: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    validated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))   # perusahaan mengajukan
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))    # admin menyetujui/menolak
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)
    review_note: Mapped[str | None] = mapped_column(String(255))

    fields: Mapped[list[ExtractedField]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="[ExtractedField.item, ExtractedField.id]")


class ExtractedField(Base):
    __tablename__ = "extracted_fields"
    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    item: Mapped[int] = mapped_column(Integer, default=0)      # baris/item dalam dokumen (tabel)
    key: Mapped[str] = mapped_column(String(40))
    label: Mapped[str] = mapped_column(String(100))
    value_text: Mapped[str | None] = mapped_column(String(255))
    value_num: Mapped[Decimal | None] = mapped_column(NUM)
    unit: Mapped[str | None] = mapped_column(String(20))
    confidence: Mapped[float] = mapped_column(Numeric(4, 2, asdecimal=False), default=1)
    snippet: Mapped[str | None] = mapped_column(Text)
    page: Mapped[int | None] = mapped_column(Integer)
    bbox: Mapped[dict | None] = mapped_column(JSON)            # kotak sumber ternormalisasi
    alternatives: Mapped[list | None] = mapped_column(JSON)    # kandidat nilai lain
    method: Mapped[str | None] = mapped_column(String(60))     # strategi: tabel, kanan, bawah, matriks, ...
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(10), default="auto")  # auto | manual
    edited_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    document: Mapped[Document] = relationship(back_populates="fields")


class EmissionFactor(TimestampMixin, Base):
    __tablename__ = "emission_factors"
    __table_args__ = (UniqueConstraint("company_id", "code", name="uq_factor_code"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(150))
    value: Mapped[Decimal] = mapped_column(Numeric(20, 8))
    unit: Mapped[str] = mapped_column(String(40))
    source: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(10), default="draft")  # draft | approved
    version: Mapped[int] = mapped_column(Integer, default=1)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime)


class Calculation(TimestampMixin, Base):
    __tablename__ = "calculations"
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    period_id: Mapped[int] = mapped_column(ForeignKey("reporting_periods.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    gwp_set: Mapped[str] = mapped_column(String(8))
    allocation_method: Mapped[str] = mapped_column(String(16))
    direct_t: Mapped[Decimal] = mapped_column(NUM)
    indirect_t: Mapped[Decimal] = mapped_column(NUM)
    upstream_t: Mapped[Decimal] = mapped_column(NUM)
    total_t: Mapped[Decimal] = mapped_column(NUM)
    has_draft_factors: Mapped[bool] = mapped_column(Boolean, default=True)
    factors_snapshot: Mapped[dict] = mapped_column(JSON)   # kode → nilai & status saat dihitung
    result: Mapped[dict] = mapped_column(JSON)             # baris rumus + alokasi
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_company_time", "company_id", "created_at"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(40))
    summary: Mapped[str] = mapped_column(String(255))
    before: Mapped[dict | None] = mapped_column(JSON)
    after: Mapped[dict | None] = mapped_column(JSON)
    reason: Mapped[str | None] = mapped_column(String(255))
