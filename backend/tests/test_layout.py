"""Uji mesin tata letak: informasi di kanan, bawah, atas, tabel multi-halaman, formulir kotak, matriks,
XLSX/CSV/DOCX, serta scan miring/diputar (OCR). Berkas uji ada di tests/fixtures (dibuat oleh make_fixtures.py)."""
import unittest
from decimal import Decimal
from pathlib import Path

from app.core import ocr
from app.core.extraction import classify_ranked, extract
from app.core.layout import build_layout

FIX = Path(__file__).parent / "fixtures"
PRODUCTS = [("CPO", "Crude palm oil"), ("PKO", "Palm kernel oil")]


def run(name: str):
    lay = build_layout(FIX / name)
    code = classify_ranked(lay.text, name)[0][0]
    return code, extract(lay, code, PRODUCTS), lay


def vals(res, key):
    return [it[key].value for it in res.items if key in it]


class LayoutExtractionTest(unittest.TestCase):
    def test_invoice_table_ignores_money_columns(self):
        code, res, _ = run("faktur_bbm_tabel.pdf")
        self.assertEqual(code, "bbm")
        self.assertEqual(res.mode, "tabel")
        self.assertEqual(vals(res, "volume_l"), ["12000", "4000"])       # bukan Rp 150.000.000
        self.assertTrue(all("B40" in v for v in vals(res, "fuel_type")))
        self.assertEqual(res.meta["doc_number"], "INV/BBM/2025/10/0921")
        self.assertEqual(res.meta["doc_date"], "2025-10-14")
        for it in res.items:
            self.assertIsNotNone(it["volume_l"].bbox)
            self.assertGreaterEqual(it["volume_l"].confidence, 0.9)

    def test_form_label_above_value_and_lwbp_wbp(self):
        code, res, _ = run("tagihan_pln_formulir.pdf")
        self.assertEqual(code, "listrik")
        it = res.items[0]
        self.assertEqual(it["kwh_purchased"].value, "198400")              # bukan 150.000 (LWBP) / stand meter
        self.assertGreaterEqual(it["kwh_purchased"].confidence, 0.9)
        self.assertEqual(it["billing_month"].value, "2025-08")             # bukan bulan jatuh tempo (09)
        self.assertEqual(it["customer_id"].value, "512345678901")

    def test_table_across_two_pages_with_total_check(self):
        code, res, _ = run("rekap_produksi_2_halaman.pdf")
        self.assertEqual(code, "produksi")
        self.assertEqual(len(res.items), 12)
        self.assertEqual(sum(Decimal(v) for v in vals(res, "ffb_processed_t")), Decimal(120000))
        self.assertEqual(sum(Decimal(v) for v in vals(res, "cpo_t")), Decimal(26400))
        self.assertEqual(sum(Decimal(v) for v in vals(res, "pko_t")), Decimal(2640))
        self.assertTrue(any("cocok" in n for n in res.notes))
        self.assertEqual({it["ffb_processed_t"].page for it in res.items}, {0, 1})

    def test_value_above_caption_and_year_not_a_quantity(self):
        _, res, _ = run("ringkasan_solar_angka_atas.pdf")
        self.assertEqual(res.items[0]["volume_l"].value, "1533400")

    def test_xlsx_monthly_rows_with_title_rows(self):
        code, res, lay = run("listrik_bulanan.xlsx")
        self.assertEqual(code, "listrik")
        self.assertEqual(len(res.items), 12)
        self.assertEqual(vals(res, "billing_month"), [f"2025-{m:02d}" for m in range(1, 13)])
        self.assertTrue(all(v == "200000" for v in vals(res, "kwh_purchased")))
        self.assertEqual(lay.pages[0].kind, "sheet")
        self.assertIn("r0", res.items[0]["kwh_purchased"].bbox)

    def test_xlsx_label_left_unit_cell_and_matrix(self):
        code, res, _ = run("lab_pome_label_kiri.xlsx")
        self.assertEqual(code, "pome")
        it = res.items[0]
        self.assertEqual(it["volume_m3"].value, "18000")
        self.assertEqual(it["cod_in_mgl"].value, "51200")                  # baris COD × kolom Inlet
        self.assertEqual(it["cod_out_mgl"].value, "4800")

    def test_csv_semicolon_items_and_n_inference(self):
        code, res, _ = run("rekap_pupuk_titik_koma.csv")
        self.assertEqual(code, "pupuk")
        self.assertEqual(len(res.items), 4)
        self.assertEqual(vals(res, "mass_kg"), ["42500", "18000", "10000", "25000"])
        n = {it["fertilizer_type"].value: it["n_content_pct"].value for it in res.items}
        self.assertEqual(n["Urea"], "46")
        self.assertEqual(n["Dolomit"], "0")                                 # sel kosong → kadar standar, bukan 15
        self.assertTrue(any("cocok" in x for x in res.notes))

    def test_docx_table(self):
        code, res, _ = run("manifest_b3.docx")
        self.assertEqual(code, "b3")
        self.assertEqual(vals(res, "mass_t"), ["12", "6.5"])
        self.assertEqual(res.meta["doc_number"], "MNF/B3/2025/044")


@unittest.skipUnless(ocr.available(), "Tesseract OCR belum terpasang")
class OcrTest(unittest.TestCase):
    def test_skewed_photo(self):
        code, res, lay = run("scan_pome_miring.jpg")
        self.assertEqual(code, "pome")
        it = res.items[0]
        self.assertEqual(it["volume_m3"].value, "18000")
        self.assertEqual(it["cod_in_mgl"].value, "51200")
        self.assertEqual(it["cod_out_mgl"].value, "4800")
        self.assertTrue(lay.pages[0].ocr)

    def test_rotated_image_only_pdf(self):
        code, res, lay = run("scan_bbm_diputar.pdf")
        self.assertEqual(code, "bbm")
        it = res.items[0]
        self.assertEqual(it["volume_l"].value, "8000")
        self.assertEqual(it["fuel_type"].value, "Biosolar B40")
        self.assertTrue(any("diputar" in w for w in lay.warnings))


if __name__ == "__main__":
    unittest.main()
