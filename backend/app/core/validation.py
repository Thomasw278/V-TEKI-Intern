"""Aturan validasi dokumen & periode, serta ringkasan kebutuhan dokumen."""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from decimal import Decimal

from .aggregation import COUNTED_STATUSES, DocInput
from .catalog import DOC_TYPE_BY_CODE, DOC_TYPES, FACTOR_BY_CODE
from .engine import D0, ActivityData, d

LOW_CONFIDENCE = 0.75

MONTHS_ID = {
    "jan": 1, "januari": 1, "feb": 2, "februari": 2, "mar": 3, "maret": 3, "apr": 4, "april": 4,
    "mei": 5, "may": 5, "jun": 6, "juni": 6, "jul": 7, "juli": 7, "agu": 8, "agt": 8, "agustus": 8, "aug": 8,
    "sep": 9, "september": 9, "okt": 10, "oktober": 10, "oct": 10, "nov": 11, "november": 11,
    "des": 12, "desember": 12, "dec": 12,
}


@dataclass
class Issue:
    severity: str  # critical | warning | info
    code: str
    title: str
    message: str
    ref_type: str = "period"
    ref_id: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


REQ_STATUSES = ("required", "optional", "not_applicable")


@dataclass(frozen=True)
class ReqSpec:
    """Status kebutuhan efektif satu jenis dokumen untuk satu perusahaan (atau snapshot periode terkunci).

    status: required (wajib) | optional (opsional) | not_applicable (tidak berlaku → dikeluarkan dari perhitungan).
    source: default (default katalog) | manual (diatur superadmin) | profile:<id> | exception:<id>.
    """
    code: str
    no: int
    name: str
    scope: str
    description: str
    status: str = "required"
    reason: str | None = None
    source: str = "default"
    builtin: bool = True
    has_default: bool = False
    can_exclude: bool = True
    scope12: bool = False
    set_by: str | None = None
    set_at: str | None = None
    fields: tuple[str, ...] = ()

    @property
    def required(self) -> bool:
        return self.status == "required"

    @property
    def excluded(self) -> bool:
        return self.status == "not_applicable"


def default_specs() -> list[ReqSpec]:
    """Kebutuhan bawaan katalog (perilaku sebelum ada pengaturan per perusahaan)."""
    return [ReqSpec(dt.code, dt.no, dt.name, dt.scope, dt.description, dt.default_status,
                    has_default=dt.has_default, can_exclude=dt.can_exclude, scope12=dt.scope12,
                    fields=tuple(f.label for f in dt.fields)) for dt in DOC_TYPES]


def parse_month(text: str, year: int | None = None) -> tuple[int, int] | None:
    """'2025-08', '08/2025', 'Agustus 2025', '2025-08-01' → (2025, 8)."""
    from .extraction import months_in

    t = (text or "").strip()
    found = months_in(t)
    if found:
        return found[0]
    m = re.search(r"([a-zA-Z]+)", t)
    if m and m.group(1).lower() in MONTHS_ID and year:
        return year, MONTHS_ID[m.group(1).lower()]
    return None


def _items(fields) -> list[dict]:
    return fields if isinstance(fields, list) else [fields]


def _lookup(d: dict, item: int, key: str, default=None):
    if (item, key) in d:
        return d[(item, key)]
    return d.get(key, default) if item == 0 or (item, key) not in d else default


