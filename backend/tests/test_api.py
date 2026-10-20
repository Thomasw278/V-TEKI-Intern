"""Uji alur API dari ujung ke ujung memakai SQLite sementara (tanpa MySQL).

Jalankan setelah `pip install -r requirements.txt`:  pytest -q
Alur: daftar perusahaan → unggah 21 dokumen demo → validasi (operator) →
setujui faktor (reviewer) → hitung → kunci periode → ekspor.
"""
import os
import tempfile
import unittest

try:
    import fastapi  # noqa: F401
    import sqlalchemy  # noqa: F401
    HAVE_DEPS = True
except ImportError:  # dependensi belum terpasang
    HAVE_DEPS = False

if HAVE_DEPS:
    _tmp = tempfile.mkdtemp()
    os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
    os.environ["STORAGE_DIR"] = f"{_tmp}/storage"
    os.environ["JWT_SECRET"] = "test-secret-yang-cukup-panjang-untuk-hs256"
    from fastapi.testclient import TestClient

    from app.core.demo_data import DEMO_DIR, DEMO_FILES_COUNTED, demo_documents
    from app.main import app


@unittest.skipUnless(HAVE_DEPS, "jalankan setelah pip install -r requirements.txt")
class ApiFlowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx = TestClient(app)
        cls.c = cls.ctx.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.ctx.__exit__(None, None, None)

    def h(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_full_flow(self):
        c = self.c
        reg = c.post("/api/auth/register", json={
            "company": {"name": "PT Uji Sawit", "province": "Riau", "city": "Siak"},
            "facilities": [{"name": "PKS Uji", "type": "pabrik"}],
            "products": [{"code": "CPO", "name": "Crude palm oil", "price_per_kg": 12000},
                         {"code": "PKO", "name": "Palm kernel oil", "price_per_kg": 19000}],
            "admin": {"name": "Admin", "email": "admin@uji.id", "password": "rahasia123"},
            "first_year": 2025,
        })
        self.assertEqual(reg.status_code, 201, reg.text)
        admin = reg.json()["access_token"]
        period_id = reg.json()["periods"][0]["id"]

        # login ulang & duplikat email
        self.assertEqual(c.post("/api/auth/login", json={"email": "admin@uji.id", "password": "salah"}).status_code, 401)
        self.assertEqual(c.post("/api/auth/login", json={"email": "admin@uji.id", "password": "rahasia123"}).status_code, 200)

        # admin membuat operator & reviewer
        for email, role in (("op@uji.id", "operator"), ("rev@uji.id", "reviewer")):
            r = c.post("/api/company/users", headers=self.h(admin),
                       json={"name": role, "email": email, "role": role, "password": "rahasia123"})
            self.assertEqual(r.status_code, 201, r.text)
        op = c.post("/api/auth/login", json={"email": "op@uji.id", "password": "rahasia123"}).json()["access_token"]
        rev = c.post("/api/auth/login", json={"email": "rev@uji.id", "password": "rahasia123"}).json()["access_token"]

        # unggah dokumen demo: teks + XLSX + PDF (background task diproses sinkron oleh TestClient)
        uploads = [(n, t, txt.encode()) for n, t, txt in demo_documents(2025)]
        uploads += [(n, t, (DEMO_DIR / n).read_bytes()) for n, t in DEMO_FILES_COUNTED]
        for name, type_code, raw in uploads:
            data = {"type_code": type_code} if type_code else {}
            r = c.post(f"/api/periods/{period_id}/documents", headers=self.h(op), data=data,
                       files=[("files", (name, raw, "application/octet-stream"))])
            self.assertEqual(r.status_code, 201, r.text)
        # duplikat persis ditolak
        n, t, raw = uploads[0]
        r = c.post(f"/api/periods/{period_id}/documents", headers=self.h(op), files=[("files", (n, raw, "text/plain"))])
        self.assertEqual(r.status_code, 409)

        docs = c.get(f"/api/periods/{period_id}/documents", headers=self.h(op)).json()
        self.assertEqual(len(docs), len(uploads))
        for d in docs:
            self.assertEqual(d["status"], "needs_review", d)
            r = c.post(f"/api/documents/{d['id']}/validate", headers=self.h(op))
            self.assertEqual(r.status_code, 200, r.text)
        # dokumen tabel: 12 baris + kotak sumber + pratinjau sel
        xl = next(d for d in docs if d["original_name"].endswith(".xlsx"))
        det = c.get(f"/api/documents/{xl['id']}", headers=self.h(op)).json()
        self.assertEqual(len({f["item"] for f in det["fields"]}), 12)
        self.assertEqual(det["layout"]["pages"][0]["kind"], "sheet")
        pdf = next(d for d in docs if d["original_name"].startswith("rekap_produksi"))
        img = c.get(f"/api/documents/{pdf['id']}/pages/1", headers=self.h(op))
        self.assertEqual(img.status_code, 200)
        self.assertEqual(img.content[:4], b"\x89PNG")
        act = c.get(f"/api/periods/{period_id}/activity", headers=self.h(op)).json()
        self.assertTrue(any(r["metric"] == "Listrik dibeli" and r["value"] == 2400000 for r in act["rows"]))

        # viewer tidak boleh; reviewer menyetujui semua faktor
        for f in c.get("/api/factors", headers=self.h(rev)).json():
            if f["status"] == "draft":
                self.assertEqual(c.post(f"/api/factors/{f['id']}/approve", headers=self.h(op)).status_code, 403)
                self.assertEqual(c.post(f"/api/factors/{f['id']}/approve", headers=self.h(rev)).status_code, 200)

        calc = c.post(f"/api/periods/{period_id}/calculate", headers=self.h(op), json={})
        self.assertEqual(calc.status_code, 200, calc.text)
        alloc = {a["code"]: a for a in calc.json()["allocations"]}
        self.assertAlmostEqual(alloc["CPO"]["see_total"], 1.006, places=3)
        self.assertAlmostEqual(alloc["PKO"]["see_total"], 1.594, places=3)

        dash = c.get(f"/api/periods/{period_id}/dashboard", headers=self.h(admin)).json()
        self.assertEqual(round(dash["calculation"]["total_t"]), 30778)

        # operator tidak boleh mengunci; reviewer boleh
        self.assertEqual(c.post(f"/api/periods/{period_id}/lock", headers=self.h(op)).status_code, 403)
        gates = c.get(f"/api/periods/{period_id}/gates", headers=self.h(rev)).json()
        self.assertTrue(all(g["ok"] for g in gates), gates)
        self.assertEqual(c.post(f"/api/periods/{period_id}/lock", headers=self.h(rev)).status_code, 200)
        # periode terkunci → unggah ditolak
        r = c.post(f"/api/periods/{period_id}/documents", headers=self.h(op),
                   files=[("files", ("baru.txt", b"solar 10 liter", "text/plain"))])
        self.assertEqual(r.status_code, 409)

        x = c.get(f"/api/periods/{period_id}/export.xlsx", headers=self.h(admin))
        self.assertEqual(x.status_code, 200)
        self.assertTrue(x.content[:2] == b"PK")
        x = c.get(f"/api/periods/{period_id}/export.xml", headers=self.h(admin))
        self.assertIn(b"SpecificEmbeddedEmissionsTotal", x.content)

    def test_tenant_isolation(self):
        c = self.c

        def reg(email, name):
            return c.post("/api/auth/register", json={
                "company": {"name": name}, "products": [{"code": "CPO", "name": "CPO"}],
                "admin": {"name": "A", "email": email, "password": "rahasia123"}, "first_year": 2025}).json()
        a = reg("a@isolasi.id", "PT A Isolasi")
        b = reg("b@isolasi.id", "PT B Isolasi")
        pa = a["periods"][0]["id"]
        r = c.get(f"/api/periods/{pa}/dashboard", headers=self.h(b["access_token"]))
        self.assertEqual(r.status_code, 404)  # perusahaan B tidak bisa melihat periode A


if __name__ == "__main__":
    unittest.main()
