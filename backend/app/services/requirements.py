"""Status kebutuhan dokumen per perusahaan: Wajib / Opsional / Tidak berlaku.

Urutan penentuan status efektif satu jenis dokumen untuk satu perusahaan:
1. periode terkunci → salinan (snapshot) yang disimpan saat periode dikunci;
2. baris company_doc_requirements (diatur superadmin, profil, atau keputusan pengecualian);
3. document_types.default_status (default katalog).

"Tidak berlaku" ≠ "data tidak tersedia":
- Tidak berlaku  → kategorinya dikeluarkan dari perhitungan dan dicantumkan di laporan beserta alasannya.
- Tidak tersedia → kategori tetap dihitung; bila jenisnya punya nilai bawaan (POME), nilai bawaan dipakai
                   dan ditandai "default" di laporan (mekanisme defaults_used).
"""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.catalog import factor_in_use
from ..core.validation import REQ_STATUSES, ReqSpec, default_specs
from ..i18n import is_en
from ..models import (
    CompanyDocRequirement, DocumentType, ExceptionRequest, ReportingPeriod, RequirementProfile, User, utcnow,
)
from . import audit

MIN_REASON = 15
STATUS_LABEL = {"required": "Wajib", "optional": "Opsional", "not_applicable": "Tidak berlaku"}
# baris rumus kalkulasi → kategori dokumen asalnya
LINE_CATEGORY = {"bbm": "bbm", "listrik": "listrik", "pupuk_n2o": "pupuk", "pupuk_urea": "pupuk", "pome": "pome",
                 "lahan": "lahan", "b3": "b3", "transport": "transport", "material": "material"}


class RequirementError(ValueError):
    """Perubahan status ditolak aturan pengaman (dikirim ke klien sebagai 422)."""


class RequirementConflict(ValueError):
    """Perubahan bertabrakan dengan keadaan saat ini (dikirim ke klien sebagai 409)."""


# ------------------------------------------------------------------ katalog
def label(dt: DocumentType) -> str:
    return dt.name_en if is_en() and dt.name_en else dt.name


def description(dt: DocumentType) -> str:
    return dt.description_en if is_en() and dt.description_en else dt.description


def doc_types(db: Session, include_inactive: bool = False) -> list[DocumentType]:
    q = select(DocumentType).order_by(DocumentType.no, DocumentType.code)
    if not include_inactive:
        q = q.where(DocumentType.active.is_not(False))
    return list(db.scalars(q))


def active_type(db: Session, code: str | None) -> DocumentType | None:
    if not code:
        return None
    dt = db.get(DocumentType, code)
    return dt if dt and dt.active is not False else None


def is_supporting(db: Session, code: str | None) -> bool:
    """Jenis dokumen pendukung buatan superadmin (bukti saja, tanpa ekstraksi & rumus)."""
    dt = db.get(DocumentType, code) if code else None
    return bool(dt and not dt.builtin)


def type_out(dt: DocumentType) -> dict:
    return {
        "code": dt.code, "no": dt.no, "name": label(dt), "name_id": dt.name, "name_en": dt.name_en,
        "description": description(dt), "description_id": dt.description, "description_en": dt.description_en,
        "scope": dt.scope, "default_status": dt.default_status or "required", "required": dt.default_status == "required",
        "builtin": bool(dt.builtin), "can_exclude": dt.can_exclude is not False, "has_default": bool(dt.has_default),
        "scope12": bool(dt.scope12), "active": dt.active is not False,
        "fields": dt.field_schema or [],
    }


# ------------------------------------------------------------------ status efektif
def _iso(v: datetime | None) -> str | None:
    return v.isoformat() if v else None


def _spec(dt: DocumentType, status: str, reason: str | None = None, source: str = "default",
          set_by: str | None = None, set_at: str | None = None) -> ReqSpec:
    return ReqSpec(
        dt.code, dt.no, label(dt), dt.scope, description(dt), status, reason, source,
        builtin=bool(dt.builtin), has_default=bool(dt.has_default), can_exclude=dt.can_exclude is not False,
        scope12=bool(dt.scope12), set_by=set_by, set_at=set_at,
        fields=tuple(f.get("label", f.get("key", "")) for f in (dt.field_schema or [])),
    )


