"""Mesin hitung emisi tertanam (SEE) — murni Python, memakai Decimal.

Pola semua komponen: data aktivitas × faktor emisi × GWP.
Hasil dijumlahkan per kelompok (langsung / tidak langsung / hulu),
dialokasikan ke produk, lalu dibagi tonase produk.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from .catalog import GWP_SETS, fossil_fraction, fuel_factor_code

D0 = Decimal("0")
THOUSAND = Decimal("1000")


def d(x) -> Decimal:
    if isinstance(x, Decimal):
        return x
    if x is None or x == "":
        return D0
    return Decimal(str(x))


def fmt_id(x: Decimal, places: int = 0) -> str:
    """Format angka gaya Indonesia: 1.533.400 dan 0,938."""
    q = Decimal(1).scaleb(-places) if places else Decimal(1)
    v = x.quantize(q, rounding=ROUND_HALF_UP)
    s = f"{v:,.{places}f}"
    return s.replace(",", "_").replace(".", ",").replace("_", ".")


@dataclass
class FuelEntry:
    fuel_type: str
    volume_l: Decimal


@dataclass
class WasteEntry:
    mass_t: Decimal
    treatment: str = ""


@dataclass
class MaterialEntry:
    name: str
    quantity_t: Decimal
    see: Decimal  # t CO2e per t material


@dataclass
class ProductInput:
    code: str
    name: str
    tonnes: Decimal
    price: Decimal = Decimal("1")


@dataclass
class ActivityData:
    fuels: list[FuelEntry] = field(default_factory=list)
    electricity_purchased_mwh: Decimal = D0
    electricity_sold_mwh: Decimal = D0
    n_applied_t: Decimal = D0
    urea_t: Decimal = D0
    pome_volume_m3: Decimal = D0
    pome_delta_cod_kg_m3: Decimal = D0
    pome_ch4_captured_t: Decimal = D0
    peat_area_ha: Decimal = D0
    wastes: list[WasteEntry] = field(default_factory=list)
    transport_tkm: Decimal = D0
    materials: list[MaterialEntry] = field(default_factory=list)
    products: list[ProductInput] = field(default_factory=list)
    ffb_processed_t: Decimal = D0  # info untuk validasi (rendemen, rasio POME)
    # kategori yang memakai nilai bawaan: {"pome": "alasan"}
    defaults_used: dict[str, str] = field(default_factory=dict)
    # kategori berstatus "Tidak berlaku" untuk perusahaan ini: {"pupuk": "alasan"}.
    # Datanya tidak dihitung dan baris rumusnya dilewati (bukan diisi 0 diam-diam).
    excluded: dict[str, str] = field(default_factory=dict)
    trace: list[dict] = field(default_factory=list)


@dataclass
class Line:
    key: str
    name: str
    group: str  # direct | indirect | upstream
    scope: str
    activity: str
    factor: str
    formula: str
    calc: str
    value_t: Decimal
    source: str  # document | default


@dataclass
class Allocation:
    code: str
    name: str
    tonnes: Decimal
    price: Decimal
    share: Decimal
    see_direct: Decimal
    see_indirect: Decimal

    @property
    def see_total(self) -> Decimal:
        return self.see_direct + self.see_indirect


@dataclass
class Result:
    gwp_set: str
    allocation_method: str
    lines: list[Line]
    direct_t: Decimal
    indirect_t: Decimal
    upstream_t: Decimal
    electricity_sold_mwh: Decimal
    allocations: list[Allocation]
    biogenic_co2_t: Decimal
    excluded: dict[str, str] = field(default_factory=dict)

    @property
    def total_t(self) -> Decimal:
        return self.direct_t + self.indirect_t + self.upstream_t

    def to_dict(self) -> dict:
        r6 = lambda v: float(v.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP))
        return {
            "gwp_set": self.gwp_set,
            "allocation_method": self.allocation_method,
            "direct_t": r6(self.direct_t),
            "indirect_t": r6(self.indirect_t),
            "upstream_t": r6(self.upstream_t),
            "total_t": r6(self.total_t),
            "biogenic_co2_t": r6(self.biogenic_co2_t),
            "electricity_sold_mwh": r6(self.electricity_sold_mwh),
            "excluded": [{"code": k, "reason": v} for k, v in self.excluded.items()],
            "lines": [
                {
                    "key": ln.key, "name": ln.name, "group": ln.group, "scope": ln.scope,
                    "activity": ln.activity, "factor": ln.factor, "formula": ln.formula,
                    "calc": ln.calc, "value_t": r6(ln.value_t), "source": ln.source,
                }
                for ln in self.lines
            ],
            "allocations": [
                {
                    "code": a.code, "name": a.name, "tonnes": r6(a.tonnes), "price": r6(a.price),
                    "share": r6(a.share), "see_direct": r6(a.see_direct),
                    "see_indirect": r6(a.see_indirect), "see_total": r6(a.see_total),
                }
                for a in self.allocations
            ],
        }


class CalculationError(ValueError):
    pass


def calculate(
    act: ActivityData,
    factors: dict[str, Decimal],
    gwp_set: str = "AR5",
    allocation: str = "economic",
) -> Result:
    if gwp_set not in GWP_SETS:
        raise CalculationError(f"Set GWP tidak dikenal: {gwp_set}")
    if allocation not in ("economic", "mass"):
        raise CalculationError(f"Metode alokasi tidak dikenal: {allocation}")
    gwp = GWP_SETS[gwp_set]
    f = {k: d(v) for k, v in factors.items()}

    def need(code: str) -> Decimal:
        if code not in f:
            raise CalculationError(f"Faktor emisi '{code}' belum tersedia")
        return f[code]

    lines: list[Line] = []
    src = lambda cat: "default" if cat in act.defaults_used else "document"
    # Kategori "Tidak berlaku" dilewati seluruhnya: barisnya tidak dibuat dan faktornya tidak diminta.
    skip = lambda cat: cat in act.excluded  # noqa: E731

    # 1. BBM (Scope 1): volume × fraksi fosil × EF; bagian bio dicatat terpisah.
    # BBM dari dokumen transportasi ikut di baris ini, jadi baris tetap ada selama masih ada volume.
    bio_t = D0
    if not (skip("bbm") and not act.fuels):
        fuel_t = D0
        total_l = D0
        parts = []
        for fe in act.fuels:
            frac = fossil_fraction(fe.fuel_type)
            ef = need(fuel_factor_code(fe.fuel_type))
            fuel_t += fe.volume_l * frac * ef / THOUSAND
            bio_t += fe.volume_l * (Decimal(1) - frac) * ef / THOUSAND
            total_l += fe.volume_l
            parts.append(f"{fmt_id(fe.volume_l)} L × {fmt_id(frac, 2)} × {fmt_id(ef, 2)}")
        lines.append(Line(
            "bbm", "BBM fosil", "direct", "Scope 1",
            f"{fmt_id(total_l)} L", "EF per jenis BBM × fraksi fosil",
            "E = Σ volume × fraksi fosil × EF ÷ 1000",
            (" + ".join(parts) or "0") + " ÷ 1000", fuel_t, src("bbm"),
        ))

    # 2. Listrik dibeli (Scope 2)
    if not skip("listrik"):
        grid = need("grid_ef")
        elec_t = act.electricity_purchased_mwh * grid
        lines.append(Line(
            "listrik", "Listrik dibeli", "indirect", "Scope 2",
            f"{fmt_id(act.electricity_purchased_mwh, 1)} MWh", f"{fmt_id(grid, 3)} t CO2/MWh",
            "E = MWh dibeli × EF jaringan",
            f"{fmt_id(act.electricity_purchased_mwh, 1)} × {fmt_id(grid, 3)}", elec_t, src("listrik"),
        ))

    if not skip("pupuk"):
        # 3. Pupuk N2O
        ef1 = need("ef1_n2o")
        n2o_t = act.n_applied_t * ef1 * Decimal(44) / Decimal(28) * gwp["N2O"]
        lines.append(Line(
            "pupuk_n2o", "Pupuk — N2O", "direct", "Scope 1",
            f"{fmt_id(act.n_applied_t, 1)} t N", f"EF1 {fmt_id(ef1, 3)} · GWP {fmt_id(gwp['N2O'])}",
            "E = N × EF1 × 44/28 × GWP N2O",
            f"{fmt_id(act.n_applied_t, 1)} × {fmt_id(ef1, 3)} × 44/28 × {fmt_id(gwp['N2O'])}", n2o_t, src("pupuk"),
        ))

        # 4. Urea CO2
        uc = need("urea_c")
        urea_t = act.urea_t * uc * Decimal(44) / Decimal(12)
        lines.append(Line(
            "pupuk_urea", "Pupuk — urea CO2", "direct", "Scope 1",
            f"{fmt_id(act.urea_t, 1)} t urea", f"{fmt_id(uc, 2)} t C/t",
            "E = massa urea × 0,20 × 44/12",
            f"{fmt_id(act.urea_t, 1)} × {fmt_id(uc, 2)} × 44/12", urea_t, src("pupuk"),
        ))

    # 5. POME CH4
    if not skip("pome"):
        bo, mcf = need("pome_bo"), need("pome_mcf")
        cod_kg = act.pome_volume_m3 * act.pome_delta_cod_kg_m3
        ch4_t = cod_kg * bo * mcf / THOUSAND - act.pome_ch4_captured_t
        if ch4_t < 0:
            ch4_t = D0
        pome_t = ch4_t * gwp["CH4"]
        lines.append(Line(
            "pome", "Limbah cair (POME) — CH4", "direct", "Scope 1",
            f"{fmt_id(act.pome_volume_m3)} m3 · ΔCOD {fmt_id(act.pome_delta_cod_kg_m3, 1)} kg/m3",
            f"Bo {fmt_id(bo, 2)} · MCF {fmt_id(mcf, 2)} · GWP {fmt_id(gwp['CH4'])}",
            "E = (volume × ΔCOD × Bo × MCF ÷ 1000 − CH4 tertangkap) × GWP CH4",
            f"({fmt_id(act.pome_volume_m3)} × {fmt_id(act.pome_delta_cod_kg_m3, 1)} × {fmt_id(bo, 2)} × {fmt_id(mcf, 2)} ÷ 1000 − {fmt_id(act.pome_ch4_captured_t, 1)}) × {fmt_id(gwp['CH4'])}",
            pome_t, src("pome"),
        ))

    # 6. Lahan gambut
    if not skip("lahan"):
        peat_ef = f.get("peat_co2", D0)
        peat_t = act.peat_area_ha * peat_ef
        lines.append(Line(
            "lahan", "Lahan gambut", "direct", "Scope 1",
            f"{fmt_id(act.peat_area_ha, 1)} ha gambut", f"{fmt_id(peat_ef, 1)} t CO2/ha",
            "E = luas gambut × EF gambut",
            f"{fmt_id(act.peat_area_ha, 1)} × {fmt_id(peat_ef, 1)}", peat_t, src("lahan"),
        ))

    # 7. Limbah padat & B3
    if not skip("b3"):
        wef = f.get("waste_default", D0)
        waste_mass = sum((w.mass_t for w in act.wastes), D0)
        waste_t = waste_mass * wef
        lines.append(Line(
            "b3", "Limbah padat & B3", "direct", "Scope 1/3",
            f"{fmt_id(waste_mass, 1)} t", f"{fmt_id(wef, 2)} t CO2e/t",
            "E = massa × EF metode olah",
            f"{fmt_id(waste_mass, 1)} × {fmt_id(wef, 2)}", waste_t, src("b3"),
        ))

    # 8. Transportasi (hulu)
    if not skip("transport"):
        tef = f.get("truck_tkm", D0)
        trans_t = act.transport_tkm * tef / THOUSAND
        lines.append(Line(
            "transport", "Transportasi", "upstream", "Hulu",
            f"{fmt_id(act.transport_tkm)} t-km", f"{fmt_id(tef, 2)} kg/t-km",
            "E = muatan × jarak × EF moda ÷ 1000",
            f"{fmt_id(act.transport_tkm)} × {fmt_id(tef, 2)} ÷ 1000", trans_t, src("transport"),
        ))

    # 9. Material prekursor (hulu)
    if not skip("material"):
        mat_t = sum((m.quantity_t * m.see for m in act.materials), D0)
        lines.append(Line(
            "material", "Material prekursor", "upstream", "Hulu",
            f"{len(act.materials)} baris material", "SEE pemasok",
            "E = Σ massa material × SEE material",
            " + ".join(f"{fmt_id(m.quantity_t, 1)} × {fmt_id(m.see, 3)}" for m in act.materials) or "0",
            mat_t, src("material"),
        ))

    direct = sum((ln.value_t for ln in lines if ln.group == "direct"), D0)
    indirect = sum((ln.value_t for ln in lines if ln.group == "indirect"), D0)
    upstream = sum((ln.value_t for ln in lines if ln.group == "upstream"), D0)

    # Alokasi ke produk
    products = [p for p in act.products if p.tonnes > 0]
    if not products:
        raise CalculationError("Tonase produk belum ada — unggah dokumen produksi terlebih dulu")
    weight = lambda p: p.tonnes * (p.price if allocation == "economic" else Decimal(1))
    denom = sum((weight(p) for p in products), D0)
    if denom <= 0:
        raise CalculationError("Harga produk wajib diisi untuk alokasi ekonomi")
    allocs = []
    for p in products:
        share = weight(p) / denom
        allocs.append(Allocation(
            p.code, p.name, p.tonnes, p.price, share,
            (direct + upstream) * share / p.tonnes,
            indirect * share / p.tonnes,
        ))

    return Result(gwp_set, allocation, lines, direct, indirect, upstream,
                  act.electricity_sold_mwh, allocs, bio_t, dict(act.excluded))