def validate_document(type_code: str | None, fields, confidence: dict, confirmed: dict,
                      supporting: bool = False) -> list[Issue]:
    """`fields` boleh satu dict (dokumen satu item) atau daftar item (dokumen tabel).

    `supporting` = jenis dokumen pendukung buatan superadmin: hanya bukti, tanpa field angka.
    """
    if supporting:
        return []
    issues: list[Issue] = []
    if not type_code or type_code not in DOC_TYPE_BY_CODE:
        return [Issue("critical", "NO_TYPE", "Kategori belum dipilih", "Pilih salah satu dari 10 kategori dokumen.", "document")]
    dt = DOC_TYPE_BY_CODE[type_code]
    items = _items(fields)
    if not items or not any(items):
        return [Issue("critical", "NO_DATA", "Belum ada data terbaca",
                      "Isi field secara manual atau unggah ulang dokumen yang lebih jelas.", "document")]
    multi = len(items) > 1
    for i, it in enumerate(items):
        pre = f"Baris {i + 1}: " if multi else ""
        ref = (lambda k: f"{i}:{k}") if multi else (lambda k: k)
        for spec in dt.fields:
            v = it.get(spec.key)
            empty = v is None or (isinstance(v, str) and not v.strip())
            if spec.required and empty:
                issues.append(Issue("critical", "FIELD_MISSING", f"{pre}{spec.label} kosong",
                                    f"Field wajib '{spec.label}' belum terisi.", "field", ref(spec.key)))
                continue
            conf = confidence.get((i, spec.key), confidence.get(spec.key) if not multi else None)
            ok = confirmed.get((i, spec.key), confirmed.get(spec.key) if not multi else None)
            if not empty and conf is not None and conf < LOW_CONFIDENCE and not ok:
                issues.append(Issue("warning", "LOW_CONFIDENCE", f"{pre}{spec.label} perlu dicek",
                                    f"Keyakinan ekstraksi {conf:.2f}. Konfirmasi atau koreksi nilainya.".replace("0.", "0,"),
                                    "field", ref(spec.key)))

        num = lambda k: d(it[k]) if k in it and it[k] not in (None, "") else None  # noqa: E731
        try:
            if type_code == "pupuk":
                n = num("n_content_pct")
                if n is not None and not (D0 <= n <= Decimal(46)):
                    issues.append(Issue("critical", "N_RANGE", f"{pre}Kadar N di luar rentang",
                                        "Kadar N harus 0–46% (urea 46%).", "field", ref("n_content_pct")))
            if type_code == "pome":
                cin, cout = num("cod_in_mgl"), num("cod_out_mgl")
                if cin is not None and not (Decimal(10000) <= cin <= Decimal(100000)):
                    issues.append(Issue("warning", "COD_RANGE", f"{pre}COD masuk tidak lazim",
                                        "COD masuk POME umumnya 10.000–100.000 mg/L.", "field", ref("cod_in_mgl")))
                if cin is not None and cout is not None and cout > cin:
                    issues.append(Issue("critical", "COD_ORDER", f"{pre}COD keluar > COD masuk",
                                        "Periksa kembali angka COD keluar dan masuk.", "field", ref("cod_out_mgl")))
            if type_code == "transport":
                vl = num("volume_l")
                lt = num("load_t")
                dk = num("distance_km")
                has_vol = vl is not None and vl > 0
                has_tkm = (lt is not None and lt > 0) and (dk is not None and dk > 0)
                if not has_vol and not has_tkm:
                    issues.append(Issue("critical", "FIELD_MISSING", f"{pre}Data transport belum lengkap",
                                        "Isi kuantitas BBM (L) atau muatan (t) dan jarak (km).", "field", ref("volume_l")))
            for spec in dt.fields:
                if spec.kind == "number":
                    v = num(spec.key)
                    if v is not None and v < 0:
                        issues.append(Issue("critical", "NEGATIVE", f"{pre}{spec.label} negatif",
                                            "Nilai tidak boleh negatif.", "field", ref(spec.key)))
        except Exception:
            issues.append(Issue("critical", "NOT_NUMBER", f"{pre}Nilai bukan angka", "Periksa format angka.", "document"))
    return issues