def _user_names(db: Session, ids) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.name).where(User.id.in_(ids))).all())


def overrides(db: Session, company_id: int) -> dict[str, CompanyDocRequirement]:
    rows = db.scalars(select(CompanyDocRequirement).where(CompanyDocRequirement.company_id == company_id))
    return {r.type_code: r for r in rows}


def effective_specs(db: Session, company_id: int) -> list[ReqSpec]:
    """Status yang berlaku sekarang (override superadmin, lalu default katalog)."""
    ov = overrides(db, company_id)
    names = _user_names(db, (r.set_by for r in ov.values()))
    out = []
    for dt in doc_types(db):
        r = ov.get(dt.code)
        if r:
            out.append(_spec(dt, r.status, r.reason, r.source or "manual", names.get(r.set_by), _iso(r.set_at)))
        else:
            out.append(_spec(dt, dt.default_status or "required"))
    return out


def snapshot(specs: list[ReqSpec]) -> dict:
    """Salinan status kebutuhan untuk disimpan di periode yang dikunci."""
    return {s.code: {"status": s.status, "reason": s.reason, "source": s.source, "set_by": s.set_by,
                     "set_at": s.set_at, "name": s.name, "no": s.no, "scope": s.scope, "description": s.description,
                     "builtin": s.builtin, "has_default": s.has_default, "can_exclude": s.can_exclude,
                     "scope12": s.scope12, "fields": list(s.fields)}
            for s in specs}


def _from_snapshot(db: Session, snap: dict) -> list[ReqSpec]:
    types = {dt.code: dt for dt in doc_types(db, include_inactive=True)}
    out = []
    for code, v in snap.items():
        dt = types.get(code)
        name = label(dt) if dt else v.get("name", code)
        desc = description(dt) if dt else v.get("description", "")
        out.append(ReqSpec(code, v.get("no", 99), name, v.get("scope", ""), desc, v.get("status", "required"),
                           v.get("reason"), v.get("source") or "default", bool(v.get("builtin", True)),
                           bool(v.get("has_default")),
                           v.get("can_exclude", True) is not False, bool(v.get("scope12")), v.get("set_by"),
                           v.get("set_at"), tuple(v.get("fields") or ())))
    return sorted(out, key=lambda s: (s.no, s.code))


def specs_for_period(db: Session, period: ReportingPeriod) -> list[ReqSpec]:
    """Periode terkunci memakai snapshot-nya; periode terbuka memakai status yang berlaku sekarang."""
    if period.status == "locked" and period.requirements_snapshot:
        return _from_snapshot(db, period.requirements_snapshot)
    return effective_specs(db, period.company_id)


def excluded_map(specs: list[ReqSpec]) -> dict[str, str]:
    return {s.code: s.reason or "Tidak berlaku untuk perusahaan ini" for s in specs if s.excluded}


def excluded_details(specs: list[ReqSpec]) -> list[dict]:
    """Daftar kategori yang dikecualikan untuk hasil kalkulasi & laporan."""
    return [{"code": s.code, "name": s.name, "reason": s.reason, "set_by": s.set_by, "set_at": s.set_at,
             "source": s.source} for s in specs if s.excluded]


def used_factors(approved: dict[str, bool], excluded) -> dict[str, bool]:
    """Faktor yang benar-benar dipakai (faktor milik kategori "Tidak berlaku" saja tidak perlu disetujui)."""
    ex = set(excluded)
    return {c: ok for c, ok in approved.items() if factor_in_use(c, ex)}


def pending_exception_codes(db: Session, company_id: int) -> list[str]:
    return list(db.scalars(select(ExceptionRequest.type_code).where(
        ExceptionRequest.company_id == company_id, ExceptionRequest.status == "pending")))


# ------------------------------------------------------------------ perubahan status
def check_change(dt: DocumentType, new: str, old: str | None, reason: str | None) -> None:
    if new not in REQ_STATUSES:
        raise RequirementError("Status kebutuhan tidak dikenal")
    if new == "not_applicable" and dt.can_exclude is False:
        raise RequirementError(f"{dt.name} tidak boleh berstatus Tidak berlaku karena menjadi pembagi SEE")
    if dt.scope12 and new != old and len((reason or "").strip()) < MIN_REASON:
        raise RequirementError(f"Perubahan status {dt.name} memengaruhi Scope 1/2 dan wajib disertai alasan "
                               f"minimal {MIN_REASON} karakter")


