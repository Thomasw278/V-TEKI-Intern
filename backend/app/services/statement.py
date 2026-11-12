"""Pernyataan Hasil Perhitungan Emisi Tertanam.

Dokumen resmi perusahaan untuk satu periode pelaporan. Isinya diambil dari kalkulasi terakhir:
- periode terkunci  → status FINAL, punya nomor dokumen, kode verifikasi, dan sidik SHA-256
                      (tersimpan di tabel `statements`, bisa dicek publik lewat /api/public/statements/{kode})
- periode terbuka   → status DRAF, tanpa kode verifikasi (angkanya masih bisa berubah)
"""
from __future__ import annotations

import hashlib
import json
import re

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..models import Calculation, Company, EmissionFactor, Facility, Product, ReportingPeriod, Statement, User, utcnow
from . import requirements as req
from .period import calc_is_stale, latest_calculation

CODE_RX = re.compile(r"^[0-9A-F]{4}(-[0-9A-F]{4}){3}$")


def number(period: ReportingPeriod) -> str:
    """KL/PHE/<tahun>/<id perusahaan>-R<revisi>: unik per perusahaan, periode, dan revisi."""
    return f"KL/PHE/{period.year}/{period.company_id:04d}-R{period.version}"


def fingerprint(company: Company, period: ReportingPeriod, calc: Calculation) -> str:
    """SHA-256 dari isi yang dinyatakan. Satu angka berubah → sidik berbeda."""
    res = calc.result or {}
    body = {
        "company": [company.id, company.name, company.legal_id],
        "period": [period.year, period.version],
        "calculation": [calc.id, calc.version, calc.gwp_set, calc.allocation_method],
        "totals": [str(calc.direct_t), str(calc.indirect_t), str(calc.upstream_t), str(calc.total_t),
                   res.get("biogenic_co2_t")],
        "lines": [[ln.get("key"), ln.get("value_t")] for ln in res.get("lines", [])],
        "allocations": [[a.get("code"), a.get("tonnes"), a.get("see_direct"), a.get("see_indirect"), a.get("see_total")]
                        for a in res.get("allocations", [])],
        "excluded": sorted(x.get("code") for x in res.get("excluded", [])),
        "defaults": sorted((res.get("defaults_used") or {}).keys()),
        "factors": calc.factors_snapshot or {},
    }
    raw = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


def code_of(sha: str) -> str:
    s = sha[:16].upper()
    return "-".join(s[i:i + 4] for i in range(0, 16, 4))


def normalise_code(raw: str) -> str | None:
    s = re.sub(r"[^0-9A-Fa-f]", "", raw or "").upper()
    if len(s) != 16:
        return None
    code = "-".join(s[i:i + 4] for i in range(0, 16, 4))
    return code if CODE_RX.match(code) else None


def active(db: Session, period: ReportingPeriod) -> Statement | None:
    return db.scalar(select(Statement).where(Statement.period_id == period.id, Statement.revision == period.version,
                                             Statement.superseded_at.is_(None)))


def issue(db: Session, period: ReportingPeriod, user: User | None) -> Statement | None:
    """Terbitkan pernyataan final untuk periode terkunci (dipanggil saat mengunci; idempoten)."""
    if period.status != "locked":
        return None
    existing = active(db, period)
    if existing:
        return existing
    calc = latest_calculation(db, period)
    if not calc:
        return None
    company = db.get(Company, period.company_id)
    sha = fingerprint(company, period, calc)
    st = Statement(company_id=period.company_id, period_id=period.id, calculation_id=calc.id, year=period.year,
                   revision=period.version, number=number(period), code=code_of(sha), sha256=sha, total_t=calc.total_t,
                   issued_at=period.locked_at or utcnow(), issued_by=period.locked_by or (user.id if user else None))
    db.add(st)
    db.flush()
    return st


def supersede(db: Session, period: ReportingPeriod) -> None:
    """Revisi baru dibuka: pernyataan revisi sebelumnya tidak berlaku lagi (tetap bisa dicek, berstatus digantikan)."""
    db.execute(update(Statement).where(Statement.period_id == period.id, Statement.superseded_at.is_(None))
               .values(superseded_at=utcnow()))


