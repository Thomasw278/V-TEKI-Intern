"""Katalog 10 jenis dokumen, skema field, dan faktor emisi bawaan.

Modul ini murni Python (tanpa database) sehingga bisa dipakai oleh
mesin hitung, ekstraksi, validasi, maupun seed database.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal


@dataclass(frozen=True)
class FieldSpec:
    key: str
    label: str
    unit: str = ""
    kind: str = "number"  # number | text
    required: bool = True
    default: str | None = None


@dataclass(frozen=True)
class DocType:
    code: str
    no: int
    name: str
    required: bool
    scope: str
    description: str
    keywords: tuple[str, ...]
    fields: tuple[FieldSpec, ...] = field(default_factory=tuple)

    def field(self, key: str) -> FieldSpec | None:
        return next((f for f in self.fields if f.key == key), None)


DOC_TYPES: tuple[DocType, ...] = (
    DocType(
        "material", 1, "Pasokan material", True, "Prekursor / hulu",
        "Faktur pembelian, surat jalan, sertifikat pemasok dengan nilai SEE.",
        ("surat jalan", "purchase order", "faktur pembelian", "material", "bahan baku", "sertifikat pemasok", "see pemasok", "prekursor"),
        (
            FieldSpec("material_name", "Nama material", kind="text"),
            FieldSpec("quantity_t", "Kuantitas", "t"),
            FieldSpec("supplier", "Pemasok", kind="text", required=False),
            FieldSpec("country", "Negara asal", kind="text", required=False),
            FieldSpec("see_supplier", "SEE pemasok", "t CO2e/t", required=False),
        ),
    ),
    DocType(
        "listrik", 2, "Energi & listrik", True, "Scope 2",
        "Tagihan PLN, catatan meter genset, catatan penjualan listrik.",
        ("pln", "kwh", "tagihan listrik", "rekening listrik", "id pelanggan", "lwbp", "wbp", "genset"),
        (
            FieldSpec("kwh_purchased", "kWh dibeli", "kWh"),
            FieldSpec("billing_month", "Bulan tagihan", kind="text"),
            FieldSpec("kwh_sold", "kWh dijual", "kWh", required=False),
            FieldSpec("customer_id", "ID pelanggan", kind="text", required=False),
        ),
    ),
    DocType(
        "bbm", 3, "BBM energi fosil", True, "Scope 1",
        "Faktur solar, stok BBM, log genset dan kendaraan.",
        ("solar", "biosolar", "bbm", "hsd", "dexlite", "pertalite", "bensin", "b40", "b35", "spbu", "liter"),
        (
            FieldSpec("fuel_type", "Jenis BBM", kind="text"),
            FieldSpec("volume_l", "Volume", "L"),
            FieldSpec("usage", "Penggunaan", kind="text", required=False),
        ),
    ),
    DocType(
        "pupuk", 4, "Pupuk aplikasi kebun", True, "Scope 1 · N2O",
        "Faktur pupuk, rekap aplikasi per blok, tandan kosong.",
        ("pupuk", "npk", "urea", "mop", "kcl", "dolomit", "aplikasi pupuk", "tandan kosong", "tankos"),
        (
            FieldSpec("fertilizer_type", "Jenis pupuk", kind="text"),
            FieldSpec("mass_kg", "Massa pupuk", "kg"),
            FieldSpec("n_content_pct", "Kadar N", "%"),
            FieldSpec("organic_mass_t", "Pupuk organik (tankos)", "t", required=False),
            FieldSpec("organic_n_pct", "Kadar N organik", "%", required=False),
        ),
    ),
    DocType(
        "lahan", 5, "Lahan kebun & panen", True, "Scope 1 · lahan",
        "Master blok tanam, rekap panen TBS, data jenis tanah.",
        ("blok", "afdeling", "luas", "hektar", "tahun tanam", "panen", "gambut", "tanah mineral"),
        (
            FieldSpec("block", "Blok", kind="text", required=False),
            FieldSpec("area_ha", "Luas", "ha"),
            FieldSpec("soil_type", "Jenis tanah", kind="text"),
            FieldSpec("ffb_harvested_t", "TBS dipanen", "t", required=False),
            FieldSpec("planting_year", "Tahun tanam", kind="text", required=False),
        ),
    ),
    DocType(
        "produksi", 6, "Pabrik & produksi", True, "Pembagi SEE",
        "Rekap produksi, tiket timbangan, laporan harian pabrik.",
        ("produksi", "tbs diolah", "tbs olah", "cpo", "pko", "kernel", "rendemen", "timbangan", "laporan harian"),
        (
            FieldSpec("ffb_processed_t", "TBS diolah", "t"),
            FieldSpec("cpo_t", "CPO", "t", required=False),
            FieldSpec("pko_t", "PKO", "t", required=False),
            FieldSpec("product_code", "Kode produk lain", kind="text", required=False),
            FieldSpec("product_t", "Tonase produk lain", "t", required=False),
        ),
    ),
    DocType(
        "pome", 7, "Limbah cair (POME)", True, "Scope 1 · CH4",
        "Log volume POME, laporan lab COD, catatan biogas.",
        ("pome", "cod", "limbah cair", "kolam", "ipal", "biogas", "inlet", "outlet"),
        (
            FieldSpec("volume_m3", "Volume POME", "m3"),
            FieldSpec("cod_in_mgl", "COD masuk", "mg/L"),
            FieldSpec("cod_out_mgl", "COD keluar", "mg/L"),
            FieldSpec("biogas_m3", "Biogas tertangkap", "m3", required=False),
            FieldSpec("ch4_fraction", "Fraksi CH4 biogas", "", required=False),
        ),
    ),
    DocType(
        "transport", 8, "Transportasi & logistik", False, "Hulu / hilir",
        "Surat jalan, manifest, invoice ekspedisi.",
        ("ekspedisi", "manifest", "angkutan", "truk", "jarak", "km", "ritase", "logistik"),
        (
            FieldSpec("volume_l", "Kuantitas BBM", "L", required=False),
            FieldSpec("fuel_type", "Jenis BBM", kind="text", required=False, default="solar"),
            FieldSpec("load_t", "Muatan", "t", required=False),
            FieldSpec("distance_km", "Jarak", "km", required=False),
            FieldSpec("mode", "Moda", kind="text", required=False),
        ),
    ),
    DocType(
        "b3", 9, "Limbah padat & B3", False, "Scope 1 / 3",
        "Manifest B3, neraca limbah, berita acara pengolahan.",
        ("b3", "limbah padat", "manifest limbah", "insinerasi", "landfill", "neraca limbah", "oli bekas"),
        (
            FieldSpec("waste_type", "Jenis limbah", kind="text", required=False),
            FieldSpec("mass_t", "Massa", "t"),
            FieldSpec("treatment", "Metode olah", kind="text", required=False),
        ),
    ),
    DocType(
        "air", 10, "Air & bukti pendukung", False, "Pemeriksa silang",
        "Meter air, izin pengambilan air, laporan lab.",
        ("air", "pdam", "sumur", "debit", "pengambilan air", "water"),
        (
            FieldSpec("water_m3", "Air diambil", "m3"),
            FieldSpec("source", "Sumber", kind="text", required=False),
        ),
    ),
)

DOC_TYPE_BY_CODE = {d.code: d for d in DOC_TYPES}


@dataclass(frozen=True)
class FactorSpec:
    code: str
    name: str
    value: Decimal
    unit: str
    source: str
    approved: bool  # status bawaan saat perusahaan dibuat


# PENTING: nilai bertanda [VERIFIKASI] adalah placeholder yang harus
# diganti/disetujui reviewer dengan sumber resmi terbaru sebelum laporan final.
DEFAULT_FACTORS: tuple[FactorSpec, ...] = (
    FactorSpec("diesel_co2", "Solar / diesel — CO2", Decimal("2.68"), "kg CO2/L", "IPCC 2006 (turunan)", True),
    FactorSpec("gasoline_co2", "Bensin — CO2", Decimal("2.31"), "kg CO2/L", "IPCC 2006 (turunan) [VERIFIKASI]", False),
    FactorSpec("grid_ef", "Faktor emisi jaringan listrik", Decimal("0.87"), "t CO2/MWh", "KESDM [VERIFIKASI tahun & sistem]", False),
    FactorSpec("ef1_n2o", "N2O langsung EF1", Decimal("0.01"), "kg N2O-N/kg N", "IPCC 2019 Refinement", True),
    FactorSpec("urea_c", "Urea — fraksi C", Decimal("0.20"), "t C/t urea", "IPCC 2006", True),
    FactorSpec("pome_bo", "Bo POME", Decimal("0.25"), "kg CH4/kg COD", "IPCC 2006", True),
    FactorSpec("pome_mcf", "MCF kolam anaerob", Decimal("0.8"), "-", "IPCC 2019 default", False),
    FactorSpec("pome_m3_per_t_ffb", "Nilai bawaan volume POME", Decimal("0.6"), "m3/t TBS", "Literatur [VERIFIKASI]", False),
    FactorSpec("pome_dcod_default", "Nilai bawaan ΔCOD POME", Decimal("45"), "kg COD/m3", "Literatur [VERIFIKASI]", False),
    FactorSpec("biogas_ch4_fraction", "Fraksi CH4 biogas bawaan", Decimal("0.6"), "-", "Literatur [VERIFIKASI]", False),
    FactorSpec("peat_co2", "Emisi gambut terdrainase (sawit)", Decimal("40.3"), "t CO2/ha/thn", "IPCC Wetlands Supplement 2013 [VERIFIKASI]", False),
    FactorSpec("truck_tkm", "Truk diesel", Decimal("0.10"), "kg CO2e/t-km", "[SUMBER]", False),
    FactorSpec("waste_default", "Pengolahan limbah padat/B3", Decimal("0.65"), "t CO2e/t", "[SUMBER]", False),
)

FACTOR_BY_CODE = {f.code: f for f in DEFAULT_FACTORS}

GWP_SETS: dict[str, dict[str, Decimal]] = {
    "AR5": {"CH4": Decimal("28"), "N2O": Decimal("265")},
    "AR6": {"CH4": Decimal("27.0"), "N2O": Decimal("273")},
}

CH4_DENSITY_KG_M3 = Decimal("0.716")


def fossil_fraction(fuel_type: str) -> Decimal:
    """Fraksi fosil dari campuran biodiesel (B40 = 40% FAME → 60% fosil)."""
    t = (fuel_type or "").lower().replace(" ", "")
    import re

    m = re.search(r"b(\d{2})", t)
    if m:
        pct = int(m.group(1))
        if 0 < pct <= 100:
            return (Decimal(100 - pct) / Decimal(100)).quantize(Decimal("0.01"))
    if "biosolar" in t:
        return Decimal("0.60")  # asumsi mandatori B40 bila persen tidak tertulis
    return Decimal("1.00")


def fuel_factor_code(fuel_type: str) -> str:
    t = (fuel_type or "").lower()
    if any(k in t for k in ("bensin", "pertalite", "pertamax", "gasoline")):
        return "gasoline_co2"
    return "diesel_co2"
