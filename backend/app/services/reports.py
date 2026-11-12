"""Ekspor laporan: XLSX (lengkap dengan jejak data) dan XML gaya komunikasi emisi CBAM."""
from __future__ import annotations

import io
import xml.etree.ElementTree as ET

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Calculation, Company, Document, Product, ReportingPeriod

HEAD = Font(bold=True, color="FFFFFF", size=10)
HEAD_FILL = PatternFill("solid", fgColor="13432C")
TITLE = Font(bold=True, size=14, color="0E2C1F")
SUBTITLE = Font(size=10, color="57534E")
LABEL = Font(bold=True, color="2E2E2C")
THIN = Side(style="thin", color="E2DFD7")
ROW_LINE = Border(bottom=THIN)
STATUS_FILL = {"final": PatternFill("solid", fgColor="E6F3EA"), "draft": PatternFill("solid", fgColor="FDF0D5")}
STATUS_FONT = {"final": Font(bold=True, color="0F5C2A"), "draft": Font(bold=True, color="7C3A06")}
# format angka Excel: ribuan + desimal tetap, supaya laporan rapi saat dicetak
T3, T6, PCT, INT = "#,##0.000", "#,##0.000000", "0.0%", "#,##0"


def _sheet(wb: Workbook, title: str, header: list[str], rows: list[list], first: bool = False, *,
           caption: tuple[str, str] | None = None, formats: dict[int, str] | None = None,
           widths: dict[int, int] | None = None, wrap: set[int] | None = None, filters: bool = False):
    """Satu lembar laporan: kop (judul + subjudul), judul kolom, baris data, format angka, dan pengaturan cetak."""
    ws = wb.active if first else wb.create_sheet()
    ws.title = title
    head_row = 1
    if caption:
        ws.append([caption[0]])
        ws.append([caption[1]])
        ws.append([])
        ws["A1"].font, ws["A2"].font = TITLE, SUBTITLE
        head_row = 4
    ws.append(header)
    for c in ws[head_row]:
        c.font, c.fill = HEAD, HEAD_FILL
        c.alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[head_row].height = 30
    for r in rows:
        ws.append(r)
    last = ws.max_row
    for row in ws.iter_rows(min_row=head_row + 1, max_row=last):
        for i, cell in enumerate(row, start=1):
            cell.border = ROW_LINE
            cell.alignment = Alignment(vertical="top", wrap_text=bool(wrap and i in wrap))
            if formats and i in formats and isinstance(cell.value, (int, float)):
                cell.number_format = formats[i]
    for i, h in enumerate(header, start=1):
        width = (widths or {}).get(i) or max([len(str(h))] + [len(str(r[i - 1])) for r in rows if i - 1 < len(r)] + [8])
        ws.column_dimensions[get_column_letter(i)].width = min(60, width + 2)
    ws.freeze_panes = f"A{head_row + 1}"
    if filters and rows:
        ws.auto_filter.ref = f"A{head_row}:{get_column_letter(len(header))}{last}"
    # cetak: lanskap, muat selebar halaman, judul kolom diulang, nomor halaman di kaki
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
    ws.print_title_rows = f"{head_row}:{head_row}"
    ws.oddFooter.left.text = "KarbonLens · &A"
    ws.oddFooter.right.text = "Halaman &P dari &N"
    return ws


def _source_label(source: str | None) -> str:
    source = source or "default"
    if source.startswith("profile:"):
        return "Profil kebutuhan"
    if source.startswith("exception:"):
        return "Permintaan pengecualian disetujui"
    return {"default": "Default katalog", "manual": "Diatur superadmin"}.get(source, source)


DOC_STATUS = {"uploaded": "Antre", "processing": "Sedang dibaca", "needs_review": "Perlu diperiksa", "validated": "Diajukan",
              "approved": "Disetujui", "rejected": "Dikembalikan", "failed": "Gagal dibaca"}
