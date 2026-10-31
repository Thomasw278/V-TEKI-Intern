"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconInbox, IconWarn } from "@/components/Icons";
import { ReqStatusBadge } from "@/components/superadmin";
import { Badge, Button, Dialog, Empty, ErrorBox, Loading, PageHead, useLoad, useToast } from "@/components/ui";
import { superApi } from "@/lib/api";
import { num, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { ExceptionRequest, RequirementPreview } from "@/lib/types";

type Tab = "pending" | "approved" | "rejected";

/** Kotak masuk permintaan pengecualian ("kami tidak punya dokumen ini"). */
export default function ExceptionsPage() {
  const t = useT();
  const toast = useToast();
  const { epoch } = useSession();
  const [tab, setTab] = useState<Tab>("pending");
  const [deciding, setDeciding] = useState<{ x: ExceptionRequest; decision: "approved" | "rejected" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useLoad(() => superApi.exceptions(tab), [tab, epoch]);

  const decide = async () => {
    if (!deciding) return;
    setBusy(true);
    try {
      await superApi.decide(deciding.x.id, deciding.decision, note.trim() || null);
      toast(deciding.decision === "approved" ? t("Permintaan disetujui", "Request approved") : t("Permintaan ditolak", "Request rejected"));
      setDeciding(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
      reload(true);
    } finally {
      setBusy(false);
    }
  };
  const tabs: [Tab, string][] = [["pending", t("Menunggu", "Pending")], ["approved", t("Disetujui", "Approved")], ["rejected", t("Ditolak", "Rejected")]];
  const empty = { pending: t("Belum ada permintaan pengecualian", "No exception requests yet"), approved: t("Belum ada permintaan yang disetujui", "No approved requests yet"), rejected: t("Belum ada permintaan yang ditolak", "No rejected requests yet") };

  return (
    <>
      <PageHead title={t("Permintaan pengecualian", "Exception requests")}
        description={t("Perusahaan mengajukan bila tidak punya kegiatan atau dokumen tertentu. Menyetujui mengubah status kebutuhan untuk periode yang masih terbuka.",
          "Companies ask when they do not have a given activity or document. Approving changes the requirement status for periods that are still open.")} />
      <div className="segmented" role="tablist" aria-label={t("Status permintaan", "Request status")} style={{ alignSelf: "flex-start" }}>
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {loading && !data ? <Loading rows={1} /> : error ? <ErrorBox error={error} onRetry={() => reload()} /> : !data?.length ? (
        <Empty icon={<IconInbox />} title={empty[tab]}>{tab === "pending" ? t("Permintaan dari perusahaan akan muncul di sini.", "Requests from companies will appear here.") : undefined}</Empty>
      ) : (
        <div className="stack" role="tabpanel">
          {data.map((x) => (
            <section key={x.id} className="panel inbox-card" aria-label={`${x.company} · ${x.type_name}`}>
              <div className="inline" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="stack tight" style={{ minWidth: 0, flex: "1 1 340px" }}>
                  <span className="small muted wrap"><Link href={`/superadmin/perusahaan/${x.company_id}`} className="strong">{x.company}</Link> · {x.requested_by} · {when(x.created_at)}</span>
                  <h2 className="wrap" style={{ fontSize: 18 }}>{x.type_name}</h2>
                  <span className="inline" style={{ gap: 8 }}><span className="small">{t("Diminta menjadi", "Requested status")}</span><ReqStatusBadge status={x.requested_status} /></span>
                  <p className="req-reason wrap">{x.reason}</p>
                  {x.status === "pending" ? <ImpactSnippet x={x} /> : (
                    <p className="tiny muted wrap">{x.status === "approved" ? t("Disetujui", "Approved") : t("Ditolak", "Rejected")} · {x.decided_by} · {when(x.decided_at)}{x.decision_note ? ` · ${x.decision_note}` : ""}</p>
                  )}
                </div>
                {x.status === "pending" ? (
                  <div className="inline">
                    <Button variant="ghost" onClick={() => { setNote(""); setDeciding({ x, decision: "rejected" }); }}>{t("Tolak", "Reject")}</Button>
                    <Button variant="primary" onClick={() => { setNote(""); setDeciding({ x, decision: "approved" }); }}>{t("Setujui", "Approve")}</Button>
                  </div>
                ) : <Badge tone={x.status === "approved" ? "ok" : "bad"}>{x.status === "approved" ? t("Disetujui", "Approved") : t("Ditolak", "Rejected")}</Badge>}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={!!deciding} onClose={() => setDeciding(null)}
        title={deciding?.decision === "approved" ? t("Setujui permintaan?", "Approve the request?") : t("Tolak permintaan?", "Reject the request?")}
        actions={<><Button variant="ghost" onClick={() => setDeciding(null)}>{t("Batal", "Cancel")}</Button>
          <Button variant={deciding?.decision === "approved" ? "primary" : "danger"} loading={busy}
            disabled={deciding?.decision === "rejected" && note.trim().length < 5} onClick={decide}>
            {deciding?.decision === "approved" ? t("Setujui permintaan", "Approve request") : t("Tolak permintaan", "Reject request")}
          </Button></>}>
        {deciding && (
          <>
            <p className="wrap">{deciding.decision === "approved"
              ? t(`${deciding.x.type_name} untuk ${deciding.x.company} akan berstatus seperti yang diminta. Alasan perusahaan dicatat di log audit dan laporan.`,
                `${deciding.x.type_name} for ${deciding.x.company} will get the requested status. The company's reason is recorded in the audit log and report.`)
              : t("Status kebutuhan tidak berubah. Perusahaan melihat catatan Anda.", "The requirement status does not change. The company sees your note.")}</p>
            <div className="field">
              <label htmlFor="note">{t("Catatan untuk perusahaan", "Note to the company")}{deciding.decision === "rejected" ? " *" : ""}</label>
              <textarea id="note" className="textarea" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} aria-describedby="note-hint" />
              <span id="note-hint" className="tiny muted">{deciding.decision === "rejected" ? t("Wajib, minimal 5 karakter.", "Required, at least 5 characters.") : t("Opsional.", "Optional.")}</span>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}

/** Cuplikan dampak bila permintaan disetujui (dari endpoint pratinjau, tidak menyimpan). */
function ImpactSnippet({ x }: { x: ExceptionRequest }) {
  const t = useT();
  const [p, setP] = useState<RequirementPreview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    superApi.preview(x.company_id, [{ code: x.type_code, status: x.requested_status }]).then((r) => alive && setP(r)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [x.company_id, x.type_code, x.requested_status]);
  if (failed) return null;
  if (!p) return <span className="impact skeleton" style={{ height: 16, width: "60%" }} aria-hidden="true" />;
  const ch = p.changes[0];
  const removed = p.open_periods.reduce((s, o) => s + o.removed_t, 0);
  const gate = p.open_periods.flatMap((o) => o.gates_changed.filter((g) => g.key === "documents").map((g) => `${o.year}: ${g.note_after.replace(/\.$/, "")}`));
  return (
    <div className="impact stack tight">
      {!ch.valid && <span className="inline" style={{ gap: 6, color: "var(--bad-ink)" }}><IconWarn size={14} aria-hidden="true" />{ch.error}</span>}
      {ch.before === ch.after && <span>{t("Status sudah sama dengan yang diminta.", "The status already matches the request.")}</span>}
      {removed > 0 && <span>{t(`Keluar dari perhitungan: ${num(removed, 1)} t CO₂e (kalkulasi terakhir).`, `Removed from the calculation: ${num(removed, 1)} t CO₂e (latest calculation).`)}</span>}
      {gate.length > 0 && <span>{t("Dokumen wajib setelah disetujui", "Required documents once approved")}: {gate.join(" · ")}</span>}
      {ch.scope12 && ch.emission_excluded && <span className="inline" style={{ gap: 6 }}><IconWarn size={14} aria-hidden="true" />{t("Kategori Scope 1/2 akan dikecualikan.", "A Scope 1/2 category will be excluded.")}</span>}
      {p.open_periods.length > 0 && <span>{t(`Periode terbuka yang perlu dihitung ulang: ${p.open_periods.map((o) => o.year).join(", ")}.`, `Open periods to re-run: ${p.open_periods.map((o) => o.year).join(", ")}.`)}</span>}
    </div>
  );
}
