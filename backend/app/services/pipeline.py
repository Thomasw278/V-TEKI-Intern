"""Pemrosesan dokumen: tata letak → klasifikasi → ekstraksi multi-strategi → status perlu tinjauan."""
from __future__ import annotations

import logging
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.catalog import DOC_TYPE_BY_CODE
from ..core.extraction import ExtractionResult, classify_ranked, extract, parse_number
from ..core.layout import DocLayout, build_layout
from ..database import SessionLocal
from ..models import Document, ExtractedField, Product, ReportingPeriod, utcnow

log = logging.getLogger(__name__)
MAX_RAW_TEXT = 200_000


def pages_dir(doc: Document) -> Path:
    """Folder cache gambar halaman (hasil OCR yang sudah diluruskan / render PDF)."""
    p = Path(doc.stored_path)
    return p.parent / f"{p.name}.pages"


def to_value(type_code: str, key: str, raw: str) -> tuple[str, Decimal | None]:
    """Teks mentah → (value_text, value_num) sesuai tipe field."""
    dt = DOC_TYPE_BY_CODE.get(type_code)
    spec = dt.field(key) if dt else None
    if spec and spec.kind == "number":
        num = parse_number(raw)
        if num is None:
            raise ValueError(f"'{raw}' bukan angka yang valid untuk {spec.label}")
        return format(num.normalize(), "f"), num
    return raw.strip(), None


def apply_result(doc: Document, res: ExtractionResult) -> None:
    """Ganti field otomatis dengan hasil ekstraksi baru; field yang diisi/dikoreksi manual dipertahankan."""
    manual = {(f.item, f.key) for f in doc.fields if f.source == "manual"}
    for f in list(doc.fields):
        if f.source == "auto":
            doc.fields.remove(f)
    dt = DOC_TYPE_BY_CODE.get(doc.type_code or "")
    for idx, item in enumerate(res.items):
        for key, fr in item.items():
            if (idx, key) in manual:
                continue
            spec = dt.field(key) if dt else None
            try:
                vtext, vnum = to_value(doc.type_code or "", key, fr.value)
            except ValueError:
                continue
            doc.fields.append(ExtractedField(
                item=idx, key=key, label=spec.label if spec else key, value_text=vtext[:255], value_num=vnum,
                unit=fr.unit or (spec.unit if spec else ""), confidence=fr.confidence, snippet=(fr.snippet or "")[:1000],
                page=fr.page, bbox=fr.bbox, alternatives=fr.alternatives or None, method=(fr.method or "")[:60],
                source="auto",
            ))
    doc.doc_number = res.meta.get("doc_number")
    doc.supplier = res.meta.get("supplier")
    doc.doc_date = res.meta.get("doc_date")
    doc.extract_mode = res.mode
    doc.notes = res.notes or None


def run_extraction(db: Session, doc: Document, layout: DocLayout, type_code: str | None = None) -> None:
    if type_code:
        doc.type_code, doc.classify_confidence = type_code, 1.0
    elif not doc.type_code:
        ranked = classify_ranked(layout.text, doc.original_name)
        doc.type_code, doc.classify_confidence = (ranked[0] if ranked else (None, 0.0))
    if not doc.type_code:
        doc.status = "needs_review"
        doc.error = "Kategori tidak dikenali. Pilih kategori secara manual."
        doc.notes = layout.warnings or None
        return
    products = [(c, n) for c, n in db.execute(select(Product.code, Product.name).where(Product.company_id == doc.company_id))]
    res = extract(layout, doc.type_code, products)
    apply_result(doc, res)
    doc.status = "needs_review"
    if not layout.text.strip():
        doc.error = ("Teks tidak terbaca. Pasang Tesseract OCR untuk dokumen hasil scan, atau isi field secara manual."
                     if layout.method != "error" else (layout.warnings or ["Berkas rusak"])[0])
    elif not res.items:
        doc.error = "Tidak ada field yang terbaca untuk kategori ini. Periksa kategori atau isi field secara manual."
    else:
        doc.error = None


def process_document(doc_id: int, force_type: str | None = None) -> None:
    """Dijalankan di background setelah unggah / proses ulang / ganti kategori."""
    db = SessionLocal()
    try:
        doc = db.get(Document, doc_id)
        if not doc:
            return
        doc.status = "processing"
        db.commit()
        layout = build_layout(doc.stored_path, ocr_cache_dir=pages_dir(doc))
        doc.extract_method = layout.method[:40]
        doc.raw_text = layout.text[:MAX_RAW_TEXT]
        doc.layout = layout.preview()
        doc.page_count = len(layout.pages)
        run_extraction(db, doc, layout, force_type)
        period = db.get(ReportingPeriod, doc.period_id)
        if period:
            period.data_changed_at = utcnow()
        db.commit()
    except Exception as exc:  # jangan biarkan job gagal diam-diam
        log.exception("Gagal memproses dokumen %s", doc_id)
        db.rollback()
        doc = db.get(Document, doc_id)
        if doc:
            doc.status = "failed"
            doc.error = f"Gagal diproses: {exc}"[:1000]
            db.commit()
    finally:
        db.close()