# Rincian kebutuhan data per kategori (seperti daftar periksa konsultan)
SUB_REQUIREMENTS: dict[str, list[tuple[str, str, str, bool]]] = {
    "material": [("quantity_t", "Material masuk", "Faktur pembelian / surat jalan", True),
                 ("see_supplier", "SEE pemasok", "Sertifikat atau data emisi pemasok", False)],
    "listrik": [("kwh_purchased", "Listrik kebun & pabrik dari PLN", "Tagihan / rekening listrik", True),
                ("_months", "Cakupan 12 bulan", "Satu tagihan per bulan atau rekap tahunan", True),
                ("kwh_sold", "Penjualan listrik ke luar", "Catatan penjualan listrik", False)],
    "bbm": [("volume_l", "Solar kebun & pabrik", "Faktur pembelian / rekap BBM", True),
            ("fuel_type", "Jenis & campuran BBM (mis. B40)", "Faktur BBM", True),
            ("usage", "Penggunaan (genset, kendaraan, alat berat)", "Log genset / kendaraan", False)],
    "pupuk": [("mass_kg", "Pupuk kimia", "Faktur atau rekap pemakaian (jumlah & kadar N)", True),
              ("n_content_pct", "Kadar N tiap jenis pupuk", "Label / spesifikasi pupuk", True),
              ("organic_mass_t", "Pupuk organik (tandan kosong)", "Catatan aplikasi tandan kosong", False)],
    "lahan": [("area_ha", "Blok tanam & luas", "Master blok tanam (luas, tahun tanam)", True),
              ("soil_type", "Jenis tanah / gambut", "Data pengelolaan gambut", True),
              ("ffb_harvested_t", "Produksi TBS kebun", "Rekap panen kebun", False)],
    "produksi": [("ffb_processed_t", "Pengolahan TBS", "Rekap produksi / laporan harian pabrik", True),
                 ("cpo_t", "Produksi CPO", "Rekap produksi / tiket timbangan", True),
                 ("pko_t", "Produksi PKO / kernel", "Rekap produksi", True)],
    "pome": [("volume_m3", "Volume limbah cair (POME)", "Log volume POME", True),
             ("cod_in_mgl", "COD masuk & keluar", "Laporan laboratorium COD", True),
             ("biogas_m3", "Penangkapan metana", "Catatan biogas / flare", False)],
    "transport": [("volume_l", "Kuantitas BBM angkutan", "Faktur BBM / log armada / surat jalan", False),
                  ("load_t", "Muatan angkutan (opsi ton-km)", "Surat jalan / manifest", False),
                  ("distance_km", "Jarak tempuh (opsi ton-km)", "Rute / invoice ekspedisi", False)],
    "b3": [("mass_t", "Limbah B3 dikirim", "Manifest limbah B3", True),
           ("treatment", "Metode pengolahan", "Berita acara pengolahan", False)],
    "air": [("water_m3", "Pengambilan air", "Meter air / tagihan PDAM", True),
            ("source", "Sumber air", "Izin pengambilan air", False)],
}


def _months_covered(docs: list[DocInput], year: int | None) -> set[int]:
    months = set()
    for x in docs:
        for it in x.all_items:
            pm = parse_month(str(it.get("billing_month") or ""), year)
            if pm and (year is None or pm[0] == year):
                months.add(pm[1])
    return months


