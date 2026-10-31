"use client";

import Link from "next/link";
import { useState } from "react";
import { IconArrow, IconBuilding, IconSearch } from "@/components/Icons";
import { StatusSummary } from "@/components/superadmin";
import { Badge, Empty, ErrorBox, Loading, PageHead, useLoad } from "@/components/ui";
import { superApi } from "@/lib/api";
import { initials, periodLabel } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";

type Filter = "all" | "excluded" | "pending" | "unassigned";

/** Semua perusahaan beserta ringkasan status kebutuhan dokumennya. */
export default function SuperCompaniesPage() {
  const t = useT();
  const { epoch } = useSession();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const { data, error, loading, reload } = useLoad(() => superApi.companies(), [epoch]);

  if (loading && !data) return <Loading rows={1} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data) return null;

  const match = (c: (typeof data)[number]) =>
    (filter === "all" || (filter === "excluded" && c.not_applicable > 0) || (filter === "pending" && c.pending_exceptions > 0)
      || (filter === "unassigned" && !c.reviewers.length))
    && (!q || `${c.name} ${c.city ?? ""} ${c.province ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const rows = data.filter(match);
  const count = (f: Filter) => data.filter((c) => f === "excluded" ? c.not_applicable > 0 : f === "pending" ? c.pending_exceptions > 0 : !c.reviewers.length).length;
  const filters: [Filter, string][] = [
    ["all", t("Semua", "All")],
    ["excluded", t(`Punya pengecualian (${count("excluded")})`, `With exclusions (${count("excluded")})`)],
    ["pending", t(`Permintaan menunggu (${count("pending")})`, `Pending requests (${count("pending")})`)],
    ["unassigned", t(`Belum ada admin (${count("unassigned")})`, `No reviewer (${count("unassigned")})`)],
  ];

  return (
    <>
      <PageHead title={t("Perusahaan", "Companies")}
        description={t("Pilih perusahaan untuk mengatur status tiap jenis dokumen.", "Choose a company to set the status of each document type.")} />

      <div className="inline" style={{ justifyContent: "space-between" }}>
        <div className="segmented" role="group" aria-label={t("Saring perusahaan", "Filter companies")} style={{ flexWrap: "wrap" }}>
          {filters.map(([k, l]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <div className="input-affix" style={{ minWidth: 0, flex: "0 1 280px" }}>
          <input className="input" style={{ paddingRight: 36 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama atau kota", "Search name or city")} aria-label={t("Cari perusahaan", "Search companies")} />
          <IconSearch size={16} className="affix" />
        </div>
      </div>

      <section className="panel flush" aria-label={t("Daftar perusahaan", "Company list")}>
        {rows.length === 0 ? (
          <Empty icon={<IconBuilding />} title={data.length ? t("Tidak ada yang cocok", "No matches") : t("Belum ada perusahaan", "No companies yet")}>
            {data.length ? t("Ubah kata kunci atau saringan.", "Change the search term or filter.") : t("Perusahaan mendaftar sendiri lewat halaman Daftarkan perusahaan.", "Companies register themselves on the registration page.")}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table cards">
              <thead><tr><th>{t("Perusahaan", "Company")}</th><th>{t("Kebutuhan dokumen", "Document requirements")}</th><th>{t("Periode terbaru", "Latest period")}</th><th>{t("Admin peninjau", "Reviewers")}</th><th /></tr></thead>
              <tbody>
                {rows.map((c) => {
                  const p = c.period ? periodLabel(c.period.status, t) : null;
                  return (
                    <tr key={c.id}>
                      <td className="primary">
                        <div className="inline nowrap" style={{ alignItems: "flex-start" }}>
                          <span className="avatar" style={{ width: 32, height: 32, fontSize: 11.5 }} aria-hidden="true">{initials(c.name)}</span>
                          <span style={{ minWidth: 0 }}>
                            <Link href={`/superadmin/perusahaan/${c.id}`} className="wrap strong" style={{ display: "block", color: "var(--ink)" }}>{c.name}</Link>
                            <span className="tiny muted">{[c.city, c.province].filter(Boolean).join(", ") || c.sector}</span>
                            {c.pending_exceptions > 0 && <div style={{ marginTop: 4 }}><Badge tone="info" pip>{t(`${c.pending_exceptions} permintaan menunggu`, `${c.pending_exceptions} pending ${c.pending_exceptions === 1 ? "request" : "requests"}`)}</Badge></div>}
                          </span>
                        </div>
                      </td>
                      <td data-label={t("Kebutuhan", "Requirements")}><StatusSummary required={c.required} optional={c.optional} notApplicable={c.not_applicable} /></td>
                      <td data-label={t("Periode terbaru", "Latest period")}>{c.period ? <span className="inline nowrap" style={{ gap: 8 }}>{c.period.year}<Badge tone={p!.tone}>{p!.label}</Badge></span> : "—"}</td>
                      <td data-label={t("Admin peninjau", "Reviewers")} className="small wrap">{c.reviewers.length ? c.reviewers.join(", ") : <Badge tone="warn">{t("Belum ada", "None")}</Badge>}</td>
                      <td style={{ textAlign: "right" }}>
                        <Link href={`/superadmin/perusahaan/${c.id}`} className="btn sm secondary" aria-label={t(`Atur kebutuhan ${c.name}`, `Set requirements for ${c.name}`)}>{t("Atur kebutuhan", "Set requirements")}<IconArrow size={14} /></Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
