from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.engine import CalculationError
from ..database import get_db
from ..deps import Ctx, company_ctx, ctx_roles, get_period
from ..models import AuditLog, ReportingPeriod, User, utcnow
from ..schemas import CalculateIn, PeriodCreate, PeriodOut
from ..services import audit
from ..services.period import activity_table, analyse, dashboard, gates, latest_calculation, run_calculation
from ..services.reports import build_xlsx, build_xml

router = APIRouter(prefix="/api/periods", tags=["periode"])


@router.get("", response_model=list[PeriodOut])
def list_periods(ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    return db.scalars(select(ReportingPeriod).where(ReportingPeriod.company_id == ctx.company_id)
                      .order_by(ReportingPeriod.year.desc())).all()


@router.post("", response_model=PeriodOut, status_code=201)
def create_period(data: PeriodCreate, ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    if db.scalar(select(ReportingPeriod.id).where(ReportingPeriod.company_id == ctx.company_id,
                                                  ReportingPeriod.year == data.year)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Periode {data.year} sudah ada")
    p = ReportingPeriod(company_id=ctx.company_id, year=data.year)
    db.add(p)
    db.flush()
    audit.log(db, ctx.user, ctx.company_id, "period", p.id, "create", f"Membuka periode {data.year}")
    db.commit()
    return p


@router.get("/{period_id}/dashboard")
def get_dashboard(period_id: int, ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    return dashboard(db, get_period(period_id, ctx, db))


@router.get("/{period_id}/requirements")
def get_requirements(period_id: int, ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    _, _, _, reqs = analyse(db, get_period(period_id, ctx, db))
    return reqs


@router.get("/{period_id}/activity")
def get_activity(period_id: int, ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    """Data aktivitas terstruktur dengan jejak ke dokumen sumber."""
    return activity_table(db, get_period(period_id, ctx, db))


@router.get("/{period_id}/issues")
def get_issues(period_id: int, ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    _, _, issues, _ = analyse(db, get_period(period_id, ctx, db))
    return [i.to_dict() for i in issues]


@router.post("/{period_id}/calculate")
def calculate_period(period_id: int, data: CalculateIn, ctx: Ctx = Depends(company_ctx),
                     db: Session = Depends(get_db)):
    period = get_period(period_id, ctx, db, for_write=True)
    try:
        calc = run_calculation(db, period, ctx.user, data.gwp_set, data.allocation_method)
    except CalculationError as e:
        raise HTTPException(422, str(e)) from e
    return _calc_out(calc)


def _calc_out(calc) -> dict:
    return {
        "id": calc.id, "version": calc.version, "gwp_set": calc.gwp_set, "allocation_method": calc.allocation_method,
        "created_at": calc.created_at.isoformat() if calc.created_at else None,
        "has_draft_factors": calc.has_draft_factors, **calc.result,
    }


@router.get("/{period_id}/calculation")
def get_calculation(period_id: int, ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    calc = latest_calculation(db, get_period(period_id, ctx, db))
    if not calc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Belum ada kalkulasi untuk periode ini")
    return _calc_out(calc)


@router.get("/{period_id}/gates")
def get_gates(period_id: int, ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    return gates(db, get_period(period_id, ctx, db), ctx.user)


@router.post("/{period_id}/lock")
def lock_period(period_id: int, ctx: Ctx = Depends(ctx_roles("admin")), db: Session = Depends(get_db)):
    period = get_period(period_id, ctx, db, for_write=True)
    g = gates(db, period, ctx.user)
    failed = [x for x in g if not x["ok"]]
    if failed:
        raise HTTPException(status.HTTP_409_CONFLICT, {"message": "Syarat penguncian belum terpenuhi", "gates": g})
    period.status, period.locked_at, period.locked_by = "locked", utcnow(), ctx.user.id
    audit.log(db, ctx.user, ctx.company_id, "period", period.id, "lock", f"Mengunci periode {period.year} (v{period.version})")
    db.commit()
    return {"status": "locked", "gates": g}


@router.post("/{period_id}/reopen")
def reopen_period(period_id: int, ctx: Ctx = Depends(ctx_roles("admin")), db: Session = Depends(get_db)):
    """Membuka revisi baru (v+1) dari periode yang terkunci."""
    period = get_period(period_id, ctx, db)
    if period.status != "locked":
        raise HTTPException(status.HTTP_409_CONFLICT, "Periode belum terkunci")
    period.status, period.version, period.locked_at, period.locked_by = "open", period.version + 1, None, None
    audit.log(db, ctx.user, ctx.company_id, "period", period.id, "reopen", f"Membuka revisi v{period.version} periode {period.year}")
    db.commit()
    return {"status": period.status, "version": period.version}


@router.get("/{period_id}/audit")
def audit_trail(period_id: int, limit: int = 50, ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    get_period(period_id, ctx, db)
    rows = db.execute(
        select(AuditLog, User.name).join(User, User.id == AuditLog.user_id, isouter=True)
        .where(AuditLog.company_id == ctx.company_id).order_by(AuditLog.id.desc()).limit(min(limit, 200))
    ).all()
    return [{"id": a.id, "user": n or "Sistem", "action": a.action, "entity": a.entity, "summary": a.summary,
             "reason": a.reason, "at": a.created_at.isoformat() if a.created_at else None} for a, n in rows]


@router.get("/{period_id}/export.xlsx")
def export_xlsx(period_id: int, ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    period = get_period(period_id, ctx, db)
    calc = latest_calculation(db, period)
    if not calc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jalankan kalkulasi terlebih dulu")
    data = build_xlsx(db, period, calc)
    name = f"karbonlens_{period.year}_v{calc.version}.xlsx"
    return Response(data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/{period_id}/export.xml")
def export_xml(period_id: int, ctx: Ctx = Depends(company_ctx), db: Session = Depends(get_db)):
    period = get_period(period_id, ctx, db)
    calc = latest_calculation(db, period)
    if not calc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jalankan kalkulasi terlebih dulu")
    name = f"cbam_communication_{period.year}_v{calc.version}.xml"
    return Response(build_xml(db, period, calc), media_type="application/xml",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
