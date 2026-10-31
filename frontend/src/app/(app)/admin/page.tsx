"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconArrow, IconBuilding, IconInbox } from "@/components/Icons";
import { Badge, Empty, ErrorBox, Loading, PageHead, useLoad } from "@/components/ui";
import { api } from "@/lib/api";
import { initials, num, periodLabel, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { AdminCompanyRow, QueueItem } from "@/lib/types";

/** Ruang kerja admin peninjau: semua perusahaan yang ditugaskan + antrean pengajuan lintas perusahaan. */
export default function AdminHome() {
  const t = useT();
  const router = useRouter();
  const { user, isAdmin, selectCompany, epoch } = useSession();
  const [opening, setOpening] = useState<number | null>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    if (!isAdmin) return null;
    const [companies, queue] = await Promise.all([api<AdminCompanyRow[]>("/api/admin/companies"), api<QueueItem[]>("/api/admin/queue")]);
    return { companies, queue };
  }, [isAdmin, epoch]);

  if (!isAdmin) {
    return <Empty title={t("Halaman ini untuk admin peninjau", "This page is for reviewers")}>{t("Akun perusahaan memakai halaman Ringkasan.", "Company accounts use the Overview page.")}</Empty>;
  }
  if (loading && !data) return <Loading rows={1} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data) return null;

  const open = async (companyId: number, href: string) => {
    setOpening(companyId);
    try {
      await selectCompany(companyId);
      router.push(href);
    } finally {
      setOpening(null);
    }
  };
  const waiting = data.companies.reduce((s, c) => s + c.waiting_review, 0);
  const locked = data.companies.filter((c) => c.period?.status === "locked").length;
  const drafts = data.companies.reduce((s, c) => s + c.draft_factors, 0);

  return (
    <>
      <PageHead
        title={t(`Selamat datang, ${user?.name.split(" ")[0]}`, `Welcome, ${user?.name.split(" ")[0]}`)}
        description={t("Perusahaan yang ditugaskan kepada Anda dan dokumen yang menunggu persetujuan.", "The companies assigned to you and the documents waiting for approval.")} />

      <div className="kpis">
        <div className="kpi"><div className="k">{t("Perusahaan ditinjau", "Companies reviewed")}</div><div className="v">{data.companies.length}</div><div className="d">{t("ditugaskan oleh pengelola sistem", "assigned by the system administrator")}</div></div>
        <div className="kpi"><div className="k">{t("Menunggu persetujuan", "Awaiting approval")}</div><div className="v" style={{ color: waiting ? "var(--info)" : undefined }}>{waiting}</div><div className="d">{t("dokumen dari semua perusahaan", "documents across all companies")}</div></div>
        <div className="kpi"><div className="k">{t("Faktor draf", "Draft factors")}</div><div className="v">{drafts}</div><div className="d">{t("perlu sumber & persetujuan", "need a source & approval")}</div></div>
        <div className="kpi"><div className="k">{t("Periode dikunci", "Periods locked")}</div><div className="v">{locked}<small>/ {data.companies.length}</small></div><div className="d">{t("periode terbaru tiap perusahaan", "latest period per company")}</div></div>
      </div>

      <section className="panel flush" aria-label={t("Perusahaan", "Companies")}>
        <div className="panel-head">
          <div><h2>{t("Perusahaan saya", "My companies")}</h2><div className="sub">{t("Pilih perusahaan untuk meninjau data, faktor, dan kalkulasinya.", "Choose a company to review its data, factors and calculation.")}</div></div>
        </div>
        {data.companies.length === 0 ? (
          <Empty icon={<IconBuilding />} title={t("Belum ada perusahaan yang ditugaskan", "No companies assigned yet")}>
            {t("Superadmin menugaskan perusahaan lewat halaman superadmin atau perintah python -m app.cli assign.", "The superadmin assigns companies on the superadmin pages or with the python -m app.cli assign command.")}
          </Empty>
        ) : (
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="table cards">
              <thead>
                <tr>
                  <th>{t("Perusahaan", "Company")}</th><th>{t("Periode", "Period")}</th><th className="num">{t("Menunggu", "Waiting")}</th>
                  <th className="num">{t("Dokumen", "Documents")}</th><th className="num">{t("Total t CO₂e", "Total t CO₂e")}</th><th>{t("Aktivitas", "Activity")}</th><th />
                </tr>
              </thead>
              <tbody>
                {data.companies.map((c) => {
                  const p = c.period ? periodLabel(c.period.status, t) : null;
                  return (
                    <tr key={c.id} className="clickable" onClick={() => open(c.id, "/dashboard")}>
                      <td className="primary">
                        <div className="inline nowrap" style={{ alignItems: "flex-start" }}>
                          <span className="avatar" style={{ width: 32, height: 32, fontSize: 11.5 }}>{initials(c.name)}</span>
                          <span style={{ minWidth: 0 }}>
                            <b className="wrap" style={{ display: "block" }}>{c.name}</b>
                            <span className="tiny muted">{[c.city, c.province].filter(Boolean).join(", ") || c.sector}</span>
                          </span>
                        </div>
                      </td>
                      <td data-label={t("Periode", "Period")}>{c.period ? <span className="inline nowrap" style={{ gap: 8 }}>{c.period.year}<Badge tone={p!.tone}>{p!.label}</Badge></span> : "—"}</td>
                      <td data-label={t("Menunggu", "Waiting")} className="num">{c.waiting_review ? <Badge tone="info">{c.waiting_review}</Badge> : <span className="muted">0</span>}</td>
                      <td data-label={t("Dokumen", "Documents")} className="num">{c.documents}</td>
                      <td data-label="Total t CO₂e" className="num strong">{c.total_t != null ? num(c.total_t) : "—"}</td>
                      <td data-label={t("Aktivitas", "Activity")} className="muted small">{when(c.last_activity)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button type="button" className="btn sm secondary" disabled={opening === c.id} onClick={(e) => { e.stopPropagation(); open(c.id, "/dashboard"); }}>
                          {opening === c.id ? <span className="spinner" /> : null}{t("Buka", "Open")}<IconArrow size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-label={t("Antrean pengajuan", "Submission queue")}>
        <div className="panel-head">
          <div><h2>{t("Antrean pengajuan", "Submission queue")}</h2><div className="sub">{t("Diurutkan dari pengajuan paling lama.", "Oldest submissions first.")}</div></div>
          {data.queue.length > 0 && <Badge tone="info" pip>{t(`${data.queue.length} dokumen`, `${data.queue.length} documents`)}</Badge>}
        </div>
        {data.queue.length === 0 ? (
          <Empty icon={<IconInbox />} title={t("Tidak ada dokumen yang menunggu", "Nothing waiting")}>{t("Pengajuan baru dari perusahaan akan muncul di sini.", "New submissions from companies will appear here.")}</Empty>
        ) : (
          <div className="list">
            {data.queue.map((q) => (
              <button key={q.id} type="button" className="list-row" onClick={() => open(q.company_id, `/dokumen/${q.id}`)}>
                <span className="sev info" />
                <span className="body">
                  <b>{q.original_name}</b>
                  <span>{q.company} · {t("periode", "period")} {q.year}{q.doc_number ? ` · ${q.doc_number}` : ""}</span>
                </span>
                <span className="tiny faint hide-m" style={{ whiteSpace: "nowrap" }}>{t("diajukan", "submitted")} {when(q.submitted_at)}</span>
                <IconArrow size={15} className="faint" />
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
