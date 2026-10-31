"use client";

import { useState, type FormEvent } from "react";
import { IconFile, IconPlus } from "@/components/Icons";
import { MIN_REASON, ReasonField, ReqStatusBadge, StatusSegment } from "@/components/superadmin";
import { Badge, Button, Dialog, ErrorBox, Loading, PageHead, useLoad, useToast } from "@/components/ui";
import { superApi } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { CatalogType, ReqStatus } from "@/lib/types";

const EMPTY = { code: "", name: "", name_en: "", description: "", description_en: "", default_status: "optional" as ReqStatus };

/** Katalog jenis dokumen: 10 jenis bawaan (status default & deskripsi) + dokumen pendukung buatan superadmin. */
export default function CatalogPage() {
  const t = useT();
  const toast = useToast();
  const { epoch } = useSession();
  const { data, error, loading, reload } = useLoad(() => superApi.docTypes(), [epoch]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<CatalogType | null>(null);
  const [def, setDef] = useState<{ x: CatalogType; to: ReqStatus } | null>(null);
  const [reason, setReason] = useState("");

  const patch = async (code: string, body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      await superApi.updateDocType(code, body);
      toast(ok);
      setEdit(null);
      setDef(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await superApi.createDocType({ ...form, code: form.code.trim().toLowerCase(), name_en: form.name_en || null, description_en: form.description_en || null });
      toast(t("Dokumen pendukung ditambahkan", "Supporting document added"));
      setForm(EMPTY);
      reload(true);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Loading rows={2} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data) return null;
  const builtin = data.filter((x) => x.builtin);
  const supporting = data.filter((x) => !x.builtin);

  const row = (x: CatalogType) => (
    <div key={x.code} className="rm-row" style={x.active ? undefined : { opacity: 0.6 }}>
      <div className="rm-name">
        <span className="rm-no">{x.no}</span>
        <span style={{ minWidth: 0 }}>
          <b className="wrap" style={{ display: "block" }}>{x.name}</b>
          <span className="tiny muted wrap" style={{ display: "block" }}>{x.description}</span>
          <span className="inline" style={{ gap: 6, marginTop: 4 }}>
            <span className="tiny muted mono">{x.code}</span>
            {x.scope12 && <Badge>Scope 1/2</Badge>}
            {!x.can_exclude && <Badge tone="warn">{t("Pembagi SEE", "SEE denominator")}</Badge>}
            {x.has_default && <Badge>{t("Punya nilai bawaan", "Has default values")}</Badge>}
            {!x.active && <Badge tone="bad">{t("Nonaktif", "Inactive")}</Badge>}
          </span>
        </span>
      </div>
      <StatusSegment value={x.default_status} req={x} disabled={!x.active} label={t(`Status default ${x.name}`, `Default status of ${x.name}`)}
        onChange={(v) => { if (v !== x.default_status) { setReason(""); setDef({ x, to: v }); } }} />
      <div className="rm-meta inline" style={{ justifyContent: "space-between" }}>
        <span>{t(`${x.overrides} perusahaan diatur khusus`, `${x.overrides} companies with their own setting`)}</span>
        <Button size="sm" variant="ghost" onClick={() => setEdit({ ...x })} aria-label={t(`Ubah ${x.name}`, `Edit ${x.name}`)}>{x.builtin ? t("Ubah deskripsi", "Edit description") : t("Ubah", "Edit")}</Button>
      </div>
    </div>
  );

  return (
    <>
      <PageHead title={t("Katalog dokumen", "Document catalogue")}
        description={t("Status default berlaku untuk perusahaan yang belum punya pengaturan sendiri. Sepuluh jenis bawaan tidak bisa dihapus.",
          "The default status applies to companies without their own setting. The ten built-in types cannot be removed.")} />

      <section className="panel flush req-matrix" aria-label={t("Jenis dokumen bawaan", "Built-in document types")}>
        <div className="rm-head" aria-hidden="true"><span>{t("Jenis bawaan", "Built-in type")}</span><span>{t("Status default", "Default status")}</span><span /></div>
        {builtin.map(row)}
      </section>

      <section className="panel flush req-matrix" aria-label={t("Dokumen pendukung", "Supporting documents")}>
          <div className="panel-head" style={{ padding: "16px 18px 6px" }}><div><h2>{t("Dokumen pendukung", "Supporting documents")}</h2><div className="sub">{t("Hanya bukti: tidak dibaca otomatis, tidak punya field angka, dan tidak ikut perhitungan emisi. Bila Wajib, perusahaan harus mengunggah dan mengajukannya sebelum periode bisa dikunci.", "Evidence only: not read automatically, no numeric fields, and not part of the emission calculation. When Required, the company must upload and submit it before the period can be locked.")}</div></div></div>
          {supporting.length ? supporting.map(row) : (
            <div className="empty"><div className="ic"><IconFile /></div><b>{t("Belum ada dokumen pendukung", "No supporting documents yet")}</b></div>
          )}
      </section>

      <form className="panel" onSubmit={create} aria-label={t("Tambah dokumen pendukung", "Add a supporting document")}>
          <div className="panel-head"><div><h2>{t("Tambah dokumen pendukung", "Add a supporting document")}</h2><div className="sub">{t("Mis. sertifikat RSPO/ISPO atau izin lingkungan.", "E.g. an RSPO/ISPO certificate or environmental permit.")}</div></div></div>
          <div className="stack">
            <div className="field"><label htmlFor="c-code">{t("Kode", "Code")}</label><input id="c-code" className="input mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="rspo" pattern="[a-z][a-z0-9_]{2,19}" required aria-describedby="c-code-hint" /><span id="c-code-hint" className="tiny muted">{t("Huruf kecil, angka, garis bawah; 3–20 karakter. Tidak bisa diubah.", "Lowercase letters, digits, underscore; 3–20 characters. Cannot be changed.")}</span></div>
            <div className="form-grid">
              <div className="field"><label htmlFor="c-name">{t("Nama (Indonesia)", "Name (Indonesian)")}</label><input id="c-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={3} /></div>
              <div className="field"><label htmlFor="c-name-en">{t("Nama (Inggris)", "Name (English)")}</label><input id="c-name-en" className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
            </div>
            <div className="form-grid">
              <div className="field"><label htmlFor="c-desc">{t("Deskripsi (Indonesia)", "Description (Indonesian)")}</label><textarea id="c-desc" className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required minLength={3} /></div>
              <div className="field"><label htmlFor="c-desc-en">{t("Deskripsi (Inggris)", "Description (English)")}</label><textarea id="c-desc-en" className="textarea" value={form.description_en} onChange={(e) => setForm({ ...form, description_en: e.target.value })} /></div>
            </div>
            <div className="field"><span className="small strong" id="c-status">{t("Status default", "Default status")}</span><StatusSegment value={form.default_status} req={{ can_exclude: true, name: form.name }} onChange={(v) => setForm({ ...form, default_status: v })} label={t("Status default", "Default status")} /></div>
            <Button type="submit" variant="primary" loading={busy} style={{ alignSelf: "flex-start" }}><IconPlus size={15} />{t("Tambah dokumen pendukung", "Add supporting document")}</Button>
          </div>
      </form>

      <Dialog open={!!def} title={t(`Ubah status default: ${def?.x.name ?? ""}`, `Change default status: ${def?.x.name ?? ""}`)} onClose={() => setDef(null)}
        actions={<><Button variant="ghost" onClick={() => setDef(null)}>{t("Batal", "Cancel")}</Button>
          <Button variant="primary" loading={busy} disabled={reason.trim().length < (def?.x.scope12 ? MIN_REASON : 5)}
            onClick={() => def && patch(def.x.code, { default_status: def.to, reason: reason.trim() }, t("Perubahan disimpan", "Changes saved"))}>{t("Simpan perubahan", "Save changes")}</Button></>}>
        {def && (
          <>
            <div className="inline" style={{ gap: 8 }}><ReqStatusBadge status={def.x.default_status} /><span aria-hidden="true">→</span><ReqStatusBadge status={def.to} /></div>
            <p className="small">{t(`Berlaku untuk semua perusahaan yang belum mengatur ${def.x.name} sendiri. ${def.x.overrides} perusahaan punya pengaturan sendiri dan tidak berubah. Periode terbuka perlu dihitung ulang; periode terkunci tidak berubah.`,
              `Applies to every company without its own setting for ${def.x.name}. ${def.x.overrides} companies have their own setting and stay unchanged. Open periods need a re-run; locked periods do not change.`)}</p>
            {def.to === "not_applicable" && def.x.scope12 && <div className="banner warn small">{t("Kategori Scope 1/2 akan dikecualikan dari perhitungan untuk perusahaan-perusahaan tersebut.", "This Scope 1/2 category will be left out of the calculation for those companies.")}</div>}
            <ReasonField value={reason} onChange={setReason} min={def.x.scope12 ? MIN_REASON : 5} id="def-reason" />
          </>
        )}
      </Dialog>

      <Dialog open={!!edit} title={edit?.builtin ? t(`Ubah deskripsi: ${edit.name}`, `Edit description: ${edit.name}`) : t("Ubah dokumen pendukung", "Edit supporting document")} onClose={() => setEdit(null)}
        actions={<><Button variant="ghost" onClick={() => setEdit(null)}>{t("Batal", "Cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={() => edit && patch(edit.code, edit.builtin
            ? { description: edit.description_id, description_en: edit.description_en }
            : { name: edit.name_id, name_en: edit.name_en, description: edit.description_id, description_en: edit.description_en, active: edit.active }, t("Perubahan disimpan", "Changes saved"))}>{t("Simpan perubahan", "Save changes")}</Button></>}>
        {edit && (
          <>
            {!edit.builtin && (
              <div className="form-grid">
                <div className="field"><label htmlFor="e-name">{t("Nama (Indonesia)", "Name (Indonesian)")}</label><input id="e-name" className="input" value={edit.name_id} onChange={(e) => setEdit({ ...edit, name_id: e.target.value })} /></div>
                <div className="field"><label htmlFor="e-name-en">{t("Nama (Inggris)", "Name (English)")}</label><input id="e-name-en" className="input" value={edit.name_en ?? ""} onChange={(e) => setEdit({ ...edit, name_en: e.target.value })} /></div>
              </div>
            )}
            <div className="field"><label htmlFor="e-desc">{t("Deskripsi (Indonesia)", "Description (Indonesian)")}</label><textarea id="e-desc" className="textarea" value={edit.description_id} onChange={(e) => setEdit({ ...edit, description_id: e.target.value })} /></div>
            <div className="field"><label htmlFor="e-desc-en">{t("Deskripsi (Inggris)", "Description (English)")}</label><textarea id="e-desc-en" className="textarea" value={edit.description_en ?? ""} onChange={(e) => setEdit({ ...edit, description_en: e.target.value })} /></div>
            {edit.builtin ? <p className="tiny muted">{t("Nama, kode, dan rumus jenis bawaan tidak bisa diubah.", "The name, code and formulas of built-in types cannot be changed.")}</p> : (
              <label className="inline" style={{ gap: 8 }}><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />{t("Aktif (tampil di kebutuhan perusahaan)", "Active (shown in company requirements)")}</label>
            )}
          </>
        )}
      </Dialog>
    </>
  );
}
