"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { IconPlus, IconX } from "@/components/Icons";
import { Button } from "@/components/ui";
import { toDecimal } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";

type Fac = { name: string; type: "kebun" | "pabrik" | "gudang"; size: string; soil_type: "" | "mineral" | "gambut" | "campuran" };
type Prod = { code: string; name: string; cn_code: string; price_per_kg: string };

const SECTORS: [string, string][] = [
  ["Kelapa sawit (CPO/PKO)", "Palm oil (CPO/PKO)"], ["Pupuk", "Fertiliser"], ["Semen", "Cement"], ["Besi & baja", "Iron & steel"],
  ["Aluminium", "Aluminium"], ["Hidrogen", "Hydrogen"], ["Lainnya", "Other"],
];

export default function RegisterPage() {
  const t = useT();
  const { register } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [company, setCompany] = useState({ name: "", legal_id: "", sector: SECTORS[0][0], address: "", province: "", city: "", postal_code: "", phone: "" });
  const [facs, setFacs] = useState<Fac[]>([
    { name: "", type: "kebun", size: "", soil_type: "mineral" },
    { name: "", type: "pabrik", size: "", soil_type: "" },
  ]);
  const [prods, setProds] = useState<Prod[]>([
    { code: "CPO", name: "Crude palm oil", cn_code: "1511 10", price_per_kg: "" },
    { code: "PKO", name: "Palm kernel oil", cn_code: "1513 21", price_per_kg: "" },
  ]);
  const [params, setParams] = useState({ gwp_set: "AR5", allocation_method: "economic", grid_system: "sumatera", pome_treatment: "open" });
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [acc, setAcc] = useState({ name: "", email: "", password: "", password2: "", agree: false });

  const STEPS = [
    t("Profil perusahaan", "Company profile"),
    t("Fasilitas & produk", "Facilities & products"),
    t("Parameter perhitungan", "Calculation settings"),
    t("Akun login", "Sign-in account"),
  ];
  const PARAMS: { key: keyof typeof params; label: string; opts: [string, string, string][] }[] = [
    { key: "gwp_set", label: t("Set GWP (IPCC)", "GWP set (IPCC)"), opts: [["AR5", "AR5", "CH₄ 28 · N₂O 265"], ["AR6", "AR6", "CH₄ 27 · N₂O 273"]] },
    { key: "allocation_method", label: t("Alokasi emisi ke produk", "Allocation to products"), opts: [
      ["economic", t("Nilai jual", "Economic value"), t("tonase × harga", "tonnes × price")], ["mass", t("Massa", "Mass"), t("berdasarkan tonase", "by tonnage")]] },
    { key: "grid_system", label: t("Sistem jaringan listrik PLN", "PLN grid system"), opts: [
      ["jamali", "Jawa-Madura-Bali", ""], ["sumatera", "Sumatera", ""], ["kalimantan", "Kalimantan", ""], ["sulawesi", "Sulawesi", ""], ["lainnya", t("Lainnya", "Other"), ""]] },
    { key: "pome_treatment", label: t("Pengolahan limbah cair", "Wastewater treatment"), opts: [
      ["open", t("Kolam terbuka", "Open ponds"), t("tanpa penangkapan metana", "no methane capture")], ["biogas", t("Penangkapan biogas", "Biogas capture"), t("metana ditangkap/dibakar", "methane captured/flared")]] },
  ];

  const setC = (k: keyof typeof company, v: string) => setCompany((c) => ({ ...c, [k]: v }));
  const setF = (i: number, patch: Partial<Fac>) => setFacs((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setP = (i: number, patch: Partial<Prod>) => setProds((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const check = (s: number): string | null => {
    if (s === 1) {
      if (company.name.trim().length < 3) return t("Nama perusahaan minimal 3 karakter.", "Company name needs at least 3 characters.");
      if (!company.address.trim()) return t("Alamat perusahaan wajib diisi.", "Company address is required.");
      if (!company.province.trim() || !company.city.trim()) return t("Provinsi dan kabupaten/kota wajib diisi.", "Province and city are required.");
    }
    if (s === 2) {
      if (facs.some((f) => f.name.trim().length < 2)) return t("Setiap fasilitas perlu nama (atau hapus barisnya).", "Every facility needs a name (or remove the row).");
      if (!prods.length) return t("Tambahkan minimal satu produk.", "Add at least one product.");
      if (prods.some((p) => !/^[A-Za-z0-9_-]{2,20}$/.test(p.code.trim()))) return t("Kode produk 2–20 huruf/angka tanpa spasi (mis. CPO).", "Product codes are 2–20 letters/digits without spaces (e.g. CPO).");
      if (prods.some((p) => p.name.trim().length < 2)) return t("Setiap produk perlu nama.", "Every product needs a name.");
      if (new Set(prods.map((p) => p.code.trim().toUpperCase())).size !== prods.length) return t("Kode produk tidak boleh sama.", "Product codes must be unique.");
    }
    if (s === 3) {
      const y = Number(year);
      if (!Number.isInteger(y) || y < 2000 || y > 2100) return t("Tahun periode tidak valid.", "Invalid period year.");
      if (params.allocation_method === "economic" && prods.some((p) => !(Number(toDecimal(p.price_per_kg)) > 0)))
        return t("Alokasi nilai jual butuh harga rata-rata tiap produk (langkah 2), atau pilih alokasi massa.",
          "Economic allocation needs an average price for every product (step 2), or choose mass allocation.");
    }
    if (s === 4) {
      if (acc.name.trim().length < 2) return t("Nama penanggung jawab wajib diisi.", "Contact name is required.");
      if (!/^\S+@\S+\.\S+$/.test(acc.email)) return t("Email tidak valid.", "Invalid email.");
      if (acc.password.length < 8) return t("Kata sandi minimal 8 karakter.", "Password needs at least 8 characters.");
      if (acc.password !== acc.password2) return t("Ulangi kata sandi tidak sama.", "Passwords do not match.");
      if (!acc.agree) return t("Centang persetujuan pemrosesan data.", "Tick the data processing consent.");
    }
    return null;
  };

  const goTo = (n: number) => {
    for (let s = 1; s < n; s++) {
      const err = check(s);
      if (err) {
        setStep(s);
        setError(err);
        return;
      }
    }
    setError(null);
    setStep(n);
  };

  const next = async () => {
    const err = check(step);
    setError(err);
    if (err) return;
    if (step < 4) return setStep(step + 1);
    setBusy(true);
    try {
      await register({
        company: { ...company, legal_id: company.legal_id || null, postal_code: company.postal_code || null, phone: company.phone || null, ...params },
        facilities: facs.map((f) => ({
          name: f.name.trim(), type: f.type, soil_type: f.soil_type || null,
          area_ha: f.type === "kebun" ? toDecimal(f.size) : null,
          capacity_tph: f.type === "pabrik" ? toDecimal(f.size) : null,
        })),
        products: prods.map((p) => ({ code: p.code.trim().toUpperCase(), name: p.name.trim(), cn_code: p.cn_code.trim() || null, price_per_kg: toDecimal(p.price_per_kg) ?? "1" })),
        account: { name: acc.name.trim(), email: acc.email.trim(), password: acc.password },
        first_year: Number(year),
      });
      router.replace("/dashboard");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout wide>
      <h1>{t("Daftarkan perusahaan", "Register your company")}</h1>
      <p className="lead">{t(
        "Data ini menentukan sumber emisi, pembagi per produk, dan faktor bawaan. Semuanya bisa diubah lagi setelah masuk.",
        "This sets your emission sources, product denominators and default factors. Everything can be changed after signing in.",
      )}</p>
      <nav className="steps" aria-label={t("Langkah pendaftaran", "Registration steps")}>
        {STEPS.map((s, i) => (
          <button key={s} type="button" onClick={() => goTo(i + 1)} aria-current={step === i + 1 ? "step" : undefined} className={step > i + 1 ? "done" : ""}>
            <span>{i + 1}. {s}</span>
          </button>
        ))}
      </nav>

      <div key={step} className="anim-rise">
        {step === 1 && (
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="cn">{t("Nama perusahaan", "Company name")}</label>
              <input id="cn" className="input" value={company.name} onChange={(e) => setC("name", e.target.value)} placeholder="PT Kebun Mitra Sejahtera" autoFocus />
            </div>
            <div className="field">
              <label htmlFor="lid">{t("NPWP / NIB (opsional)", "Tax / business ID (optional)")}</label>
              <input id="lid" className="input" value={company.legal_id} onChange={(e) => setC("legal_id", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="sec">{t("Sektor", "Sector")}</label>
              <select id="sec" className="select" value={company.sector} onChange={(e) => setC("sector", e.target.value)}>
                {SECTORS.map(([id, en]) => <option key={id} value={id}>{t(id, en)}</option>)}
              </select>
            </div>
            <div className="field full">
              <label htmlFor="adr">{t("Alamat", "Address")}</label>
              <textarea id="adr" className="textarea" rows={2} value={company.address} onChange={(e) => setC("address", e.target.value)} placeholder="Jl. Lintas Timur Km 87, Desa Sei Rimba" />
            </div>
            <div className="field">
              <label htmlFor="prov">{t("Provinsi", "Province")}</label>
              <input id="prov" className="input" value={company.province} onChange={(e) => setC("province", e.target.value)} placeholder="Riau" />
            </div>
            <div className="field">
              <label htmlFor="city">{t("Kabupaten / kota", "Regency / city")}</label>
              <input id="city" className="input" value={company.city} onChange={(e) => setC("city", e.target.value)} placeholder="Pelalawan" />
            </div>
            <div className="field">
              <label htmlFor="pc">{t("Kode pos", "Postal code")}</label>
              <input id="pc" className="input" inputMode="numeric" value={company.postal_code} onChange={(e) => setC("postal_code", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ph">{t("Telepon", "Phone")}</label>
              <input id="ph" className="input" inputMode="tel" value={company.phone} onChange={(e) => setC("phone", e.target.value)} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack loose">
            <div>
              <div className="label" style={{ marginBottom: 8 }}>{t("Fasilitas", "Facilities")}</div>
              <p className="tiny muted" style={{ marginBottom: 12 }}>{t("Kebun, pabrik, atau gudang yang menghasilkan emisi.", "Plantations, mills or warehouses that produce emissions.")}</p>
              {facs.map((f, i) => (
                <div key={i} className="repeat">
                  <button type="button" className="btn ghost icon sm rm" onClick={() => setFacs((xs) => xs.filter((_, j) => j !== i))} aria-label={t("Hapus fasilitas", "Remove facility")}><IconX size={15} /></button>
                  <div className="form-grid">
                    <div className="field full" style={{ paddingRight: 36 }}>
                      <label>{t("Nama fasilitas", "Facility name")}</label>
                      <input className="input" value={f.name} onChange={(e) => setF(i, { name: e.target.value })} placeholder={f.type === "pabrik" ? "PKS Sei Rimba" : "Kebun Sei Rimba"} />
                    </div>
                    <div className="field">
                      <label>{t("Jenis", "Type")}</label>
                      <select className="select" value={f.type} onChange={(e) => setF(i, { type: e.target.value as Fac["type"] })}>
                        <option value="kebun">{t("Kebun", "Plantation")}</option>
                        <option value="pabrik">{t("Pabrik", "Mill")}</option>
                        <option value="gudang">{t("Gudang", "Warehouse")}</option>
                      </select>
                    </div>
                    {f.type !== "gudang" && (
                      <div className="field">
                        <label>{f.type === "kebun" ? t("Luas (ha)", "Area (ha)") : t("Kapasitas (t TBS/jam)", "Capacity (t FFB/h)")}</label>
                        <input className="input num" inputMode="decimal" value={f.size} onChange={(e) => setF(i, { size: e.target.value })} />
                      </div>
                    )}
                    {f.type === "kebun" && (
                      <div className="field">
                        <label>{t("Jenis tanah", "Soil type")}</label>
                        <select className="select" value={f.soil_type} onChange={(e) => setF(i, { soil_type: e.target.value as Fac["soil_type"] })}>
                          <option value="mineral">{t("Mineral", "Mineral")}</option>
                          <option value="gambut">{t("Gambut", "Peat")}</option>
                          <option value="campuran">{t("Campuran", "Mixed")}</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <Button size="sm" variant="ghost" style={{ marginTop: 10 }} onClick={() => setFacs((xs) => [...xs, { name: "", type: "pabrik", size: "", soil_type: "" }])}>
                <IconPlus size={15} />{t("Tambah fasilitas", "Add facility")}
              </Button>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>{t("Produk yang dilaporkan", "Reported products")}</div>
              <p className="tiny muted" style={{ marginBottom: 12 }}>{t("Emisi dibagi ke produk ini. Harga rata-rata dipakai untuk alokasi nilai jual.", "Emissions are divided over these products. Average prices are used for economic allocation.")}</p>
              {prods.map((p, i) => (
                <div key={i} className="repeat">
                  <button type="button" className="btn ghost icon sm rm" onClick={() => setProds((xs) => xs.filter((_, j) => j !== i))} aria-label={t("Hapus produk", "Remove product")}><IconX size={15} /></button>
                  <div className="form-grid" style={{ paddingRight: 36 }}>
                    <div className="field"><label>{t("Kode", "Code")}</label><input className="input" value={p.code} onChange={(e) => setP(i, { code: e.target.value })} /></div>
                    <div className="field"><label>{t("Nama", "Name")}</label><input className="input" value={p.name} onChange={(e) => setP(i, { name: e.target.value })} /></div>
                    <div className="field"><label>{t("Kode CN (opsional)", "CN code (optional)")}</label><input className="input" value={p.cn_code} onChange={(e) => setP(i, { cn_code: e.target.value })} /></div>
                    <div className="field">
                      <label>{t("Harga rata-rata", "Average price")}</label>
                      <div className="input-affix"><input className="input num" inputMode="decimal" value={p.price_per_kg} onChange={(e) => setP(i, { price_per_kg: e.target.value })} placeholder="12.000" /><span className="affix">Rp/kg</span></div>
                    </div>
                  </div>
                </div>
              ))}
              <Button size="sm" variant="ghost" style={{ marginTop: 10 }} onClick={() => setProds((xs) => [...xs, { code: "", name: "", cn_code: "", price_per_kg: "" }])}>
                <IconPlus size={15} />{t("Tambah produk", "Add product")}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="stack loose">
            {PARAMS.map((p) => (
              <div key={p.key} className="field">
                <span className="label">{p.label}</span>
                <div className="segmented" role="group" aria-label={p.label} style={{ flexWrap: "wrap", alignSelf: "flex-start" }}>
                  {p.opts.map(([v, label, hint]) => (
                    <button key={v} type="button" aria-pressed={params[p.key] === v} onClick={() => setParams((x) => ({ ...x, [p.key]: v }))} title={hint || undefined}>{label}</button>
                  ))}
                </div>
                {p.opts.find(([v]) => v === params[p.key])?.[2] && <span className="hint">{p.opts.find(([v]) => v === params[p.key])?.[2]}</span>}
              </div>
            ))}
            <div className="field" style={{ maxWidth: 220 }}>
              <label htmlFor="yr">{t("Periode pelaporan pertama", "First reporting period")}</label>
              <input id="yr" className="input num" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="an">{t("Nama penanggung jawab", "Contact person")}</label>
              <input id="an" className="input" value={acc.name} onChange={(e) => setAcc((a) => ({ ...a, name: e.target.value }))} autoFocus />
            </div>
            <div className="field full">
              <label htmlFor="ae">{t("Email perusahaan (untuk login)", "Company email (for sign-in)")}</label>
              <input id="ae" className="input" type="email" autoComplete="email" value={acc.email} onChange={(e) => setAcc((a) => ({ ...a, email: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="ap">{t("Kata sandi", "Password")}</label>
              <input id="ap" className="input" type="password" autoComplete="new-password" value={acc.password} onChange={(e) => setAcc((a) => ({ ...a, password: e.target.value }))} />
              <span className="hint">{t("Minimal 8 karakter.", "At least 8 characters.")}</span>
            </div>
            <div className="field">
              <label htmlFor="ap2">{t("Ulangi kata sandi", "Repeat password")}</label>
              <input id="ap2" className="input" type="password" autoComplete="new-password" value={acc.password2} onChange={(e) => setAcc((a) => ({ ...a, password2: e.target.value }))} />
            </div>
            <label className="check full">
              <input type="checkbox" checked={acc.agree} onChange={(e) => setAcc((a) => ({ ...a, agree: e.target.checked }))} />
              <span>{t("Saya setuju dokumen perusahaan diproses untuk perhitungan emisi dan ditinjau oleh admin peninjau yang ditugaskan.",
                "I agree that company documents are processed for emission calculation and reviewed by the assigned reviewer.")}</span>
            </label>
          </div>
        )}
      </div>

      {error && <div className="banner bad anim-shake" role="alert" style={{ marginTop: 18 }}>{error}</div>}
      <div className="inline" style={{ marginTop: 24, justifyContent: "space-between" }}>
        {step > 1 ? <Button variant="ghost" onClick={() => { setError(null); setStep(step - 1); }}>{t("Kembali", "Back")}</Button>
          : <Link href="/login" className="small">{t("Sudah punya akun? Masuk", "Already registered? Sign in")}</Link>}
        <Button variant="primary" size="lg" onClick={next} loading={busy}>
          {step < 4 ? t("Lanjut", "Continue") : t("Daftarkan perusahaan", "Register company")}
        </Button>
      </div>
    </AuthLayout>
  );
}
