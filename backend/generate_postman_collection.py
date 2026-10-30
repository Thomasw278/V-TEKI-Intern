"""Script to generate complete Postman Collection (v2.1.0) and Environment files for Carbon Lens API.
"""
import json
import uuid
from pathlib import Path


def create_postman_collection():
    collection_id = str(uuid.uuid4())

    def script_test(lines: list[str]):
        return {
            "listen": "test",
            "script": {
                "exec": lines,
                "type": "text/javascript",
            },
        }

    def auth_headers(role="company"):
        token_var = "{{access_token}}" if role == "company" else "{{admin_access_token}}"
        h = [
            {"key": "Authorization", "value": f"Bearer {token_var}", "type": "text"},
            {"key": "Accept", "value": "application/json", "type": "text"},
        ]
        if role == "admin":
            h.append({"key": "X-Company-Id", "value": "{{company_id}}", "type": "text"})
        return h

    def json_body(payload: dict):
        return {
            "mode": "raw",
            "raw": json.dumps(payload, indent=2),
            "options": {"raw": {"language": "json"}},
        }

    items = []

    # =========================================================================
    # 1. HEALTH & SYSTEM
    # =========================================================================
    items.append({
        "name": "01 - Health & System",
        "item": [
            {
                "name": "Check System Health",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "pm.test('Response body has ok status', function () {",
                        "    var json = pm.response.json();",
                        "    pm.expect(json.status).to.eql('ok');",
                        "});",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": [],
                    "url": {
                        "raw": "{{base_url}}/api/health",
                        "host": ["{{base_url}}"],
                        "path": ["api", "health"],
                    },
                    "description": "Cek kesiapan backend & koneksi API.",
                },
            }
        ],
    })

    # =========================================================================
    # 2. AUTHENTICATION
    # =========================================================================
    items.append({
        "name": "02 - Authentication",
        "item": [
            {
                "name": "Register Company",
                "event": [
                    script_test([
                        "pm.test('Status is 201 Created or 409 Conflict', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([201, 409]);",
                        "});",
                        "if (pm.response.code === 201) {",
                        "    var res = pm.response.json();",
                        "    pm.expect(res.access_token).to.be.a('string');",
                        "    pm.environment.set('access_token', res.access_token);",
                        "    if (res.company && res.company.id) pm.environment.set('company_id', String(res.company.id));",
                        "    if (res.periods && res.periods.length > 0) pm.environment.set('period_id', String(res.periods[0].id));",
                        "}",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({
                        "company": {
                            "name": "PT Sawit Lestari Nusantara",
                            "legal_id": "ID-99281726",
                            "sector": "Kelapa sawit",
                            "address": "Kawasan Industri Sawit KM 14",
                            "province": "Riau",
                            "city": "Pelalawan",
                            "postal_code": "28300",
                            "phone": "08123456789",
                            "gwp_set": "AR5",
                            "allocation_method": "economic",
                            "grid_system": "sumatera",
                            "pome_treatment": "open",
                        },
                        "facilities": [
                            {
                                "name": "PKS Langgam",
                                "type": "pabrik",
                                "area_ha": 3500.0,
                                "capacity_tph": 60.0,
                                "soil_type": "mineral",
                                "address": "Kecamatan Langgam",
                            }
                        ],
                        "products": [
                            {
                                "code": "CPO",
                                "name": "Crude Palm Oil",
                                "cn_code": "15111000",
                                "price_per_kg": 12500,
                            },
                            {
                                "code": "PK",
                                "name": "Palm Kernel",
                                "cn_code": "12071000",
                                "price_per_kg": 7200,
                            },
                        ],
                        "account": {
                            "name": "Budi Santoso",
                            "email": "budi.santoso@sawitlestari.id",
                            "password": "PasswordSawit123!",
                        },
                        "first_year": 2024,
                    }),
                    "url": {
                        "raw": "{{base_url}}/api/auth/register",
                        "host": ["{{base_url}}"],
                        "path": ["api", "auth", "register"],
                    },
                    "description": "Mendaftarkan perusahaan, pabrik/kebun, produk, akun login, dan membuka periode pertama.",
                },
            },
            {
                "name": "Login as Company",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data.access_token).to.be.a('string');",
                        "pm.expect(data.user.role).to.eql('company');",
                        "pm.environment.set('access_token', data.access_token);",
                        "if (data.company && data.company.id) pm.environment.set('company_id', String(data.company.id));",
                        "if (data.periods && data.periods.length > 0) pm.environment.set('period_id', String(data.periods[0].id));",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({
                        "email": "{{company_email}}",
                        "password": "{{company_password}}",
                    }),
                    "url": {
                        "raw": "{{base_url}}/api/auth/login",
                        "host": ["{{base_url}}"],
                        "path": ["api", "auth", "login"],
                    },
                    "description": "Autentikasi akun perusahaan dan penyimpanan JWT bearer token ke environment.",
                },
            },
            {
                "name": "Login as Admin Reviewer",
                "event": [
                    script_test([
                        "pm.test('Status is 200 or 401', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 401]);",
                        "});",
                        "if (pm.response.code === 200) {",
                        "    var data = pm.response.json();",
                        "    pm.expect(data.access_token).to.be.a('string');",
                        "    pm.environment.set('admin_access_token', data.access_token);",
                        "}",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({
                        "email": "{{admin_email}}",
                        "password": "{{admin_password}}",
                    }),
                    "url": {
                        "raw": "{{base_url}}/api/auth/login",
                        "host": ["{{base_url}}"],
                        "path": ["api", "auth", "login"],
                    },
                    "description": "Autentikasi akun admin peninjau untuk operasi approval dan audit.",
                },
            },
            {
                "name": "Get Profile & Refresh Session (/me)",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data.user).to.be.an('object');",
                        "pm.expect(data.access_token).to.be.a('string');",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/auth/me",
                        "host": ["{{base_url}}"],
                        "path": ["api", "auth", "me"],
                    },
                },
            },
            {
                "name": "Update User Profile",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data.name).to.eql('Budi Santoso S.T.');",
                    ])
                ],
                "request": {
                    "method": "PUT",
                    "header": auth_headers("company") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({"name": "Budi Santoso S.T."}),
                    "url": {
                        "raw": "{{base_url}}/api/auth/profile",
                        "host": ["{{base_url}}"],
                        "path": ["api", "auth", "profile"],
                    },
                },
            },
            {
                "name": "Change Password",
                "event": [
                    script_test([
                        "pm.test('Status code is 204 or 400', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([204, 400]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": auth_headers("company") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({
                        "current_password": "{{company_password}}",
                        "new_password": "{{company_password}}",
                    }),
                    "url": {
                        "raw": "{{base_url}}/api/auth/password",
                        "host": ["{{base_url}}"],
                        "path": ["api", "auth", "password"],
                    },
                },
            },
        ],
    })

    # =========================================================================
    # 3. COMPANY & FACILITIES & PRODUCTS
    # =========================================================================
    items.append({
        "name": "03 - Company Profile & Master Data",
        "item": [
            {
                "name": "Get Company Detail",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data.id).to.be.a('number');",
                        "pm.expect(data.name).to.be.a('string');",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/company",
                        "host": ["{{base_url}}"],
                        "path": ["api", "company"],
                    },
                },
            },
            {
                "name": "Update Company Profile",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data.postal_code).to.eql('28301');",
                    ])
                ],
                "request": {
                    "method": "PUT",
                    "header": auth_headers("company") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({
                        "name": "PT Sawit Lestari Nusantara",
                        "legal_id": "ID-99281726",
                        "sector": "Kelapa sawit",
                        "address": "Kawasan Industri Sawit KM 14",
                        "province": "Riau",
                        "city": "Pelalawan",
                        "postal_code": "28301",
                        "phone": "08123456789",
                        "gwp_set": "AR5",
                        "allocation_method": "economic",
                        "grid_system": "sumatera",
                        "pome_treatment": "open",
                    }),
                    "url": {
                        "raw": "{{base_url}}/api/company",
                        "host": ["{{base_url}}"],
                        "path": ["api", "company"],
                    },
                },
            },
            {
                "name": "List Reviewers Assigned",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/company/reviewers",
                        "host": ["{{base_url}}"],
                        "path": ["api", "company", "reviewers"],
                    },
                },
            },
            {
                "name": "List Facilities",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                        "if (data.length > 0) pm.environment.set('facility_id', String(data[0].id));",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/company/facilities",
                        "host": ["{{base_url}}"],
                        "path": ["api", "company", "facilities"],
                    },
                },
            },
            {
                "name": "Add Facility",
                "event": [
                    script_test([
                        "pm.test('Status code is 201', function () {",
                        "    pm.response.to.have.status(201);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data.name).to.eql('Kebun Sawit Inti 1');",
                        "pm.environment.set('facility_id', String(data.id));",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": auth_headers("company") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({
                        "name": "Kebun Sawit Inti 1",
                        "type": "kebun",
                        "area_ha": 4200.0,
                        "capacity_tph": 0.0,
                        "soil_type": "mineral",
                        "address": "Blok B Wilayah Langgam",
                    }),
                    "url": {
                        "raw": "{{base_url}}/api/company/facilities",
                        "host": ["{{base_url}}"],
                        "path": ["api", "company", "facilities"],
                    },
                },
            },
            {
                "name": "Update Facility",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "PUT",
                    "header": auth_headers("company") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({
                        "name": "Kebun Sawit Inti 1 Updated",
                        "type": "kebun",
                        "area_ha": 4500.0,
                        "capacity_tph": 0.0,
                        "soil_type": "campuran",
                        "address": "Blok B Wilayah Langgam Barat",
                    }),
                    "url": {
                        "raw": "{{base_url}}/api/company/facilities/{{facility_id}}",
                        "host": ["{{base_url}}"],
                        "path": ["api", "company", "facilities", "{{facility_id}}"],
                    },
                },
            },
            {
                "name": "Delete Facility",
                "event": [
                    script_test([
                        "pm.test('Status code is 204 or 404', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([204, 404]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "DELETE",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/company/facilities/{{facility_id}}",
                        "host": ["{{base_url}}"],
                        "path": ["api", "company", "facilities", "{{facility_id}}"],
                    },
                },
            },
            {
                "name": "List Products",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                        "if (data.length > 0) pm.environment.set('product_id', String(data[0].id));",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/company/products",
                        "host": ["{{base_url}}"],
                        "path": ["api", "company", "products"],
                    },
                },
            },
            {
                "name": "Add Product",
                "event": [
                    script_test([
                        "pm.test('Status code is 201 or 409', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([201, 409]);",
                        "});",
                        "if (pm.response.code === 201) {",
                        "    var data = pm.response.json();",
                        "    pm.environment.set('product_id', String(data.id));",
                        "}",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": auth_headers("company") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({
                        "code": "SHELL",
                        "name": "Palm Kernel Shell",
                        "cn_code": "14049000",
                        "price_per_kg": 1500,
                    }),
                    "url": {
                        "raw": "{{base_url}}/api/company/products",
                        "host": ["{{base_url}}"],
                        "path": ["api", "company", "products"],
                    },
                },
            },
            {
                "name": "Update Product",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "PUT",
                    "header": auth_headers("company") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({
                        "code": "SHELL",
                        "name": "Palm Kernel Shell Premium",
                        "cn_code": "14049000",
                        "price_per_kg": 1750,
                    }),
                    "url": {
                        "raw": "{{base_url}}/api/company/products/{{product_id}}",
                        "host": ["{{base_url}}"],
                        "path": ["api", "company", "products", "{{product_id}}"],
                    },
                },
            },
            {
                "name": "Delete Product",
                "event": [
                    script_test([
                        "pm.test('Status code is 204, 404, or 409', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([204, 404, 409]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "DELETE",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/company/products/{{product_id}}",
                        "host": ["{{base_url}}"],
                        "path": ["api", "company", "products", "{{product_id}}"],
                    },
                },
            },
        ],
    })

    # =========================================================================
    # 4. REPORTING PERIODS & CALCULATIONS
    # =========================================================================
    items.append({
        "name": "04 - Reporting Periods & Calculations",
        "item": [
            {
                "name": "List Periods",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                        "if (data.length > 0) pm.environment.set('period_id', String(data[0].id));",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/periods",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods"],
                    },
                },
            },
            {
                "name": "Create Period",
                "event": [
                    script_test([
                        "pm.test('Status is 201 or 409', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([201, 409]);",
                        "});",
                        "if (pm.response.code === 201) {",
                        "    var data = pm.response.json();",
                        "    pm.environment.set('period_id', String(data.id));",
                        "}",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": auth_headers("company") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({"year": 2025}),
                    "url": {
                        "raw": "{{base_url}}/api/periods",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods"],
                    },
                },
            },
            {
                "name": "Get Period Dashboard",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/dashboard",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "dashboard"],
                    },
                },
            },
            {
                "name": "Get Period Requirements",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/requirements",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "requirements"],
                    },
                },
            },
            {
                "name": "Get Period Activity Table",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/activity",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "activity"],
                    },
                },
            },
            {
                "name": "Get Period Issues",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/issues",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "issues"],
                    },
                },
            },
            {
                "name": "Run Period Calculation",
                "event": [
                    script_test([
                        "pm.test('Status is 200 or 422', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 422]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": auth_headers("company") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({"gwp_set": "AR5", "allocation_method": "economic"}),
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/calculate",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "calculate"],
                    },
                },
            },
            {
                "name": "Get Latest Calculation",
                "event": [
                    script_test([
                        "pm.test('Status code is 200 or 404', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 404]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/calculation",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "calculation"],
                    },
                },
            },
            {
                "name": "Get Lock Gates Status",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/gates",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "gates"],
                    },
                },
            },
            {
                "name": "Lock Period (Admin)",
                "event": [
                    script_test([
                        "pm.test('Status is 200 or 409 Conflict', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 409]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": auth_headers("admin"),
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/lock",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "lock"],
                    },
                },
            },
            {
                "name": "Reopen Period (Admin)",
                "event": [
                    script_test([
                        "pm.test('Status is 200 or 409 Conflict', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 409]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": auth_headers("admin"),
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/reopen",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "reopen"],
                    },
                },
            },
            {
                "name": "Get Audit Trail",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/audit?limit=50",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "audit"],
                        "query": [{"key": "limit", "value": "50"}],
                    },
                },
            },
            {
                "name": "Export XLSX Report",
                "event": [
                    script_test([
                        "pm.test('Status code is 200 or 404', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 404]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/export.xlsx",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "export.xlsx"],
                    },
                },
            },
            {
                "name": "Export XML CBAM Communication",
                "event": [
                    script_test([
                        "pm.test('Status code is 200 or 404', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 404]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/export.xml",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "export.xml"],
                    },
                },
            },
        ],
    })

    # =========================================================================
    # 5. DOCUMENTS WORKFLOW
    # =========================================================================
    items.append({
        "name": "05 - Documents Workflow",
        "item": [
            {
                "name": "Get Document Catalog Types",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                        "pm.expect(data.length).to.be.at.least(10);",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/document-types",
                        "host": ["{{base_url}}"],
                        "path": ["api", "document-types"],
                    },
                },
            },
            {
                "name": "Upload Document (CSV/Text)",
                "event": [
                    script_test([
                        "pm.test('Status code is 201 Created', function () {",
                        "    pm.response.to.have.status(201);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                        "if (data.length > 0) pm.environment.set('doc_id', String(data[0].id));",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": [
                        {"key": "Authorization", "value": "Bearer {{access_token}}", "type": "text"},
                    ],
                    "body": {
                        "mode": "formdata",
                        "formdata": [
                            {
                                "key": "files",
                                "contentType": "text/csv",
                                "type": "file",
                                "src": "sample_invoice.csv",
                                "description": "Upload CSV/PDF document file",
                            },
                            {
                                "key": "type_code",
                                "value": "bbm",
                                "type": "text",
                            },
                        ],
                    },
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/documents",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "documents"],
                    },
                },
            },
            {
                "name": "List Documents in Period",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                        "if (data.length > 0) pm.environment.set('doc_id', String(data[0].id));",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/periods/{{period_id}}/documents",
                        "host": ["{{base_url}}"],
                        "path": ["api", "periods", "{{period_id}}", "documents"],
                    },
                },
            },
            {
                "name": "Get Document Detail",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data.id).to.be.a('number');",
                        "if (data.fields && data.fields.length > 0) {",
                        "    pm.environment.set('field_id', String(data.fields[0].id));",
                        "}",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/documents/{{doc_id}}",
                        "host": ["{{base_url}}"],
                        "path": ["api", "documents", "{{doc_id}}"],
                    },
                },
            },
            {
                "name": "Download Original Document File",
                "event": [
                    script_test([
                        "pm.test('Status code is 200 or 404', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 404]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/documents/{{doc_id}}/file",
                        "host": ["{{base_url}}"],
                        "path": ["api", "documents", "{{doc_id}}", "file"],
                    },
                },
            },
            {
                "name": "Get Rendered Page Preview Image",
                "event": [
                    script_test([
                        "pm.test('Status code is 200 or 404', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 404]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/documents/{{doc_id}}/pages/0",
                        "host": ["{{base_url}}"],
                        "path": ["api", "documents", "{{doc_id}}", "pages", "0"],
                    },
                },
            },
            {
                "name": "Patch Document Metadata / Category",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "PATCH",
                    "header": auth_headers("company") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({"type_code": "solar"}),
                    "url": {
                        "raw": "{{base_url}}/api/documents/{{doc_id}}",
                        "host": ["{{base_url}}"],
                        "path": ["api", "documents", "{{doc_id}}"],
                    },
                },
            },
            {
                "name": "Add Extracted Field Manually",
                "event": [
                    script_test([
                        "pm.test('Status code is 201 or 409', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([201, 409]);",
                        "});",
                        "if (pm.response.code === 201) {",
                        "    var data = pm.response.json();",
                        "    if (data.fields && data.fields.length > 0) {",
                        "        pm.environment.set('field_id', String(data.fields[data.fields.length - 1].id));",
                        "    }",
                        "}",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": auth_headers("company") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({
                        "key": "volume_l",
                        "value": "15000",
                        "item": 0,
                    }),
                    "url": {
                        "raw": "{{base_url}}/api/documents/{{doc_id}}/fields",
                        "host": ["{{base_url}}"],
                        "path": ["api", "documents", "{{doc_id}}", "fields"],
                    },
                },
            },
            {
                "name": "Update / Confirm Extracted Field",
                "event": [
                    script_test([
                        "pm.test('Status code is 200 or 404', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 404]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "PATCH",
                    "header": auth_headers("company") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({
                        "value": "15500",
                        "reason": "Koreksi manual sesuai struk fisik meteran",
                    }),
                    "url": {
                        "raw": "{{base_url}}/api/documents/{{doc_id}}/fields/{{field_id}}",
                        "host": ["{{base_url}}"],
                        "path": ["api", "documents", "{{doc_id}}", "fields", "{{field_id}}"],
                    },
                },
            },
            {
                "name": "Validate & Submit Document to Admin",
                "event": [
                    script_test([
                        "pm.test('Status code is 200, 409 or 422', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 409, 422]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/documents/{{doc_id}}/validate",
                        "host": ["{{base_url}}"],
                        "path": ["api", "documents", "{{doc_id}}", "validate"],
                    },
                },
            },
            {
                "name": "Approve Document (Admin Reviewer)",
                "event": [
                    script_test([
                        "pm.test('Status code is 200 or 409', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 409]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": auth_headers("admin"),
                    "url": {
                        "raw": "{{base_url}}/api/documents/{{doc_id}}/approve",
                        "host": ["{{base_url}}"],
                        "path": ["api", "documents", "{{doc_id}}", "approve"],
                    },
                },
            },
            {
                "name": "Reject Document (Admin Reviewer)",
                "event": [
                    script_test([
                        "pm.test('Status code is 200 or 409', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 409]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": auth_headers("admin") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({"reason": "Nilai volume solar tidak cocok dengan lampiran invoice faktur pajak"}),
                    "url": {
                        "raw": "{{base_url}}/api/documents/{{doc_id}}/reject",
                        "host": ["{{base_url}}"],
                        "path": ["api", "documents", "{{doc_id}}", "reject"],
                    },
                },
            },
            {
                "name": "Reprocess Document OCR / Extraction",
                "event": [
                    script_test([
                        "pm.test('Status code is 200 or 409', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 409]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/documents/{{doc_id}}/reprocess",
                        "host": ["{{base_url}}"],
                        "path": ["api", "documents", "{{doc_id}}", "reprocess"],
                    },
                },
            },
            {
                "name": "Delete Extracted Table Item",
                "event": [
                    script_test([
                        "pm.test('Status code is 200 or 404', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([200, 404]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "DELETE",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/documents/{{doc_id}}/items/0",
                        "host": ["{{base_url}}"],
                        "path": ["api", "documents", "{{doc_id}}", "items", "0"],
                    },
                },
            },
            {
                "name": "Delete Document",
                "event": [
                    script_test([
                        "pm.test('Status code is 204, 404, or 409', function () {",
                        "    pm.expect(pm.response.code).to.be.oneOf([204, 404, 409]);",
                        "});",
                    ])
                ],
                "request": {
                    "method": "DELETE",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/documents/{{doc_id}}",
                        "host": ["{{base_url}}"],
                        "path": ["api", "documents", "{{doc_id}}"],
                    },
                },
            },
        ],
    })

    # =========================================================================
    # 6. EMISSION FACTORS
    # =========================================================================
    items.append({
        "name": "06 - Emission Factors",
        "item": [
            {
                "name": "List Emission Factors",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                        "if (data.length > 0) pm.environment.set('factor_id', String(data[0].id));",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("company"),
                    "url": {
                        "raw": "{{base_url}}/api/factors",
                        "host": ["{{base_url}}"],
                        "path": ["api", "factors"],
                    },
                },
            },
            {
                "name": "Update Factor Value to Draft (Admin)",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data.status).to.eql('draft');",
                    ])
                ],
                "request": {
                    "method": "PUT",
                    "header": auth_headers("admin") + [{"key": "Content-Type", "value": "application/json"}],
                    "body": json_body({
                        "value": 2.685,
                        "source": "Kajian Spesifik Emisi Lokal Perusahaan 2024",
                    }),
                    "url": {
                        "raw": "{{base_url}}/api/factors/{{factor_id}}",
                        "host": ["{{base_url}}"],
                        "path": ["api", "factors", "{{factor_id}}"],
                    },
                },
            },
            {
                "name": "Approve Emission Factor (Admin)",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data.status).to.eql('approved');",
                    ])
                ],
                "request": {
                    "method": "POST",
                    "header": auth_headers("admin"),
                    "url": {
                        "raw": "{{base_url}}/api/factors/{{factor_id}}/approve",
                        "host": ["{{base_url}}"],
                        "path": ["api", "factors", "{{factor_id}}", "approve"],
                    },
                },
            },
        ],
    })

    # =========================================================================
    # 7. ADMIN WORKSPACE
    # =========================================================================
    items.append({
        "name": "07 - Admin Workspace",
        "item": [
            {
                "name": "List Assigned Review Companies (Admin)",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("admin"),
                    "url": {
                        "raw": "{{base_url}}/api/admin/companies",
                        "host": ["{{base_url}}"],
                        "path": ["api", "admin", "companies"],
                    },
                },
            },
            {
                "name": "Get Review Document Queue (Admin)",
                "event": [
                    script_test([
                        "pm.test('Status code is 200', function () {",
                        "    pm.response.to.have.status(200);",
                        "});",
                        "var data = pm.response.json();",
                        "pm.expect(data).to.be.an('array');",
                    ])
                ],
                "request": {
                    "method": "GET",
                    "header": auth_headers("admin"),
                    "url": {
                        "raw": "{{base_url}}/api/admin/queue",
                        "host": ["{{base_url}}"],
                        "path": ["api", "admin", "queue"],
                    },
                },
            },
        ],
    })

    collection = {
        "info": {
            "_postman_id": collection_id,
            "name": "Carbon Lens API Test Suite",
            "description": "Comprehensive testing suite for all Carbon Lens backend APIs (Auth, Company, Master Data, Periods, Documents, Factors, Admin, Health).",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "item": items,
    }

    env = {
        "id": str(uuid.uuid4()),
        "name": "Carbon Lens Local Environment",
        "values": [
            {"key": "base_url", "value": "http://127.0.0.1:8000", "type": "default", "enabled": True},
            {"key": "company_email", "value": "budi.santoso@sawitlestari.id", "type": "default", "enabled": True},
            {"key": "company_password", "value": "PasswordSawit123!", "type": "secret", "enabled": True},
            {"key": "admin_email", "value": "admin@karbonlens.id", "type": "default", "enabled": True},
            {"key": "admin_password", "value": "AdminPassword123!", "type": "secret", "enabled": True},
            {"key": "access_token", "value": "", "type": "secret", "enabled": True},
            {"key": "admin_access_token", "value": "", "type": "secret", "enabled": True},
            {"key": "company_id", "value": "1", "type": "default", "enabled": True},
            {"key": "period_id", "value": "1", "type": "default", "enabled": True},
            {"key": "facility_id", "value": "1", "type": "default", "enabled": True},
            {"key": "product_id", "value": "1", "type": "default", "enabled": True},
            {"key": "doc_id", "value": "1", "type": "default", "enabled": True},
            {"key": "field_id", "value": "1", "type": "default", "enabled": True},
            {"key": "factor_id", "value": "1", "type": "default", "enabled": True},
        ],
    }

    out_dir = Path("backend")
    out_dir.mkdir(parents=True, exist_ok=True)
    col_path = out_dir / "CarbonLens_API.postman_collection.json"
    env_path = out_dir / "CarbonLens_API.postman_environment.json"

    with open(col_path, "w", encoding="utf-8") as f:
        json.dump(collection, f, indent=2, ensure_ascii=False)

    with open(env_path, "w", encoding="utf-8") as f:
        json.dump(env, f, indent=2, ensure_ascii=False)

    print(f"Generated {col_path} with {len(items)} module groups.")
    print(f"Generated {env_path}.")


if __name__ == "__main__":
    create_postman_collection()
