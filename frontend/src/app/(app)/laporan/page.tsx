"use client";

import { useState } from "react";
import { IconDownload, IconLock } from "@/components/Icons";
import { Badge, Button, Dialog, Empty, ErrorBox, Loading, PageHead, useLoad, useToast } from "@/components/ui";
import { api, ApiError, downloadFile } from "@/lib/api";
import { num, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { AuditEntry, Calculation, Gate, Reviewer } from "@/lib/types";

export default function LaporanPage() {
  const t = useT();
  const { period, company, isAdmin, reloadCompany, epoch } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReopen, setConfirmReopen] = useState(false);

  const { data, error, loading, reload } = useLoad(async () => {
    if (!period) return null;
    const [gates, audit, calc, reviewers] = await Promise.all([
      api<Gate[]>(`/api/periods/${period.id}/gates`),
      api<AuditEntry[]>(`/api/periods/${period.id}/audit?limit=14`),
      api<Calculation>(`/api/periods/${period.id}/calculation`).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
      api<Reviewer[]>("/api/company/reviewers").catch(() => [] as Reviewer[]),
    ]);
    return { gates, audit, calc, reviewers };
  }, [period?.id, period?.status, epoch]);

  if (!period) return null;
  if (loading && !data) return <Loading rows={1} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data) return null;

  const locked = period.status === "locked";
  const workGates = data.gates.filter((g) => g.key !== "role");
  const passed = workGates.filter((g) => g.ok).length;
  const ready = passed === workGates.length;
  const calc = data.calc;

  const lock = async () => {
    setBusy("lock");
    try {
      await api(`/api/periods/${period.id}/lock`, { method: "POST" });
      toast(t(`Periode ${period.year} dikunci`, `Period ${period.year} locked`));
      await reloadCompany();
    } catch (e) {
      toast((e as Error).message, "error");
      reload(true);
    } finally {
      setBusy(null);
    }
  };
  const reopen = async () => {
    setConfirmReopen(false);
    setBusy("reopen");
    try {
      await api(`/api/periods/${period.id}/reopen`, { method: "POST" });
      toast(t("Revisi baru dibuka", "New revision opened"));
      await reloadCompany();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };
  const dl = async (kind: "xlsx" | "xml") => {
    setBusy(kind);
    try {
      await downloadFile(`/api/periods/${period.id}/export.${kind}`, `karbonlens_${period.year}.${kind}`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead title={isAdmin ? t("Laporan & penguncian", "Report & lock") : t("Tinjauan & laporan", "Review & report")}
        description={isAdmin
          ? t(`Periode ${period.year}, revisi ${period.version}. Periksa syarat di bawah, lalu kunci periode agar laporan final bisa diterbitkan.`,
            `Period ${period.year}, revision ${period.version}. Check the requirements below, then lock the period so the final report can be issued.`)
          : t(`Periode ${period.year}, revisi ${period.version}. Admin peninjau mengunci periode setelah semua syarat terpenuhi.`,
            `Period ${period.year}, revision ${period.version}. Your reviewer locks the period once every requirement is met.`)}>
        {locked ? <Badge tone="ok" pip>{t("Dikunci", "Locked")}</Badge> : <Badge tone="warn" pip>{t("Belum dikunci", "Not locked")}</Badge>}
      </PageHead>

      <div className="split even">
        <section className="panel" aria-label={t("Laporan", "Report")} style={{ position: "relative", overflow: "hidden" }}>
          <div className="inline" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ minWidth: 0, flex: "1 1 260px" }}>
              <div className="small muted">{t("Laporan emisi tertanam produk", "Embedded product emissions report")}</div>
              <h2 className="display wrap" style={{ fontSize: 30, marginTop: 4 }}>{company?.name}</h2>
              <div className="small strong" style={{ marginTop: 6 }}>{t(`1 Januari – 31 Desember ${period.year}`, `1 January – 31 December ${period.year}`)}</div>
              <div className="small muted wrap">{[company?.address, company?.city, company?.province].filter(Boolean).join(", ")}</div>
            </div>
            {locked ? <Badge tone="ok">{t(`FINAL · v${period.version}`, `FINAL · v${period.version}`)}</Badge> : <Badge tone="warn">{t("DRAF", "DRAFT")}</Badge>}
          </div>
          <hr />
          {!calc ? <Empty title={t("Belum ada kalkulasi", "No calculation yet")}>{t("Jalankan kalkulasi untuk mengisi laporan.", "Run a calculation to fill in the report.")}</Empty> : (
            <div className="stack">
              <dl className="kv">
                <dt>{t("Versi kalkulasi", "Calculation version")}</dt><dd>v{calc.version} · {when(calc.created_at)}</dd>
                <dt>GWP</dt><dd>IPCC {calc.gwp_set}</dd>
                <dt>{t("Alokasi", "Allocation")}</dt><dd>{calc.allocation_method === "economic" ? t("Nilai jual", "Economic value") : t("Massa", "Mass")}</dd>
                <dt>{t("Total emisi", "Total emissions")}</dt><dd>{num(calc.total_t)} t CO₂e</dd>
              </dl>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t("Produk", "Product")}</th><th className="num">{t("Ton", "Tonnes")}</th><th className="num">SEE {t("langsung", "direct")}</th><th className="num">SEE {t("tdk langsung", "indirect")}</th><th className="num">SEE total</th></tr></thead>
                  <tbody>
                    {calc.allocations.map((a) => (
                      <tr key={a.code}><td><b>{a.code}</b></td><td className="num">{num(a.tonnes)}</td><td className="num">{num(a.see_direct, 3)}</td><td className="num">{num(a.see_indirect, 3)}</td><td className="num"><b>{num(a.see_total, 3)}</b></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Object.keys(calc.defaults_used ?? {}).length > 0 && <div className="banner warn small"><span className="grow">{t("Memakai nilai bawaan", "Uses default values")}: {Object.values(calc.defaults_used).join("; ")}</span></div>}
              <p className="tiny muted">{t("SEE dalam t CO₂e per ton produk. Setiap angka tertaut ke dokumen sumber di ekspor XLSX.", "SEE in t CO₂e per tonne of product. Every figure links to its source document in the XLSX export.")}</p>
              <div className="grid-2" style={{ gap: 12 }}>
                {([["xlsx", t("Laporan & data aktivitas", "Report & activity data"), t("Ringkasan, SEE, rumus, faktor, jejak data", "Summary, SEE, formulas, factors, data trail")],
                  ["xml", t("Komunikasi emisi CBAM", "CBAM emissions communication"), t("Struktur XML untuk importir di UE", "XML structure for EU importers")]] as const).map(([k, title, sub]) => (
                  <button key={k} type="button" className="btn secondary" style={{ height: "auto", padding: 14, justifyContent: "flex-start", textAlign: "left", whiteSpace: "normal" }}
                    disabled={busy === k} onClick={() => dl(k)}>
                    {busy === k ? <span className="spinner" /> : <IconDownload size={18} />}
                    <span><b style={{ display: "block" }}>{title}</b><span className="tiny muted" style={{ fontWeight: 400 }}>{k.toUpperCase()} · {sub}</span></span>
                  </button>
                ))}
              </div>
              {!locked && <span className="tiny muted">{t("Ekspor sebelum dikunci diberi tanda DRAF di dalam berkas.", "Exports before locking are marked DRAFT inside the file.")}</span>}
            </div>
          )}
        </section>

        <div className="stack">
          <section className="panel" aria-label={t("Syarat penguncian", "Lock requirements")}>
            <div className="panel-head" style={{ marginBottom: 6 }}>
              <h2>{t("Syarat sebelum dikunci", "Before locking")}</h2>
              <span className="badge">{passed}/{workGates.length}</span>
            </div>
            {workGates.map((g) => (
              <div key={g.key} className="gate">
                <span className={`ic ${g.ok ? "ok" : "no"}`}>{g.ok ? "✓" : ""}</span>
                <span className="body" style={{ minWidth: 0 }}><b className="small" style={{ display: "block" }}>{g.name}</b><span className="tiny muted">{g.note}</span></span>
              </div>
            ))}
            <div style={{ marginTop: 14 }}>
              {isAdmin ? (
                locked ? (
                  <Button block onClick={() => setConfirmReopen(true)} loading={busy === "reopen"}>{t(`Buka revisi v${period.version + 1}`, `Open revision v${period.version + 1}`)}</Button>
                ) : (
                  <Button variant="primary" block size="lg" onClick={lock} loading={busy === "lock"} disabled={!ready}>
                    <IconLock size={17} />{ready ? t("Setujui & kunci periode", "Approve & lock period") : t("Lengkapi syarat untuk mengunci", "Meet the requirements to lock")}
                  </Button>
                )
              ) : (
                <div className="role-note">
                  <IconLock size={18} style={{ flex: "none", marginTop: 2, color: "var(--primary)" }} />
                  <span>{data.reviewers.length
                    ? t(`Dikunci oleh admin peninjau: ${data.reviewers.map((r) => r.name).join(", ")}.`, `Locked by your reviewer: ${data.reviewers.map((r) => r.name).join(", ")}.`)
                    : t("Belum ada admin peninjau yang ditugaskan untuk perusahaan ini. Hubungi pengelola sistem.", "No reviewer has been assigned to this company yet. Contact the system administrator.")}</span>
                </div>
              )}
            </div>
          </section>

          <section className="panel" aria-label={t("Jejak audit", "Audit trail")}>
            <div className="panel-head"><h2>{t("Jejak audit", "Audit trail")}</h2></div>
            <div className="list">
              {data.audit.map((a) => (
                <div key={a.id} className="list-row" style={{ alignItems: "flex-start" }}>
                  <span className={`sev ${a.action === "lock" || a.action === "approve" ? "info" : a.action === "reject" ? "critical" : "warning"}`} style={{ opacity: a.action === "lock" || a.action === "approve" || a.action === "reject" ? 1 : 0.35 }} />
                  <span className="body">
                    <b style={{ fontSize: 13.5, fontWeight: 600 }}>{a.user} <span className="muted" style={{ fontWeight: 400 }}>{a.summary}</span></b>
                    {a.reason && <span>{t("Alasan", "Reason")}: {a.reason}</span>}
                  </span>
                  <span className="tiny faint" style={{ whiteSpace: "nowrap" }}>{when(a.at)}</span>
                </div>
              ))}
              {!data.audit.length && <Empty title={t("Belum ada aktivitas", "No activity yet")} />}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={confirmReopen} title={t("Buka revisi baru?", "Open a new revision?")} onClose={() => setConfirmReopen(false)}
        actions={<><Button variant="ghost" onClick={() => setConfirmReopen(false)}>{t("Batal", "Cancel")}</Button><Button variant="primary" onClick={reopen}>{t("Buka revisi", "Open revision")}</Button></>}>
        <p>{t("Data bisa diubah lagi oleh perusahaan dan laporan harus dikunci ulang. Revisi sebelumnya tetap tercatat di jejak audit.",
          "The company can change data again and the report must be locked again. The previous revision stays in the audit trail.")}</p>
      </Dialog>
    </>
  );
}