def touch_open_periods(db: Session, company_id: int) -> list[ReportingPeriod]:
    """Status berubah → kalkulasi periode yang masih terbuka ditandai perlu dihitung ulang."""
    from .period import mark_changed

    rows = list(db.scalars(select(ReportingPeriod).where(ReportingPeriod.company_id == company_id,
                                                         ReportingPeriod.status != "locked")))
    for p in rows:
        mark_changed(p)
    return rows


def current_status(db: Session, company_id: int, dt: DocumentType) -> str:
    r = db.get(CompanyDocRequirement, (company_id, dt.code))
    return r.status if r else (dt.default_status or "required")


def set_status(db: Session, actor: User, company_id: int, dt: DocumentType, status: str, reason: str | None,
               source: str = "manual") -> dict | None:
    """Simpan override status untuk satu perusahaan. Mengembalikan perubahan, atau None bila tidak berubah."""
    old = current_status(db, company_id, dt)
    reason = (reason or "").strip() or None
    check_change(dt, status, old, reason)
    row = db.get(CompanyDocRequirement, (company_id, dt.code))
    if row and row.status == status and (row.reason or None) == reason:
        return None
    if not row:
        row = CompanyDocRequirement(company_id=company_id, type_code=dt.code)
        db.add(row)
    row.status, row.reason, row.source, row.set_by, row.set_at = status, reason, source[:40], actor.id, utcnow()
    audit.log(db, actor, company_id, "requirement", dt.code, "set_status",
              f"Status {dt.name}: {STATUS_LABEL[old]} → {STATUS_LABEL[status]}",
              {"status": old}, {"status": status, "source": source}, reason)
    touch_open_periods(db, company_id)
    return {"code": dt.code, "name": dt.name, "before": old, "after": status}


# ------------------------------------------------------------------ pengecualian
def request_exception(db: Session, user: User, company_id: int, dt: DocumentType, requested: str,
                      reason: str) -> ExceptionRequest:
    current = current_status(db, company_id, dt)
    if requested == current:
        raise RequirementConflict(f"{dt.name} sudah berstatus {STATUS_LABEL[requested]}")
    check_change(dt, requested, current, reason)
    if db.scalar(select(ExceptionRequest.id).where(ExceptionRequest.company_id == company_id,
                                                   ExceptionRequest.type_code == dt.code,
                                                   ExceptionRequest.status == "pending")):
        raise RequirementConflict(f"Permintaan untuk {dt.name} masih menunggu keputusan superadmin")
    req = ExceptionRequest(company_id=company_id, type_code=dt.code, requested_status=requested,
                           reason=reason.strip(), requested_by=user.id)
    db.add(req)
    db.flush()
    audit.log(db, user, company_id, "exception", req.id, "request",
              f"Mengajukan pengecualian {dt.name}: {STATUS_LABEL[requested]}", None,
              {"status": requested}, reason.strip())
    touch_open_periods(db, company_id)  # isu EXCEPTION_PENDING muncul di periode terbuka
    return req


def decide_exception(db: Session, actor: User, req: ExceptionRequest, approve: bool, note: str | None) -> dict | None:
    if req.status != "pending":
        raise RequirementConflict("Permintaan ini sudah diputus")
    dt = db.get(DocumentType, req.type_code)
    note = (note or "").strip() or None
    change = None
    if approve:
        reason = req.reason + (f" · Catatan superadmin: {note}" if note else "")
        change = set_status(db, actor, req.company_id, dt, req.requested_status, reason[:500], f"exception:{req.id}")
    req.status, req.decided_by, req.decided_at, req.decision_note = (
        "approved" if approve else "rejected", actor.id, utcnow(), note)
    audit.log(db, actor, req.company_id, "exception", req.id, "approve" if approve else "reject",
              f"{'Menyetujui' if approve else 'Menolak'} pengecualian {dt.name}: {STATUS_LABEL[req.requested_status]}",
              {"status": "pending"}, {"status": req.status}, note)
    touch_open_periods(db, req.company_id)
    return change


