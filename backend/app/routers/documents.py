import hashlib
import mimetypes
import re
import uuid
from pathlib import Path

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Response, UploadFile, status,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..core.catalog import DOC_TYPE_BY_CODE, DOC_TYPES
from ..core.validation import validate_document
from ..database import get_db
from ..deps import current_user, get_document, get_period, require_roles
from ..models import Document, ExtractedField, ReportingPeriod, User
from ..schemas import DocumentDetail, DocumentOut, DocumentPatch, FieldCreate, FieldOut, FieldUpdate, RejectIn
from ..services import audit
from ..services.period import mark_changed
from ..services.pipeline import pages_dir, process_document, to_value

router = APIRouter(tags=["dokumen"])
writers = require_roles("admin", "operator", "reviewer")
ALLOWED = {".pdf", ".xlsx", ".xlsm", ".csv", ".txt", ".docx", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp", ".bmp"}


@router.get("/api/document-types")
def document_types(user: User = Depends(current_user)):
    return [
        {"code": d.code, "no": d.no, "name": d.name, "required": d.required, "scope": d.scope,
         "description": d.description,
         "fields": [{"key": f.key, "label": f.label, "unit": f.unit, "kind": f.kind, "required": f.required} for f in d.fields]}
        for d in DOC_TYPES
    ]


def _safe_name(name: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(name).name)[-120:]
    return base or "berkas"


@router.post("/api/periods/{period_id}/documents", response_model=list[DocumentOut], status_code=201)
async def upload_documents(
    period_id: int,
    background: BackgroundTasks,
    files: list[UploadFile] = File(...),
    type_code: str | None = Form(default=None),
    facility_id: int | None = Form(default=None),
    user: User = Depends(writers),
    db: Session = Depends(get_db),
):
    """Unggah satu atau banyak berkas. Klasifikasi & ekstraksi berjalan di background."""
    settings = get_settings()
    period = get_period(period_id, user, db, for_write=True)
    if type_code and type_code not in DOC_TYPE_BY_CODE:
        raise HTTPException(422, "Kategori dokumen tidak dikenal")
    folder = Path(settings.storage_dir) / str(user.company_id) / str(period.id)
    folder.mkdir(parents=True, exist_ok=True)
    created: list[Document] = []
    for up in files:
        ext = Path(up.filename or "").suffix.lower()
        if ext not in ALLOWED:
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"Format {ext or '?'} tidak didukung: {up.filename}")
        data = await up.read()
        if len(data) > settings.max_upload_mb * 1024 * 1024:
            raise HTTPException(413, f"{up.filename} melebihi {settings.max_upload_mb} MB")
        digest = hashlib.sha256(data).hexdigest()
        dup = db.scalar(select(Document).where(Document.period_id == period.id, Document.sha256 == digest))
        if dup:
            raise HTTPException(status.HTTP_409_CONFLICT, f"{up.filename} sama persis dengan dokumen #{dup.id} ({dup.original_name})")
        path = folder / f"{uuid.uuid4().hex[:12]}_{_safe_name(up.filename or 'berkas')}"
        path.write_bytes(data)
        doc = Document(
            company_id=user.company_id, period_id=period.id, facility_id=facility_id, type_code=type_code,
            original_name=(up.filename or path.name)[:255], stored_path=str(path),
            mime=up.content_type or mimetypes.guess_type(path.name)[0], size_bytes=len(data), sha256=digest,
            status="uploaded", uploaded_by=user.id,
        )
        db.add(doc)
        db.flush()
        audit.log(db, user, user.company_id, "document", doc.id, "upload", f"Mengunggah {doc.original_name}")
        created.append(doc)
    mark_changed(period)
    db.commit()
    for doc in created:
        background.add_task(process_document, doc.id)
    return created


