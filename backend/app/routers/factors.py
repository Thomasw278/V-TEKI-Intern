from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import Ctx, company_ctx, ctx_roles
from ..models import EmissionFactor, ReportingPeriod, utcnow
from ..schemas import FactorOut, FactorUpdate
from ..services import audit
from ..services.period import mark_changed

router = APIRouter(prefix="/api/factors", tags=["faktor emisi"])


def _factor(fid: int, ctx: Ctx, db: Session) -> EmissionFactor:
    f = db.scalar(select(EmissionFactor).where(EmissionFactor.id == fid, EmissionFactor.company_id == ctx.company_id))
    if not f:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Faktor tidak ditemukan")
    return f


def _touch_open_periods(db: Session, company_id: int) -> None:
    for p in db.scalars(select(ReportingPeriod).where(ReportingPeriod.company_id == company_id,
                                                      ReportingPeriod.status != "locked")):
        mark_changed(p)


@router.get("", response_model=list[FactorOut])
def list_factors(ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    return db.scalars(select(EmissionFactor).where(EmissionFactor.company_id == ctx.company_id)
                      .order_by(EmissionFactor.id)).all()


@router.put("/{fid}", response_model=FactorOut)
def update_factor(fid: int, data: FactorUpdate, ctx: Ctx = Depends(ctx_roles("admin")),
                  db: Session = Depends(get_db)):
    """Admin mengubah nilai → versi baru berstatus draf (perlu disetujui ulang)."""
    f = _factor(fid, ctx, db)
    before = {"value": str(f.value), "source": f.source, "version": f.version}
    f.value, f.source, f.version, f.status, f.approved_by, f.approved_at = (
        data.value, data.source, f.version + 1, "draft", None, None)
    audit.log(db, ctx.user, ctx.company_id, "factor", f.id, "update", f"Faktor {f.name} → {data.value} (v{f.version})",
              before, {"value": str(data.value), "source": data.source})
    _touch_open_periods(db, ctx.company_id)
    db.commit()
    return f


@router.post("/{fid}/approve", response_model=FactorOut)
def approve_factor(fid: int, ctx: Ctx = Depends(ctx_roles("admin")), db: Session = Depends(get_db)):
    f = _factor(fid, ctx, db)
    f.status, f.approved_by, f.approved_at = "approved", ctx.user.id, utcnow()
    audit.log(db, ctx.user, ctx.company_id, "factor", f.id, "approve", f"Menyetujui faktor {f.name} v{f.version}")
    _touch_open_periods(db, ctx.company_id)
    db.commit()
    return f
