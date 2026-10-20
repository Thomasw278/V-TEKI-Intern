"use client";

import { useEffect, useState, type FormEvent } from "react";
import { IconPlus, IconTrash } from "@/components/Icons";
import { Badge, Button, Empty, ErrorBox, Loading, PageHead, useLoad, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { initials, num, periodLabel, roleLabel, toDecimal, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Company, Facility, Product, Reviewer } from "@/lib/types";

type Tab = "profil" | "fasilitas" | "produk" | "periode" | "akun";

/** Perusahaan mengelola profil, fasilitas, produk, periode. Admin melihat (baca saja). Semua akun: profil & kata sandi. */
export default function PengaturanPage() {
  const t = useT();
  const { isAdmin, company } = useSession();
  const hasCompany = !!company;
  const [tab, setTab] = useState<Tab>(hasCompany ? "profil" : "akun");
  useEffect(() => {
    if (window.location.hash === "#akun") setTab("akun");
  }, []);
  const tabs: [Tab, string][] = [];
  if (hasCompany) tabs.push(["profil", t("Profil & parameter", "Profile & settings")], ["fasilitas", t("Fasilitas", "Facilities")], ["produk", t("Produk", "Products")], ["periode", t("Periode", "Periods")]);
  tabs.push(["akun", t("Akun saya", "My account")]);
  const editable = !isAdmin;

  return (
    <>
      <PageHead title={hasCompany ? (isAdmin ? t("Profil perusahaan & akun", "Company profile & account") : t("Perusahaan & akun", "Company & account")) : t("Akun saya", "My account")}
        description={isAdmin
          ? t("Profil perusahaan hanya bisa diubah oleh akun perusahaan itu. Anda dapat mengubah nama dan kata sandi akun Anda sendiri.",
            "Only the company account can change its profile. You can change your own name and password.")
          : t("Profil, fasilitas, dan produk menjadi dasar perhitungan.", "Profile, facilities and products are the basis of the calculation.")}>
        {isAdmin && hasCompany && <Badge tone="info">{t("Baca saja", "Read only")}</Badge>}
      </PageHead>
      {tabs.length > 1 && (
        <div className="segmented" role="tablist" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
          {tabs.map(([k, l]) => <button key={k} role="tab" aria-pressed={tab === k} aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        </div>
      )}
      <div key={tab} className="anim-rise stack">
        {tab === "profil" && hasCompany && <ProfileTab editable={editable} />}
        {tab === "fasilitas" && hasCompany && <FacilityTab editable={editable} />}
        {tab === "produk" && hasCompany && <ProductTab editable={editable} />}
        {tab === "periode" && hasCompany && <PeriodTab editable={editable} />}
        {tab === "akun" && <AccountTab />}
      </div>
    </>
  );
}

function ProfileTab({ editable }: { editable: boolean }) {
  const t = useT();
  const { reloadCompany, epoch } = useSession();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api<Company>("/api/company"), [epoch]);
  const reviewers = useLoad(() => api<Reviewer[]>("/api/company/reviewers"), [epoch]);
  const [form, setForm] = useState<Company | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setForm(data); }, [data]);

  if (loading && !form) return <Loading rows={1} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!form) return null;
  const set = <K extends keyof Company>(k: K, v: Company[K]) => setForm({ ...form, [k]: v });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { id: _id, created_at: _c, ...body } = form;
      await api<Company>("/api/company", { method: "PUT", body: { ...body, legal_id: body.legal_id || null, postal_code: body.postal_code || null, phone: body.phone || null } });
      toast(t("Profil perusahaan disimpan", "Company profile saved"));
      reloadCompany();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const text = (k: keyof Company, label: string, full = false) => (
    <div className={`field ${full ? "full" : ""}`}>
      <label htmlFor={`co-${k}`}>{label}</label>
      <input id={`co-${k}`} className="input" disabled={!editable} value={(form[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} />
    </div>
  );

  return (
    <div className="split">
      <form className="panel stack loose" onSubmit={submit}>
        <div>
          <h2 style={{ fontSize: 16.5, marginBottom: 14 }}>{t("Profil perusahaan", "Company profile")}</h2>
          <div className="form-grid">
            {text("name", t("Nama perusahaan", "Company name"), true)}
            {text("legal_id", t("NPWP / NIB", "Tax / business ID"))}
            {text("sector", t("Sektor", "Sector"))}
            <div className="field full"><label htmlFor="co-address">{t("Alamat", "Address")}</label>
              <textarea id="co-address" className="textarea" rows={2} disabled={!editable} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
            {text("province", t("Provinsi", "Province"))}
            {text("city", t("Kabupaten / kota", "Regency / city"))}
            {text("postal_code", t("Kode pos", "Postal code"))}
            {text("phone", t("Telepon", "Phone"))}
          </div>
        </div>
        <div>
          <h2 style={{ fontSize: 16.5, marginBottom: 14 }}>{t("Parameter perhitungan", "Calculation settings")}</h2>
          <div className="form-grid">
            <div className="field"><label htmlFor="co-gwp">{t("Set GWP", "GWP set")}</label>
              <select id="co-gwp" className="select" disabled={!editable} value={form.gwp_set} onChange={(e) => set("gwp_set", e.target.value as Company["gwp_set"])}>
                <option value="AR5">AR5 (CH₄ 28 · N₂O 265)</option><option value="AR6">AR6 (CH₄ 27 · N₂O 273)</option></select></div>
            <div className="field"><label htmlFor="co-alloc">{t("Alokasi ke produk", "Allocation to products")}</label>
              <select id="co-alloc" className="select" disabled={!editable} value={form.allocation_method} onChange={(e) => set("allocation_method", e.target.value as Company["allocation_method"])}>
                <option value="economic">{t("Nilai jual (tonase × harga)", "Economic value (tonnes × price)")}</option><option value="mass">{t("Massa (tonase)", "Mass (tonnes)")}</option></select></div>
            <div className="field"><label htmlFor="co-grid">{t("Sistem jaringan listrik", "Grid system")}</label>
              <select id="co-grid" className="select" disabled={!editable} value={form.grid_system} onChange={(e) => set("grid_system", e.target.value as Company["grid_system"])}>
                <option value="jamali">Jawa-Madura-Bali</option><option value="sumatera">Sumatera</option><option value="kalimantan">Kalimantan</option>
                <option value="sulawesi">Sulawesi</option><option value="lainnya">{t("Lainnya", "Other")}</option></select></div>
            <div className="field"><label htmlFor="co-pome">{t("Pengolahan limbah cair", "Wastewater treatment")}</label>
              <select id="co-pome" className="select" disabled={!editable} value={form.pome_treatment} onChange={(e) => set("pome_treatment", e.target.value as Company["pome_treatment"])}>
                <option value="open">{t("Kolam terbuka", "Open ponds")}</option><option value="biogas">{t("Penangkapan biogas", "Biogas capture")}</option></select></div>
          </div>
        </div>
        {editable && <div className="inline" style={{ justifyContent: "flex-end" }}><Button type="submit" variant="primary" loading={busy}>{t("Simpan perubahan", "Save changes")}</Button></div>}
      </form>

      <section className="panel" aria-label={t("Admin peninjau", "Reviewers")}>
        <div className="panel-head"><div><h2>{t("Admin peninjau", "Reviewers")}</h2><div className="sub">{t("Ditugaskan oleh pengelola sistem", "Assigned by the system administrator")}</div></div></div>
        {(reviewers.data ?? []).length === 0 ? (
          <Empty title={t("Belum ada peninjau", "No reviewer yet")}>{t("Dokumen tetap bisa diunggah dan diajukan. Persetujuan dan penguncian menunggu peninjau ditugaskan.",
            "You can still upload and submit documents. Approval and locking wait until a reviewer is assigned.")}</Empty>
        ) : (
          <div className="list">
            {(reviewers.data ?? []).map((r) => (
              <div key={r.email} className="list-row">
                <span className="avatar round" style={{ width: 34, height: 34 }}>{initials(r.name)}</span>
                <span className="body"><b>{r.name}</b><span>{r.email}</span></span>
                <span className="tiny faint hide-m">{t("sejak", "since")} {when(r.assigned_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FacilityTab({ editable }: { editable: boolean }) {
  const t = useT();
  const { epoch } = useSession();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api<Facility[]>("/api/company/facilities"), [epoch]);
  const [f, setF] = useState({ name: "", type: "pabrik", size: "", soil_type: "mineral" });
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Loading rows={1} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  const TYPE: Record<string, string> = { kebun: t("Kebun", "Plantation"), pabrik: t("Pabrik", "Mill"), gudang: t("Gudang", "Warehouse") };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (f.name.trim().length < 2) return toast(t("Nama fasilitas minimal 2 karakter", "Facility name needs at least 2 characters"), "error");
    setBusy(true);
    try {
      await api("/api/company/facilities", { body: {
        name: f.name.trim(), type: f.type, soil_type: f.type === "kebun" ? f.soil_type : null,
        area_ha: f.type === "kebun" ? toDecimal(f.size) : null, capacity_tph: f.type === "pabrik" ? toDecimal(f.size) : null,
      } });
      setF({ name: "", type: "pabrik", size: "", soil_type: "mineral" });
      toast(t("Fasilitas ditambahkan", "Facility added"));
      reload(true);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (x: Facility) => {
    try {
      await api(`/api/company/facilities/${x.id}`, { method: "DELETE" });
      toast(t("Fasilitas dihapus", "Facility deleted"));
      reload(true);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div className="stack">
      <section className="panel flush">
        {(data ?? []).length === 0 ? <Empty title={t("Belum ada fasilitas", "No facilities yet")} /> : (
          <div className="table-wrap">
            <table className="table cards">
              <thead><tr><th>{t("Nama", "Name")}</th><th>{t("Jenis", "Type")}</th><th className="num">{t("Ukuran", "Size")}</th><th>{t("Tanah", "Soil")}</th>{editable && <th />}</tr></thead>
              <tbody>
                {(data ?? []).map((x) => (
                  <tr key={x.id}>
                    <td className="primary strong wrap">{x.name}</td>
                    <td data-label={t("Jenis", "Type")}>{TYPE[x.type] ?? x.type}</td>
                    <td data-label={t("Ukuran", "Size")} className="num">{x.area_ha ? `${num(Number(x.area_ha))} ha` : x.capacity_tph ? `${num(Number(x.capacity_tph))} t/${t("jam", "h")}` : "—"}</td>
                    <td data-label={t("Tanah", "Soil")}>{x.soil_type ?? "—"}</td>
                    {editable && <td style={{ textAlign: "right" }}><button type="button" className="btn ghost icon sm" onClick={() => remove(x)} aria-label={t(`Hapus ${x.name}`, `Delete ${x.name}`)}><IconTrash size={15} /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editable && (
        <form className="panel" onSubmit={add}>
          <div className="panel-head"><h2>{t("Tambah fasilitas", "Add facility")}</h2></div>
          <div className="form-grid">
            <div className="field full"><label>{t("Nama", "Name")}</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="field"><label>{t("Jenis", "Type")}</label>
              <select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                <option value="kebun">{TYPE.kebun}</option><option value="pabrik">{TYPE.pabrik}</option><option value="gudang">{TYPE.gudang}</option></select></div>
            {f.type !== "gudang" && <div className="field"><label>{f.type === "kebun" ? t("Luas (ha)", "Area (ha)") : t("Kapasitas (t TBS/jam)", "Capacity (t FFB/h)")}</label>
              <input className="input num" inputMode="decimal" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} /></div>}
            {f.type === "kebun" && <div className="field"><label>{t("Jenis tanah", "Soil type")}</label>
              <select className="select" value={f.soil_type} onChange={(e) => setF({ ...f, soil_type: e.target.value })}>
                <option value="mineral">{t("Mineral", "Mineral")}</option><option value="gambut">{t("Gambut", "Peat")}</option><option value="campuran">{t("Campuran", "Mixed")}</option></select></div>}
          </div>
          <div className="inline" style={{ justifyContent: "flex-end", marginTop: 16 }}><Button type="submit" variant="primary" loading={busy}><IconPlus size={15} />{t("Tambah", "Add")}</Button></div>
        </form>
      )}
    </div>
  );
}

function ProductTab({ editable }: { editable: boolean }) {
  const t = useT();
  const { epoch } = useSession();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api<Product[]>("/api/company/products"), [epoch]);
  const [p, setP] = useState({ code: "", name: "", cn_code: "", price: "" });
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <Loading rows={1} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(p.code.trim())) return toast(t("Kode produk 2–20 huruf/angka", "Product code: 2–20 letters/digits"), "error");
    setBusy(true);
    try {
      await api("/api/company/products", { body: { code: p.code.trim(), name: p.name.trim(), cn_code: p.cn_code.trim() || null, price_per_kg: toDecimal(p.price) ?? "1" } });
      setP({ code: "", name: "", cn_code: "", price: "" });
      toast(t("Produk ditambahkan", "Product added"));
      reload(true);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (x: Product) => {
    try {
      await api(`/api/company/products/${x.id}`, { method: "DELETE" });
      toast(t("Produk dihapus", "Product deleted"));
      reload(true);
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  return (
    <div className="stack">
      <section className="panel flush">
        <div className="table-wrap">
          <table className="table cards">
            <thead><tr><th>{t("Kode", "Code")}</th><th>{t("Nama", "Name")}</th><th>{t("Kode CN", "CN code")}</th><th className="num">{t("Harga (Rp/kg)", "Price (Rp/kg)")}</th>{editable && <th />}</tr></thead>
            <tbody>
              {(data ?? []).map((x) => (
                <tr key={x.id}>
                  <td className="primary"><b>{x.code}</b></td>
                  <td data-label={t("Nama", "Name")} className="wrap">{x.name}</td>
                  <td data-label={t("Kode CN", "CN code")} className="mono small">{x.cn_code ?? "—"}</td>
                  <td data-label={t("Harga (Rp/kg)", "Price (Rp/kg)")} className="num">{num(Number(x.price_per_kg))}</td>
                  {editable && <td style={{ textAlign: "right" }}><button type="button" className="btn ghost icon sm" onClick={() => remove(x)} aria-label={t(`Hapus ${x.code}`, `Delete ${x.code}`)}><IconTrash size={15} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editable && (
        <form className="panel" onSubmit={add}>
          <div className="panel-head"><h2>{t("Tambah produk", "Add product")}</h2></div>
          <div className="form-grid">
            <div className="field"><label>{t("Kode", "Code")}</label><input className="input" value={p.code} onChange={(e) => setP({ ...p, code: e.target.value })} placeholder="RBDPO" /></div>
            <div className="field"><label>{t("Nama", "Name")}</label><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></div>
            <div className="field"><label>{t("Kode CN (opsional)", "CN code (optional)")}</label><input className="input" value={p.cn_code} onChange={(e) => setP({ ...p, cn_code: e.target.value })} /></div>
            <div className="field"><label>{t("Harga rata-rata (Rp/kg)", "Average price (Rp/kg)")}</label><input className="input num" inputMode="decimal" value={p.price} onChange={(e) => setP({ ...p, price: e.target.value })} /></div>
          </div>
          <div className="inline" style={{ justifyContent: "flex-end", marginTop: 16 }}><Button type="submit" variant="primary" loading={busy}><IconPlus size={15} />{t("Tambah", "Add")}</Button></div>
        </form>
      )}
    </div>
  );
}

function PeriodTab({ editable }: { editable: boolean }) {
  const t = useT();
  const { periods, reloadCompany, setPeriodId } = useSession();
  const toast = useToast();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState(false);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api<{ id: number }>("/api/periods", { body: { year: Number(year) } });
      toast(t(`Periode ${year} dibuka`, `Period ${year} opened`));
      await reloadCompany();
      setPeriodId(p.id);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="split">
      <section className="panel flush">
        <div className="table-wrap">
          <table className="table cards">
            <thead><tr><th>{t("Tahun", "Year")}</th><th>Status</th><th>{t("Revisi", "Revision")}</th><th>{t("Dikunci", "Locked")}</th></tr></thead>
            <tbody>
              {periods.map((p) => {
                const s = periodLabel(p.status, t);
                return (
                  <tr key={p.id}>
                    <td className="primary"><b>{p.year}</b></td>
                    <td data-label="Status"><Badge tone={s.tone}>{s.label}</Badge></td>
                    <td data-label={t("Revisi", "Revision")}>v{p.version}</td>
                    <td data-label={t("Dikunci", "Locked")} className="small muted">{when(p.locked_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {editable && (
        <form className="panel" onSubmit={add}>
          <div className="panel-head"><div><h2>{t("Buka periode baru", "Open a new period")}</h2><div className="sub">{t("Satu periode per tahun kalender.", "One period per calendar year.")}</div></div></div>
          <div className="field"><label htmlFor="ny">{t("Tahun", "Year")}</label><input id="ny" className="input num" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></div>
          <Button type="submit" variant="primary" block loading={busy} style={{ marginTop: 16 }}><IconPlus size={15} />{t("Buka periode", "Open period")}</Button>
        </form>
      )}
    </div>
  );
}

function AccountTab() {
  const t = useT();
  const { user, refresh } = useSession();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("name");
    try {
      await api("/api/auth/profile", { method: "PUT", body: { name } });
      toast(t("Nama disimpan", "Name saved"));
      refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };
  const savePw = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.next.length < 8) return toast(t("Kata sandi baru minimal 8 karakter", "The new password needs at least 8 characters"), "error");
    if (pw.next !== pw.again) return toast(t("Ulangi kata sandi tidak sama", "Passwords do not match"), "error");
    setBusy("pw");
    try {
      await api("/api/auth/password", { body: { current_password: pw.current, new_password: pw.next } });
      setPw({ current: "", next: "", again: "" });
      toast(t("Kata sandi diganti", "Password changed"));
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="split even">
      <form className="panel" onSubmit={saveName}>
        <div className="panel-head"><div><h2>{t("Profil akun", "Account profile")}</h2><div className="sub">{roleLabel(user?.role, t)}</div></div></div>
        <div className="stack">
          <div className="field"><label htmlFor="acc-email">Email</label><input id="acc-email" className="input" value={user?.email ?? ""} disabled /></div>
          <div className="field"><label htmlFor="acc-name">{t("Nama", "Name")}</label><input id="acc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Button type="submit" variant="primary" loading={busy === "name"} style={{ alignSelf: "flex-end" }}>{t("Simpan", "Save")}</Button>
        </div>
      </form>
      <form className="panel" onSubmit={savePw}>
        <div className="panel-head"><h2>{t("Ganti kata sandi", "Change password")}</h2></div>
        <div className="stack">
          <div className="field"><label htmlFor="pw0">{t("Kata sandi saat ini", "Current password")}</label><input id="pw0" className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
          <div className="field"><label htmlFor="pw1">{t("Kata sandi baru", "New password")}</label><input id="pw1" className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
          <div className="field"><label htmlFor="pw2">{t("Ulangi kata sandi baru", "Repeat new password")}</label><input id="pw2" className="input" type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></div>
          <Button type="submit" variant="primary" loading={busy === "pw"} style={{ alignSelf: "flex-end" }}>{t("Ganti kata sandi", "Change password")}</Button>
        </div>
      </form>
    </div>
  );
}
