"use client";

import { useState } from "react";
import { Badge, Button, Dialog, ErrorBox, Loading, PageHead, useLoad, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { sig, toDecimal, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Factor } from "@/lib/types";

type T = (id: string, en: string) => string;

/** Kelompok faktor menurut sumber emisi, beserta posisinya terhadap batas CBAM (Annex IV Reg. 2023/956). */
const GROUPS = (t: T): { key: string; title: string; codes: string[]; cbam: "in" | "out"; note: string }[] => [
  { key: "fuel", title: t("Bahan bakar", "Fuels"), codes: ["diesel_co2", "gasoline_co2"], cbam: "in",
    note: t("Dalam batas CBAM untuk sumber stasioner (genset, boiler). BBM kendaraan dan alat berat di luar batas.", "Inside the CBAM boundary for stationary sources (gensets, boilers). Vehicle and machinery fuel is outside.") },
  { key: "power", title: t("Listrik", "Electricity"), codes: ["grid_ef"], cbam: "in",
    note: t("Emisi tidak langsung: E_el × EF_el. Untuk CBAM pakai nilai bawaan negara atau data aktual dengan bukti PPA/sambungan langsung.", "Indirect emissions: E_el × EF_el. For CBAM use the country default or actual data backed by a PPA/direct link.") },
  { key: "farm", title: t("Pupuk & lahan", "Fertiliser & land"), codes: ["ef1_n2o", "urea_c", "peat_co2"], cbam: "out",
    note: t("Emisi kebun. Dihitung untuk jejak karbon produk, di luar batas instalasi CBAM.", "Plantation emissions. Counted in the product footprint, outside the CBAM installation boundary.") },
  { key: "pome", title: t("Limbah cair (POME)", "Wastewater (POME)"), codes: ["pome_bo", "pome_mcf", "pome_m3_per_t_ffb", "pome_dcod_default", "biogas_ch4_fraction"], cbam: "out",
    note: t("CH₄ tidak termasuk gas rumah kaca CBAM. Dihitung untuk jejak karbon produk.", "CH₄ is not a CBAM greenhouse gas. Counted in the product footprint.") },
  { key: "logistics", title: t("Transportasi & limbah padat", "Transport & solid waste"), codes: ["truck_tkm", "waste_default"], cbam: "out",
    note: t("Transportasi antarlokasi dan pengolahan limbah di luar instalasi tidak termasuk batas CBAM.", "Transport between sites and off-site waste treatment are outside the CBAM boundary.") },
];

/** "Rujukan. Ganti dengan …" → rujukan + tindakan yang perlu dilakukan. */
function splitSource(src: string): { ref: string; action: string | null } {
  const m = src.match(/^(.*?)(?:[.;]\s*|\s+)((?:Ganti|Replace|untuk pelaporan CBAM)[^]*)$/i);
  return m ? { ref: m[1].trim(), action: m[2].trim() } : { ref: src, action: null };
}

/** Faktor emisi perusahaan. Admin peninjau mengubah & menyetujui; perusahaan melihat. */
export default function FaktorPage() {
  const t = useT();
  const { isAdmin, epoch } = useSession();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useLoad(() => api<Factor[]>("/api/factors"), [epoch]);
  const [editing, setEditing] = useState<Factor | null>(null);
  const [form, setForm] = useState({ value: "", source: "" });
  const [busy, setBusy] = useState<number | null>(null);

  if (loading && !data) return <Loading rows={1} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  const rows = data ?? [];
  const drafts = rows.filter((f) => f.status === "draft").length;
  const replace = (f: Factor) => setData(rows.map((x) => (x.id === f.id ? f : x)));
  const known = GROUPS(t).flatMap((g) => g.codes);
  const others = rows.filter((f) => !known.includes(f.code));
  const needOwn = rows.filter((f) => splitSource(f.source).action).length;

  /** Satu kelompok faktor: tabel dengan rujukan, catatan tindakan, status, dan aksi admin (fungsi render, bukan komponen, agar tidak dipasang ulang). */
  const renderGroup = (key: string, title: string, note: string, cbam: "in" | "out" | null, list: Factor[]) => (
    <section key={key} className="panel flush fx-group">
      <div className="fx-head">
        <div>
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
        {cbam && <span className={`fx-cbam ${cbam}`}>{cbam === "in" ? t("Dalam batas CBAM", "Inside CBAM boundary") : t("Di luar batas CBAM", "Outside CBAM boundary")}</span>}
      </div>
      <div className="table-wrap">
        <table className="table cards fx-table">
          <thead><tr><th>{t("Faktor", "Factor")}</th><th className="num">{t("Nilai", "Value")}</th><th>{t("Satuan", "Unit")}</th><th>{t("Rujukan", "Reference")}</th><th>Status</th>{isAdmin && <th />}</tr></thead>
          <tbody>
            {list.map((f) => {
              const src = splitSource(f.source);
              return (
                <tr key={f.id}>
                  <td className="primary"><b className="wrap">{f.name}</b><div className="tiny muted mono">{f.code} · v{f.version}</div></td>
                  <td data-label={t("Nilai", "Value")} className="num fx-val">{sig(f.value)}</td>
                  <td data-label={t("Satuan", "Unit")} className="small mono fx-unit">{f.unit}</td>
                  <td data-label={t("Rujukan", "Reference")} className="small fx-src">
                    <span className="wrap">{src.ref}</span>
                    {src.action && <span className="fx-action">{src.action}</span>}
                  </td>
                  <td data-label="Status">
                    {f.status === "approved" ? <Badge tone="ok">{t("Disetujui", "Approved")}</Badge> : <Badge tone="warn">{t("Draf", "Draft")}</Badge>}
                    {f.approved_at && <div className="tiny muted">{when(f.approved_at)}</div>}
                  </td>
                  {isAdmin && (
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(f); setForm({ value: f.value, source: f.source }); }}>{t("Ubah", "Edit")}</Button>
                      {f.status === "draft" && <Button size="sm" variant="primary" loading={busy === f.id} onClick={() => approve(f)}>{t("Setujui", "Approve")}</Button>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  const approve = async (f: Factor) => {
    setBusy(f.id);
    try {
      replace(await api<Factor>(`/api/factors/${f.id}/approve`, { method: "POST" }));
      toast(t(`${f.name} disetujui. Jalankan ulang kalkulasi.`, `${f.name} approved. Run the calculation again.`));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    if (!editing) return;
    const value = toDecimal(form.value);
    if (value === null) return toast(t("Nilai faktor harus angka", "The factor value must be a number"), "error");
    if (form.source.trim().length < 3) return toast(t("Tuliskan sumber faktor", "Enter the factor source"), "error");
    setBusy(editing.id);
    try {
      replace(await api<Factor>(`/api/factors/${editing.id}`, { method: "PUT", body: { value, source: form.source.trim() } }));
      setEditing(null);
      toast(t("Faktor diperbarui sebagai versi baru (draf)", "Factor updated as a new version (draft)"));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead title={t("Faktor emisi", "Emission factors")}
        description={isAdmin
          ? t("Nilai pengali untuk setiap sumber emisi perusahaan ini. Perubahan membuat versi baru berstatus draf yang perlu Anda setujui.",
            "Multipliers for each emission source of this company. Changes create a new draft version that you need to approve.")
          : t("Nilai pengali untuk setiap sumber emisi. Faktor dikelola dan disetujui oleh admin peninjau.",
            "Multipliers for each emission source. Factors are managed and approved by your reviewer.")}>
        {drafts ? <Badge tone="warn" pip>{t(`${drafts} draf`, `${drafts} drafts`)}</Badge> : <Badge tone="ok" pip>{t("Semua disetujui", "All approved")}</Badge>}
      </PageHead>
      <section className="db-strip fx-strip" aria-label={t("Ringkasan faktor", "Factor summary")}>
        <div className="db-cell"><span className="db-k">{t("Faktor", "Factors")}</span><b className="db-v">{rows.length}</b><span className="db-u">{t("dipakai perhitungan", "used in calculations")}</span></div>
        <div className="db-cell"><span className="db-k">{t("Disetujui", "Approved")}</span><b className="db-v">{rows.length - drafts}</b><span className="db-u">{t("oleh admin peninjau", "by the reviewer")}</span></div>
        <div className="db-cell"><span className="db-k">{t("Draf", "Draft")}</span><b className={`db-v ${drafts ? "warn" : ""}`}>{drafts}</b><span className="db-u">{drafts ? t("hasil kalkulasi masih draf", "results stay draft") : t("tidak ada", "none")}</span></div>
        <div className="db-cell"><span className="db-k">{t("Perlu data sendiri", "Need own data")}</span><b className={`db-v ${needOwn ? "warn" : ""}`}>{needOwn}</b><span className="db-u">{t("nilai awal literatur", "literature starting values")}</span></div>
      </section>

      {GROUPS(t).map((g) => {
        const list = rows.filter((f) => g.codes.includes(f.code));
        return list.length ? renderGroup(g.key, g.title, g.note, g.cbam, list) : null;
      })}
      {others.length > 0 && renderGroup("other", t("Faktor lainnya", "Other factors"), t("Faktor tambahan perusahaan.", "Additional company factors."), null, others)}

      <Dialog open={!!editing} title={editing ? t(`Ubah ${editing.name}`, `Edit ${editing.name}`) : ""} onClose={() => setEditing(null)}
        actions={<><Button variant="ghost" onClick={() => setEditing(null)}>{t("Batal", "Cancel")}</Button><Button variant="primary" loading={busy === editing?.id} onClick={save}>{t("Simpan sebagai draf", "Save as draft")}</Button></>}>
        <label className="field">
          <span className="label">{t("Nilai", "Value")} ({editing?.unit})</span>
          <input className="input num" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} autoFocus />
        </label>
        <label className="field">
          <span className="label">{t("Sumber", "Source")}</span>
          <input className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder={t("mis. Ditjen Gatrik KESDM 2024, sistem Sumatera", "e.g. KESDM grid factor 2024, Sumatra system")} />
          <span className="hint">{t("Versi baru berstatus draf dan perlu disetujui sebelum laporan dikunci.", "The new version is a draft and needs approval before the report is locked.")}</span>
        </label>
      </Dialog>
    </>
  );
}
