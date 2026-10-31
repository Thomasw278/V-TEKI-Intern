"""Ruang kerja superadmin: katalog dokumen, status kebutuhan per perusahaan, profil kebutuhan,
permintaan pengecualian, akun admin peninjau & penugasannya, serta log audit.

Superadmin hanya dibuat lewat `python -m app.cli create-superadmin`. Superadmin tidak mengunggah atau
menyetujui dokumen dan tidak mengubah angka emisi; itu tetap tugas perusahaan dan admin peninjau.
"""
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import superadmin_user
from ..models import (
    AdminCompany, AuditLog, Company, CompanyDocRequirement, DocumentType, ExceptionRequest, ReportingPeriod,
    RequirementProfile, RequirementProfileItem, User, utcnow,
)
from ..schemas import (
    AdminCreate, AdminPatch, DocTypeCreate, DocTypeUpdate, ExceptionDecision, ProfileApply, ProfileIn, ProfilePatch,
    RequirementBatch, RequirementPreviewIn, RequirementSet,
)
from ..security import hash_password
from ..services import audit
from ..services import requirements as req

router = APIRouter(prefix="/api/superadmin", tags=["superadmin"])


def _fail(e: ValueError) -> HTTPException:
    if isinstance(e, req.RequirementConflict):
        conflicts = getattr(e, "conflicts", None)
        return HTTPException(status.HTTP_409_CONFLICT, {"message": str(e), "conflicts": conflicts} if conflicts else str(e))
    return HTTPException(422, str(e))


def _type(db: Session, code: str) -> DocumentType:
    dt = db.get(DocumentType, code)
    if not dt:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jenis dokumen tidak ditemukan")
    return dt


