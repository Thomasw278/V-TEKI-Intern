"use client";

import { useState } from "react";
import { IconHistory } from "@/components/Icons";
import { ReqStatusBadge } from "@/components/superadmin";
import { Button, Empty, ErrorBox, Loading, PageHead, useLoad } from "@/components/ui";
import { superApi } from "@/lib/api";
import { when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";

const REQ = ["required", "optional", "not_applicable"];
/** Jenis aksi → filter entitas & aksi di backend. */
const KINDS: Record<string, { entity?: string; action?: string }> = {
  "": { entity: "requirement,exception,profile,doc_type,admin" },
  status: { entity: "requirement" },
  exception: { entity: "exception" },
  profile: { entity: "profile" },
  catalog: { entity: "doc_type" },
  admin: { entity: "admin" },
  period: { entity: "period" },
  all: {},
};

/** Log audit lintas perusahaan: nilai lama → nilai baru, alasan, dan pelaku. */
export default function AuditPage() {
  const t = useT();
  const { epoch } = useSession();
  const empty = { company: "", actor: "", kind: "", from: "", to: "" };
  const [f, setF] = useState(empty);
  const opts = useLoad(async () => {
    const [companies, actors] = await Promise.all([superApi.companies(), superApi.auditActors()]);
    return { companies, actors };
  }, [epoch]);
  const { data, error, loading, reload } = useLoad(() => superApi.audit({
    ...KINDS[f.kind], company_id: f.company, user_id: f.actor, date_from: f.from, date_to: f.to, limit: 300,
  }), [f.company, f.actor, f.kind, f.from, f.to, epoch]);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const kinds: [string, string][] = [
    ["", t("Kebutuhan & akses", "Requirements & access")], ["status", t("Perubahan status", "Status changes")], ["exception", t("Pengecualian", "Exceptions")],
    ["profile", t("Profil", "Profiles")], ["catalog", t("Katalog", "Catalogue")], ["admin", t("Admin & penugasan", "Reviewers & assignments")],
    ["period", t("Periode", "Periods")], ["all", t("Semua aksi", "All actions")],
  ];

  return (
    <>
      <PageHead title={t("Log audit", "Audit log")} description={t("Perubahan status kebutuhan, profil, keputusan pengecualian, katalog, dan akses admin, lengkap dengan alasan dan pelakunya.", "Changes to requirement statuses, profiles, exception decisions, the catalogue and reviewer access, with reasons and who made them.")} />

      <section className="panel" aria-label={t("Saring log", "Filter the log")}>
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <div className="field"><label htmlFor="f-company">{t("Perusahaan", "Company")}</label>
            <select id="f-company" className="select" value={f.company} onChange={set("company")}>
              <option value="">{t("Semua", "All")}</option>
              {(opts.data?.companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="field"><label htmlFor="f-actor">{t("Pelaku", "Actor")}</label>
            <select id="f-actor" className="select" value={f.actor} onChange={set("actor")}>
              <option value="">{t("Semua", "All")}</option>
              {(opts.data?.actors ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></div>
          <div className="field"><label htmlFor="f-kind">{t("Jenis aksi", "Action type")}</label>
            <select id="f-kind" className="select" value={f.kind} onChange={set("kind")}>
              {kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
          <div className="field"><label htmlFor="f-from">{t("Dari tanggal", "From")}</label><input id="f-from" type="date" className="input" value={f.from} max={f.to || undefined} onChange={set("from")} /></div>
          <div className="field"><label htmlFor="f-to">{t("Sampai tanggal", "To")}</label><input id="f-to" type="date" className="input" value={f.to} min={f.from || undefined} onChange={set("to")} /></div>
        </div>
        {JSON.stringify(f) !== JSON.stringify(empty) && <div style={{ marginTop: 10 }}><Button size="sm" variant="ghost" onClick={() => setF(empty)}>{t("Hapus saringan", "Clear filters")}</Button></div>}
      </section>

      {loading && !data ? <Loading rows={1} /> : error ? <ErrorBox error={error} onRetry={() => reload()} /> : !data?.length ? (
        <Empty icon={<IconHistory />} title={t("Tidak ada catatan yang cocok", "No matching entries")} />
      ) : (
        <section className="panel flush" aria-label={t("Catatan audit", "Audit entries")}>
          <div className="table-wrap">
            <table className="table cards">
              <thead><tr><th>{t("Perubahan", "Change")}</th><th>{t("Waktu", "Time")}</th><th>{t("Perusahaan", "Company")}</th><th>{t("Pelaku", "Actor")}</th><th>{t("Alasan", "Reason")}</th></tr></thead>
              <tbody>
                {data.map((a) => {
                  const b = typeof a.before?.status === "string" ? a.before.status : null;
                  const n = typeof a.after?.status === "string" ? a.after.status : null;
                  const isReq = !!b && !!n && REQ.includes(b) && REQ.includes(n);
                  return (
                    <tr key={a.id}>
                      <td className="primary">
                        <span className="wrap" style={{ display: "block" }}>{a.summary}</span>
                        {isReq && <span className="inline" style={{ gap: 6, marginTop: 4 }}><ReqStatusBadge status={b!} /><span aria-hidden="true">→</span><ReqStatusBadge status={n!} /></span>}
                      </td>
                      <td data-label={t("Waktu", "Time")} className="small muted" style={{ whiteSpace: "nowrap" }}>{when(a.at)}</td>
                      <td data-label={t("Perusahaan", "Company")} className="small wrap">{a.company ?? <span className="muted">{t("Global", "Global")}</span>}</td>
                      <td data-label={t("Pelaku", "Actor")} className="small">{a.user}</td>
                      <td data-label={t("Alasan", "Reason")} className="small wrap">{a.reason ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
