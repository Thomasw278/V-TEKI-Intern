"use client";

import Link from "next/link";
import { IconArrow, IconBuilding, IconHistory, IconInbox } from "@/components/Icons";
import { ReqStatusBadge, StatusSummary } from "@/components/superadmin";
import { Badge, Empty, ErrorBox, Loading, PageHead, useLoad } from "@/components/ui";
import { superApi } from "@/lib/api";
import { when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";

/** Ringkasan superadmin: permintaan yang menunggu (paling menonjol), perusahaan dengan pengecualian, aktivitas terbaru. */
export default function SuperadminHome() {
  const t = useT();
  const { user, epoch } = useSession();
  const { data, error, loading, reload } = useLoad(async () => {
    const [companies, pending, audit] = await Promise.all([
      superApi.companies(), superApi.exceptions("pending"), superApi.audit({ entity: "requirement,exception,profile,doc_type,admin", limit: 8 }),
    ]);
    return { companies, pending, audit };
  }, [epoch]);

  if (loading && !data) return <Loading rows={2} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data) return null;

  const excluded = data.companies.filter((c) => c.not_applicable > 0);
  const custom = data.companies.filter((c) => c.overrides > 0).length;
  const unassigned = data.companies.filter((c) => !c.reviewers.length).length;

  return (
    <>
      <PageHead title={t(`Selamat datang, ${user?.name.split(" ")[0]}`, `Welcome, ${user?.name.split(" ")[0]}`)}
        description={t("Atur dokumen yang wajib, opsional, atau tidak berlaku untuk tiap perusahaan. Superadmin tidak mengunggah atau menyetujui dokumen.",
          "Set which documents are required, optional or not applicable for each company. The superadmin does not upload or approve documents.")} />

      {data.pending.length > 0 ? (
        <section className="banner info" aria-label={t("Permintaan menunggu", "Pending requests")}>
          <IconInbox size={20} style={{ flex: "none" }} aria-hidden="true" />
          <span className="grow">
            <b style={{ display: "block", fontSize: 16 }}>{t(`${data.pending.length} permintaan pengecualian menunggu keputusan`, `${data.pending.length} exception ${data.pending.length === 1 ? "request awaits" : "requests await"} a decision`)}</b>
            <span className="small">{data.pending.slice(0, 3).map((x) => `${x.company} · ${x.type_name}`).join("; ")}{data.pending.length > 3 ? " …" : ""}</span>
          </span>
          <Link href="/superadmin/pengecualian" className="btn primary sm">{t("Putuskan sekarang", "Decide now")}<IconArrow size={14} /></Link>
        </section>
      ) : (
        <div className="banner ok small"><span className="grow">{t("Tidak ada permintaan pengecualian yang menunggu.", "No exception requests are waiting.")}</span></div>
      )}

      <div className="kpis">
        <div className="kpi"><div className="k">{t("Perusahaan", "Companies")}</div><div className="v">{data.companies.length}</div><div className="d"><Link href="/superadmin/perusahaan">{t("lihat semua", "view all")}</Link></div></div>
        <div className="kpi"><div className="k">{t("Permintaan menunggu", "Pending requests")}</div><div className="v" style={{ color: data.pending.length ? "var(--info)" : undefined }}>{data.pending.length}</div><div className="d">{t("dari perusahaan", "from companies")}</div></div>
        <div className="kpi"><div className="k">{t("Punya kategori tidak berlaku", "With excluded categories")}</div><div className="v">{excluded.length}</div><div className="d">{t(`${custom} perusahaan punya pengaturan khusus`, `${custom} companies have custom settings`)}</div></div>
        <div className="kpi"><div className="k">{t("Belum ditugaskan admin", "No reviewer assigned")}</div><div className="v" style={{ color: unassigned ? "var(--warn)" : undefined }}>{unassigned}</div><div className="d"><Link href="/superadmin/admin">{t("atur penugasan", "manage assignments")}</Link></div></div>
      </div>

      <div className="split even">
        <section className="panel" aria-label={t("Perusahaan dengan kategori tidak berlaku", "Companies with excluded categories")}>
          <div className="panel-head"><div><h2>{t("Perusahaan dengan kategori tidak berlaku", "Companies with excluded categories")}</h2><div className="sub">{t("Kategori ini dikeluarkan dari perhitungan.", "These categories are left out of the calculation.")}</div></div></div>
          {excluded.length === 0 ? (
            <Empty icon={<IconBuilding />} title={t("Semua perusahaan memakai kebutuhan bawaan", "Every company uses the default requirements")} />
          ) : (
            <div className="list">
              {excluded.map((c) => (
                <Link key={c.id} href={`/superadmin/perusahaan/${c.id}`} className="list-row">
                  <span className="body"><b className="wrap">{c.name}</b><StatusSummary required={c.required} optional={c.optional} notApplicable={c.not_applicable} /></span>
                  <IconArrow size={15} className="faint" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="panel" aria-label={t("Aktivitas terbaru", "Recent activity")}>
          <div className="panel-head"><h2>{t("Aktivitas terbaru", "Recent activity")}</h2><Link href="/superadmin/audit" className="small strong">{t("Buka log audit", "Open the audit log")}</Link></div>
          {data.audit.length === 0 ? <Empty icon={<IconHistory />} title={t("Belum ada aktivitas", "No activity yet")} /> : (
            <div className="list">
              {data.audit.map((a) => {
                const before = typeof a.before?.status === "string" ? a.before.status : null;
                const after = typeof a.after?.status === "string" ? a.after.status : null;
                const isReq = before && after && ["required", "optional", "not_applicable"].includes(after);
                return (
                  <div key={a.id} className="list-row" style={{ alignItems: "flex-start" }}>
                    <span className="body">
                      <b style={{ fontSize: 13.5, fontWeight: 600 }} className="wrap">{a.summary}</b>
                      <span>{a.user}{a.company ? ` · ${a.company}` : ""}</span>
                      {isReq && <span className="inline" style={{ gap: 6, marginTop: 2 }}><ReqStatusBadge status={before!} /><span aria-hidden="true">→</span><ReqStatusBadge status={after!} /></span>}
                    </span>
                    <span className="tiny faint" style={{ whiteSpace: "nowrap" }}>{when(a.at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {data.pending.length > 0 && (
        <section className="panel" aria-label={t("Permintaan terbaru", "Latest requests")}>
          <div className="panel-head"><h2>{t("Permintaan terbaru", "Latest requests")}</h2><Badge tone="info" pip>{data.pending.length}</Badge></div>
          <div className="list">
            {data.pending.slice(0, 5).map((x) => (
              <Link key={x.id} href="/superadmin/pengecualian" className="list-row">
                <span className="body"><b className="wrap">{x.company} · {x.type_name}</b><span className="wrap">{x.reason}</span></span>
                <ReqStatusBadge status={x.requested_status} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
