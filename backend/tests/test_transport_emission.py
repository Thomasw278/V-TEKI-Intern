"""Unit test modul katalog, ekstraksi, validasi, dan agregasi emisi transport (BBM langsung & fallback ton-km)."""
from decimal import Decimal
import unittest

from app.core.catalog import DEFAULT_FACTORS, DOC_TYPE_BY_CODE, fossil_fraction, fuel_factor_code
from app.core.rules import RULES
from app.core.layout import layout_from_text
from app.core.extraction import extract
from app.core.aggregation import DocInput, ProductSpec, build_activity
from app.core.engine import calculate, ActivityData, FuelEntry
from app.core.validation import validate_document


class TestTransportCatalog(unittest.TestCase):
    def test_transport_doctype_fields(self):
        dt = DOC_TYPE_BY_CODE.get("transport")
        self.assertIsNotNone(dt)

        vl = dt.field("volume_l")
        self.assertIsNotNone(vl)
        self.assertEqual(vl.unit, "L")
        self.assertEqual(vl.kind, "number")
        self.assertFalse(vl.required)

        ft = dt.field("fuel_type")
        self.assertIsNotNone(ft)
        self.assertEqual(ft.kind, "text")
        self.assertFalse(ft.required)
        self.assertEqual(ft.default, "solar")

        # Fallback fields
        lt = dt.field("load_t")
        self.assertIsNotNone(lt)
        self.assertFalse(lt.required)

        dk = dt.field("distance_km")
        self.assertIsNotNone(dk)
        self.assertFalse(dk.required)


class TestTransportRulesAndExtraction(unittest.TestCase):
    def test_transport_rules_exist(self):
        tr = RULES.get("transport")
        self.assertIsNotNone(tr)
        self.assertIsNotNone(tr.get("volume_l"))
        self.assertIsNotNone(tr.get("fuel_type"))
        self.assertIsNotNone(tr.get("load_t"))
        self.assertIsNotNone(tr.get("distance_km"))

    def test_extract_transport_fuel(self):
        text = """
        PT LOGISTIK MAJU BERSAMA
        SURAT JALAN ANGKUTAN TRUK
        Moda: Truk Tronton
        Bahan Bakar: Biosolar B35
        Konsumsi BBM: 450 Liter
        """
        layout = layout_from_text(text)
        res = extract(layout, "transport")
        self.assertTrue(len(res.items) >= 1)
        item0 = res.items[0]
        self.assertIn("volume_l", item0)
        self.assertEqual(item0["volume_l"].value, "450")
        if "fuel_type" in item0:
            self.assertIn("B35", item0["fuel_type"].value)


