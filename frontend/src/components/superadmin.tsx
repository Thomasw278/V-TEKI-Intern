"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { conflictsOf, superApi, type ReqChange } from "@/lib/api";
import { num, reqSourceLabel, reqStatusLabel, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { CompanyRequirement, ReqStatus, RequirementConflict, RequirementPreview } from "@/lib/types";
import { IconCheck, IconWarn, IconX } from "./Icons";
import { ReqStatusBadge, StatusIcon } from "./requirements";
import { Button, Dialog, ErrorBox, Spinner, useToast } from "./ui";

export const MIN_REASON = 15;
export const STATUSES: ReqStatus[] = ["required", "optional", "not_applicable"];

export { ReqStatusBadge, StatusIcon };

/** Alasan sebuah opsi status tidak boleh dipilih (null = boleh). */
export function blockedReason(req: Pick<CompanyRequirement, "can_exclude" | "name">, status: ReqStatus, t: ReturnType<typeof useT>): string | null {
  if (status === "not_applicable" && !req.can_exclude) {
    return t(`${req.name} tidak bisa dikecualikan karena menjadi pembagi emisi per ton produk.`,
      `${req.name} cannot be excluded because it is the denominator of emissions per tonne of product.`);
  }
  return null;
}

/**
 * Kontrol segmen Wajib / Opsional / Tidak berlaku (radiogroup: Tab masuk, panah kiri/kanan berpindah).
 * Opsi terlarang tetap terlihat dan bisa difokus (aria-disabled) agar penjelasannya terbaca saat hover/fokus.
 */
export function StatusSegment({ value, onChange, req, label, disabled }: {
  value: ReqStatus; onChange: (v: ReqStatus) => void; req: Pick<CompanyRequirement, "can_exclude" | "name">; label: string; disabled?: boolean;
}) {
  const t = useT();
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const n = STATUSES.length;
    const j = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + n) % n;
    refs.current[j]?.focus();
    if (!blockedReason(req, STATUSES[j], t) && !disabled) onChange(STATUSES[j]);
  };
  return (
    <div className="status-seg" role="radiogroup" aria-label={label}>
      {STATUSES.map((s, i) => {
        const why = blockedReason(req, s, t);
        const on = value === s;
        return (
          <span key={s} className="tip-wrap">
            <button type="button" ref={(el) => { refs.current[i] = el; }} role="radio" aria-checked={on}
              aria-disabled={!!why || disabled || undefined} aria-describedby={why ? `${id}-${s}` : undefined}
              tabIndex={on ? 0 : -1} className={`seg-${s}`}
              onClick={() => !why && !disabled && onChange(s)} onKeyDown={(e) => onKey(e, i)}>
              <StatusIcon status={s} />{reqStatusLabel(s, t).label}
            </button>
            {why && <span role="tooltip" id={`${id}-${s}`} className="tip">{why}</span>}
          </span>
        );
      })}
    </div>
  );
}

/** Sumber nilai: bawaan katalog, dari profil "X", pengecualian disetujui, atau diubah manual. */
export function SourceText({ r }: { r: Pick<CompanyRequirement, "source" | "source_profile" | "set_by" | "set_at"> }) {
  const t = useT();
  const text = r.source_profile ? t(`Dari profil "${r.source_profile}"`, `From profile "${r.source_profile}"`)
    : r.source === "manual" ? t("Diubah manual", "Changed manually") : reqSourceLabel(r.source, t);
  return <span>{text}{r.set_by ? ` · ${r.set_by}` : ""}{r.set_at ? ` · ${when(r.set_at)}` : ""}</span>;
}

