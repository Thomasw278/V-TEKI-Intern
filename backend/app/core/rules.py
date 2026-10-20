"""Aturan ekstraksi per jenis dokumen: label (anchor) sinonim, satuan, rentang wajar.

Anchor ditulis sebagai fragmen regex huruf kecil (Indonesia + Inggris). Mesin
ekstraksi mencari anchor di mana pun pada dokumen lalu mencari nilai di kanan,
kiri, bawah, atas, atau di kolom tabel yang sama.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal

# ---------------------------------------------------------------- satuan
# token satuan → (dimensi, faktor ke satuan dasar dimensi)
# satuan dasar: vol=L, m3=m3, energy=kWh, mass=kg, area=ha, dist=km, conc=mg/L, pct=%, tkm=t-km
UNIT_TABLE: list[tuple[str, str, Decimal]] = [
    (r"t\s?-\s?km|ton\s?-\s?km|ton\.km|tkm", "tkm", Decimal(1)),
    (r"kwh", "energy", Decimal(1)),
    (r"mwh", "energy", Decimal(1000)),
    (r"gwh", "energy", Decimal(1_000_000)),
    (r"kiloliter|kl", "vol", Decimal(1000)),
    (r"liters?|litres?|ltr|lt|l", "vol", Decimal(1)),
    (r"nm3|nm³|m3|m³|m\^3|meter\s*kubik|kubik", "m3", Decimal(1)),
    (r"mg\s*/\s*l(?:iter)?|ppm", "conc", Decimal(1)),
    (r"g\s*/\s*l", "conc", Decimal(1000)),
    (r"kilogram|kgs?", "mass", Decimal(1)),
    (r"kwintal|kuintal", "mass", Decimal(100)),
    (r"sak|karung|zak|bags?", "mass", Decimal(50)),  # asumsi 50 kg/sak, ditandai keyakinan lebih rendah
    (r"tonnes?|tons?|mt|ton|t", "mass", Decimal(1000)),
    (r"hektare|hektar|hectares?|ha", "area", Decimal(1)),
    (r"km", "dist", Decimal(1)),
    (r"%|persen|percent", "pct", Decimal(1)),
]
UNIT_RE = re.compile(
    r"^[\s.]{0,5}(?P<u>" + "|".join(f"(?:{u})" for u, _, _ in UNIT_TABLE) + r")(?![a-z0-9²³])",
    re.IGNORECASE,
)
UNIT_ONLY_RE = re.compile(r"^\(?\s*(?:" + "|".join(f"(?:{u})" for u, _, _ in UNIT_TABLE) + r")\s*\)?$", re.IGNORECASE)
_UNIT_COMPILED = [(re.compile(f"^(?:{u})$", re.IGNORECASE), dim, f) for u, dim, f in UNIT_TABLE]


def unit_info(token: str) -> tuple[str, Decimal] | None:
    t = re.sub(r"\s+", " ", token.strip().strip("()[]").strip())
    for rx, dim, f in _UNIT_COMPILED:
        if rx.match(t):
            return dim, f
    return None


# satuan target field → (dimensi, faktor satuan target terhadap satuan dasar)
TARGET: dict[str, tuple[str, Decimal]] = {
    "L": ("vol", Decimal(1)),
    "kWh": ("energy", Decimal(1)),
    "kg": ("mass", Decimal(1)),
    "t": ("mass", Decimal(1000)),
    "ha": ("area", Decimal(1)),
    "km": ("dist", Decimal(1)),
    "m3": ("m3", Decimal(1)),
    "mg/L": ("conc", Decimal(1)),
    "%": ("pct", Decimal(1)),
}

MONTHS = {
    "januari": 1, "jan": 1, "january": 1,
    "februari": 2, "feb": 2, "pebruari": 2, "february": 2,
    "maret": 3, "mar": 3, "march": 3,
    "april": 4, "apr": 4,
    "mei": 5, "may": 5,
    "juni": 6, "jun": 6, "june": 6,
    "juli": 7, "jul": 7, "july": 7,
    "agustus": 8, "agu": 8, "agt": 8, "ags": 8, "aug": 8, "august": 8,
    "september": 9, "sep": 9, "sept": 9,
    "oktober": 10, "okt": 10, "oct": 10, "october": 10,
    "november": 11, "nov": 11, "nop": 11, "nopember": 11,
    "desember": 12, "des": 12, "dec": 12, "december": 12,
}
MONTH_NAME_RE = "|".join(sorted(MONTHS, key=len, reverse=True))

TOTAL_RE = re.compile(r"^\W*(grand\s*total|total\s*keseluruhan|jumlah\s*total|total|jumlah|sub\s*total|akumulasi|sum)\b", re.I)
TOTAL_WORD_RE = re.compile(r"\b(grand\s*total|total|jumlah\s*total|keseluruhan|akumulasi|setahun|tahunan|annual)\b", re.I)
SKIP_ROW_RE = re.compile(r"^\W*(rata-?\s*rata|average|rerata|min(?:imum)?|max(?:imum)?|target|anggaran|budget|keterangan)\b", re.I)
MONEY_BEFORE_RE = re.compile(r"(rp\.?|idr|usd|us\$|\$|€)\s*$", re.I)
ID_CONTEXT_RE = re.compile(
    r"\b(no\.?|nomor|nomer|invoice|faktur\s*no|id\s*pelanggan|idpel|npwp|nik|nib|telp|telepon|phone|hp|fax|"
    r"rekening|no\.?\s*rek|kode\s*pos|nopol|no\.?\s*polisi|rt|rw|km\s*\d+\s*jl)\b", re.I)
RATE_AFTER_RE = re.compile(r"^\s*/\s*(ha|hektar|pokok|pohon|jam|hari|ton|t|kg|l|liter|kwh|m3|unit)\b", re.I)
MONEY_HEADER_RE = re.compile(r"\b(harga|price|rp|idr|nilai|amount|biaya|cost|tarif|total\s*harga|jumlah\s*harga|dpp|ppn|pph)\b", re.I)


@dataclass(frozen=True)
class Rule:
    key: str
    kind: str  # number | text | enum | month
    anchors: tuple[str, ...] = ()
    weak: tuple[str, ...] = ()
    unit: str = ""                 # satuan target (lihat TARGET)
    unit_required: bool = False
    rng: tuple[float, float] | None = None
    values: str | None = None      # regex nilai (enum / pola teks)
    reject: tuple[str, ...] = ()   # kata konteks yang membatalkan kandidat angka tanpa satuan
    avoid: tuple[str, ...] = ()    # kata konteks yang menurunkan skor (mis. "jatuh tempo")
    item: bool = True              # nilai per baris tabel / item
    primary: bool = False          # field yang menandai satu baris item
    row_label: str | None = None   # tabel matriks: label baris (mis. "cod")
    col_label: str | None = None   # tabel matriks: judul kolom (mis. "inlet")
    row_reject: tuple[str, ...] = ()  # label baris tabel yang bukan untuk field ini (mis. "kVArh" di kolom kWh)


@dataclass(frozen=True)
class TypeRules:
    code: str
    rules: tuple[Rule, ...]
    item_enum: str | None = None   # rule enum yang menandai baris item tanpa tabel
    hints: tuple[tuple[str, float], ...] = ()  # kata kunci klasifikasi (regex, bobot)
    negatives: tuple[str, ...] = ()
    # Baris tabel tanpa kolom ini dianggap bagian dari SATU dokumen (mis. blok LWBP/WBP dalam satu
    # tagihan) dan dijumlahkan menjadi satu item. Tabel yang punya kolom ini (rekap 12 bulan) tetap per baris.
    collapse_without: str | None = None

    def get(self, key: str) -> Rule | None:
        return next((r for r in self.rules if r.key == key), None)

    @property
    def numeric(self) -> list[Rule]:
        return [r for r in self.rules if r.kind == "number"]

    @property
    def primary(self) -> Rule | None:
        return next((r for r in self.rules if r.primary), None)


MONEY = ("harga", "rp", "idr", "ppn", "pph", "dpp", "diskon", "discount", "biaya", "tarif", "nilai", "amount", "bayar")

FUEL_ENUM = (r"b[i1l!]o\s*-?\s*s[o0]lar(?:\s*b\s?\d{2})?|solar\s*(?:industri\s*)?b\s?\d{2}|\bb\s?(?:20|30|35|40|50)\b|\bhsd\b|"
             r"high\s*speed\s*diesel|dexlite|pertamina\s*dex|\bsolar\b|\bdiesel\b|pertalite|pertamax(?:\s*turbo)?|"
             r"\bbensin\b|gasoline|\bmfo\b|\bido\b|\blpg\b")
FERT_ENUM = (r"npk(?:\s*(?:mutiara|phonska|pelangi|yaramila|kebomas))?(?:\s*\d{1,2}\s*[-.]\s*\d{1,2}\s*[-.]\s*\d{1,2}"
             r"(?:\s*[-.]\s*\d{1,2})?)?|\burea\b|\bmop\b|\bkcl\b|\bza\b|\btsp\b|\bsp\s*-?\s*36\b|\bdap\b|\bmap\b|"
             r"dolomit\w*|kieserit\w*|\bborate\b|rock\s*phosphate|\bkno3\b|\bnpk\b")
WASTE_ENUM = (r"oli\s*bekas|minyak\s*pelumas\s*bekas|pelumas\s*bekas|aki\s*(?:/\s*baterai\s*)?bekas|baterai\s*bekas|accu\s*bekas|majun(?:\s*terkontaminasi)?|"
              r"kain\s*terkontaminasi|filter\s*(?:oli|udara|solar)?\s*bekas|kemasan\s*(?:bekas\s*)?b3|abu\s*boiler|"
              r"fly\s*ash|bottom\s*ash|limbah\s*medis|lampu\s*(?:tl|bekas)|cartridge|toner|grease|sludge")
MODE_ENUM = r"dump\s*truck|truk|truck|tronton|pick\s*-?up|kapal|tongkang|ponton|kereta|trailer"
SOIL_ENUM = r"gambut|mineral|organosol|histosol|peat|spodosol|aluvial|alluvial|podsolik|latosol"
WATER_ENUM = r"pdam|sumur\s*(?:bor|dalam|dangkal)|sungai|air\s*permukaan|air\s*tanah|embung|waduk|danau"
TREAT_ENUM = (r"insinerasi|insinerator|incinerat\w*|landfill|penimbunan|pihak\s*ketiga|pemanfaatan|daur\s*ulang|recycl\w*|"
              r"co-?processing|pengumpul(?:an)?(?:\s*berizin)?|dikirim\s*ke\s*[^\n]{3,40}")
USAGE_ENUM = r"genset|generator|kendaraan|alat\s*berat|boiler|pabrik|kebun|traktor|truk|transport\w*|operasional"

RULES: dict[str, TypeRules] = {}


def _add(tr: TypeRules) -> None:
    RULES[tr.code] = tr


_add(TypeRules("bbm", (
    Rule("fuel_type", "enum", anchors=(r"jenis\s*(?:bbm|bahan\s*bakar)", r"bahan\s*bakar", r"produk", r"nama\s*barang", r"uraian",
                                       r"deskripsi", r"description", r"item", r"fuel", r"jenis"), values=FUEL_ENUM),
    Rule("volume_l", "number", anchors=(r"volume", r"vol\.?", r"kuantitas", r"qty", r"quantity", r"banyaknya", r"pemakaian",
                                        r"pengisian", r"penerimaan", r"pembelian", r"diterima", r"total\s*liter", r"jumlah\s*liter", r"liter", r"litre"),
         weak=(r"jumlah", r"total"), unit="L", rng=(1, 5e8), reject=MONEY, primary=True),
    Rule("usage", "text", anchors=(r"penggunaan", r"keperluan", r"peruntukan", r"tujuan", r"untuk", r"keterangan", r"lokasi\s*pemakaian",
                                   r"usage"), values=USAGE_ENUM),
), item_enum="fuel_type",
    hints=((r"\bbbm\b", 3), (r"bio\s*solar|biosolar", 3), (r"\bsolar\b", 2), (r"\bhsd\b|dexlite|pertalite|pertamax", 2),
           (r"\bspbu\b|depot|pertamina\s*patra", 2), (r"\bliter\b|\bltr\b", 1), (r"bahan\s*bakar", 2), (r"\bfuel\b", 2),
           (r"\bgenset\b", 0.5))))

_add(TypeRules("listrik", (
    Rule("kwh_purchased", "number", anchors=(r"total\s*pemakaian", r"pemakaian(?:\s*(?:listrik|energi|kwh))?", r"jumlah\s*kwh",
                                             r"total\s*kwh", r"kwh\s*total", r"konsumsi(?:\s*energi)?", r"energi\s*(?:terpakai|listrik)",
                                             r"penggunaan\s*listrik", r"energy\s*consumption", r"consumption", r"kwh\s*(?:terpakai|dibeli)",
                                             r"kwh"),
         weak=(r"total", r"jumlah"), unit="kWh", rng=(1, 5e10), avoid=(r"lwbp", r"wbp", r"kvarh", r"stand", r"blok\s*\d"),
         reject=MONEY + ("stand", r"meter\s*awal", r"meter\s*akhir", "daya", "va", "kva", r"faktor\s*kali"), primary=True,
         row_reject=(r"kvarh", r"kvar", r"\bkva\b", r"\bdaya\b", r"reaktif", r"faktor\s*kali", r"stand")),
    Rule("billing_month", "month", anchors=(r"bulan\s*tagihan", r"rekening\s*bulan", r"tagihan\s*bulan", r"bulan\s*pemakaian",
                                            r"periode(?:\s*(?:tagihan|pemakaian|rekening))?", r"bulan", r"billing\s*period", r"month",
                                            r"masa"),
         avoid=(r"jatuh\s*tempo", r"tgl\.?\s*bayar", r"tanggal\s*bayar", r"dicetak", r"tgl\.?\s*cetak", r"tanggal\s*cetak",
                r"cetak", r"batas", r"due", r"tanggal\s*lunas", r"dibayar", r"tanggal\s*terbit", r"issued")),
    Rule("kwh_sold", "number", anchors=(r"dijual", r"penjualan\s*listrik", r"ekspor", r"export", r"disalurkan", r"dikirim\s*ke\s*jaringan"),
         unit="kWh", rng=(0, 5e10), reject=MONEY),
    Rule("customer_id", "text", anchors=(r"id\s*pelanggan", r"idpel", r"no\.?\s*pelanggan", r"nomor\s*pelanggan", r"customer\s*id"),
         values=r"\d[\dx\- ]{5,18}\d", item=False),
), collapse_without="billing_month",
   hints=((r"\bpln\b", 3), (r"\bkwh\b", 3), (r"tagihan\s*listrik|rekening\s*listrik", 4), (r"id\s*pelanggan|idpel", 2),
          (r"\blwbp\b|\bwbp\b", 3), (r"\bkvarh\b|\bkva\b|daya\s*terpasang", 2), (r"listrik|electricity", 2), (r"\bgenset\b", 0.5))))

_add(TypeRules("pupuk", (
    Rule("fertilizer_type", "enum", anchors=(r"jenis\s*pupuk", r"nama\s*pupuk", r"pupuk", r"produk", r"nama\s*barang", r"uraian",
                                             r"item", r"fertili[sz]er", r"jenis"), values=FERT_ENUM),
    Rule("mass_kg", "number", anchors=(r"jumlah\s*pupuk", r"berat", r"massa", r"kuantitas", r"qty", r"quantity", r"tonase",
                                       r"realisasi(?:\s*aplikasi)?", r"total\s*aplikasi", r"volume", r"netto"),
         weak=(r"jumlah", r"total"), unit="kg", unit_required=True, rng=(1, 5e9), reject=MONEY, primary=True),
    Rule("n_content_pct", "number", anchors=(r"kadar\s*n(?:itrogen)?", r"kandungan\s*n(?:itrogen)?", r"n\s*total", r"nitrogen",
                                             r"%\s*n\b", r"\bn\b"), unit="%", rng=(0, 46.5)),
    Rule("organic_mass_t", "number", anchors=(r"tandan\s*kosong", r"tankos", r"janjang\s*kosong", r"\bjjk\b", r"\btkks\b",
                                              r"empty\s*fruit\s*bunch", r"\befb\b", r"kompos"),
         unit="t", unit_required=True, rng=(0, 1e7), reject=MONEY, item=False),
    Rule("organic_n_pct", "number", anchors=(r"kadar\s*n\s*(?:tankos|tandan|organik|kompos)", r"n\s*(?:tankos|organik)"),
         unit="%", rng=(0, 10), item=False),
), item_enum="fertilizer_type",
    hints=((r"pupuk|fertili[sz]er", 3), (r"\bnpk\b|\burea\b|\bmop\b|\bkcl\b|dolomit", 3), (r"aplikasi\s*pupuk|pemupukan", 3),
           (r"tandan\s*kosong|tankos", 2), (r"dosis", 1))))

_add(TypeRules("lahan", (
    Rule("block", "text", anchors=(r"blok", r"block", r"petak", r"kode\s*blok"), values=r"[A-Z]{0,3}\s?-?\d{1,4}[A-Z]?"),
    Rule("area_ha", "number", anchors=(r"luas(?:\s*(?:tanam|tertanam|areal|lahan|blok|kebun))?", r"luasan", r"area", r"hektar",
                                       r"planted\s*area"), unit="ha", rng=(0.01, 5e6), reject=MONEY + ("ton/ha", "t/ha"),
         primary=True),
    Rule("soil_type", "enum", anchors=(r"jenis\s*tanah", r"tanah", r"soil"), values=SOIL_ENUM),
    Rule("ffb_harvested_t", "number", anchors=(r"produksi\s*tbs", r"tbs\s*dipanen", r"hasil\s*panen", r"panen", r"\bffb\b",
                                               r"tonase\s*tbs", r"produksi"),
         unit="t", unit_required=True, rng=(0, 1e8), reject=MONEY + ("ton/ha", "t/ha", "/ha")),
    Rule("planting_year", "text", anchors=(r"tahun\s*tanam", r"\btt\b", r"planting\s*year", r"tahun"), values=r"(?:19[6-9]\d|20[0-4]\d)"),
), hints=((r"\bblok\b|\bafdeling\b", 3), (r"luas|hektar|\bha\b", 2), (r"tahun\s*tanam", 3), (r"gambut|mineral|jenis\s*tanah", 2),
          (r"panen|tbs\s*dipanen", 1.5))))

_add(TypeRules("produksi", (
    Rule("ffb_processed_t", "number", anchors=(r"tbs\s*(?:diolah|olah|masuk|diterima|proses|processed)", r"total\s*tbs",
                                               r"ffb\s*processed", r"bahan\s*baku\s*tbs", r"tbs"),
         unit="t", rng=(0, 1e8), reject=MONEY + ("kapasitas", "ton/jam", "t/jam", "/jam", "rendemen", "oer"), primary=True),
    Rule("cpo_t", "number", anchors=(r"produksi\s*cpo", r"\bcpo\b", r"crude\s*palm\s*oil", r"minyak\s*sawit\s*mentah"),
         unit="t", rng=(0, 3e7), reject=MONEY + ("rendemen", "oer", "ffa", "kadar", r"stok\s*awal")),
    Rule("pko_t", "number", anchors=(r"produksi\s*pko", r"\bpko\b", r"palm\s*kernel\s*oil", r"minyak\s*inti\s*sawit",
                                     r"kernel", r"inti\s*sawit", r"\bpk\b"),
         unit="t", rng=(0, 1e7), reject=MONEY + ("rendemen", "ker", "kadar", r"stok\s*awal")),
), hints=((r"\bpks\b|pabrik\s*kelapa\s*sawit", 3), (r"tbs\s*(?:diolah|olah|masuk|diterima)", 4), (r"\bcpo\b", 2),
          (r"\bpko\b|kernel", 2), (r"rendemen|\boer\b|\bker\b", 2), (r"produksi", 1.5), (r"timbangan|weighbridge", 2))))

_add(TypeRules("pome", (
    Rule("volume_m3", "number", anchors=(r"volume\s*(?:pome|limbah(?:\s*cair)?)", r"debit(?:\s*limbah)?", r"total\s*volume",
                                         r"volume", r"limbah\s*cair", r"\bpome\b", r"effluent\s*volume"),
         unit="m3", unit_required=True, rng=(1, 1e8), reject=MONEY + ("kapasitas", "biogas", "gas"), primary=True),
    Rule("cod_in_mgl", "number", anchors=(r"cod\s*(?:inlet|masuk|in\b|awal|influent|sebelum)", r"(?:inlet|influent)\s*cod",
                                          r"cod\s*\(\s*inlet\s*\)"),
         unit="mg/L", rng=(100, 200000), row_label=r"\bcod\b", col_label=r"inlet|masuk|influent|in\b|awal|sebelum"),
    Rule("cod_out_mgl", "number", anchors=(r"cod\s*(?:outlet|keluar|out\b|akhir|effluent|sesudah)", r"(?:outlet|effluent)\s*cod",
                                           r"cod\s*\(\s*outlet\s*\)"),
         unit="mg/L", rng=(0, 200000), row_label=r"\bcod\b", col_label=r"outlet|keluar|effluent|out\b|akhir|sesudah"),
    Rule("biogas_m3", "number", anchors=(r"biogas(?:\s*(?:tertangkap|dihasilkan|captured|dibakar))?", r"gas\s*metana",
                                         r"methane\s*captured", r"gas\s*ditangkap"),
         unit="m3", unit_required=True, rng=(0, 1e9), reject=MONEY),
    Rule("ch4_fraction", "number", anchors=(r"kadar\s*ch4", r"kandungan\s*ch4", r"\bch4\b", r"metana\s*%"), rng=(0, 100), item=False),
), hints=((r"\bpome\b", 4), (r"\bcod\b", 3), (r"limbah\s*cair", 3), (r"\bipal\b|kolam\s*(?:anaerob|limbah)", 2),
          (r"inlet|outlet", 1), (r"biogas", 2), (r"\bbod\b|\btss\b", 1.5))))

_add(TypeRules("transport", (
    Rule("load_t", "number", anchors=(r"muatan", r"tonase", r"berat\s*(?:muatan|bersih|netto)?", r"netto", r"bruto",
                                      r"jumlah\s*angkut", r"kuantitas", r"qty"),
         weak=(r"jumlah", r"total"), unit="t", unit_required=True, rng=(0.01, 1e8), reject=MONEY, primary=True),
    Rule("distance_km", "number", anchors=(r"jarak(?:\s*tempuh)?", r"distance", r"km\s*tempuh", r"rute"), unit="km",
         rng=(0.1, 50000), reject=MONEY + (r"km\s*\d",)),
    Rule("mode", "enum", anchors=(r"moda", r"kendaraan", r"armada", r"jenis\s*angkutan", r"mode"), values=MODE_ENUM),
), item_enum="mode",
    hints=((r"ekspedisi|angkutan|logistik|freight", 3), (r"surat\s*jalan|delivery\s*order", 2), (r"jarak|\bkm\b", 2),
           (r"muatan|ritase", 2), (r"truk|truck|tongkang|kapal", 1.5))))

_add(TypeRules("b3", (
    Rule("waste_type", "enum", anchors=(r"jenis\s*limbah", r"nama\s*limbah", r"uraian", r"limbah", r"jenis"), values=WASTE_ENUM),
    Rule("mass_t", "number", anchors=(r"berat", r"massa", r"jumlah\s*limbah", r"kuantitas", r"qty", r"tonase", r"netto"),
         weak=(r"jumlah", r"total"), unit="t", unit_required=True, rng=(0.0001, 1e7), reject=MONEY, primary=True),
    Rule("treatment", "enum", anchors=(r"metode(?:\s*pengolahan)?", r"pengolahan", r"diolah", r"perlakuan", r"tujuan", r"disposal"),
         values=TREAT_ENUM),
), item_enum="waste_type",
    hints=((r"\bb3\b", 4), (r"manifest", 2), (r"limbah\s*padat|neraca\s*limbah", 3), (r"oli\s*bekas|aki\s*bekas|majun", 2),
           (r"insinerasi|landfill", 2))))

_add(TypeRules("air", (
    Rule("water_m3", "number", anchors=(r"pemakaian(?:\s*air)?", r"volume(?:\s*air)?", r"debit", r"pengambilan(?:\s*air)?",
                                        r"konsumsi\s*air", r"total"),
         unit="m3", unit_required=True, rng=(0.1, 1e9), reject=MONEY + ("stand", r"meter\s*awal", r"meter\s*akhir"), primary=True),
    Rule("source", "enum", anchors=(r"sumber(?:\s*air)?", r"source"), values=WATER_ENUM),
), hints=((r"\bpdam\b", 4), (r"\bair\b", 1.5), (r"sumur|pengambilan\s*air|\bsipa\b", 3), (r"debit", 1.5), (r"water", 2))))

_add(TypeRules("material", (
    Rule("material_name", "text", anchors=(r"nama\s*(?:barang|material|bahan)", r"material", r"uraian", r"deskripsi", r"description",
                                           r"item", r"produk", r"bahan")),
    Rule("quantity_t", "number", anchors=(r"kuantitas", r"qty", r"quantity", r"berat", r"netto", r"tonase", r"volume"),
         weak=(r"jumlah", r"total"), unit="t", unit_required=True, rng=(0.0001, 1e8), reject=MONEY, primary=True),
    Rule("see_supplier", "number", anchors=(r"\bsee\b", r"emisi\s*tertanam", r"embedded\s*emissions?", r"intensitas\s*emisi",
                                            r"carbon\s*footprint", r"jejak\s*karbon"), rng=(0, 60), reject=MONEY),
    Rule("supplier", "text", anchors=(r"pemasok", r"supplier", r"vendor", r"penjual", r"seller"),
         values=r"(?:PT|CV|UD|Koperasi|KUD)\.?\s+[A-Z][\w .&,'-]{2,60}"),
    Rule("country", "text", anchors=(r"negara\s*asal", r"country\s*of\s*origin", r"origin", r"asal\s*barang", r"asal")),
), hints=((r"material|bahan\s*baku|bahan\s*kimia", 2), (r"purchase\s*order|\bpo\b", 1.5), (r"sertifikat\s*pemasok|\bsee\b", 3),
          (r"emisi\s*tertanam|embedded", 3), (r"surat\s*jalan", 1), (r"faktur\s*pembelian", 1))))


def product_rule(code: str, name: str = "") -> Rule:
    anchors = [rf"\b{re.escape(code.lower())}\b"]
    if name and len(name) > 3:
        anchors.append(re.escape(name.lower()))
    return Rule(f"{code.lower()}_t", "number", anchors=tuple(anchors), unit="t", rng=(0, 1e8),
                reject=MONEY + ("rendemen", "kadar", r"stok\s*awal"))


# Kadar N standar bila tidak tertulis
N_STANDARD = [
    (re.compile(r"\burea\b", re.I), Decimal(46)),
    (re.compile(r"\bza\b", re.I), Decimal(21)),
    (re.compile(r"\bdap\b", re.I), Decimal(18)),
    (re.compile(r"\bmap\b", re.I), Decimal(11)),
    (re.compile(r"\bkno3\b", re.I), Decimal(13)),
    (re.compile(r"\bmop\b|\bkcl\b|\btsp\b|sp\s*-?36|dolomit|kieserit|borate|rock\s*phosphate", re.I), Decimal(0)),
]
NPK_GRADE_RE = re.compile(r"npk\D{0,20}?(\d{1,2})\s*[-.]\s*\d{1,2}\s*[-.]\s*\d{1,2}", re.I)
