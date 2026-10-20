"use client";

import { useState } from "react";
import { Badge, Button, Dialog, ErrorBox, Loading, PageHead, useLoad, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { num, toDecimal, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Factor } from "@/lib/types";

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
      {drafts > 0 && (
        <div className="banner warn">
          <span className="grow">{t(
            "Nilai bertanda [VERIFIKASI] atau [SUMBER] adalah placeholder. Ganti dengan sumber resmi terbaru (mis. faktor jaringan KESDM) sebelum laporan final.",
            "Values marked [VERIFIKASI] or [SUMBER] are placeholders. Replace them with the latest official source (e.g. the KESDM grid factor) before the final report.",
          )}</span>
        </div>
      )}
      <section className="panel flush">
        <div className="table-wrap">
          <table className="table cards">
            <thead><tr><th>{t("Faktor", "Factor")}</th><th className="num">{t("Nilai", "Value")}</th><th>{t("Satuan", "Unit")}</th><th>{t("Sumber", "Source")}</th><th>Status</th>{isAdmin && <th />}</tr></thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td className="primary"><b className="wrap">{f.name}</b><div className="tiny muted mono">{f.code} · v{f.version}</div></td>
                  <td data-label={t("Nilai", "Value")} className="num strong">{num(Number(f.value), Number(f.value) % 1 ? 3 : 0)}</td>
                  <td data-label={t("Satuan", "Unit")} className="small">{f.unit}</td>
                  <td data-label={t("Sumber", "Source")} className="small"><span className="wrap">{f.source}</span></td>
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
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={!!editing} title={editing ? t(`Ubah ${editing.name}`, `Edit ${editing.name}`) : ""} onClose={() => setEditing(null)}
        actions={<><Button variant="ghost" onClick={() => setEditing(null)}>{t("Batal", "Cancel")}</Button><Button variant="primary" loading={busy === editing?.id} onClick={save}>{t("Simpan sebagai draf", "Save as draft")}</Button></>}>
        <label className="field">
          <span className="label">{t("Nilai", "Value")} ({editing?.unit})</span>
          <input className="input num" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} autoFocus />
        </label>
        <label className="field">
          <span className="label">{t("Sumber", "Source")}</span>
          <input className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="KESDM 2024, sistem Sumatera" />
          <span className="hint">{t("Versi baru berstatus draf dan perlu disetujui sebelum laporan dikunci.", "The new version is a draft and needs approval before the report is locked.")}</span>
        </label>
      </Dialog>
    </>
  );
}
