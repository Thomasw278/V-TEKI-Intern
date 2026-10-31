"""Menghubungkan database dengan logika inti: data aktivitas, validasi, kalkulasi, gerbang kunci."""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..core.aggregation import DocInput, ProductSpec, build_activity
from ..core.engine import ActivityData, calculate
from ..core.validation import Issue, ReqSpec, requirements, validate_period
from ..models import (
    AuditLog, Calculation, Company, Document, EmissionFactor, Product, ReportingPeriod, User, utcnow,
)
from . import audit
from . import requirements as req


def doc_inputs(db: Session, period: ReportingPeriod) -> list[DocInput]:
    docs = db.scalars(
        select(Document).where(Document.period_id == period.id, Document.company_id == period.company_id)
        .options(selectinload(Document.fields))
    ).all()
    out = []
    for d in docs:
        n = max((f.item or 0 for f in d.fields), default=-1) + 1
        items: list[dict] = [{} for _ in range(n)]
        conf, confirmed = {}, {}
        for f in d.fields:
            i = f.item or 0
            items[i][f.key] = f.value_num if f.value_num is not None else f.value_text
            conf[(i, f.key)] = float(f.confidence or 0)
            confirmed[(i, f.key)] = bool(f.confirmed)
        out.append(DocInput(d.id, d.type_code, d.status, {}, conf, confirmed, d.doc_number, d.supplier, d.sha256,
                            items=items, name=d.original_name))
    return out


def factor_map(db: Session, company_id: int) -> tuple[dict[str, Decimal], dict[str, bool], list[EmissionFactor]]:
    rows = db.scalars(select(EmissionFactor).where(EmissionFactor.company_id == company_id)
                      .order_by(EmissionFactor.id)).all()
    return {r.code: Decimal(r.value) for r in rows}, {r.code: r.status == "approved" for r in rows}, list(rows)


def product_specs(db: Session, company_id: int) -> list[ProductSpec]:
    rows = db.scalars(select(Product).where(Product.company_id == company_id).order_by(Product.id)).all()
    return [ProductSpec(p.code, p.name, Decimal(p.price_per_kg or 1)) for p in rows]


def activity_table(db: Session, period: ReportingPeriod) -> dict:
    """Data aktivitas terstruktur: angka per kategori beserta dokumen & baris sumbernya."""
    docs, act, _, _ = analyse(db, period)
    groups: dict[tuple[str, str, str], dict] = {}
    for t in act.trace:
        k = (t["category"], t["metric"], t["unit"])
        g = groups.setdefault(k, {"category": t["category"], "metric": t["metric"], "unit": t["unit"], "value": 0.0,
                                  "sources": []})
        g["value"] += t["value"]
        g["sources"].append({"doc_id": t["doc_id"], "doc_name": t["doc_name"], "item": t["item"], "value": t["value"],
                             "note": t["note"]})
    return {"rows": list(groups.values()), "defaults_used": act.defaults_used, "excluded": act.excluded,
            "summary": {"ffb_processed_t": float(act.ffb_processed_t), "electricity_mwh": float(act.electricity_purchased_mwh),
                        "fuel_l": float(sum((f.volume_l for f in act.fuels), Decimal(0))), "n_applied_t": float(act.n_applied_t),
                        "pome_m3": float(act.pome_volume_m3), "peat_ha": float(act.peat_area_ha),
                        "transport_tkm": float(act.transport_tkm),
                        "products": [{"code": p.code, "tonnes": float(p.tonnes)} for p in act.products]}}


def analyse(db: Session, period: ReportingPeriod, specs: list[ReqSpec] | None = None,
            ) -> tuple[list[DocInput], ActivityData, list[Issue], list[dict]]:
    """`specs` = status kebutuhan yang dipakai; kosong → status efektif periode (snapshot bila terkunci)."""
    specs = specs if specs is not None else req.specs_for_period(db, period)
    excluded = req.excluded_map(specs)
    docs = doc_inputs(db, period)
    factors, approved, _ = factor_map(db, period.company_id)
    act = build_activity(docs, product_specs(db, period.company_id), factors, excluded)
    pending = req.pending_exception_codes(db, period.company_id) if period.status != "locked" else []
    issues = validate_period(docs, act, period.year, req.used_factors(approved, excluded), specs, pending)
    reqs = requirements(docs, act.defaults_used, period.year, specs)
    for r in reqs:
        r["exception_pending"] = r["code"] in pending
    return docs, act, issues, reqs