def _company(db: Session, company_id: int) -> Company:
    c = db.get(Company, company_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Perusahaan tidak ditemukan")
    return c


def _touch_all(db: Session, company_ids=None) -> None:
    ids = company_ids if company_ids is not None else [c for (c,) in db.execute(select(Company.id))]
    for cid in ids:
        req.touch_open_periods(db, cid)


# ------------------------------------------------------------------ katalog dokumen
@router.get("/doc-types")
def list_doc_types(_: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    used = dict(db.execute(select(CompanyDocRequirement.type_code, func.count())
                           .group_by(CompanyDocRequirement.type_code)).all())
    return [{**req.type_out(dt), "overrides": used.get(dt.code, 0)} for dt in req.doc_types(db, include_inactive=True)]


@router.post("/doc-types", status_code=201)
def create_doc_type(data: DocTypeCreate, user: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    """Jenis dokumen pendukung: bukti saja (tanpa ekstraksi otomatis & tanpa rumus emisi)."""
    if db.get(DocumentType, data.code):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Kode jenis dokumen {data.code} sudah dipakai")
    no = (db.scalar(select(func.max(DocumentType.no))) or 0) + 1
    dt = DocumentType(
        code=data.code, no=no, name=data.name.strip(), name_en=(data.name_en or "").strip() or None,
        description=data.description.strip(), description_en=(data.description_en or "").strip() or None,
        scope="Dokumen pendukung", field_schema=[], default_status=data.default_status,
        required=data.default_status == "required", builtin=False, can_exclude=True, has_default=False,
        scope12=False, active=True,
    )
    db.add(dt)
    db.flush()
    audit.log(db, user, None, "doc_type", dt.code, "create",
              f"Menambah jenis dokumen pendukung {dt.name} ({req.STATUS_LABEL[dt.default_status]})",
              None, req.type_out(dt))
    _touch_all(db)
    db.commit()
    return req.type_out(dt)


@router.patch("/doc-types/{code}")
def update_doc_type(code: str, data: DocTypeUpdate, user: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    dt = _type(db, code)
    changes = data.model_dump(exclude_unset=True, exclude={"reason"})
    if dt.builtin and set(changes) - {"default_status", "description", "description_en"}:
        raise HTTPException(422, "Jenis dokumen bawaan hanya bisa diubah status default dan deskripsinya")
    before = req.type_out(dt)
    old_default = dt.default_status or "required"
    new_default = changes.get("default_status") or old_default
    if new_default != old_default:
        try:
            req.check_change(dt, new_default, old_default, data.reason)
        except req.RequirementError as e:
            raise _fail(e) from e
    for k in ("name", "description"):
        if changes.get(k):
            setattr(dt, k, changes[k].strip())
    for k in ("name_en", "description_en"):
        if k in changes:
            setattr(dt, k, (changes[k] or "").strip() or None)
    if "active" in changes and changes["active"] is not None:
        dt.active = changes["active"]
    dt.default_status, dt.required = new_default, new_default == "required"
    after = req.type_out(dt)
    if before == after:
        return after
    audit.log(db, user, None, "doc_type", dt.code, "update", f"Mengubah jenis dokumen {dt.name}", before, after,
              data.reason)
    if new_default != old_default or before["active"] != after["active"]:
        # perusahaan tanpa pengaturan sendiri ikut default baru → tandai periode terbukanya
        overridden = {c for (c,) in db.execute(select(CompanyDocRequirement.company_id)
                                               .where(CompanyDocRequirement.type_code == dt.code))}
        affected = [c for (c,) in db.execute(select(Company.id)) if c not in overridden]
        if new_default != old_default:
            for cid in affected:
                audit.log(db, user, cid, "requirement", dt.code, "default_status",
                          f"Status {dt.name}: {req.STATUS_LABEL[old_default]} → {req.STATUS_LABEL[new_default]}",
                          {"status": old_default}, {"status": new_default, "source": "default"}, data.reason)
        _touch_all(db, affected if before["active"] == after["active"] else None)
    db.commit()
    return after


# ------------------------------------------------------------------ kebutuhan per perusahaan
def _spec_out(s, dt: DocumentType | None, pending: set[str], profiles: dict[int, str]) -> dict:
    pid = int(s.source.split(":", 1)[1]) if s.source.startswith("profile:") and s.source[8:].isdigit() else None
    return {
        "source_profile": profiles.get(pid) if pid else None,
        "code": s.code, "no": s.no, "name": s.name, "scope": s.scope, "description": s.description,
        "status": s.status, "reason": s.reason, "source": s.source, "set_by": s.set_by, "set_at": s.set_at,
        "default_status": (dt.default_status if dt else None) or "required", "overridden": s.source != "default",
        "builtin": s.builtin, "can_exclude": s.can_exclude, "has_default": s.has_default, "scope12": s.scope12,
        "exception_pending": s.code in pending,
    }


def requirement_list(db: Session, company_id: int) -> list[dict]:
    types = {dt.code: dt for dt in req.doc_types(db)}
    pending = set(req.pending_exception_codes(db, company_id))
    profiles = dict(db.execute(select(RequirementProfile.id, RequirementProfile.name)).all())
    return [_spec_out(s, types.get(s.code), pending, profiles) for s in req.effective_specs(db, company_id)]


@router.get("/companies")
def list_companies(_: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    """Semua perusahaan beserta ringkasan kebutuhan dan permintaan pengecualian yang menunggu."""
    types = req.doc_types(db)
    ov: dict[int, dict[str, str]] = {}
    for r in db.scalars(select(CompanyDocRequirement)):
        ov.setdefault(r.company_id, {})[r.type_code] = r.status
    pending = dict(db.execute(select(ExceptionRequest.company_id, func.count())
                              .where(ExceptionRequest.status == "pending").group_by(ExceptionRequest.company_id)).all())
    admins: dict[int, list[str]] = {}
    for cid, name in db.execute(select(AdminCompany.company_id, User.name).join(User, User.id == AdminCompany.admin_id)
                                .order_by(User.name)):
        admins.setdefault(cid, []).append(name)
    out = []
    for c in db.scalars(select(Company).order_by(Company.name)):
        mine = ov.get(c.id, {})
        counts = {"required": 0, "optional": 0, "not_applicable": 0}
        for dt in types:
            counts[mine.get(dt.code, dt.default_status or "required")] += 1
        period = db.scalar(select(ReportingPeriod).where(ReportingPeriod.company_id == c.id)
                           .order_by(ReportingPeriod.year.desc()).limit(1))
        out.append({
            "id": c.id, "name": c.name, "city": c.city, "province": c.province, "sector": c.sector,
            "required": counts["required"], "optional": counts["optional"], "not_applicable": counts["not_applicable"],
            "overrides": len([k for k in mine if any(dt.code == k for dt in types)]),
            "pending_exceptions": pending.get(c.id, 0), "reviewers": admins.get(c.id, []),
            "period": {"id": period.id, "year": period.year, "status": period.status, "version": period.version}
            if period else None,
        })
    return out


@router.get("/companies/{company_id}/requirements")
def company_requirements(company_id: int, _: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    c = _company(db, company_id)
    rows = list(db.scalars(select(ExceptionRequest).where(ExceptionRequest.company_id == c.id)
                           .order_by(ExceptionRequest.id.desc()).limit(30)))
    periods = db.scalars(select(ReportingPeriod).where(ReportingPeriod.company_id == c.id)
                         .order_by(ReportingPeriod.year.desc())).all()
    locked = []
    for p in periods:
        if p.status != "locked":
            continue
        specs = req.specs_for_period(db, p)
        locked.append({"id": p.id, "year": p.year, "version": p.version,
                       "locked_at": p.locked_at.isoformat() if p.locked_at else None,
                       "statuses": [{"code": x.code, "name": x.name, "status": x.status, "reason": x.reason} for x in specs]})
    return {
        "company": {"id": c.id, "name": c.name, "city": c.city, "province": c.province},
        "requirements": requirement_list(db, c.id),
        "exceptions": req.exception_out(db, rows),
        "periods": [{"id": p.id, "year": p.year, "status": p.status, "version": p.version} for p in periods],
        # snapshot status saat periode dikunci (baca saja; perubahan sekarang tidak memengaruhinya)
        "locked_periods": locked,
    }


@router.put("/companies/{company_id}/requirements/{code}")
def set_requirement(company_id: int, code: str, data: RequirementSet, user: User = Depends(superadmin_user),
                    db: Session = Depends(get_db)):
    c = _company(db, company_id)
    dt = req.active_type(db, code)
    if not dt:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jenis dokumen tidak ditemukan")
    try:
        change = req.set_status(db, user, c.id, dt, data.status, data.reason)
    except req.RequirementError as e:
        raise _fail(e) from e
    db.commit()
    return {"changed": change is not None, "requirements": requirement_list(db, c.id)}


def _changes(db: Session, data: RequirementPreviewIn) -> list[tuple[DocumentType, str, str | None]]:
    out = []
    for ch in data.changes:
        dt = req.active_type(db, ch.code)
        if not dt:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Jenis dokumen tidak ditemukan")
        out.append((dt, ch.status, ch.expected))
    return out


@router.put("/companies/{company_id}/requirements")
def save_requirements(company_id: int, data: RequirementBatch, user: User = Depends(superadmin_user),
                      db: Session = Depends(get_db)):
    """Simpan beberapa perubahan sekaligus dengan satu alasan. 409 + daftar perbedaan bila status
    sudah diubah superadmin lain sejak halaman dimuat."""
    c = _company(db, company_id)
    try:
        done = req.save_changes(db, user, c.id, _changes(db, data), data.reason)
    except (req.RequirementError, req.RequirementConflict) as e:
        db.rollback()
        raise _fail(e) from e
    db.commit()
    return {"changed": done, "requirements": requirement_list(db, c.id)}


@router.post("/companies/{company_id}/requirements/preview")
def preview_requirement(company_id: int, data: RequirementPreviewIn, user: User = Depends(superadmin_user),
                        db: Session = Depends(get_db)):
    """Dampak satu atau beberapa perubahan status tanpa menyimpan apa pun."""
    c = _company(db, company_id)
    out = req.preview(db, user, c.id, [(dt, st) for dt, st, _ in _changes(db, data)], data.reason)
    db.rollback()  # pratinjau tidak boleh menyimpan apa pun
    return out


# ------------------------------------------------------------------ profil kebutuhan
def _profile_out(p: RequirementProfile) -> dict:
    return {"id": p.id, "name": p.name, "description": p.description,
            "items": {it.type_code: it.status for it in p.items},
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None}


def _profile(db: Session, pid: int) -> RequirementProfile:
    p = db.get(RequirementProfile, pid)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profil tidak ditemukan")
    return p


def _set_items(db: Session, p: RequirementProfile, items: dict[str, str]) -> None:
    try:
        req.check_profile_items(db, items)
    except req.RequirementError as e:
        raise _fail(e) from e
    p.items.clear()
    db.flush()
    for code, st in items.items():
        p.items.append(RequirementProfileItem(type_code=code, status=st))


@router.get("/profiles")
def list_profiles(_: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    return [_profile_out(p) for p in db.scalars(select(RequirementProfile).order_by(RequirementProfile.name))]


@router.post("/profiles", status_code=201)
def create_profile(data: ProfileIn, user: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    if db.scalar(select(RequirementProfile.id).where(RequirementProfile.name == data.name.strip())):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Profil {data.name.strip()} sudah ada")
    p = RequirementProfile(name=data.name.strip(), description=data.description, created_by=user.id)
    db.add(p)
    _set_items(db, p, data.items)
    db.flush()
    audit.log(db, user, None, "profile", p.id, "create", f"Membuat profil kebutuhan {p.name}", None, _profile_out(p))
    db.commit()
    return _profile_out(p)


@router.patch("/profiles/{pid}")
def update_profile(pid: int, data: ProfilePatch, user: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    """Mengubah profil tidak mengubah perusahaan yang sudah memakainya (nilai disalin saat diterapkan)."""
    p = _profile(db, pid)
    before = _profile_out(p)
    if data.name and data.name.strip() != p.name:
        if db.scalar(select(RequirementProfile.id).where(RequirementProfile.name == data.name.strip())):
            raise HTTPException(status.HTTP_409_CONFLICT, f"Profil {data.name.strip()} sudah ada")
        p.name = data.name.strip()
    if "description" in data.model_fields_set:
        p.description = data.description
    if data.items is not None:
        _set_items(db, p, data.items)
    p.updated_at = utcnow()
    db.flush()
    audit.log(db, user, None, "profile", p.id, "update", f"Mengubah profil kebutuhan {p.name}", before, _profile_out(p))
    db.commit()
    return _profile_out(p)


@router.post("/profiles/{pid}/apply")
def apply_profile(pid: int, data: ProfileApply, user: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    """`dry_run: true` hanya menampilkan perubahan per perusahaan tanpa menyimpan."""
    p = _profile(db, pid)
    try:
        result = req.apply_profile(db, user, p, data.company_ids, data.dry_run, data.reason)
    except req.RequirementError as e:
        raise _fail(e) from e
    if data.dry_run:
        db.rollback()
    else:
        db.commit()
    return {"dry_run": data.dry_run, "companies": result,
            "needs_reason": any(ch["scope12"] for r in result for ch in r["changes"])}


# ------------------------------------------------------------------ permintaan pengecualian
@router.get("/exceptions")
def list_exceptions(status_: str | None = Query(default="pending", alias="status"),
                    _: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    q = select(ExceptionRequest).order_by(ExceptionRequest.id.desc()).limit(200)
    if status_ and status_ != "all":
        q = q.where(ExceptionRequest.status == status_)
    return req.exception_out(db, list(db.scalars(q)))


@router.post("/exceptions/{eid}/decide")
def decide_exception(eid: int, data: ExceptionDecision, user: User = Depends(superadmin_user),
                     db: Session = Depends(get_db)):
    r = db.get(ExceptionRequest, eid)
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Permintaan tidak ditemukan")
    if data.decision == "rejected" and len((data.note or "").strip()) < 5:
        raise HTTPException(422, "Tulis alasan penolakan (minimal 5 karakter)")
    try:
        req.decide_exception(db, user, r, data.decision == "approved", data.note)
    except ValueError as e:
        raise _fail(e) from e
    db.commit()
    return req.exception_out(db, [r])[0]


# ------------------------------------------------------------------ admin peninjau
def _admin(db: Session, admin_id: int) -> User:
    u = db.get(User, admin_id)
    if not u or u.role != "admin":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admin tidak ditemukan")
    return u


def _admin_out(db: Session, u: User) -> dict:
    rows = db.execute(select(Company.id, Company.name).join(AdminCompany, AdminCompany.company_id == Company.id)
                      .where(AdminCompany.admin_id == u.id).order_by(Company.name)).all()
    return {"id": u.id, "name": u.name, "email": u.email, "is_active": u.is_active,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "companies": [{"id": i, "name": n} for i, n in rows]}


@router.get("/admins")
def list_admins(_: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    return [_admin_out(db, u) for u in db.scalars(select(User).where(User.role == "admin").order_by(User.name))]


@router.post("/admins", status_code=201)
def create_admin(data: AdminCreate, user: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    """Membuat akun admin peninjau. Peran selalu "admin": superadmin hanya bisa dibuat lewat CLI."""
    if db.scalar(select(User.id).where(User.email == data.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email sudah dipakai akun lain")
    u = User(company_id=None, name=data.name.strip(), email=data.email.lower(), role="admin",
             password_hash=hash_password(data.password))
    db.add(u)
    db.flush()
    audit.log(db, user, None, "admin", u.id, "create", f"Membuat admin peninjau {u.name}")
    db.commit()
    return _admin_out(db, u)


@router.patch("/admins/{admin_id}")
def update_admin(admin_id: int, data: AdminPatch, user: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    u = _admin(db, admin_id)
    if data.name:
        u.name = data.name.strip()
    if data.password:
        u.password_hash = hash_password(data.password)
    if data.is_active is not None and data.is_active != u.is_active:
        u.is_active = data.is_active
        audit.log(db, user, None, "admin", u.id, "activate" if data.is_active else "deactivate",
                  f"{'Mengaktifkan' if data.is_active else 'Menonaktifkan'} admin peninjau {u.name}")
    elif data.name or data.password:
        audit.log(db, user, None, "admin", u.id, "update", f"Mengubah akun admin peninjau {u.name}")
    db.commit()
    return _admin_out(db, u)


@router.post("/admins/{admin_id}/companies/{company_id}")
def assign_admin(admin_id: int, company_id: int, user: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    u, c = _admin(db, admin_id), _company(db, company_id)
    if not db.get(AdminCompany, (u.id, c.id)):
        db.add(AdminCompany(admin_id=u.id, company_id=c.id))
        audit.log(db, user, c.id, "admin", u.id, "assign", f"Menugaskan {u.name} meninjau {c.name}")
        db.commit()
    return _admin_out(db, u)


@router.delete("/admins/{admin_id}/companies/{company_id}")
def unassign_admin(admin_id: int, company_id: int, user: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    u, c = _admin(db, admin_id), _company(db, company_id)
    row = db.get(AdminCompany, (u.id, c.id))
    if row:
        db.delete(row)
        audit.log(db, user, c.id, "admin", u.id, "unassign", f"Mencabut tugas {u.name} meninjau {c.name}")
        db.commit()
    return _admin_out(db, u)


# ------------------------------------------------------------------ audit
@router.get("/audit/actors")
def audit_actors(_: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    """Pengguna yang pernah tercatat di log audit (untuk filter pelaku)."""
    rows = db.execute(select(User.id, User.name, User.role).where(User.id.in_(select(AuditLog.user_id).distinct()))
                      .order_by(User.name)).all()
    return [{"id": i, "name": n, "role": r} for i, n, r in rows]


@router.get("/audit")
def audit_log(company_id: int | None = None, entity: str | None = None, user_id: int | None = None,
              action: str | None = None, date_from: date | None = None, date_to: date | None = None,
              limit: int = 100, _: User = Depends(superadmin_user), db: Session = Depends(get_db)):
    """Filter: perusahaan, jenis entitas, pelaku, aksi (dipisah koma), rentang tanggal (YYYY-MM-DD, inklusif)."""
    q = (select(AuditLog, User.name, Company.name).join(User, User.id == AuditLog.user_id, isouter=True)
         .join(Company, Company.id == AuditLog.company_id, isouter=True))
    if company_id:
        q = q.where(AuditLog.company_id == company_id)
    if entity:
        q = q.where(AuditLog.entity.in_([e.strip() for e in entity.split(",") if e.strip()]))
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    if action:
        q = q.where(AuditLog.action.in_([a.strip() for a in action.split(",") if a.strip()]))
    if date_from:
        q = q.where(AuditLog.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        q = q.where(AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min))
    rows = db.execute(q.order_by(AuditLog.id.desc()).limit(max(1, min(limit, 500)))).all()
    return [{"id": a.id, "user": u or "Sistem", "user_id": a.user_id, "company_id": a.company_id, "company": c, "entity": a.entity,
             "entity_id": a.entity_id, "action": a.action, "summary": a.summary, "reason": a.reason,
             "before": a.before, "after": a.after, "at": a.created_at.isoformat() if a.created_at else None}
            for a, u, c in rows]