GROUP = {"direct": "Langsung", "indirect": "Tidak langsung", "upstream": "Hulu"}


def build_xlsx(db: Session, period: ReportingPeriod, calc: Calculation) -> bytes:
    company = db.get(Company, period.company_id)
    products = {p.code: p for p in db.scalars(select(Product).where(Product.company_id == company.id))}
    res = calc.result
    excluded = res.get("excluded", [])
    final = period.status == "locked"
    wb = Workbook()
    wb.properties.creator = "KarbonLens"
    wb.properties.title = f"Laporan emisi tertanam {company.name} {period.year}"
    sub = f"{company.name} · Periode 1 Januari – 31 Desember {period.year} · Kalkulasi v{calc.version} ({calc.gwp_set})"

    ws = _sheet(wb, "Ringkasan", ["Item", "Nilai"], [
        ["Perusahaan", company.name], ["Alamat", ", ".join(x for x in [company.address, company.city, company.province] if x) or "-"],
        ["Periode", period.year],
        ["Status laporan", f"FINAL · revisi {period.version}" if final else "DRAF · bukan untuk pelaporan resmi"],
        ["Versi kalkulasi", calc.version],
        ["Dihitung pada", calc.created_at.strftime("%d-%m-%Y %H:%M") + " UTC" if calc.created_at else "-"],
        ["Set GWP", f"IPCC {calc.gwp_set}"], ["Metode alokasi", "Ekonomi (nilai jual)" if calc.allocation_method == "economic" else "Massa"],
        ["Emisi langsung (t CO2e)", float(calc.direct_t)], ["Emisi tidak langsung (t CO2e)", float(calc.indirect_t)],
        ["Emisi hulu (t CO2e)", float(calc.upstream_t)], ["Total emisi tertanam (t CO2e)", float(calc.total_t)],
        ["CO2 biogenik, dilaporkan terpisah (t)", float(res.get("biogenic_co2_t", 0) or 0)],
        ["Kategori memakai nilai bawaan", ", ".join(res.get("defaults_used", {}).keys()) or "-"],
        ["Kategori dikecualikan (tidak berlaku)", ", ".join(x["name"] for x in excluded) or "-"],
        ["Faktor emisi draf", "Ya, ada faktor yang belum disetujui" if calc.has_draft_factors else "Tidak, semua disetujui"],
    ], first=True, caption=("Laporan emisi tertanam produk", sub), formats={2: T3}, widths={1: 38, 2: 54}, wrap={2})
    for row in ws.iter_rows(min_row=5, max_row=ws.max_row):
        row[0].font = LABEL
        row[1].alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        if row[0].value == "Status laporan":
            key = "final" if final else "draft"
            row[1].fill, row[1].font = STATUS_FILL[key], STATUS_FONT[key]
        if row[0].value == "Total emisi tertanam (t CO2e)":
            row[0].font = row[1].font = Font(bold=True, size=12, color="0E2C1F")

    _sheet(wb, "SEE per produk", ["Kode", "Produk", "Kode CN", "Tonase (t)", "Porsi alokasi", "SEE langsung (t CO2e/t)",
                                  "SEE tidak langsung (t CO2e/t)", "SEE total (t CO2e/t)"], [
        [a["code"], a["name"], (products.get(a["code"]).cn_code if products.get(a["code"]) else "") or "-",
         a["tonnes"], a["share"], a["see_direct"], a["see_indirect"], a["see_total"]]
        for a in res.get("allocations", [])
    ], caption=("Emisi tertanam spesifik (SEE) per produk", sub), formats={4: T3, 5: PCT, 6: T6, 7: T6, 8: T6})
    _sheet(wb, "Rincian komponen", ["Komponen", "Kelompok", "Scope", "Data aktivitas", "Faktor", "Rumus", "Perhitungan",
                                    "t CO2e", "Sumber data"], [
        [ln["name"], GROUP.get(ln["group"], ln["group"]), ln["scope"], ln["activity"], ln["factor"], ln["formula"], ln["calc"],
         ln["value_t"], "Nilai bawaan" if ln["source"] == "default" else "Dokumen"]
        for ln in res.get("lines", [])
    ], caption=("Rincian komponen emisi", sub), formats={8: T3}, widths={6: 40, 7: 48}, wrap={4, 5, 6, 7})
    # "Tidak berlaku" ≠ "data tidak tersedia": kategori ini dikeluarkan dari perhitungan, bukan diisi 0
    _sheet(wb, "Kategori dikecualikan", ["Kode", "Kategori", "Alasan", "Ditetapkan oleh", "Waktu", "Asal penetapan"], [
        [x["code"], x["name"], x.get("reason") or "-", x.get("set_by") or "Default katalog",
         (x.get("set_at") or "")[:16].replace("T", " "), _source_label(x.get("source"))]
        for x in excluded
    ] or [["-", "Tidak ada kategori yang dikecualikan", "", "", "", ""]],
        caption=("Kategori yang dikecualikan dari perhitungan", "Kategori ini tidak berlaku untuk perusahaan, bukan diisi nol."),
        widths={3: 50}, wrap={3})
    cb = res.get("cbam")
    if cb:
        # pembanding menurut batas CBAM (Reg. (EU) 2023/956 Annex IV): hanya instalasi, hanya CO2, alokasi massa
        rows_cb = [[ln["name"], {"direct": "Langsung", "indirect": "Tidak langsung", "precursor": "Prekursor"}.get(ln["kind"], ln["kind"]),
                    ln["formula"], ln["calc"], ln["value_t"], "Masuk batas CBAM"] for ln in cb.get("lines", [])]
        rows_cb += [[o["name"], "-", "-", "-", o["value_t"], f"Di luar batas: {o['reason']}"] for o in cb.get("outside", [])]
        rows_cb += [["Total emisi tertanam (batas CBAM)", "-", "SEE = (AttrEm + Σ M·SEE) / AL", "-", cb.get("embedded_total_t"), "Dibulatkan ke ton utuh"]]
        rows_cb += [[f"SEE {a['code']} (dir / indir / total)", "Alokasi massa", "-",
                     f"{a['see_dir']:.5f} / {a['see_indir']:.5f}", a["see_total"], f"AL {a['tonnes']:.3f} t"] for a in cb.get("allocations", [])]
        _sheet(wb, "Batas CBAM", ["Komponen", "Jenis", "Rumus", "Perhitungan", "t CO2e", "Keterangan"], rows_cb,
               caption=("Emisi tertanam menurut batas CBAM", cb.get("basis", "Regulasi (EU) 2023/956 Annex IV")),
               formats={5: T3}, widths={1: 40, 3: 46, 4: 40, 6: 60}, wrap={3, 4, 6})
    _sheet(wb, "Faktor emisi", ["Kode", "Nilai", "Satuan", "Status", "Versi", "Sumber"], [
        [k, float(v["value"]), v["unit"], "Disetujui" if v["status"] == "approved" else "Draf", v["version"], v["source"]]
        for k, v in (calc.factors_snapshot or {}).items()
    ], caption=("Faktor emisi yang dipakai", sub), formats={2: "#,##0.########"}, widths={6: 44}, wrap={6})
    docs = db.scalars(select(Document).where(Document.period_id == period.id).options(selectinload(Document.fields))
                      .order_by(Document.type_code, Document.id)).all()
    rows = []
    for d in docs:
        for f in d.fields:
            value = float(f.value_num) if f.value_num is not None else f.value_text
            rows.append([d.id, d.original_name, d.type_code or "-", DOC_STATUS.get(d.status, d.status), f.item + 1 if f.item else 1,
                         f.label, value, f.unit or "", float(f.confidence or 0), "Ya" if f.confirmed else "Tidak",
                         f.page + 1 if f.page is not None else "", (f.snippet or "")[:200]])
    _sheet(wb, "Data aktivitas", ["ID dok", "Berkas", "Kategori", "Status", "Baris", "Field", "Nilai", "Satuan", "Keyakinan",
                                  "Dikonfirmasi", "Hal.", "Kutipan sumber"], rows,
           caption=("Jejak data: setiap angka beserta dokumen sumbernya", sub), formats={7: "#,##0.###", 9: "0%"},
           widths={2: 28, 12: 50}, wrap={12}, filters=True)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_xml(db: Session, period: ReportingPeriod, calc: Calculation) -> bytes:
    """Struktur sederhana mengikuti isi template komunikasi emisi CBAM.

    Catatan: ini BUKAN skema XSD resmi registri CBAM; sesuaikan dengan
    format yang diminta importir/registri sebelum dikirim.
    """
    company = db.get(Company, period.company_id)
    products = {p.code: p for p in db.scalars(select(Product).where(Product.company_id == company.id))}
    root = ET.Element("EmissionsCommunication", {"version": "1.0", "status": period.status})
    inst = ET.SubElement(root, "Installation")
    for tag, val in [("OperatorName", company.name), ("Address", company.address or ""), ("City", company.city or ""),
                     ("Region", company.province or ""), ("Country", "ID"), ("PostalCode", company.postal_code or "")]:
        ET.SubElement(inst, tag).text = val
    rp = ET.SubElement(root, "ReportingPeriod")
    ET.SubElement(rp, "Start").text = f"{period.year}-01-01"
    ET.SubElement(rp, "End").text = f"{period.year}-12-31"
    meth = ET.SubElement(root, "Methodology")
    ET.SubElement(meth, "GWPSet").text = calc.gwp_set
    ET.SubElement(meth, "AllocationMethod").text = calc.allocation_method
    ET.SubElement(meth, "CalculationVersion").text = str(calc.version)
    goods = ET.SubElement(root, "Goods")
    for a in calc.result.get("allocations", []):
        g = ET.SubElement(goods, "Good")
        p = products.get(a["code"])
        ET.SubElement(g, "ProductCode").text = a["code"]
        ET.SubElement(g, "Name").text = a["name"]
        ET.SubElement(g, "CNCode").text = (p.cn_code if p else "") or ""
        ET.SubElement(g, "ProductionTonnes").text = f"{a['tonnes']:.3f}"
        ET.SubElement(g, "SpecificEmbeddedEmissionsDirect", unit="tCO2e/t").text = f"{a['see_direct']:.6f}"
        ET.SubElement(g, "SpecificEmbeddedEmissionsIndirect", unit="tCO2e/t").text = f"{a['see_indirect']:.6f}"
        ET.SubElement(g, "SpecificEmbeddedEmissionsTotal", unit="tCO2e/t").text = f"{a['see_total']:.6f}"
    tot = ET.SubElement(root, "InstallationTotals", unit="tCO2e")
    ET.SubElement(tot, "Direct").text = f"{float(calc.direct_t):.3f}"
    ET.SubElement(tot, "Indirect").text = f"{float(calc.indirect_t):.3f}"
    ET.SubElement(tot, "Upstream").text = f"{float(calc.upstream_t):.3f}"
    excluded = calc.result.get("excluded", [])
    if excluded:
        ex = ET.SubElement(root, "ExcludedCategories")
        for x in excluded:
            attrs = {"code": x["code"], "name": x["name"]}
            if x.get("set_by"):
                attrs["setBy"] = x["set_by"]
            if x.get("set_at"):
                attrs["setAt"] = x["set_at"]
            ET.SubElement(ex, "Category", attrs).text = x.get("reason") or ""
    defaults = calc.result.get("defaults_used", {})
    if defaults:
        dv = ET.SubElement(root, "DefaultValuesUsed")
        for k, why in defaults.items():
            ET.SubElement(dv, "Category", code=k).text = why
    ET.indent(root)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)
