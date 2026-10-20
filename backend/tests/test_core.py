"""Unit test logika inti. Jalankan: python -m pytest  (atau python -m unittest)."""
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from app.core.aggregation import DocInput, ProductSpec, build_activity
from app.core.catalog import DEFAULT_FACTORS, fossil_fraction
from app.core.engine import (
    ActivityData, CalculationError, FuelEntry, MaterialEntry, ProductInput, WasteEntry, calculate, fmt_id,
)
from app.core.extraction import ExtractedText, classify, extract_fields, parse_number
from app.core.validation import parse_month, requirements, validate_document, validate_period

FACTORS = {f.code: f.value for f in DEFAULT_FACTORS}
D = Decimal


def sample_activity() -> ActivityData:
    """Data contoh yang sama dengan prototipe UI (SEE CPO 1,006)."""
    return ActivityData(
        fuels=[FuelEntry("Biosolar B40", D("1533400"))],
        electricity_purchased_mwh=D("2400"),
        n_applied_t=D("1450"),
        urea_t=D("1800"),
        pome_volume_m3=D("72000"),
        pome_delta_cod_kg_m3=D("45"),
        wastes=[WasteEntry(D("18"), "insinerasi")],
        transport_tkm=D("3000000"),
        materials=[MaterialEntry("bahan kimia", D("410"), D("1"))],
        products=[ProductInput("CPO", "Crude palm oil", D("26400"), D("12000")),
                  ProductInput("PKO", "Palm kernel oil", D("2640"), D("19000"))],
    )


class EngineTest(unittest.TestCase):
    def test_sample_matches_prototype(self):
        r = calculate(sample_activity(), FACTORS, "AR5", "economic")
        by = {ln.key: ln.value_t for ln in r.lines}
        self.assertEqual(round(by["bbm"]), 2466)
        self.assertEqual(round(by["listrik"]), 2088)
        self.assertEqual(round(by["pupuk_n2o"] + by["pupuk_urea"]), 7358)
        self.assertEqual(round(by["pome"]), 18144)
        self.assertEqual(round(r.total_t), 30778)
        cpo, pko = r.allocations
        self.assertEqual(round(cpo.see_total, 3), D("1.006"))
        self.assertEqual(round(cpo.see_direct, 3), D("0.938"))
        self.assertEqual(round(cpo.see_indirect, 3), D("0.068"))
        self.assertEqual(round(pko.see_total, 3), D("1.594"))
        self.assertAlmostEqual(float(cpo.share + pko.share), 1.0, places=9)

    def test_gwp_ar6_changes_pome_and_n2o(self):
        r5 = calculate(sample_activity(), FACTORS, "AR5")
        r6 = calculate(sample_activity(), FACTORS, "AR6")
        p5 = next(x.value_t for x in r5.lines if x.key == "pome")
        p6 = next(x.value_t for x in r6.lines if x.key == "pome")
        self.assertEqual(round(p6), 17496)
        self.assertLess(p6, p5)

    def test_mass_allocation(self):
        r = calculate(sample_activity(), FACTORS, "AR5", "mass")
        cpo, pko = r.allocations
        # alokasi massa → SEE sama untuk semua produk
        self.assertEqual(round(cpo.see_total, 6), round(pko.see_total, 6))

    def test_biogenic_part_separated(self):
        r = calculate(sample_activity(), FACTORS)
        self.assertEqual(round(r.biogenic_co2_t), round(D("1533400") * D("0.4") * D("2.68") / 1000))

    def test_no_products_raises(self):
        a = sample_activity()
        a.products = []
        with self.assertRaises(CalculationError):
            calculate(a, FACTORS)

    def test_fossil_fraction(self):
        self.assertEqual(fossil_fraction("Biosolar B40"), D("0.60"))
        self.assertEqual(fossil_fraction("B35"), D("0.65"))
        self.assertEqual(fossil_fraction("HSD"), D("1.00"))

    def test_fmt_id(self):
        self.assertEqual(fmt_id(D("1533400")), "1.533.400")
        self.assertEqual(fmt_id(D("0.9381"), 3), "0,938")


