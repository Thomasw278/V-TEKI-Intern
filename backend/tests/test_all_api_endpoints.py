"""Comprehensive Integration & Unit Tests for all Carbon Lens FastAPI endpoints.
"""
from decimal import Decimal
import io
from pathlib import Path
import sys

# Ensure backend root is in sys.path when running from workspace root
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
import app.database
from app.main import app as fastapi_app
from app.models import AdminCompany, Company, Facility, Product, ReportingPeriod, User
from app.security import hash_password
from app.services.setup import seed_document_types
import app.services.pipeline

# Set up in-memory SQLite database for isolated testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Patch SessionLocal so background tasks (e.g. process_document) use test DB
app.database.SessionLocal = TestingSessionLocal
app.services.pipeline.SessionLocal = TestingSessionLocal


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


fastapi_app.dependency_overrides[get_db] = override_get_db
client = TestClient(fastapi_app)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as db:
        seed_document_types(db)
        # Create seed admin
        admin = User(
            name="Admin Peninjau",
            email="admin.test@karbonlens.id",
            role="admin",
            password_hash=hash_password("AdminSecret123!"),
            is_active=True,
        )
        db.add(admin)
        db.commit()
    yield
    Base.metadata.drop_all(bind=engine)


class TestCarbonLensAPI:
    tokens = {}
    ids = {}

    def test_01_health_check(self):
        res = client.get("/api/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}

    def test_02_register_company(self):
        payload = {
            "company": {
                "name": "PT Sawit Sejahtera Test",
                "legal_id": "ID-123456",
                "sector": "Kelapa sawit",
                "address": "Jl. Sawit Lestari 1",
                "province": "Riau",
                "city": "Pelalawan",
                "postal_code": "28300",
                "phone": "081234567890",
                "gwp_set": "AR5",
                "allocation_method": "economic",
                "grid_system": "sumatera",
                "pome_treatment": "open",
            },
            "facilities": [
                {
                    "name": "PKS Sejahtera Mill",
                    "type": "pabrik",
                    "area_ha": 3000,
                    "capacity_tph": 45,
                    "soil_type": "mineral",
                    "address": "Kecamatan Langgam",
                }
            ],
            "products": [
                {
                    "code": "CPO",
                    "name": "Crude Palm Oil",
                    "cn_code": "15111000",
                    "price_per_kg": 12000,
                },
                {
                    "code": "PK",
                    "name": "Palm Kernel",
                    "cn_code": "12071000",
                    "price_per_kg": 7000,
                },
            ],
            "account": {
                "name": "Budi Sutrisno",
                "email": "budi.test@sawitsejahtera.com",
                "password": "Password123!",
            },
            "first_year": 2024,
        }
        res = client.post("/api/auth/register", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert "access_token" in data
        assert data["user"]["email"] == "budi.test@sawitsejahtera.com"
        TestCarbonLensAPI.tokens["company"] = data["access_token"]
        TestCarbonLensAPI.ids["company_id"] = data["company"]["id"]
        TestCarbonLensAPI.ids["period_id"] = data["periods"][0]["id"]

    def test_03_login_company(self):
        res = client.post(
            "/api/auth/login",
            json={"email": "budi.test@sawitsejahtera.com", "password": "Password123!"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["user"]["role"] == "company"
        TestCarbonLensAPI.tokens["company"] = data["access_token"]

    def test_04_login_admin(self):
        res = client.post(
            "/api/auth/login",
            json={"email": "admin.test@karbonlens.id", "password": "AdminSecret123!"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["user"]["role"] == "admin"
        TestCarbonLensAPI.tokens["admin"] = data["access_token"]
        TestCarbonLensAPI.ids["admin_id"] = data["user"]["id"]

        # Link admin to company for testing admin reviews
        with TestingSessionLocal() as db:
            db.add(AdminCompany(admin_id=data["user"]["id"], company_id=TestCarbonLensAPI.ids["company_id"]))
            db.commit()

    def test_05_auth_me_and_profile_and_password(self):
        token = TestCarbonLensAPI.tokens["company"]
        headers = {"Authorization": f"Bearer {token}"}

        # Me
        res = client.get("/api/auth/me", headers=headers)
        assert res.status_code == 200
        assert res.json()["user"]["email"] == "budi.test@sawitsejahtera.com"

        # Update profile
        res = client.put("/api/auth/profile", headers=headers, json={"name": "Budi Sutrisno S.T."})
        assert res.status_code == 200
        assert res.json()["name"] == "Budi Sutrisno S.T."

        # Change password
        res = client.post(
            "/api/auth/password",
            headers=headers,
            json={"current_password": "Password123!", "new_password": "PasswordBaru123!"},
        )
        assert res.status_code == 204

        # Reset password back
        res = client.post(
            "/api/auth/password",
            headers=headers,
            json={"current_password": "PasswordBaru123!", "new_password": "Password123!"},
        )
        assert res.status_code == 204

    def test_06_company_profile_and_master_data(self):
        token = TestCarbonLensAPI.tokens["company"]
        headers = {"Authorization": f"Bearer {token}"}

        # Get company
        res = client.get("/api/company", headers=headers)
        assert res.status_code == 200
        assert res.json()["id"] == TestCarbonLensAPI.ids["company_id"]

        # List reviewers
        res = client.get("/api/company/reviewers", headers=headers)
        assert res.status_code == 200
        assert len(res.json()) >= 1

        # Update company
        update_data = {
            "name": "PT Sawit Sejahtera Test",
            "legal_id": "ID-123456",
            "sector": "Kelapa sawit",
            "address": "Jl. Sawit Baru KM 5",
            "province": "Riau",
            "city": "Pelalawan",
            "postal_code": "28301",
            "phone": "081234567890",
            "gwp_set": "AR5",
            "allocation_method": "economic",
            "grid_system": "sumatera",
            "pome_treatment": "open",
        }
        res = client.put("/api/company", headers=headers, json=update_data)
        assert res.status_code == 200
        assert res.json()["postal_code"] == "28301"

        # Facilities CRUD
        res = client.get("/api/company/facilities", headers=headers)
        assert res.status_code == 200
        facs = res.json()
        assert len(facs) >= 1
        fac_id = facs[0]["id"]
        TestCarbonLensAPI.ids["facility_id"] = fac_id

        res = client.post(
            "/api/company/facilities",
            headers=headers,
            json={
                "name": "Kebun Plasma A",
                "type": "kebun",
                "area_ha": 1500,
                "capacity_tph": 0,
                "soil_type": "mineral",
                "address": "Blok Plasma",
            },
        )
        assert res.status_code == 201
        new_fac_id = res.json()["id"]

        res = client.put(
            f"/api/company/facilities/{new_fac_id}",
            headers=headers,
            json={
                "name": "Kebun Plasma A Replanted",
                "type": "kebun",
                "area_ha": 1600,
                "capacity_tph": 0,
                "soil_type": "mineral",
                "address": "Blok Plasma",
            },
        )
        assert res.status_code == 200
        assert float(res.json()["area_ha"]) == 1600

        res = client.delete(f"/api/company/facilities/{new_fac_id}", headers=headers)
        assert res.status_code == 204

        # Products CRUD
        res = client.get("/api/company/products", headers=headers)
        assert res.status_code == 200
        prods = res.json()
        assert len(prods) >= 2

        res = client.post(
            "/api/company/products",
            headers=headers,
            json={
                "code": "SHELL",
                "name": "Palm Kernel Shell",
                "cn_code": "14049000",
                "price_per_kg": 1500,
            },
        )
        assert res.status_code == 201
        prod_id = res.json()["id"]

        res = client.put(
            f"/api/company/products/{prod_id}",
            headers=headers,
            json={
                "code": "SHELL",
                "name": "Palm Kernel Shell Biofuel",
                "cn_code": "14049000",
                "price_per_kg": 1600,
            },
        )
        assert res.status_code == 200

        res = client.delete(f"/api/company/products/{prod_id}", headers=headers)
        assert res.status_code == 204

    def test_07_periods_flow(self):
        token = TestCarbonLensAPI.tokens["company"]
        headers = {"Authorization": f"Bearer {token}"}
        pid = TestCarbonLensAPI.ids["period_id"]

        # List periods
        res = client.get("/api/periods", headers=headers)
        assert res.status_code == 200
        assert len(res.json()) >= 1

        # Create another period
        res = client.post("/api/periods", headers=headers, json={"year": 2025})
        assert res.status_code == 201

        # Period endpoints
        res = client.get(f"/api/periods/{pid}/dashboard", headers=headers)
        assert res.status_code == 200

        res = client.get(f"/api/periods/{pid}/requirements", headers=headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)

        res = client.get(f"/api/periods/{pid}/activity", headers=headers)
        assert res.status_code == 200

        res = client.get(f"/api/periods/{pid}/issues", headers=headers)
        assert res.status_code == 200

        res = client.get(f"/api/periods/{pid}/gates", headers=headers)
        assert res.status_code == 200

        res = client.get(f"/api/periods/{pid}/audit", headers=headers)
        assert res.status_code == 200

    def test_08_documents_and_workflow(self):
        token = TestCarbonLensAPI.tokens["company"]
        admin_token = TestCarbonLensAPI.tokens["admin"]
        headers = {"Authorization": f"Bearer {token}"}
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        pid = TestCarbonLensAPI.ids["period_id"]

        # Document types catalog
        res = client.get("/api/document-types", headers=headers)
        assert res.status_code == 200
        assert len(res.json()) >= 10

        # Upload document
        csv_content = b"No,Tanggal,Volume_L,Supplier\n1,2024-05-01,5000,PT Pertamina\n"
        files = [
            ("files", ("invoice_solar.csv", io.BytesIO(csv_content), "text/csv")),
        ]
        data = {"type_code": "bbm"}
        res = client.post(f"/api/periods/{pid}/documents", headers=headers, files=files, data=data)
        assert res.status_code == 201
        doc_list = res.json()
        assert len(doc_list) == 1
        doc_id = doc_list[0]["id"]
        TestCarbonLensAPI.ids["doc_id"] = doc_id

        # List documents
        res = client.get(f"/api/periods/{pid}/documents", headers=headers)
        assert res.status_code == 200
        assert any(d["id"] == doc_id for d in res.json())

        # Document detail
        res = client.get(f"/api/documents/{doc_id}", headers=headers)
        assert res.status_code == 200
        assert res.json()["id"] == doc_id

        # Download file
        res = client.get(f"/api/documents/{doc_id}/file", headers=headers)
        assert res.status_code == 200
        assert b"PT Pertamina" in res.content

        # Add manual field (item 1 as new row)
        res = client.post(
            f"/api/documents/{doc_id}/fields",
            headers=headers,
            json={"key": "volume_l", "value": "5000", "item": 1},
        )
        assert res.status_code == 201
        detail = res.json()
        field = next((f for f in detail["fields"] if f["key"] == "volume_l" and f["item"] == 1), None)
        assert field is not None
        field_id = field["id"]

        # Update field
        res = client.patch(
            f"/api/documents/{doc_id}/fields/{field_id}",
            headers=headers,
            json={"value": "5200", "reason": "Penyesuaian delivery order"},
        )
        assert res.status_code == 200

        # Validate document (409 expected if still uploaded/processing in test environment)
        res = client.post(f"/api/documents/{doc_id}/validate", headers=headers)
        assert res.status_code in (200, 409, 422)

        # Reprocess document
        res = client.post(f"/api/documents/{doc_id}/reprocess", headers=headers)
        assert res.status_code == 200

    def test_09_factors_and_admin_workflow(self):
        token = TestCarbonLensAPI.tokens["company"]
        admin_token = TestCarbonLensAPI.tokens["admin"]
        cid = str(TestCarbonLensAPI.ids["company_id"])
        headers = {"Authorization": f"Bearer {token}"}
        admin_headers = {"Authorization": f"Bearer {admin_token}", "X-Company-Id": cid}

        # List factors
        res = client.get("/api/factors", headers=headers)
        assert res.status_code == 200
        factors = res.json()
        assert len(factors) > 0
        factor_id = factors[0]["id"]

        # Admin update factor
        res = client.put(
            f"/api/factors/{factor_id}",
            headers=admin_headers,
            json={"value": 2.75, "source": "Uji Emisi Lapangan 2024"},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "draft"

        # Admin approve factor
        res = client.post(f"/api/factors/{factor_id}/approve", headers=admin_headers)
        assert res.status_code == 200
        assert res.json()["status"] == "approved"

        # Admin companies list
        res = client.get("/api/admin/companies", headers=admin_headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)

        # Admin queue list
        res = client.get("/api/admin/queue", headers=admin_headers)
        assert res.status_code == 200
        assert isinstance(res.json(), list)