def exception_out(db: Session, rows: list[ExceptionRequest]) -> list[dict]:
    from ..models import Company

    names = _user_names(db, [r.requested_by for r in rows] + [r.decided_by for r in rows])
    types = {dt.code: dt for dt in doc_types(db, include_inactive=True)}
    companies = dict(db.execute(select(Company.id, Company.name).where(
        Company.id.in_({r.company_id for r in rows}))).all()) if rows else {}
    return [{
        "id": r.id, "company_id": r.company_id, "company": companies.get(r.company_id),
        "type_code": r.type_code, "type_name": label(types[r.type_code]) if r.type_code in types else r.type_code,
        "requested_status": r.requested_status, "reason": r.reason, "status": r.status,
        "requested_by": names.get(r.requested_by), "created_at": _iso(r.created_at),
        "decided_by": names.get(r.decided_by), "decided_at": _iso(r.decided_at), "decision_note": r.decision_note,
    } for r in rows]


# ------------------------------------------------------------------ profil
def profile_changes(db: Session, profile: RequirementProfile, company_id: int) -> list[dict]:
    types = {dt.code: dt for dt in doc_types(db)}
    out = []
    for it in profile.items:
        dt = types.get(it.type_code)
        if not dt:
            continue
        old = current_status(db, company_id, dt)
        if old != it.status:
            out.append({"code": dt.code, "name": label(dt), "before": old, "after": it.status, "scope12": bool(dt.scope12)})
    return out


def apply_profile(db: Session, actor: User, profile: RequirementProfile, company_ids: list[int], dry_run: bool,
                  reason: str | None) -> list[dict]:
    from ..models import Company

    reason = (reason or "").strip() or None
    companies = {c.id: c for c in db.scalars(select(Company).where(Company.id.in_(company_ids)))}
    missing = [i for i in company_ids if i not in companies]
    if missing:
        raise RequirementError(f"Perusahaan tidak ditemukan: {', '.join(map(str, missing))}")
    result = [{"company_id": cid, "company": companies[cid].name, "changes": profile_changes(db, profile, cid)}
              for cid in company_ids]
    needs_reason = any(ch["scope12"] for r in result for ch in r["changes"])
    if not dry_run and needs_reason and len(reason or "") < MIN_REASON:
        raise RequirementError(f"Profil ini mengubah kategori Scope 1/2; isi alasan minimal {MIN_REASON} karakter")
    if dry_run:
        return result
    types = {dt.code: dt for dt in doc_types(db)}
    for r in result:
        for ch in r["changes"]:
            set_status(db, actor, r["company_id"], types[ch["code"]], ch["after"],
                       reason or f"Profil {profile.name}", f"profile:{profile.id}")
        audit.log(db, actor, r["company_id"], "profile", profile.id, "apply",
                  f"Menerapkan profil {profile.name} ({len(r['changes'])} perubahan)", reason=reason)
    return result


def check_profile_items(db: Session, items: dict[str, str]) -> None:
    types = {dt.code: dt for dt in doc_types(db)}
    for code, status in items.items():
        dt = types.get(code)
        if not dt:
            raise RequirementError(f"Jenis dokumen tidak dikenal: {code}")
        if status == "not_applicable" and dt.can_exclude is False:
            raise RequirementError(f"{dt.name} tidak boleh berstatus Tidak berlaku karena menjadi pembagi SEE")