def requirements(docs: list[DocInput], defaults_used: dict[str, str] | None = None, year: int | None = None,
                 specs: list[ReqSpec] | None = None) -> list[dict]:
    defaults_used = defaults_used or {}
    out = []
    for dt in specs if specs is not None else default_specs():
        mine = [x for x in docs if x.type_code == dt.code]
        counted = [x for x in mine if x.status in COUNTED_STATUSES]
        pending = [x for x in mine if x.status in ("uploaded", "processing", "needs_review")]
        subs = []
        for key, label, hint, req in SUB_REQUIREMENTS.get(dt.code, []):
            detail = ""
            if key == "_months":
                got = _months_covered(counted, year)
                pend = _months_covered(pending, year) - got
                st = "complete" if len(got) >= 12 else "partial" if got else ("in_review" if pend else "missing")
                detail = f"{len(got)}/12 bulan"
            else:
                has = lambda xs: any(it.get(key) not in (None, "") for x in xs for it in x.all_items)  # noqa: E731
                if has(counted):
                    st = "complete"
                elif dt.code in defaults_used and req:
                    st = "default"
                elif has(pending):
                    st = "in_review"
                else:
                    st = "missing"
            subs.append({"key": key, "label": label, "hint": hint, "required": req, "state": st, "detail": detail})
        req_subs = [x for x in subs if x["required"]]
        if dt.excluded:
            state = "excluded"
        elif counted and all(x["state"] == "complete" for x in req_subs):
            state = "partial" if pending else "complete"
        elif counted:
            state = "partial"
        elif dt.code in defaults_used:
            state = "default"
        elif pending:
            state = "in_review"
        else:
            state = "missing"
        items = sum(len(x.all_items) for x in counted)
        if req_subs:
            progress = round(sum(1 for x in req_subs if x["state"] == "complete") / len(req_subs), 2)
        elif not subs:  # dokumen pendukung tanpa rincian field
            progress = 1 if counted else 0
        else:
            progress = 0
        out.append({
            "code": dt.code, "no": dt.no, "name": dt.name, "required": dt.required,
            "status": dt.status, "status_reason": dt.reason, "status_source": dt.source,
            "status_set_by": dt.set_by, "status_set_at": dt.set_at,
            "excluded": dt.excluded, "builtin": dt.builtin, "has_default": dt.has_default,
            "can_exclude": dt.can_exclude, "scope12": dt.scope12,
            "scope": dt.scope, "description": dt.description,
            "fields": list(dt.fields),
            "total": len(mine), "counted": len(counted), "pending": len(pending), "rows": items,
            "state": state, "items": subs, "progress": progress,
        })
    return out