class TestTransportAggregation(unittest.TestCase):
    def setUp(self):
        self.factors = {f.code: f.value for f in DEFAULT_FACTORS}
        self.products = [ProductSpec("CPO", "Crude Palm Oil", Decimal("10000"))]
        self.prod_doc = DocInput(
            id=99,
            type_code="produksi",
            status="validated",
            fields={"ffb_processed_t": 5000, "cpo_t": 1000},
            name="prod.pdf",
        )

    def test_direct_fuel_solar(self):
        doc = DocInput(
            id=1,
            type_code="transport",
            status="validated",
            fields={"volume_l": 1000, "fuel_type": "solar", "mode": "truk"},
            name="sj_solar.pdf",
        )
        act = build_activity([doc, self.prod_doc], self.products, self.factors)
        self.assertEqual(len(act.fuels), 1)
        self.assertEqual(act.fuels[0].fuel_type, "solar")
        self.assertEqual(act.fuels[0].volume_l, Decimal("1000"))
        self.assertEqual(act.transport_tkm, Decimal("0"))

        # Cek trace
        traces = [t for t in act.trace if t["category"] == "transport"]
        self.assertEqual(len(traces), 1)
        self.assertEqual(traces[0]["metric"], "Volume solar (truk)")
        self.assertEqual(traces[0]["unit"], "L")
        self.assertEqual(traces[0]["value"], 1000.0)

        # Cek kalkulasi emisi: 1000 L * 1.00 (solar murni) * 2.68 / 1000 = 2.68 t CO2e
        res = calculate(act, self.factors)
        bbm_line = next(line for line in res.lines if line.key == "bbm")
        self.assertEqual(bbm_line.value_t, Decimal("2.68"))

    def test_direct_fuel_b35(self):
        doc = DocInput(
            id=2,
            type_code="transport",
            status="validated",
            fields={"volume_l": "2000", "fuel_type": "b35"},
            name="sj_b35.pdf",
        )
        act = build_activity([doc, self.prod_doc], self.products, self.factors)
        self.assertEqual(len(act.fuels), 1)
        self.assertEqual(act.fuels[0].fuel_type, "b35")
        self.assertEqual(act.fuels[0].volume_l, Decimal("2000"))

        # B35 -> fraksi fosil 0.65 -> emisi fosil: 2000 * 0.65 * 2.68 / 1000 = 3.484 t CO2e
        res = calculate(act, self.factors)
        bbm_line = next(line for line in res.lines if line.key == "bbm")
        self.assertEqual(bbm_line.value_t, Decimal("3.484"))
        self.assertEqual(res.biogenic_co2_t, Decimal("1.876"))

    def test_direct_fuel_default_to_solar_if_unspecified(self):
        doc = DocInput(
            id=3,
            type_code="transport",
            status="validated",
            fields={"volume_l": "500"},
            name="sj_no_fuel_type.pdf",
        )
        act = build_activity([doc, self.prod_doc], self.products, self.factors)
        self.assertEqual(len(act.fuels), 1)
        self.assertEqual(act.fuels[0].fuel_type, "solar")
        self.assertEqual(act.fuels[0].volume_l, Decimal("500"))

    def test_fallback_to_ton_km(self):
        doc = DocInput(
            id=4,
            type_code="transport",
            status="validated",
            fields={"load_t": 25, "distance_km": 100, "mode": "truk"},
            name="sj_tkm.pdf",
        )
        act = build_activity([doc, self.prod_doc], self.products, self.factors)
        self.assertEqual(len(act.fuels), 0)
        self.assertEqual(act.transport_tkm, Decimal("2500"))

        traces = [t for t in act.trace if t["category"] == "transport"]
        self.assertEqual(len(traces), 1)
        self.assertEqual(traces[0]["metric"], "Angkutan truk")
        self.assertEqual(traces[0]["unit"], "t-km")
        self.assertEqual(traces[0]["value"], 2500.0)

        # 2500 t-km * 0.10 / 1000 = 0.25 t CO2e
        res = calculate(act, self.factors)
        trans_line = next(line for line in res.lines if line.key == "transport")
        self.assertEqual(trans_line.value_t, Decimal("0.25"))

    def test_validation_transport_documents(self):
        # Dokumen valid dengan volume_l
        issues_vol = validate_document("transport", {"volume_l": "100", "fuel_type": "solar"}, {}, {})
        self.assertEqual(len(issues_vol), 0)

        # Dokumen valid dengan ton-km
        issues_tkm = validate_document("transport", {"load_t": "20", "distance_km": "50"}, {}, {})
        self.assertEqual(len(issues_tkm), 0)

        # Dokumen kosong / tanpa data kuantitas
        issues_empty = validate_document("transport", {"mode": "truk"}, {}, {})
        self.assertTrue(any(i.code == "FIELD_MISSING" for i in issues_empty))


class TestOtherDocTypesNonRegression(unittest.TestCase):
    def setUp(self):
        self.factors = {f.code: f.value for f in DEFAULT_FACTORS}
        self.products = [ProductSpec("CPO", "Crude Palm Oil", Decimal("10000"))]

    def test_all_doctypes_aggregate_and_calculate(self):
        docs = [
            DocInput(1, "bbm", "validated", fields={"volume_l": 5000, "fuel_type": "solar"}),
            DocInput(2, "listrik", "validated", fields={"kwh_purchased": 100000, "billing_month": "2025-01"}),
            DocInput(3, "pupuk", "validated", fields={"mass_kg": 2000, "n_content_pct": 46, "fertilizer_type": "urea"}),
            DocInput(4, "lahan", "validated", fields={"area_ha": 50, "soil_type": "gambut"}),
            DocInput(5, "produksi", "validated", fields={"ffb_processed_t": 1000, "cpo_t": 220}),
            DocInput(6, "pome", "validated", fields={"volume_m3": 600, "cod_in_mgl": 50000, "cod_out_mgl": 5000}),
            DocInput(7, "b3", "validated", fields={"mass_t": 5, "treatment": "insinerasi"}),
            DocInput(8, "material", "validated", fields={"material_name": "heksana", "quantity_t": 10, "see_supplier": 1.2}),
            DocInput(9, "air", "validated", fields={"water_m3": 5000, "source": "sungai"}),
            DocInput(10, "transport", "validated", fields={"volume_l": 800, "fuel_type": "b40"}),
        ]
        act = build_activity(docs, self.products, self.factors)
        self.assertEqual(len(act.fuels), 2)  # bbm + transport
        self.assertEqual(act.electricity_purchased_mwh, Decimal("100"))
        self.assertEqual(act.peat_area_ha, Decimal("50"))

        res = calculate(act, self.factors)
        self.assertGreater(res.total_t, Decimal("0"))
        self.assertGreater(res.direct_t, Decimal("0"))
        self.assertGreater(res.indirect_t, Decimal("0"))
        self.assertGreater(res.upstream_t, Decimal("0"))


if __name__ == "__main__":
    unittest.main()
