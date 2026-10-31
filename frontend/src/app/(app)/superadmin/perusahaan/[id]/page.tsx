"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { IconBack, IconLock, IconWarn } from "@/components/Icons";
import {
  ChangeBar, ImpactDialog, ReqStatusBadge, SourceText, StatusSegment, StatusSummary, type DraftChange,
} from "@/components/superadmin";
import { Badge, Button, ErrorBox, Loading, PageHead, useLoad } from "@/components/ui";
import { superApi } from "@/lib/api";
import { periodLabel, reqStatusLabel, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { CompanyRequirement, ReqStatus, RequirementConflict } from "@/lib/types";

type Group = { key: string; title: string; note: string; rows: CompanyRequirement[] };

/** Status kebutuhan tiap jenis dokumen untuk satu perusahaan. Perubahan disimpan setelah dampaknya ditinjau. */
export default function CompanyRequirementsPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { epoch } = useSession();
  const { data, error, loading, reload } = useLoad(() => superApi.requirements(id), [id, epoch]);
  const [draft, setDraft] = useState<Record<string, ReqStatus>>({});
  const [review, setReview] = useState(false);
  const [conflicts, setConflicts] = useState<RequirementConflict[] | null>(null);

  const changes: DraftChange[] = useMemo(() => (data?.requirements ?? [])
    .filter((r) => draft[r.code] && draft[r.code] !== r.status)
    .map((r) => ({ code: r.code, name: r.name, from: r.status, to: draft[r.code] })), [data, draft]);

  // jangan biarkan perubahan yang belum disimpan hilang diam-diam saat menutup tab
  useEffect(() => {
    if (!changes.length) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes.length]);

  if (loading && !data) return <Loading rows={2} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data) return null;

  const status = (r: CompanyRequirement) => draft[r.code] ?? r.status;
  const count = (s: ReqStatus) => data.requirements.filter((r) => status(r) === s).length;
  const groups: Group[] = [
    { key: "s12", title: t("Scope 1 & 2", "Scope 1 & 2"), note: t("Perubahan status wajib disertai alasan minimal 15 karakter.", "Status changes need a reason of at least 15 characters."), rows: data.requirements.filter((r) => r.builtin && r.scope12) },
    { key: "see", title: t("Pembagi SEE", "SEE denominator"), note: t("Selalu dihitung karena menjadi pembagi emisi per ton produk.", "Always calculated because it is the denominator of emissions per tonne of product."), rows: data.requirements.filter((r) => r.builtin && !r.can_exclude) },
    { key: "up", title: t("Hulu, hilir & pemeriksa silang", "Upstream, downstream & cross-checks"), note: "", rows: data.requirements.filter((r) => r.builtin && !r.scope12 && r.can_exclude) },
    { key: "sup", title: t("Dokumen pendukung", "Supporting documents"), note: t("Hanya bukti: tidak dibaca otomatis dan tidak ikut perhitungan emisi.", "Evidence only: not read automatically and not part of the emission calculation."), rows: data.requirements.filter((r) => !r.builtin) },
  ].filter((g) => g.rows.length);
  const open = data.periods.filter((p) => p.status !== "locked");

  const onConflict = async (c: RequirementConflict[]) => {
    setReview(false);
    setConflicts(c);
    await reload(true);
    // perubahan yang kini sama dengan status terbaru tidak perlu disimpan lagi
    setDraft((d) => Object.fromEntries(Object.entries(d).filter(([code, to]) => !c.some((x) => x.code === code && x.current === to))));
  };

  return (
    <>
      <PageHead
        eyebrow={<Link href="/superadmin/perusahaan" className="inline nowrap" style={{ gap: 6 }}><IconBack size={14} />{t("Semua perusahaan", "All companies")}</Link>}
        title={<span className="wrap">{data.company.name}</span>}
        description={t("Wajib menghalangi penguncian bila belum ada. Opsional dipakai bila ada. Tidak berlaku dikeluarkan dari perhitungan dan dicantumkan di laporan.",
          "Required blocks locking when missing. Optional is used when present. Not applicable is left out of the calculation and listed in the report.")}>
        <StatusSummary required={count("required")} optional={count("optional")} notApplicable={count("not_applicable")} />
      </PageHead>

      {conflicts && (
        <div className="banner warn" role="alert">
          <IconWarn size={18} style={{ flex: "none" }} aria-hidden="true" />
          <span className="grow">
            <b style={{ display: "block" }}>{t("Superadmin lain sudah mengubah status ini. Data terbaru sudah dimuat.", "Another superadmin already changed these statuses. The latest data is loaded.")}</b>
            {conflicts.map((c) => (
              <span key={c.code} className="small" style={{ display: "block" }}>
                {c.name}: {t("Anda melihat", "you saw")} {reqStatusLabel(c.expected, t).label}, {t("sekarang", "now")} <b>{reqStatusLabel(c.current, t).label}</b>{c.set_by ? ` (${c.set_by}${c.set_at ? `, ${when(c.set_at)}` : ""})` : ""}
              </span>
            ))}
            <span className="small">{t("Periksa lagi perubahan Anda sebelum menyimpan.", "Check your changes again before saving.")}</span>
          </span>
          <Button size="sm" variant="ghost" onClick={() => setConflicts(null)}>{t("Tutup", "Close")}</Button>
        </div>
      )}

      <div className="banner info small">
        <span className="grow">{open.length
          ? t(`Perubahan berlaku untuk periode terbuka (${open.map((p) => p.year).join(", ")}) dan kalkulasinya perlu dihitung ulang.`, `Changes apply to open periods (${open.map((p) => p.year).join(", ")}) and their calculation needs a re-run.`)
          : t("Tidak ada periode terbuka. Perubahan berlaku untuk periode berikutnya.", "No open periods. Changes apply to the next period.")}
          {" "}{t("Perubahan tidak memengaruhi periode yang sudah dikunci.", "Changes do not affect periods that are already locked.")}</span>
      </div>

      <section className="panel flush req-matrix" aria-label={t("Status kebutuhan dokumen", "Document requirement statuses")}>
        <div className="rm-head" aria-hidden="true"><span>{t("Dokumen", "Document")}</span><span>{t("Status", "Status")}</span><span>{t("Sumber & alasan", "Source & reason")}</span></div>
        {groups.map((g) => (
          <div key={g.key} role="group" aria-labelledby={`g-${g.key}`}>
            <div className="rm-group" id={`g-${g.key}`}>{g.title}{g.note && <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}> · {g.note}</span>}</div>
            {g.rows.map((r) => {
              const changed = !!draft[r.code] && draft[r.code] !== r.status;
              return (
                <div key={r.code} className={`rm-row ${changed ? "changed" : ""}`}>
                  <div className="rm-name">
                    <span className="rm-no">{r.no}</span>
                    <span style={{ minWidth: 0 }}>
                      <b className="wrap" style={{ display: "block" }}>{r.name}</b>
                      <span className="tiny muted">{r.scope}{r.has_default ? ` · ${t("punya nilai bawaan", "has default values")}` : ""}</span>
                      {r.exception_pending && <div style={{ marginTop: 4 }}><Link href="/superadmin/pengecualian"><Badge tone="info" pip>{t("Permintaan pengecualian menunggu", "Exception request pending")}</Badge></Link></div>}
                    </span>
                  </div>
                  <StatusSegment value={status(r)} req={r} label={t(`Status ${r.name}`, `Status of ${r.name}`)}
                    onChange={(v) => setDraft((d) => {
                      const next = { ...d };
                      if (v === r.status) delete next[r.code];
                      else next[r.code] = v;
                      return next;
                    })} />
                  <div className="rm-meta">
                    {changed ? (
                      <span className="inline" style={{ gap: 6 }}><b>{t("Belum disimpan", "Not saved")}:</b><ReqStatusBadge status={r.status} /><span aria-hidden="true">→</span><ReqStatusBadge status={draft[r.code]} /></span>
                    ) : (
                      <>
                        <SourceText r={r} />
                        {r.reason && <span style={{ display: "block", color: "var(--ink-2)" }}>{r.reason}</span>}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </section>

      {data.locked_periods.length > 0 && (
        <section className="panel" aria-label={t("Periode terkunci", "Locked periods")}>
          <div className="panel-head"><div><h2>{t("Periode terkunci", "Locked periods")}</h2><div className="sub">{t("Status saat periode dikunci (baca saja). Perubahan tidak memengaruhi periode yang sudah dikunci.", "Statuses when the period was locked (read only). Changes do not affect periods that are already locked.")}</div></div></div>
          <div className="stack tight">
            {data.locked_periods.map((p) => {
              const na = p.statuses.filter((s) => s.status === "not_applicable");
              return (
                <details key={p.id} className="note-box">
                  <summary>
                    <IconLock size={15} aria-hidden="true" />
                    <span><b>{t("Periode", "Period")} {p.year}{p.version > 1 ? ` · v${p.version}` : ""}</b> <span className="muted small">{t("dikunci", "locked")} {when(p.locked_at)}</span></span>
                    <span className="small muted hide-m">{na.length ? t(`${na.length} tidak berlaku`, `${na.length} not applicable`) : t("semua kategori berlaku", "all categories apply")}</span>
                  </summary>
                  <div className="body">
                    {p.statuses.map((s) => (
                      <div key={s.code} className="inline" style={{ justifyContent: "space-between", gap: 8 }}>
                        <span className="wrap" style={{ flex: "1 1 180px" }}>{s.name}{s.reason ? <span className="muted"> · {s.reason}</span> : null}</span>
                        <ReqStatusBadge status={s.status} />
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}

      {data.exceptions.length > 0 && (
        <section className="panel" aria-label={t("Riwayat permintaan pengecualian", "Exception request history")}>
          <div className="panel-head"><h2>{t("Riwayat permintaan pengecualian", "Exception request history")}</h2><Link href="/superadmin/pengecualian" className="small strong">{t("Buka kotak masuk", "Open the inbox")}</Link></div>
          <div className="list">
            {data.exceptions.map((x) => (
              <div key={x.id} className="list-row" style={{ alignItems: "flex-start" }}>
                <span className="body">
                  <b className="wrap">{x.type_name}</b>
                  <span className="wrap">{x.reason} · {x.requested_by}</span>
                  {x.decision_note && <span className="wrap">{t("Catatan", "Note")}: {x.decision_note}</span>}
                </span>
                <span className="stack tight" style={{ alignItems: "flex-end" }}>
                  <ReqStatusBadge status={x.requested_status} />
                  <Badge tone={x.status === "approved" ? "ok" : x.status === "rejected" ? "bad" : "info"}>
                    {x.status === "approved" ? t("Disetujui", "Approved") : x.status === "rejected" ? t("Ditolak", "Rejected") : t("Menunggu", "Pending")}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.periods.length > 0 && (
        <div className="inline small muted" style={{ gap: 6 }}>
          {t("Periode", "Periods")}: {data.periods.map((p) => <Badge key={p.id} tone={periodLabel(p.status, t).tone}>{p.year}{p.version > 1 ? ` v${p.version}` : ""} · {periodLabel(p.status, t).label}</Badge>)}
        </div>
      )}

      <ChangeBar count={changes.length} onReview={() => setReview(true)} onDiscard={() => setDraft({})} />

      {review && (
        <ImpactDialog companyId={data.company.id} changes={changes} onClose={() => setReview(false)} onConflict={onConflict}
          onSaved={() => { setReview(false); setDraft({}); setConflicts(null); reload(true); }} />
      )}
    </>
  );
}
