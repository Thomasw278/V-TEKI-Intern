"""Simulasi alur lengkap tanpa database: dokumen demo (teks, XLSX, PDF) → klasifikasi → ekstraksi → hitung."""
import unittest
from decimal import Decimal

from app.core.aggregation import DocInput, ProductSpec, build_activity
from app.core.catalog import DEFAULT_FACTORS
from app.core.demo_data import DEMO_DIR, DEMO_FILES_COUNTED, demo_documents
from app.core.engine import calculate
from app.core.extraction import classify_ranked, extract, parse_number
from app.core.catalog import DOC_TYPE_BY_CODE
from app.core.layout import build_layout, layout_from_text
from app.core.validation import validate_document, validate_period

PRODUCTS = [("CPO", "Crude palm oil"), ("PKO", "Palm kernel oil")]


def to_items(code, res):
    items = []
    for it in res.items:
        row = {}
        for k, f in it.items():
            spec = DOC_TYPE_BY_CODE[code].field(k)
            row[k] = parse_number(f.value) if spec and spec.kind == "number" else f.value
        items.append(row)
    return items


class DemoPipelineTest(unittest.TestCase):
    def test_demo_documents_reproduce_prototype(self):
        docs = []
        sources = [(n, t, layout_from_text(txt)) for n, t, txt in demo_documents(2025)]
        sources += [(n, t, build_layout(DEMO_DIR / n)) for n, t in DEMO_FILES_COUNTED]
        for i, (name, type_code, lay) in enumerate(sources, start=1):
            code = type_code or classify_ranked(lay.text, name)[0][0]
            items = to_items(code, extract(lay, code, PRODUCTS))
            crit = [x for x in validate_document(code, items, {}, {}) if x.severity == "critical"]
            self.assertEqual(crit, [], f"{name}: {crit} {items}")
            docs.append(DocInput(i, code, "validated", items=items, name=name))

        factors = {f.code: f.value for f in DEFAULT_FACTORS}
        prods = [ProductSpec("CPO", "CPO", Decimal("12000")), ProductSpec("PKO", "PKO", Decimal("19000"))]
        act = build_activity(docs, prods, factors)
        self.assertEqual(act.defaults_used, {})
        self.assertEqual(act.electricity_purchased_mwh, Decimal(2400))
        r = calculate(act, factors, "AR5", "economic")
        cpo, pko = r.allocations
        self.assertEqual(round(cpo.see_total, 3), Decimal("1.006"))
        self.assertEqual(round(pko.see_total, 3), Decimal("1.594"))
        self.assertEqual(round(r.total_t), 30778)
        codes = {i.code for i in validate_period(docs, act, 2025, {})}
        self.assertNotIn("ELEC_MONTHS", codes)      # 12 bulan dari XLSX
        self.assertNotIn("CATEGORY_MISSING", codes)
        self.assertNotIn("OER_RANGE", codes)        # rendemen 22%


if __name__ == "__main__":
    unittest.main()