class AggregationTest(unittest.TestCase):
    def docs(self):
        return [
            DocInput(1, "bbm", "validated", {"fuel_type": "Biosolar B40", "volume_l": D("1533400")}),
            DocInput(2, "listrik", "validated", {"kwh_purchased": D("2400000"), "billing_month": "2025-01"}),
            DocInput(3, "pupuk", "validated", {"fertilizer_type": "Urea", "mass_kg": D("1800000"), "n_content_pct": D("46")}),
            DocInput(4, "pupuk", "validated", {"fertilizer_type": "NPK 15-15-6-4", "mass_kg": D("4146666.67"), "n_content_pct": D("15")}),
            DocInput(5, "produksi", "validated", {"ffb_processed_t": D("120000"), "cpo_t": D("26400"), "pko_t": D("2640")}),
            DocInput(6, "pome", "validated", {"volume_m3": D("72000"), "cod_in_mgl": D("50000"), "cod_out_mgl": D("5000")}),
            DocInput(7, "bbm", "needs_review", {"fuel_type": "solar", "volume_l": D("999999")}),
        ]

    def test_build_activity(self):
        prods = [ProductSpec("CPO", "CPO", D("12000")), ProductSpec("PKO", "PKO", D("19000"))]
        a = build_activity(self.docs(), prods, FACTORS)
        self.assertEqual(len(a.fuels), 1)  # dokumen needs_review tidak dihitung
        self.assertEqual(a.electricity_purchased_mwh, D("2400"))
        self.assertEqual(a.urea_t, D("1800"))
        self.assertAlmostEqual(float(a.n_applied_t), 828 + 622, delta=0.01)
        self.assertEqual(a.pome_delta_cod_kg_m3, D("45"))
        self.assertEqual([p.tonnes for p in a.products], [D("26400"), D("2640")])
        self.assertNotIn("pome", a.defaults_used)

    def test_pome_default_when_missing(self):
        docs = [x for x in self.docs() if x.type_code != "pome"]
        a = build_activity(docs, [ProductSpec("CPO", "CPO", D("1"))], FACTORS)
        self.assertIn("pome", a.defaults_used)
        self.assertEqual(a.pome_volume_m3, D("120000") * D("0.6"))


class ExtractionTest(unittest.TestCase):
    def test_parse_number(self):
        cases = {"1.533.400": "1533400", "16.000,50": "16000.50", "1,533,400.5": "1533400.5",
                 "0,72": "0.72", "45": "45", "2.68": "2.68", "16,000": "16000", "0.250": "0.250"}
        for raw, want in cases.items():
            self.assertEqual(parse_number(raw), D(want), raw)

    def test_classify_and_extract_invoice(self):
        text = ("PT Energi Sumatra Mandiri\nFAKTUR PENJUALAN BBM\nNo. INV/SOL/2025/10/0921  Tgl 14-10-2025\n"
                "Uraian  Jumlah\nBiosolar B40 industri  16.000 L\nKeterangan: untuk genset pabrik\n")
        code, conf = classify(text, "Faktur_solar_okt.pdf")
        self.assertEqual(code, "bbm")
        self.assertGreater(conf, 0.6)
        fields = {f.key: f for f in extract_fields("bbm", ExtractedText(text, [text], "txt"))}
        self.assertEqual(fields["volume_l"].value, "16000")
        self.assertIn("B40", fields["fuel_type"].value.upper())

    def test_extract_pome_and_pln(self):
        pome = "Laporan lab POME Q3\nVolume POME 18.000 m3\nCOD inlet 51.200 mg/L\nCOD outlet 4.800 mg/L\n"
        f = {x.key: x.value for x in extract_fields("pome", ExtractedText(pome, [pome], "txt"))}
        self.assertEqual(f["volume_m3"], "18000")
        self.assertEqual(f["cod_in_mgl"], "51200")
        self.assertEqual(f["cod_out_mgl"], "4800")
        pln = "TAGIHAN LISTRIK PLN\nID Pelanggan 512345678901\nPeriode Agustus 2025\nPemakaian total 198.400 kWh\n"
        self.assertEqual(classify(pln, "tagihan.pdf")[0], "listrik")
        f = {x.key: x.value for x in extract_fields("listrik", ExtractedText(pln, [pln], "txt"))}
        self.assertEqual(f["kwh_purchased"], "198400")
        self.assertEqual(parse_month(f["billing_month"]), (2025, 8))

    def test_extract_production_kg_to_t(self):
        txt = "Laporan produksi harian\nTBS diolah 1.200.000 kg\nCPO 264 ton\nKernel 26,4 ton\n"
        f = {x.key: x.value for x in extract_fields("produksi", ExtractedText(txt, [txt], "txt"))}
        self.assertEqual(D(f["ffb_processed_t"]), D("1200"))
        self.assertEqual(D(f["cpo_t"]), D("264"))
        self.assertEqual(D(f["pko_t"]), D("26.4"))

    def test_xlsx_text(self):
        from openpyxl import Workbook

        from app.core.extraction import extract
        from app.core.layout import build_layout
        wb = Workbook()
        ws = wb.active
        ws.append(["Jenis pupuk", "Massa", "Kadar N"])
        ws.append(["NPK 15-15-6-4", "42.500 kg", "N 15 %"])
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "rekap_pupuk.xlsx"
            wb.save(p)
            lay = build_layout(p)
        self.assertEqual(lay.method, "xlsx")
        self.assertEqual(classify(lay.text, p.name)[0], "pupuk")
        it = extract(lay, "pupuk").items[0]
        self.assertEqual(it["mass_kg"].value, "42500")
        self.assertEqual(it["n_content_pct"].value, "15")

    def test_money_and_dates_are_not_quantities(self):
        text = ("FAKTUR 12-10-2025\nHarga per liter Rp 12.500\nTotal bayar Rp 200.000.000\n"
                "Biosolar B40   16.000 L\nNo. Rekening 1234567890\n")
        f = {x.key: x.value for x in extract_fields("bbm", ExtractedText(text, [text], "txt"))}
        self.assertEqual(f["volume_l"], "16000")

    def test_ocr_digit_repair(self):
        from app.core.extraction import fix_ocr_token
        self.assertEqual(fix_ocr_token("1.5O0"), "1.500")
        self.assertEqual(fix_ocr_token("2l.4O0"), "21.400")
        self.assertEqual(fix_ocr_token("B40"), "B40")
        self.assertEqual(fix_ocr_token("SOLAR"), "SOLAR")