export function ReasonField({ value, onChange, min, id = "reason", hint }: {
  value: string; onChange: (v: string) => void; min: number; id?: string; hint?: ReactNode;
}) {
  const t = useT();
  const short = value.trim().length < min;
  return (
    <div className="field">
      <label htmlFor={id}>{t("Alasan", "Reason")} *</label>
      <textarea id={id} className="textarea" value={value} maxLength={500} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-hint`}
        aria-invalid={value.length > 0 && short}
        placeholder={t("Mis. PKS tanpa kebun sendiri; seluruh TBS dibeli dari pihak ketiga.", "E.g. mill without its own plantation; all FFB bought from third parties.")} />
      <span id={`${id}-hint`} className="tiny muted">
        {hint ?? t(`Minimal ${min} karakter. Dicatat di log audit dan laporan.`, `At least ${min} characters. Recorded in the audit log and report.`)} ({value.trim().length}/{min})
      </span>
    </div>
  );
}

/** Bilah perubahan yang menempel di bawah layar selama ada perubahan belum disimpan. */
export function ChangeBar({ count, onReview, onDiscard }: { count: number; onReview: () => void; onDiscard: () => void }) {
  const t = useT();
  if (!count) return null;
  return (
    <div className="change-bar" role="region" aria-label={t("Perubahan belum disimpan", "Unsaved changes")}>
      <span className="grow" aria-live="polite"><b>{t(`${count} perubahan belum disimpan`, `${count} unsaved ${count === 1 ? "change" : "changes"}`)}</b></span>
      <Button variant="ghost" size="sm" onClick={onDiscard}>{t("Batalkan perubahan", "Discard changes")}</Button>
      <Button variant="primary" size="sm" onClick={onReview}>{t("Tinjau dampak", "Review impact")}</Button>
    </div>
  );
}

export type DraftChange = { code: string; name: string; from: ReqStatus; to: ReqStatus };

/** Tinjau dampak (POST preview) → alasan → simpan semua perubahan sekaligus. */
export function ImpactDialog({ companyId, changes, onClose, onSaved, onConflict }: {
  companyId: number; changes: DraftChange[]; onClose: () => void; onSaved: () => void; onConflict: (c: RequirementConflict[]) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<RequirementPreview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const body: ReqChange[] = changes.map((c) => ({ code: c.code, status: c.to, expected: c.from }));

  const load = () => {
    setError(null);
    superApi.preview(companyId, body).then(setPreview).catch(setError);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const min = preview?.needs_reason ? MIN_REASON : 5;
  const save = async () => {
    setBusy(true);
    try {
      await superApi.saveRequirements(companyId, body, reason.trim());
      toast(t("Perubahan disimpan", "Changes saved"));
      onSaved();
    } catch (e) {
      const c = conflictsOf(e);
      if (c) onConflict(c);
      else toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open title={t("Tinjau dampak perubahan", "Review the impact")} onClose={onClose}
      actions={<><Button variant="ghost" onClick={onClose}>{t("Kembali", "Back")}</Button>
        <Button variant="primary" loading={busy} disabled={!preview || !preview.valid || reason.trim().length < min} onClick={save}>{t("Simpan perubahan", "Save changes")}</Button></>}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t("Dokumen", "Document")}</th><th>{t("Sebelum", "Before")}</th><th>{t("Sesudah", "After")}</th></tr></thead>
          <tbody>
            {changes.map((c) => (
              <tr key={c.code}><td className="wrap"><b>{c.name}</b></td><td><ReqStatusBadge status={c.from} /></td><td><ReqStatusBadge status={c.to} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <ErrorBox error={error} onRetry={load} /> : !preview ? <Spinner label={t("Menghitung dampak…", "Working out the impact…")} /> : (
        <>
          {preview.changes.filter((c) => !c.valid).map((c) => <div key={c.code} className="banner bad small" role="alert">{c.error}</div>)}
          {preview.scope12_excluded.length > 0 && (
            <div className="banner warn small" role="note">
              <IconWarn size={16} style={{ flex: "none" }} aria-hidden="true" />
              <span className="grow">{t(`Kategori Scope 1/2 dikecualikan: ${preview.scope12_excluded.join(", ")}. Emisinya tidak dihitung sama sekali dan laporan mencantumkan alasan Anda. Pastikan kegiatan ini memang tidak ada, bukan sekadar datanya belum tersedia.`,
                `Scope 1/2 categories excluded: ${preview.scope12_excluded.join(", ")}. Their emissions are not calculated at all and the report shows your reason. Make sure the activity really does not exist, rather than its data not being available yet.`)}</span>
            </div>
          )}
          <div className="stack tight">
            <b className="small">{t("Periode terbuka yang perlu dihitung ulang", "Open periods that need a re-run")}</b>
            {preview.open_periods.length === 0 && <span className="small muted">{t("Tidak ada periode terbuka.", "No open periods.")}</span>}
            {preview.open_periods.map((p) => (
              <div key={p.id} className="impact-period">
                <b>{t("Periode", "Period")} {p.year}{p.version > 1 ? ` · v${p.version}` : ""}</b>
                {p.lines_removed.length > 0 && (
                  <span>{t("Keluar dari perhitungan", "Removed from the calculation")}: {p.lines_removed.map((l) => `${l.name} (${num(l.value_t, 1)} t CO₂e)`).join(", ")}
                    {p.calc_total_t ? t(` · dari total ${num(p.calc_total_t)} t pada kalkulasi v${p.calc_version}`, ` · out of ${num(p.calc_total_t)} t in calculation v${p.calc_version}`) : ""}</span>
                )}
                {p.gates_changed.map((g) => (
                  <span key={g.key} className="inline nowrap" style={{ gap: 6 }}>
                    {g.after ? <IconCheck size={13} aria-hidden="true" /> : <IconX size={13} aria-hidden="true" />}
                    <span className="wrap">{g.name}: {g.note_before} → <b>{g.note_after}</b>{g.before !== g.after ? ` (${g.after ? t("terpenuhi", "met") : t("belum terpenuhi", "not met")})` : ""}</span>
                  </span>
                ))}
                {!p.lines_removed.length && !p.gates_changed.length && <span className="muted">{t("Syarat penguncian tidak berubah.", "Lock requirements do not change.")}</span>}
              </div>
            ))}
            {preview.locked_periods.length > 0 && (
              <span className="tiny muted">{t(`Perubahan tidak memengaruhi periode yang sudah dikunci (${preview.locked_periods.map((p) => p.year).join(", ")}).`, `Changes do not affect periods that are already locked (${preview.locked_periods.map((p) => p.year).join(", ")}).`)}</span>
            )}
          </div>
          <ReasonField value={reason} onChange={setReason} min={min}
            hint={preview.needs_reason ? t(`Ada kategori Scope 1/2: minimal ${MIN_REASON} karakter.`, `Includes Scope 1/2 categories: at least ${MIN_REASON} characters.`) : undefined} />
        </>
      )}
    </Dialog>
  );
}

/** Ringkasan "7 wajib · 1 opsional · 2 tidak berlaku". */
export function StatusSummary({ required, optional, notApplicable }: { required: number; optional: number; notApplicable: number }) {
  const t = useT();
  return (
    <span className="status-summary">
      <span><StatusIcon status="required" />{t(`${required} wajib`, `${required} required`)}</span>
      <span aria-hidden="true">·</span>
      <span><StatusIcon status="optional" />{t(`${optional} opsional`, `${optional} optional`)}</span>
      <span aria-hidden="true">·</span>
      <span className={notApplicable ? "strong" : undefined}><StatusIcon status="not_applicable" />{t(`${notApplicable} tidak berlaku`, `${notApplicable} not applicable`)}</span>
    </span>
  );
}
