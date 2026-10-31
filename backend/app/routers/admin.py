"""Ruang kerja admin peninjau: daftar perusahaan yang ditugaskan dan antrean dokumen yang diajukan.

Admin dibuat dan ditugaskan oleh superadmin (halaman /superadmin atau `python -m app.cli`).
"""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import admin_company_ids, admin_user
from ..models import AdminCompany, AuditLog, Calculation, Company, Document, EmissionFactor, ReportingPeriod, User

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/companies")
def my_companies(user: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Perusahaan yang ditinjau admin ini beserta status terkini setiap perusahaan."""
    ids = admin_company_ids(db, user.id)
    if not ids:
        return []
    companies = db.scalars(select(Company).where(Company.id.in_(ids)).order_by(Company.name)).all()
    assigned = dict(db.execute(select(AdminCompany.company_id, AdminCompany.assigned_at)
                               .where(AdminCompany.admin_id == user.id)).all())
    waiting = dict(db.execute(select(Document.company_id, func.count(Document.id))
                              .where(Document.company_id.in_(ids), Document.status == "validated")
                              .group_by(Document.company_id)).all())
    total_docs = dict(db.execute(select(Document.company_id, func.count(Document.id))
                                 .where(Document.company_id.in_(ids)).group_by(Document.company_id)).all())
    drafts = dict(db.execute(select(EmissionFactor.company_id, func.count(EmissionFactor.id))
                             .where(EmissionFactor.company_id.in_(ids), EmissionFactor.status == "draft")
                             .group_by(EmissionFactor.company_id)).all())
    last_act = dict(db.execute(select(AuditLog.company_id, func.max(AuditLog.created_at))
                               .where(AuditLog.company_id.in_(ids)).group_by(AuditLog.company_id)).all())
    out = []
    for c in companies:
        period = db.scalar(select(ReportingPeriod).where(ReportingPeriod.company_id == c.id)
                           .order_by(ReportingPeriod.year.desc()).limit(1))
        calc = None
        if period:
            calc = db.scalar(select(Calculation).where(Calculation.period_id == period.id)
                             .order_by(Calculation.version.desc()).limit(1))
        out.append({
            "id": c.id, "name": c.name, "city": c.city, "province": c.province, "sector": c.sector,
            "assigned_at": assigned.get(c.id).isoformat() if assigned.get(c.id) else None,
            "period": {"id": period.id, "year": period.year, "status": period.status, "version": period.version}
            if period else None,
            "waiting_review": waiting.get(c.id, 0),
            "documents": total_docs.get(c.id, 0),
            "draft_factors": drafts.get(c.id, 0),
            "total_t": float(calc.total_t) if calc else None,
            "calc_version": calc.version if calc else None,
            "last_activity": last_act.get(c.id).isoformat() if last_act.get(c.id) else None,
        })
    return out


@router.get("/queue")
def review_queue(user: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Dokumen yang sudah diajukan perusahaan dan menunggu persetujuan, dari semua perusahaan yang ditinjau."""
    ids = admin_company_ids(db, user.id)
    if not ids:
        return []
    rows = db.execute(
        select(Document, Company.name, ReportingPeriod.year)
        .join(Company, Company.id == Document.company_id)
        .join(ReportingPeriod, ReportingPeriod.id == Document.period_id)
        .where(Document.company_id.in_(ids), Document.status == "validated")
        .order_by(Document.submitted_at.is_(None), Document.submitted_at, Document.id).limit(200)
    ).all()
    return [{
        "id": d.id, "company_id": d.company_id, "company": name, "period_id": d.period_id, "year": year,
        "original_name": d.original_name, "type_code": d.type_code, "doc_number": d.doc_number,
        "submitted_at": d.submitted_at.isoformat() if d.submitted_at else None,
    } for d, name, year in rows]