def run_calculation(db: Session, period: ReportingPeriod, user: User, gwp: str | None, alloc: str | None) -> Calculation:
    company = db.get(Company, period.company_id)
    gwp = gwp or company.gwp_set
    alloc = alloc or company.allocation_method
    specs = req.specs_for_period(db, period)
    excluded = req.excluded_map(specs)
    docs = doc_inputs(db, period)
    factors, approved, rows = factor_map(db, period.company_id)
    act = build_activity(docs, product_specs(db, period.company_id), factors, excluded)
    result = calculate(act, factors, gwp, alloc)  # CalculationError ditangani router
    version = (db.scalar(select(func.max(Calculation.version)).where(Calculation.period_id == period.id)) or 0) + 1
    data = result.to_dict()
    data["defaults_used"] = act.defaults_used
    # kategori "Tidak berlaku" beserta alasan & penetapnya (dicantumkan di laporan)
    data["excluded"] = req.excluded_details(specs)
    calc = Calculation(
        company_id=period.company_id, period_id=period.id, version=version, gwp_set=gwp, allocation_method=alloc,
        direct_t=result.direct_t, indirect_t=result.indirect_t, upstream_t=result.upstream_t, total_t=result.total_t,
        has_draft_factors=not all(req.used_factors(approved, excluded).values()),
        factors_snapshot={r.code: {"value": str(r.value), "unit": r.unit, "status": r.status, "version": r.version,
                                   "source": r.source} for r in rows},
        result=data, created_by=user.id,
    )
    db.add(calc)
    if period.status == "open":
        period.status = "calculated"
    audit.log(db, user, period.company_id, "calculation", period.id, "calculate",
              f"Kalkulasi v{version} ({gwp}, alokasi {'ekonomi' if alloc == 'economic' else 'massa'}) total {result.total_t:,.0f} t CO2e".replace(",", "."))
    db.commit()
    db.refresh(calc)
    return calc


def latest_calculation(db: Session, period: ReportingPeriod) -> Calculation | None:
    return db.scalar(select(Calculation).where(Calculation.period_id == period.id)
                     .order_by(Calculation.version.desc()).limit(1))


def gates(db: Session, period: ReportingPeriod, user: User, specs: list[ReqSpec] | None = None) -> list[dict]:
    """Syarat sebelum periode dikunci oleh admin peninjau. `specs` dipakai pratinjau perubahan status."""
    docs, act, issues, reqs = analyse(db, period, specs)
    _, approved, _ = factor_map(db, period.company_id)
    calc = latest_calculation(db, period)
    required_ok = [r for r in reqs if r["required"]]
    complete = [r for r in required_ok if r["state"] in ("complete", "partial")]
    critical = [i for i in issues if i.severity == "critical"]
    drafts = [c for c, ok in req.used_factors(approved, act.excluded).items() if not ok]
    waiting = sum(1 for d in docs if d.status == "validated")
    fresh = bool(calc and period.data_changed_at and calc.created_at and calc.created_at >= period.data_changed_at)
    return [
        {"key": "role", "name": "Dikunci oleh admin peninjau", "ok": user.role == "admin",
         "note": "Hanya admin yang ditugaskan untuk perusahaan ini yang dapat mengunci periode."},
        {"key": "documents", "name": "Dokumen wajib tervalidasi", "ok": len(complete) == len(required_ok),
         "note": f"{len(complete)} dari {len(required_ok)} kategori wajib tervalidasi."},
        {"key": "reviewed", "name": "Semua pengajuan sudah ditinjau", "ok": waiting == 0,
         "note": f"{waiting} dokumen menunggu persetujuan admin." if waiting else "Tidak ada dokumen yang menunggu."},
        {"key": "critical", "name": "Tidak ada isu kritis", "ok": not critical,
         "note": f"{len(critical)} isu kritis terbuka." if critical else "0 isu kritis."},
        {"key": "factors", "name": "Faktor emisi disetujui", "ok": not drafts,
         "note": f"{len(drafts)} faktor masih draf." if drafts else "Semua faktor disetujui."},
        {"key": "fresh", "name": "Kalkulasi terbaru", "ok": fresh,
         "note": "Kalkulasi dijalankan setelah perubahan data terakhir." if fresh else
         "Jalankan kalkulasi ulang setelah perubahan data terakhir."},
    ]


def mark_changed(period: ReportingPeriod) -> None:
    period.data_changed_at = utcnow()
    if period.status == "calculated":
        period.status = "open"


def dashboard(db: Session, period: ReportingPeriod) -> dict:
    docs, act, issues, reqs = analyse(db, period)
    calc = latest_calculation(db, period)
    status_count: dict[str, int] = {}
    for d in docs:
        status_count[d.status] = status_count.get(d.status, 0) + 1
    recent = db.execute(
        select(AuditLog, User.name).join(User, User.id == AuditLog.user_id, isouter=True)
        .where(AuditLog.company_id == period.company_id).order_by(AuditLog.id.desc()).limit(8)
    ).all()
    return {
        "period": {"id": period.id, "year": period.year, "status": period.status},
        "requirements": reqs,
        "complete_categories": sum(1 for r in reqs if r["state"] in ("complete", "partial")),
        "document_status": status_count,
        "documents_total": len(docs),
        "issues": [i.to_dict() for i in issues],
        "calculation": None if not calc else {
            "id": calc.id, "version": calc.version, "created_at": calc.created_at.isoformat() if calc.created_at else None,
            "total_t": float(calc.total_t), "direct_t": float(calc.direct_t), "indirect_t": float(calc.indirect_t),
            "upstream_t": float(calc.upstream_t), "has_draft_factors": calc.has_draft_factors,
            "lines": calc.result.get("lines", []), "allocations": calc.result.get("allocations", []),
            "excluded": calc.result.get("excluded", []),
        },
        "activity": [
            {"user": name or "Sistem", "summary": a.summary, "at": a.created_at.isoformat() if a.created_at else None}
            for a, name in recent
        ],
    }