def validate_period(
    docs: list[DocInput],
    act: ActivityData,
    year: int,
    factor_approved: dict[str, bool],
    specs: list[ReqSpec] | None = None,
    pending_exceptions: tuple[str, ...] | list[str] = (),
) -> list[Issue]:
    """`factor_approved` sebaiknya sudah dibatasi ke faktor yang dipakai (lihat catalog.factor_in_use)."""
    issues: list[Issue] = []
    counted = [x for x in docs if x.status in COUNTED_STATUSES]
    specs = specs if specs is not None else default_specs()

    # Kelengkapan kategori sesuai status kebutuhan perusahaan
    for dt in specs:
        if dt.excluded:
            issues.append(Issue("info", "CATEGORY_EXCLUDED", f"{dt.name} tidak berlaku",
                                (dt.reason or "Dikecualikan dari perhitungan oleh superadmin.")
                                + " Kategori ini tidak dihitung dan dicantumkan di laporan.", "category", dt.code))
            mine = [x for x in docs if x.type_code == dt.code and x.status != "failed"]
            if mine:
                issues.append(Issue("warning", "EXCLUDED_HAS_DOCS", f"{len(mine)} dokumen {dt.name} tidak dihitung",
                                    "Kategori ini berstatus Tidak berlaku. Ajukan perubahan status bila kegiatan ini ternyata ada.",
                                    "category", dt.code))
            continue
        has = any(x.type_code == dt.code for x in counted)
        if has:
            continue
        if dt.code in act.defaults_used:
            # nilai bawaan menghalangi penguncian hanya bila kategorinya wajib
            issues.append(Issue("critical" if dt.required else "warning", "DEFAULT_USED", f"{dt.name} memakai nilai bawaan",
                                act.defaults_used[dt.code] + ". Unggah dokumen asli untuk mengganti.", "category", dt.code))
        elif dt.required:
            issues.append(Issue("critical", "CATEGORY_MISSING", f"{dt.name} belum ada",
                                "Kategori wajib belum memiliki dokumen tervalidasi.", "category", dt.code))

    # Permintaan pengecualian dari perusahaan yang belum diputus superadmin
    names = {dt.code: dt.name for dt in specs}
    for code in pending_exceptions:
        issues.append(Issue("warning", "EXCEPTION_PENDING", f"Permintaan pengecualian {names.get(code, code)} belum diputus",
                            "Superadmin belum memutus permintaan ini. Status kebutuhan bisa berubah setelah diputus.",
                            "category", code))

    # Dokumen belum diajukan / dikembalikan / menunggu admin
    pending = [x for x in docs if x.status == "needs_review"]
    if pending:
        issues.append(Issue("warning", "PENDING_REVIEW", f"{len(pending)} dokumen belum diajukan",
                            "Periksa angkanya lalu ajukan ke admin. Dokumen ini belum ikut dihitung.", "period"))
    rejected = [x for x in docs if x.status == "rejected"]
    if rejected:
        issues.append(Issue("warning", "DOC_REJECTED", f"{len(rejected)} dokumen dikembalikan admin",
                            "Perbaiki sesuai catatan admin lalu ajukan ulang.", "period"))
    waiting = [x for x in docs if x.status == "validated"]
    if waiting:
        issues.append(Issue("info", "WAITING_APPROVAL", f"{len(waiting)} dokumen menunggu persetujuan admin",
                            "Sudah ikut dihitung sebagai draf; laporan final menunggu persetujuan.", "period"))

    # Cakupan 12 bulan tagihan listrik
    months = _months_covered([x for x in counted if x.type_code == "listrik"], year)
    if "listrik" not in act.excluded and any(x.type_code == "listrik" for x in counted) and len(months) < 12:
        missing = [m for m in range(1, 13) if m not in months]
        names = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
        issues.append(Issue("warning", "ELEC_MONTHS", f"Tagihan listrik {len(months)} dari 12 bulan",
                            "Bulan belum ada: " + ", ".join(names[m - 1] for m in missing), "category", "listrik"))

    # Produk
    for p in act.products:
        if p.tonnes <= 0:
            issues.append(Issue("critical", "PRODUCT_ZERO", f"Tonase {p.code} nol",
                                f"Dokumen produksi belum mencatat tonase {p.code}. SEE tidak bisa dihitung.", "category", "produksi"))

    # Rendemen & rasio POME
    ffb = act.ffb_processed_t
    if ffb > 0:
        cpo = next((p.tonnes for p in act.products if p.code == "CPO"), None)
        if cpo:
            oer = cpo / ffb * 100
            if not (Decimal(18) <= oer <= Decimal(26)):
                issues.append(Issue("warning", "OER_RANGE", "Rendemen CPO tidak lazim",
                                    f"Rendemen {oer:.1f}% (lazim 18–26% dari TBS diolah).", "category", "produksi"))
        if "pome" not in act.defaults_used and act.pome_volume_m3 > 0:
            ratio = act.pome_volume_m3 / ffb
            if not (Decimal("0.5") <= ratio <= Decimal("0.7")):
                issues.append(Issue("warning", "POME_RATIO", "Rasio POME/TBS tidak lazim",
                                    f"{ratio:.2f} m3/t (lazim 0,5–0,7 m3/t TBS diolah).", "category", "pome"))

    # Duplikat nomor dokumen
    seen: dict[tuple, int] = {}
    for x in docs:
        if x.doc_number:
            k = (x.type_code, x.doc_number.strip().lower(), (x.supplier or "").strip().lower())
            if k in seen:
                issues.append(Issue("warning", "DUPLICATE_NO", "Nomor dokumen ganda",
                                    f"Nomor {x.doc_number} muncul lebih dari sekali.", "document", str(x.id)))
            seen[k] = x.id

    # Faktor draf
    drafts = [c for c, ok in factor_approved.items() if not ok]
    if drafts:
        names = ", ".join(FACTOR_BY_CODE[c].name if c in FACTOR_BY_CODE else c for c in drafts)
        issues.append(Issue("warning", "FACTOR_DRAFT", f"{len(drafts)} faktor emisi belum disetujui",
                            f"Draf: {names}. Hasil hanya untuk internal sampai disetujui admin peninjau.", "factor"))
    return issues