class ValidationTest(unittest.TestCase):
    def test_document_rules(self):
        iss = validate_document("pupuk", {"fertilizer_type": "NPK", "mass_kg": D("10"), "n_content_pct": D("60")}, {}, {})
        self.assertIn("N_RANGE", [i.code for i in iss])
        iss = validate_document("bbm", {"fuel_type": "solar"}, {}, {})
        self.assertIn("FIELD_MISSING", [i.code for i in iss])
        iss = validate_document("bbm", {"fuel_type": "solar", "volume_l": D("5")}, {"volume_l": 0.5}, {})
        self.assertIn("LOW_CONFIDENCE", [i.code for i in iss])
        iss = validate_document("bbm", {"fuel_type": "solar", "volume_l": D("5")}, {"volume_l": 0.5}, {"volume_l": True})
        self.assertEqual(iss, [])

    def test_period_rules(self):
        docs = AggregationTest().docs()
        docs = [x for x in docs if x.type_code != "pome"]
        prods = [ProductSpec("CPO", "CPO", D("12000")), ProductSpec("PKO", "PKO", D("19000"))]
        a = build_activity(docs, prods, FACTORS)
        iss = validate_period(docs, a, 2025, {"grid_ef": False, "diesel_co2": True})
        codes = [i.code for i in iss]
        self.assertIn("DEFAULT_USED", codes)       # POME nilai bawaan
        self.assertIn("CATEGORY_MISSING", codes)   # material & lahan belum ada
        self.assertIn("ELEC_MONTHS", codes)        # hanya Januari
        self.assertIn("PENDING_REVIEW", codes)
        self.assertIn("FACTOR_DRAFT", codes)
        req = {r["code"]: r["state"] for r in requirements(docs, a.defaults_used)}
        self.assertEqual(req["pome"], "default")
        self.assertEqual(req["bbm"], "partial")
        self.assertEqual(req["air"], "missing")


class ItemsTest(unittest.TestCase):
    def test_multi_item_aggregation_and_trace(self):
        docs = [
            DocInput(1, "pupuk", "validated", items=[
                {"fertilizer_type": "NPK 15-15-6-4", "mass_kg": D("1000"), "n_content_pct": D("15")},
                {"fertilizer_type": "Urea", "mass_kg": D("2000"), "n_content_pct": D("46")},
                {"fertilizer_type": "MOP", "mass_kg": D("500"), "n_content_pct": D("0")},
            ], name="rekap.csv"),
            DocInput(2, "transport", "validated", items=[
                {"load_t": D("10"), "distance_km": D("100")}, {"load_t": D("20"), "distance_km": D("5")}]),
            DocInput(3, "produksi", "validated", items=[{"ffb_processed_t": D("100"), "cpo_t": D("22")},
                                                        {"ffb_processed_t": D("50"), "cpo_t": D("11")}]),
        ]
        a = build_activity(docs, [ProductSpec("CPO", "CPO", D("1"))], FACTORS)
        self.assertEqual(a.n_applied_t, D("0.15") + D("0.92"))
        self.assertEqual(a.urea_t, D("2"))
        self.assertEqual(a.transport_tkm, D("1100"))       # per baris, bukan Σmuatan × Σjarak (3000)
        self.assertEqual(a.products[0].tonnes, D("33"))
        self.assertTrue(any(t["doc_name"] == "rekap.csv" and t["item"] == 1 for t in a.trace))

    def test_requirements_sub_items(self):
        docs = [DocInput(1, "listrik", "validated", items=[{"kwh_purchased": D("1"), "billing_month": f"2025-{m:02d}"}
                                                            for m in range(1, 9)])]
        req = {r["code"]: r for r in requirements(docs, {}, 2025)}
        months = next(x for x in req["listrik"]["items"] if x["key"] == "_months")
        self.assertEqual(months["state"], "partial")
        self.assertEqual(months["detail"], "8/12 bulan")
        self.assertEqual(req["listrik"]["state"], "partial")
        sold = next(x for x in req["listrik"]["items"] if x["key"] == "kwh_sold")
        self.assertEqual(sold["state"], "missing")

    def test_item_validation_refs(self):
        iss = validate_document("pupuk", [{"fertilizer_type": "NPK", "mass_kg": D("1"), "n_content_pct": D("15")},
                                          {"fertilizer_type": "Urea", "mass_kg": D("1")}], {}, {})
        self.assertEqual([(i.code, i.ref_id) for i in iss], [("FIELD_MISSING", "1:n_content_pct")])


if __name__ == "__main__":
    unittest.main()