@router.get("/api/periods/{period_id}/documents", response_model=list[DocumentOut])
def list_documents(
    period_id: int,
    type_code: str | None = Query(default=None),
    status_: str | None = Query(default=None, alias="status"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    period = get_period(period_id, user, db)
    q = select(Document).where(Document.period_id == period.id, Document.company_id == user.company_id)
    if type_code:
        q = q.where(Document.type_code == type_code)
    if status_:
        q = q.where(Document.status == status_)
    return db.scalars(q.order_by(Document.id.desc())).all()


def doc_items(doc: Document) -> tuple[list[dict], dict, dict]:
    """Field dokumen dikelompokkan per item/baris + keyakinan & konfirmasi per (item, key)."""
    n = max((f.item or 0 for f in doc.fields), default=-1) + 1
    items: list[dict] = [{} for _ in range(n)]
    conf, confirmed = {}, {}
    for f in doc.fields:
        i = f.item or 0
        items[i][f.key] = f.value_num if f.value_num is not None else f.value_text
        conf[(i, f.key)] = float(f.confidence or 0)
        confirmed[(i, f.key)] = bool(f.confirmed)
    return items, conf, confirmed


def _detail(doc: Document) -> DocumentDetail:
    issues = []
    if doc.status not in ("uploaded", "processing"):
        items, conf, confirmed = doc_items(doc)
        issues = [i.to_dict() for i in validate_document(doc.type_code, items, conf, confirmed)]
    out = DocumentDetail.model_validate({
        **DocumentOut.model_validate(doc).model_dump(),
        "fields": [FieldOut.model_validate(f) for f in doc.fields],
        "issues": issues, "notes": doc.notes, "layout": doc.layout,
    })
    out.text_preview = (doc.raw_text or "")[:8000] or None
    return out


@router.get("/api/documents/{doc_id}", response_model=DocumentDetail)
def get_document_detail(doc_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _detail(get_document(doc_id, user, db))


@router.get("/api/documents/{doc_id}/file")
def download_file(doc_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    doc = get_document(doc_id, user, db)
    p = Path(doc.stored_path)
    if not p.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Berkas fisik tidak ditemukan di penyimpanan")
    return FileResponse(p, media_type=doc.mime or "application/octet-stream", filename=doc.original_name,
                        content_disposition_type="inline")


def _period_for_write(doc: Document, user: User, db: Session) -> ReportingPeriod:
    return get_period(doc.period_id, user, db, for_write=True)


@router.get("/api/documents/{doc_id}/pages/{n}")
def page_image(doc_id: int, n: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Gambar halaman untuk pratinjau dengan kotak sumber (PDF dirender, scan memakai citra yang diluruskan)."""
    doc = get_document(doc_id, user, db)
    cache = pages_dir(doc)
    cache.mkdir(parents=True, exist_ok=True)
    ocr_img = cache / f"p{n}.png"
    if ocr_img.exists():
        return FileResponse(ocr_img, media_type="image/png")
    rendered = cache / f"r{n}.png"
    if not rendered.exists():
        src = Path(doc.stored_path)
        try:
            if src.suffix.lower() == ".pdf":
                import pdfplumber

                with pdfplumber.open(str(src)) as pdf:
                    if n >= len(pdf.pages):
                        raise HTTPException(404, "Halaman tidak ada")
                    pdf.pages[n].to_image(resolution=110).original.save(rendered, optimize=True)
            elif src.suffix.lower() in (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp", ".bmp"):
                from PIL import Image, ImageOps

                with Image.open(src) as im:
                    im.seek(n)
                    frame = ImageOps.exif_transpose(im.convert("RGB"))
                    frame.thumbnail((1800, 1800))
                    frame.save(rendered, optimize=True)
            else:
                raise HTTPException(404, "Format ini dipratinjau sebagai teks/tabel")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(404, f"Halaman tidak bisa dirender: {exc}") from exc
    return FileResponse(rendered, media_type="image/png")


@router.patch("/api/documents/{doc_id}", response_model=DocumentDetail)
def patch_document(doc_id: int, data: DocumentPatch, background: BackgroundTasks, user: User = Depends(writers),
                   db: Session = Depends(get_db)):
    """Ganti kategori → dokumen dibaca ulang dengan aturan kategori baru (di background)."""
    doc = get_document(doc_id, user, db)
    period = _period_for_write(doc, user, db)
    if data.facility_id is not None:
        doc.facility_id = data.facility_id
    if data.type_code and data.type_code != doc.type_code:
        if data.type_code not in DOC_TYPE_BY_CODE:
            raise HTTPException(422, "Kategori tidak dikenal")
        old = doc.type_code
        doc.status = "processing"
        audit.log(db, user, user.company_id, "document", doc.id, "reclassify",
                  f"Kategori {doc.original_name}: {old or '-'} → {data.type_code}")
        mark_changed(period)
        background.add_task(process_document, doc.id, data.type_code)
    db.commit()
    db.refresh(doc)
    return _detail(doc)


@router.patch("/api/documents/{doc_id}/fields/{field_id}", response_model=DocumentDetail)
def update_field(doc_id: int, field_id: int, data: FieldUpdate, user: User = Depends(writers), db: Session = Depends(get_db)):
    """Koreksi nilai, konfirmasi, atau pakai salah satu kandidat alternatif hasil ekstraksi."""
    doc = get_document(doc_id, user, db)
    period = _period_for_write(doc, user, db)
    f = next((x for x in doc.fields if x.id == field_id), None)
    if not f:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Field tidak ditemukan")
    alt = None
    if data.alt_index is not None:
        alts = f.alternatives or []
        if data.alt_index >= len(alts):
            raise HTTPException(422, "Kandidat tidak ada")
        alt = alts[data.alt_index]
        raw = str(alt.get("value", ""))
    elif data.value is not None:
        raw = data.value
    else:
        raw = f.value_text or ""
    try:
        vtext, vnum = to_value(doc.type_code or "", f.key, raw)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    before = {"value": f.value_text}
    changed = vtext != (f.value_text or "")
    if alt:
        # tukar: nilai lama menjadi kandidat, kandidat terpilih menjadi nilai utama
        old_alt = {"value": f.value_text, "unit": f.unit, "confidence": float(f.confidence or 0), "snippet": f.snippet,
                   "page": f.page, "bbox": f.bbox, "method": f.method}
        alts = list(f.alternatives or [])
        alts[data.alt_index] = old_alt
        f.alternatives = alts
        f.snippet, f.page, f.bbox, f.method = alt.get("snippet"), alt.get("page"), alt.get("bbox"), alt.get("method")
    f.value_text, f.value_num, f.confirmed, f.edited_by = vtext[:255], vnum, True, user.id
    if changed:
        f.source = "manual"
        f.confidence = 1.0
    if doc.status in ("validated", "approved"):
        doc.status = "needs_review"  # data berubah → perlu divalidasi ulang
    label = f"{f.label}{f' (baris {f.item + 1})' if f.item else ''}"
    audit.log(db, user, user.company_id, "field", f.id, "update" if changed else "confirm",
              f"{label} di {doc.original_name}: {before['value']} → {vtext}" if changed else f"Konfirmasi {label}",
              before, {"value": vtext}, data.reason)
    mark_changed(period)
    db.commit()
    db.refresh(doc)
    return _detail(doc)


@router.post("/api/documents/{doc_id}/fields", response_model=DocumentDetail, status_code=201)
def add_field(doc_id: int, data: FieldCreate, user: User = Depends(writers), db: Session = Depends(get_db)):
    """Isi field secara manual (dokumen scan yang tidak terbaca, atau menambah baris baru)."""
    doc = get_document(doc_id, user, db)
    period = _period_for_write(doc, user, db)
    dt = DOC_TYPE_BY_CODE.get(doc.type_code or "")
    spec = dt.field(data.key) if dt else None
    if not spec:
        raise HTTPException(422, "Field tidak dikenal untuk kategori ini")
    if any(f.key == data.key and (f.item or 0) == data.item for f in doc.fields):
        raise HTTPException(status.HTTP_409_CONFLICT, "Field sudah ada, ubah nilainya saja")
    try:
        vtext, vnum = to_value(doc.type_code, data.key, data.value)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    doc.fields.append(ExtractedField(item=data.item, key=spec.key, label=spec.label, value_text=vtext, value_num=vnum,
                                     unit=spec.unit, confidence=1.0, confirmed=True, source="manual", edited_by=user.id,
                                     snippet="Diisi manual", method="manual"))
    if doc.status in ("validated", "approved"):
        doc.status = "needs_review"
    audit.log(db, user, user.company_id, "document", doc.id, "add_field",
              f"Isi manual {spec.label}{f' (baris {data.item + 1})' if data.item else ''} = {vtext}")
    mark_changed(period)
    db.commit()
    db.refresh(doc)
    return _detail(doc)


@router.delete("/api/documents/{doc_id}/items/{item}", response_model=DocumentDetail)
def delete_item(doc_id: int, item: int, user: User = Depends(writers), db: Session = Depends(get_db)):
    """Hapus satu baris hasil ekstraksi (mis. baris subtotal yang ikut terbaca)."""
    doc = get_document(doc_id, user, db)
    period = _period_for_write(doc, user, db)
    rows = [f for f in doc.fields if (f.item or 0) == item]
    if not rows:
        raise HTTPException(404, "Baris tidak ditemukan")
    for f in rows:
        doc.fields.remove(f)
    for f in doc.fields:
        if (f.item or 0) > item:
            f.item -= 1
    if doc.status in ("validated", "approved"):
        doc.status = "needs_review"
    audit.log(db, user, user.company_id, "document", doc.id, "delete_item", f"Hapus baris {item + 1} di {doc.original_name}")
    mark_changed(period)
    db.commit()
    db.refresh(doc)
    return _detail(doc)


@router.post("/api/documents/{doc_id}/validate", response_model=DocumentDetail)
def validate_doc(doc_id: int, user: User = Depends(writers), db: Session = Depends(get_db)):
    """Operator mengonfirmasi semua field. Ditolak bila masih ada isu kritis."""
    doc = get_document(doc_id, user, db)
    period = _period_for_write(doc, user, db)
    for f in doc.fields:
        f.confirmed = True
    items, _, _ = doc_items(doc)
    crit = [i.to_dict() for i in validate_document(doc.type_code, items, {}, {}) if i.severity == "critical"]
    if crit:
        db.rollback()
        raise HTTPException(422, {"message": "Masih ada isu kritis", "issues": crit})
    doc.status, doc.validated_by, doc.error = "validated", user.id, None
    audit.log(db, user, user.company_id, "document", doc.id, "validate", f"Memvalidasi {doc.original_name}")
    mark_changed(period)
    db.commit()
    db.refresh(doc)
    return _detail(doc)


@router.post("/api/documents/{doc_id}/approve", response_model=DocumentDetail)
def approve_doc(doc_id: int, user: User = Depends(require_roles("reviewer")), db: Session = Depends(get_db)):
    doc = get_document(doc_id, user, db)
    _period_for_write(doc, user, db)
    if doc.status != "validated":
        raise HTTPException(status.HTTP_409_CONFLICT, "Hanya dokumen tervalidasi yang bisa disetujui")
    if doc.validated_by == user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Pemisahan peran: Anda tidak bisa menyetujui dokumen yang Anda validasi sendiri")
    doc.status, doc.approved_by = "approved", user.id
    audit.log(db, user, user.company_id, "document", doc.id, "approve", f"Menyetujui {doc.original_name}")
    db.commit()
    db.refresh(doc)
    return _detail(doc)


@router.post("/api/documents/{doc_id}/reject", response_model=DocumentDetail)
def reject_doc(doc_id: int, data: RejectIn, user: User = Depends(require_roles("reviewer", "admin")), db: Session = Depends(get_db)):
    doc = get_document(doc_id, user, db)
    period = _period_for_write(doc, user, db)
    doc.status, doc.error = "rejected", f"Ditolak: {data.reason}"
    audit.log(db, user, user.company_id, "document", doc.id, "reject", f"Menolak {doc.original_name}", reason=data.reason)
    mark_changed(period)
    db.commit()
    db.refresh(doc)
    return _detail(doc)


@router.post("/api/documents/{doc_id}/reprocess", response_model=DocumentOut)
def reprocess(doc_id: int, background: BackgroundTasks, user: User = Depends(writers), db: Session = Depends(get_db)):
    doc = get_document(doc_id, user, db)
    _period_for_write(doc, user, db)
    doc.status = "uploaded"
    db.commit()
    background.add_task(process_document, doc.id)
    return doc


@router.delete("/api/documents/{doc_id}", status_code=204)
def delete_doc(doc_id: int, user: User = Depends(writers), db: Session = Depends(get_db)):
    doc = get_document(doc_id, user, db)
    period = _period_for_write(doc, user, db)
    path = Path(doc.stored_path)
    audit.log(db, user, user.company_id, "document", doc.id, "delete", f"Menghapus {doc.original_name}")
    db.delete(doc)
    mark_changed(period)
    db.commit()
    path.unlink(missing_ok=True)
    return Response(status_code=204)