# ------------------------------------------------------------------ pratinjau dampak
def preview(db: Session, actor: User, company_id: int, changes: list[tuple[DocumentType, str]],
            reason: str | None = None) -> dict:
    """Dampak satu atau beberapa perubahan status tanpa menyimpan: gerbang yang berubah, baris emisi yang
    keluar dari total, dan periode terbuka yang terdampak. Periode terkunci tidak berubah (memakai snapshot)."""
    from .period import gates, latest_calculation

    items = []
    for dt, status in changes:
        old = current_status(db, company_id, dt)
        error = None
        try:  # hanya aturan yang memblokir; kebutuhan alasan dilaporkan lewat needs_reason
            check_change(dt, status, old, "x" * MIN_REASON)
        except RequirementError as e:
            error = str(e)
        items.append({
            "code": dt.code, "name": label(dt), "before": old, "after": status, "changed": old != status,
            "valid": error is None, "error": error, "scope12": bool(dt.scope12),
            "needs_reason": bool(dt.scope12) and old != status,
            "emission_excluded": status == "not_applicable" and old != "not_applicable",
            "emission_restored": old == "not_applicable" and status != "not_applicable",
        })
    target = {it["code"]: it["after"] for it in items}
    leaving = {it["code"] for it in items if it["emission_excluded"]}
    now = effective_specs(db, company_id)
    new = [replace(s, status=target[s.code], reason=reason, source="manual") if s.code in target else s for s in now]
    periods = list(db.scalars(select(ReportingPeriod).where(ReportingPeriod.company_id == company_id)
                              .order_by(ReportingPeriod.year.desc())))
    out_periods = []
    for p in periods:
        if p.status == "locked":
            continue
        before = {g["key"]: g for g in gates(db, p, actor, now)}
        after = {g["key"]: g for g in gates(db, p, actor, new)}
        changed = [{"key": k, "name": after[k]["name"], "before": before[k]["ok"], "after": after[k]["ok"],
                    "note_before": before[k]["note"], "note_after": after[k]["note"]}
                   for k in after if k != "role" and (before[k]["ok"] != after[k]["ok"] or before[k]["note"] != after[k]["note"])]
        calc = latest_calculation(db, p)
        # baris emisi yang keluar dari total (berdasarkan kalkulasi terakhir) karena menjadi "Tidak berlaku"
        lines = [ln for ln in (calc.result.get("lines", []) if calc else []) if LINE_CATEGORY.get(ln["key"]) in leaving]
        out_periods.append({
            "id": p.id, "year": p.year, "status": p.status, "version": p.version, "gates_changed": changed,
            "calc_version": calc.version if calc else None, "calc_total_t": float(calc.total_t) if calc else None,
            "lines_removed": [{"key": ln["key"], "name": ln["name"], "value_t": ln["value_t"]} for ln in lines],
            "removed_t": round(sum(ln["value_t"] for ln in lines), 6),
        })
    return {
        "changes": items,
        "valid": all(it["valid"] for it in items),
        "needs_reason": any(it["needs_reason"] for it in items),
        "scope12_excluded": [it["name"] for it in items if it["scope12"] and it["emission_excluded"]],
        "open_periods": out_periods,
        "locked_periods": [{"id": p.id, "year": p.year, "version": p.version} for p in periods if p.status == "locked"],
    }


def save_changes(db: Session, actor: User, company_id: int, changes: list[tuple[DocumentType, str, str | None]],
                 reason: str | None) -> list[dict]:
    """Simpan beberapa perubahan sekaligus (semua atau tidak sama sekali).

    `expected` = status yang dilihat pengguna saat mulai mengubah. Bila status sekarang berbeda (diubah
    superadmin lain), tidak ada yang disimpan dan RequirementConflict membawa daftar perbedaannya.
    """
    conflicts = []
    for dt, _status, expected in changes:
        current = current_status(db, company_id, dt)
        if expected and current != expected:
            row = db.get(CompanyDocRequirement, (company_id, dt.code))
            by = _user_names(db, [row.set_by]).get(row.set_by) if row else None
            conflicts.append({"code": dt.code, "name": label(dt), "expected": expected, "current": current,
                              "set_by": by, "set_at": _iso(row.set_at) if row else None})
    if conflicts:
        err = RequirementConflict("Status sudah diubah superadmin lain. Muat ulang lalu periksa perbedaannya.")
        err.conflicts = conflicts  # type: ignore[attr-defined]
        raise err
    done = []
    for dt, status, _expected in changes:
        ch = set_status(db, actor, company_id, dt, status, reason)
        if ch:
            done.append(ch)
    return done


# ------------------------------------------------------------------ migrasi
def migrate_requirements(db: Session) -> list[str]:
    """Periode yang sudah terkunci sebelum fitur ini ada diberi snapshot default katalog (aturan yang
    berlaku saat dikunci), supaya perubahan status sesudahnya tidak mengubah periode tersebut."""
    rows = list(db.scalars(select(ReportingPeriod).where(ReportingPeriod.status == "locked",
                                                         ReportingPeriod.requirements_snapshot.is_(None))))
    if not rows:
        return []
    snap = snapshot(default_specs())
    for p in rows:
        p.requirements_snapshot = snap
    db.commit()
    return [f"{len(rows)} periode terkunci diberi snapshot kebutuhan default"]
