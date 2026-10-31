"""Skema request/response (Pydantic v2)."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Role = Literal["company", "admin", "superadmin"]
ReqStatus = Literal["required", "optional", "not_applicable"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------ perusahaan
class FacilityIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    type: Literal["kebun", "pabrik", "gudang"] = "pabrik"
    area_ha: Decimal | None = Field(default=None, ge=0)
    capacity_tph: Decimal | None = Field(default=None, ge=0)
    soil_type: Literal["mineral", "gambut", "campuran"] | None = None
    address: str | None = None


class FacilityOut(FacilityIn, ORM):
    id: int


class ProductIn(BaseModel):
    code: str = Field(min_length=2, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=2, max_length=150)
    cn_code: str | None = Field(default=None, max_length=20)
    price_per_kg: Decimal = Field(default=Decimal("1"), gt=0)

    @field_validator("code")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.upper()


class ProductOut(ProductIn, ORM):
    id: int


class CompanyIn(BaseModel):
    name: str = Field(min_length=3, max_length=200)
    legal_id: str | None = Field(default=None, max_length=64)
    sector: str = Field(default="Kelapa sawit", max_length=80)
    address: str | None = None
    province: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=10)
    phone: str | None = Field(default=None, max_length=40)
    gwp_set: Literal["AR5", "AR6"] = "AR5"
    allocation_method: Literal["economic", "mass"] = "economic"
    grid_system: Literal["jamali", "sumatera", "kalimantan", "sulawesi", "lainnya"] = "sumatera"
    pome_treatment: Literal["open", "biogas"] = "open"


class CompanyOut(CompanyIn, ORM):
    id: int
    created_at: datetime


class AccountIn(BaseModel):
    """Akun login perusahaan: nama penanggung jawab, email perusahaan, kata sandi."""
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class RegisterIn(BaseModel):
    company: CompanyIn
    facilities: list[FacilityIn] = Field(default_factory=list)
    products: list[ProductIn] = Field(min_length=1)
    account: AccountIn
    first_year: int = Field(ge=2000, le=2100)


# ------------------------------------------------------------------ auth & user
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORM):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    company_id: int | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class CompanyBrief(ORM):
    """Ringkasan perusahaan untuk daftar milik admin."""
    id: int
    name: str
    city: str | None = None
    province: str | None = None
    sector: str | None = None


class PeriodOut(ORM):
    id: int
    year: int
    status: str
    version: int
    locked_at: datetime | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    company: CompanyOut | None = None          # akun perusahaan
    periods: list[PeriodOut] = Field(default_factory=list)
    companies: list[CompanyBrief] = Field(default_factory=list)  # akun admin: perusahaan yang ditinjau


class PeriodCreate(BaseModel):
    year: int = Field(ge=2000, le=2100)


# ------------------------------------------------------------------ dokumen
class FieldOut(ORM):
    id: int
    item: int = 0
    key: str
    label: str
    value_text: str | None
    value_num: Decimal | None
    unit: str | None
    confidence: float
    snippet: str | None
    page: int | None
    bbox: dict | None = None
    alternatives: list[dict] | None = None
    method: str | None = None
    confirmed: bool
    source: str


class DocumentOut(ORM):
    id: int
    period_id: int
    type_code: str | None
    original_name: str
    mime: str | None
    size_bytes: int
    status: str
    classify_confidence: float | None
    extract_method: str | None
    doc_number: str | None
    supplier: str | None
    doc_date: str | None
    error: str | None
    page_count: int | None = None
    extract_mode: str | None = None
    created_at: datetime
    submitted_at: datetime | None = None
    reviewed_at: datetime | None = None
    review_note: str | None = None


class DocumentDetail(DocumentOut):
    fields: list[FieldOut]
    issues: list[dict] = Field(default_factory=list)
    notes: list[str] | None = None
    layout: dict | None = None
    text_preview: str | None = None


class FieldUpdate(BaseModel):
    value: str | None = Field(default=None, max_length=255)
    alt_index: int | None = Field(default=None, ge=0, le=5)   # pakai kandidat alternatif ke-n
    reason: str | None = Field(default=None, max_length=255)


class FieldCreate(BaseModel):
    key: str = Field(max_length=40)
    value: str = Field(max_length=255)
    item: int = Field(default=0, ge=0, le=999)


class DocumentPatch(BaseModel):
    type_code: str | None = None
    facility_id: int | None = None


class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=255)


# ------------------------------------------------------------------ faktor & hitung
class FactorOut(ORM):
    id: int
    code: str
    name: str
    value: Decimal
    unit: str
    source: str
    status: str
    version: int
    approved_at: datetime | None


class FactorUpdate(BaseModel):
    value: Decimal = Field(ge=0)
    source: str = Field(min_length=3, max_length=255)


class CalculateIn(BaseModel):
    gwp_set: Literal["AR5", "AR6"] | None = None
    allocation_method: Literal["economic", "mass"] | None = None


# ------------------------------------------------------------------ kebutuhan dokumen & superadmin
class RequirementSet(BaseModel):
    status: ReqStatus
    reason: str | None = Field(default=None, max_length=500)


class RequirementChange(BaseModel):
    code: str = Field(max_length=20)
    status: ReqStatus
    # status yang dilihat pengguna sebelum mengubah; dipakai mendeteksi perubahan oleh superadmin lain
    expected: ReqStatus | None = None


class RequirementPreviewIn(BaseModel):
    changes: list[RequirementChange] = Field(min_length=1, max_length=50)
    reason: str | None = Field(default=None, max_length=500)


class RequirementBatch(RequirementPreviewIn):
    pass


class ExceptionRequestIn(BaseModel):
    type_code: str = Field(max_length=20)
    requested_status: Literal["optional", "not_applicable"]
    reason: str = Field(min_length=5, max_length=500)


class ExceptionDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=500)


class DocTypeCreate(BaseModel):
    """Jenis dokumen pendukung baru: bukti saja, tanpa ekstraksi otomatis dan tanpa rumus emisi."""
    code: str = Field(min_length=3, max_length=20, pattern=r"^[a-z][a-z0-9_]+$")
    name: str = Field(min_length=3, max_length=100)
    name_en: str | None = Field(default=None, max_length=100)
    description: str = Field(min_length=3, max_length=1000)
    description_en: str | None = Field(default=None, max_length=1000)
    default_status: ReqStatus = "optional"


class DocTypeUpdate(BaseModel):
    """Jenis bawaan: status default & deskripsi. Jenis pendukung: semua field."""
    name: str | None = Field(default=None, min_length=3, max_length=100)
    name_en: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, min_length=3, max_length=1000)
    description_en: str | None = Field(default=None, max_length=1000)
    default_status: ReqStatus | None = None
    active: bool | None = None
    reason: str | None = Field(default=None, max_length=500)


class ProfileIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    items: dict[str, ReqStatus] = Field(default_factory=dict)


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    items: dict[str, ReqStatus] | None = None


class ProfileApply(BaseModel):
    company_ids: list[int] = Field(min_length=1)
    dry_run: bool = True
    reason: str | None = Field(default=None, max_length=500)


class AdminCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class AdminPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