def _name(db: Session, user_id: int | None) -> str | None:
    if not user_id:
        return None
    u = db.get(User, user_id)
    return u.name if u else None


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def build(db: Session, period: ReportingPeriod, user: User) -> dict | None:
    """Seluruh isi pernyataan untuk dirender frontend. None bila belum ada kalkulasi."""
    calc = latest_calculation(db, period)
    if not calc:
        return None
    company = db.get(Company, period.company_id)
    final = period.status == "locked"
    st = issue(db, period, user) if final else None
    if st and st.calculation_id != calc.id:  # seharusnya tidak terjadi: kalkulasi diblokir saat periode terkunci
        st = None
    if final:
        db.commit()
    res = calc.result or {}
    products = {p.code: p for p in db.scalars(select(Product).where(Product.company_id == company.id))}
    names = {f.code: f.name for f in db.scalars(select(EmissionFactor).where(EmissionFactor.company_id == company.id))}
    excluded_codes = {x["code"] for x in res.get("excluded", [])}
    snapshot = calc.factors_snapshot or {}
    used = req.used_factors({k: v.get("status") == "approved" for k, v in snapshot.items()}, excluded_codes)
    stale = calc_is_stale(period, calc)
    defaults = res.get("defaults_used") or {}

    notes = []
    if not final:
        notes.append("Periode belum dikunci admin peninjau; angka masih bisa berubah.")
    if stale:
        notes.append("Data berubah setelah kalkulasi terakhir; jalankan kalkulasi ulang.")
    if calc.has_draft_factors:
        notes.append("Ada faktor emisi yang masih berstatus draf.")

    facilities = db.scalars(select(Facility).where(Facility.company_id == company.id).order_by(Facility.id)).all()
    return {
        "status": "final" if final and st else "draft",
        "notes": notes,
        "number": number(period),
        "code": st.code if st else None,
        "sha256": st.sha256 if st else None,
        "issued_at": _iso(st.issued_at) if st else None,
        "generated_at": _iso(utcnow()),
        "company": {"name": company.name, "legal_id": company.legal_id, "sector": company.sector,
                    "address": company.address, "city": company.city, "province": company.province,
                    "postal_code": company.postal_code},
        "facilities": [{"name": f.name, "type": f.type, "capacity_tph": float(f.capacity_tph) if f.capacity_tph else None,
                        "area_ha": float(f.area_ha) if f.area_ha else None} for f in facilities],
        "period": {"id": period.id, "year": period.year, "revision": period.version, "status": period.status,
                   "locked_at": _iso(period.locked_at), "locked_by": _name(db, period.locked_by)},
        "calculation": {
            "id": calc.id, "version": calc.version, "created_at": _iso(calc.created_at),
            "created_by": _name(db, calc.created_by), "gwp_set": calc.gwp_set,
            "allocation_method": calc.allocation_method, "stale": stale, "has_draft_factors": calc.has_draft_factors,
            "direct_t": float(calc.direct_t), "indirect_t": float(calc.indirect_t), "upstream_t": float(calc.upstream_t),
            "total_t": float(calc.total_t), "biogenic_co2_t": float(res.get("biogenic_co2_t") or 0),
            "lines": [{"key": ln.get("key"), "name": ln.get("name"), "group": ln.get("group"), "scope": ln.get("scope"),
                       "value_t": ln.get("value_t") or 0, "source": ln.get("source")} for ln in res.get("lines", [])],
            "allocations": [{**a, "cn_code": (products[a["code"]].cn_code if a.get("code") in products else None),
                             "product_name": products[a["code"]].name if a.get("code") in products else a.get("name")}
                            for a in res.get("allocations", [])],
            "excluded": res.get("excluded", []),
            "defaults_used": defaults,
        },
        "factors": [{"code": k, "name": names.get(k, k), "value": v.get("value"), "unit": v.get("unit"),
                     "status": v.get("status"), "source": v.get("source")}
                    for k, v in snapshot.items() if k in used],
        "verify_path": f"/verifikasi?kode={st.code}" if st else None,
    }


def verify(db: Session, raw_code: str) -> dict | None:
    """Data minimum untuk pengecekan publik. Tidak membuka data aktivitas atau dokumen perusahaan."""
    code = normalise_code(raw_code)
    if not code:
        return None
    st = db.scalar(select(Statement).where(Statement.code == code))
    if not st:
        return None
    company = db.get(Company, st.company_id)
    calc = db.get(Calculation, st.calculation_id)
    newer = db.scalar(select(Statement).where(Statement.period_id == st.period_id, Statement.revision > st.revision)
                      .order_by(Statement.revision.desc()).limit(1))
    return {
        "code": st.code, "number": st.number, "sha256": st.sha256,
        "status": "superseded" if st.superseded_at else "valid",
        "superseded_at": _iso(st.superseded_at), "replaced_by": newer.number if newer else None,
        "company": company.name if company else None, "legal_id": company.legal_id if company else None,
        "year": st.year, "revision": st.revision, "issued_at": _iso(st.issued_at),
        "total_t": float(st.total_t),
        "products": [{"code": a.get("code"), "name": a.get("name"), "see_total": a.get("see_total")}
                     for a in (calc.result or {}).get("allocations", [])] if calc else [],
    }
