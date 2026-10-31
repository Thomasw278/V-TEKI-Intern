"""Mengubah field hasil ekstraksi (per dokumen, per baris/item) menjadi data aktivitas baku.

Setiap kontribusi dicatat di `act.trace` sehingga halaman "Data aktivitas" bisa
menunjukkan dokumen dan baris mana yang membentuk setiap angka.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal

from .engine import D0, ActivityData, FuelEntry, MaterialEntry, ProductInput, WasteEntry, d

COUNTED_STATUSES = ("validated", "approved")
PEAT_RE = re.compile(r"gambut|peat|organosol|histosol", re.I)


@dataclass
class DocInput:
    id: int
    type_code: str | None
    status: str
    fields: dict[str, object] = field(default_factory=dict)  # item tunggal (kompatibilitas)
    confidence: dict = field(default_factory=dict)            # key atau (item, key) → keyakinan
    confirmed: dict = field(default_factory=dict)
    doc_number: str | None = None
    supplier: str | None = None
    sha256: str | None = None
    items: list[dict[str, object]] | None = None
    name: str = ""

    @property
    def all_items(self) -> list[dict[str, object]]:
        if self.items is not None:
            return self.items
        return [self.fields] if self.fields else []


@dataclass
class ProductSpec:
    code: str
    name: str
    price: Decimal


def _num(fields: dict, key: str) -> Decimal:
    v = fields.get(key)
    if v is None or isinstance(v, str) and not v.strip():
        return D0
    try:
        return d(v)
    except Exception:
        return D0


def _txt(fields: dict, key: str) -> str:
    v = fields.get(key)
    return "" if v is None else str(v)


def build_activity(
    docs: list[DocInput],
    products: list[ProductSpec],
    factors: dict[str, Decimal],
    excluded: dict[str, str] | None = None,
) -> ActivityData:
    """Hanya dokumen berstatus tervalidasi/disetujui yang dihitung.

    `excluded` = kategori berstatus "Tidak berlaku" untuk perusahaan ini ({kode: alasan}). Dokumennya
    tidak dihitung dan nilai bawaan tidak dipakai, karena kegiatannya memang tidak ada.
    """
    act = ActivityData(excluded=dict(excluded or {}))
    counted = [x for x in docs if x.status in COUNTED_STATUSES and x.type_code and x.type_code not in act.excluded]
    by_type: dict[str, list[DocInput]] = {}
    for x in counted:
        by_type.setdefault(x.type_code, []).append(x)

    def trace(cat: str, metric: str, value: Decimal, unit: str, doc: DocInput, item: int, note: str = ""):
        act.trace.append({"category": cat, "metric": metric, "value": float(value), "unit": unit,
                          "doc_id": doc.id, "doc_name": doc.name, "item": item, "note": note})

    def rows(code: str):
        for x in by_type.get(code, []):
            for i, it in enumerate(x.all_items):
                yield x, i, it

    # BBM
    for x, i, it in rows("bbm"):
        vol = _num(it, "volume_l")
        if vol > 0:
            ft = _txt(it, "fuel_type") or "solar"
            act.fuels.append(FuelEntry(ft, vol))
            trace("bbm", f"Volume {ft}", vol, "L", x, i)

    # Listrik
    for x, i, it in rows("listrik"):
        kwh = _num(it, "kwh_purchased")
        if kwh:
            act.electricity_purchased_mwh += kwh / 1000
            trace("listrik", "Listrik dibeli", kwh, "kWh", x, i, _txt(it, "billing_month"))
        sold = _num(it, "kwh_sold")
        if sold:
            act.electricity_sold_mwh += sold / 1000
            trace("listrik", "Listrik dijual", sold, "kWh", x, i)

    # Pupuk
    for x, i, it in rows("pupuk"):
        mass_kg = _num(it, "mass_kg")
        n_pct = _num(it, "n_content_pct")
        if mass_kg:
            n_t = mass_kg * n_pct / 100 / 1000
            act.n_applied_t += n_t
            ft = _txt(it, "fertilizer_type") or "pupuk"
            trace("pupuk", f"N dari {ft}", n_t, "t N", x, i, f"{mass_kg} kg × {n_pct}%")
            if re.search(r"\burea\b", ft, re.I):
                act.urea_t += mass_kg / 1000
                trace("pupuk", "Urea", mass_kg / 1000, "t", x, i)
        org = _num(it, "organic_mass_t") * _num(it, "organic_n_pct") / 100
        if org:
            act.n_applied_t += org
            trace("pupuk", "N dari pupuk organik", org, "t N", x, i)

    # Lahan gambut
    for x, i, it in rows("lahan"):
        area = _num(it, "area_ha")
        if PEAT_RE.search(_txt(it, "soil_type")):
            act.peat_area_ha += area
            trace("lahan", f"Gambut {_txt(it, 'block')}".strip(), area, "ha", x, i)
        elif area:
            trace("lahan", f"Tanah mineral {_txt(it, 'block')}".strip(), area, "ha", x, i)

    # Produksi
    ffb = D0
    tonnes: dict[str, Decimal] = {p.code.upper(): D0 for p in products}
    for x, i, it in rows("produksi"):
        v = _num(it, "ffb_processed_t")
        if v:
            ffb += v
            trace("produksi", "TBS diolah", v, "t", x, i)
        for code in tonnes:
            t = _num(it, f"{code.lower()}_t")
            if t:
                tonnes[code] += t
                trace("produksi", f"Produksi {code}", t, "t", x, i)
        other = _txt(it, "product_code").upper().strip()
        if other in tonnes and _num(it, "product_t"):
            tonnes[other] += _num(it, "product_t")
            trace("produksi", f"Produksi {other}", _num(it, "product_t"), "t", x, i)
    act.products = [ProductInput(p.code.upper(), p.name, tonnes[p.code.upper()], d(p.price)) for p in products]
    act.ffb_processed_t = ffb

    # POME (tidak berlaku → tidak ada nilai bawaan; data tidak tersedia → nilai bawaan literatur)
    pome_rows = list(rows("pome"))
    if "pome" in act.excluded:
        pass
    elif pome_rows:
        vol_total = cod_weighted = captured_t = D0
        doc_dcod = {}
        for x, i, it in pome_rows:
            cin, cout = _num(it, "cod_in_mgl"), _num(it, "cod_out_mgl")
            if cin:
                doc_dcod[x.id] = max(cin - cout, D0) / 1000
        for x, i, it in pome_rows:
            vol = _num(it, "volume_m3")
            cin, cout = _num(it, "cod_in_mgl"), _num(it, "cod_out_mgl")
            dcod = max(cin - cout, D0) / 1000 if cin else doc_dcod.get(x.id, d(factors.get("pome_dcod_default", "45")))
            if vol:
                vol_total += vol
                cod_weighted += vol * dcod
                trace("pome", "Volume POME", vol, "m3", x, i, f"ΔCOD {dcod} kg/m3")
            frac = _num(it, "ch4_fraction") or d(factors.get("biogas_ch4_fraction", "0.6"))
            cap = _num(it, "biogas_m3") * frac * Decimal("0.716") / 1000
            if cap:
                captured_t += cap
                trace("pome", "CH4 tertangkap", cap, "t CH4", x, i)
        if vol_total > 0:
            act.pome_volume_m3 = vol_total
            act.pome_delta_cod_kg_m3 = cod_weighted / vol_total
            act.pome_ch4_captured_t = captured_t
        elif ffb > 0:
            act.pome_volume_m3 = ffb * d(factors.get("pome_m3_per_t_ffb", "0.6"))
            act.pome_delta_cod_kg_m3 = next(iter(doc_dcod.values()), d(factors.get("pome_dcod_default", "45")))
            act.defaults_used["pome"] = "Volume POME tidak ada di dokumen — memakai nilai bawaan × TBS diolah"
    elif ffb > 0:
        act.pome_volume_m3 = ffb * d(factors.get("pome_m3_per_t_ffb", "0.6"))
        act.pome_delta_cod_kg_m3 = d(factors.get("pome_dcod_default", "45"))
        act.defaults_used["pome"] = "Tidak ada dokumen POME tervalidasi — memakai nilai bawaan literatur"

    # Transportasi (BBM langsung jika volume_l > 0, fallback ton-km: muatan × jarak)
    for x, i, it in rows("transport"):
        vol = _num(it, "volume_l")
        if vol > 0:
            ft = _txt(it, "fuel_type") or "solar"
            act.fuels.append(FuelEntry(ft, vol))
            mode_desc = _txt(it, "mode")
            trace("transport", f"Volume {ft}" if not mode_desc else f"Volume {ft} ({mode_desc})", vol, "L", x, i)
        else:
            tkm = _num(it, "load_t") * _num(it, "distance_km")
            if tkm:
                act.transport_tkm += tkm
                trace("transport", f"Angkutan {_txt(it, 'mode')}".strip() or "Angkutan", tkm, "t-km", x, i)

    # Limbah
    for x, i, it in rows("b3"):
        m = _num(it, "mass_t")
        if m > 0:
            act.wastes.append(WasteEntry(m, _txt(it, "treatment")))
            trace("b3", _txt(it, "waste_type") or "Limbah", m, "t", x, i, _txt(it, "treatment"))

    # Material prekursor
    for x, i, it in rows("material"):
        q = _num(it, "quantity_t")
        if q > 0:
            name = _txt(it, "material_name") or "material"
            act.materials.append(MaterialEntry(name, q, _num(it, "see_supplier")))
            trace("material", name, q, "t", x, i, f"SEE {_txt(it, 'see_supplier') or '-'}")

    # Air (bukti pendukung, tidak masuk emisi)
    for x, i, it in rows("air"):
        w = _num(it, "water_m3")
        if w:
            trace("air", f"Air {_txt(it, 'source')}".strip(), w, "m3", x, i)

    return act
