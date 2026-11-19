"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconArrow, IconCheck, IconChevronRight } from "@/components/Icons";
import { Empty, ErrorBox, Loading, useLoad } from "@/components/ui";
import { superApi } from "@/lib/api";
import { initials, num, periodLabel, reqStatusLabel, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { SuperCompanyRow } from "@/lib/types";

type Filter = "all" | "excluded" | "custom" | "unassigned";
type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

/** Status ringkas: titik berwarna + teks (tanpa latar). */
function Dot({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`sa-dot ${tone}`}><i aria-hidden="true" />{children}</span>;
}

/**
 * Ringkasan superadmin: kotak masuk permintaan pengecualian (paling menonjol), metrik dalam bento grid,
 * tabel perusahaan yang bisa disaring, dan aktivitas pengaturan terbaru.
 */
export default function SuperadminHome() {
  const t = useT();
  const router = useRouter();
  const { user, epoch } = useSession();
  const [filter, setFilter] = useState<Filter>("all");
  const { data, error, loading, reload } = useLoad(async () => {
    const [companies, pending, audit] = await Promise.all([
      superApi.companies(), superApi.exceptions("pending"), superApi.audit({ entity: "requirement,exception,profile,doc_type,admin", limit: 8 }),
    ]);
    return { companies, pending, audit };
  }, [epoch]);

  if (loading && !data) return <Loading rows={2} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data) return null;

  const companies = data.companies;
  const excluded = companies.filter((c) => c.not_applicable > 0);
  const custom = companies.filter((c) => c.overrides > 0);
  const unassigned = companies.filter((c) => !c.reviewers.length);
  const totalNA = companies.reduce((s, c) => s + c.not_applicable, 0);
  const share = (n: number) => (companies.length ? (n / companies.length) * 100 : 0);
  const PICK: Record<Filter, (c: SuperCompanyRow) => boolean> = {
    all: () => true, excluded: (c) => c.not_applicable > 0, custom: (c) => c.overrides > 0, unassigned: (c) => !c.reviewers.length,
  };
  const rows = companies.filter(PICK[filter]);
  const tabs: [Filter, string, number][] = [
    ["all", t("Semua", "All"), companies.length],
    ["excluded", t("Ada pengecualian", "With exclusions"), excluded.length],
    ["custom", t("Pengaturan khusus", "Custom settings"), custom.length],
    ["unassigned", t("Tanpa admin", "No reviewer"), unassigned.length],
  ];

  return (
    <>
      <header className="dx-head">
        <div className="dx-titles">
          <h1>{t("Ringkasan", "Overview")}</h1>
          <p>
            <span>{user?.name}</span><span aria-hidden="true">·</span>
            <span>{t("Pengelola sistem", "System administrator")}</span><span aria-hidden="true">·</span>
            <span>{t(`${companies.length} perusahaan terdaftar`, `${companies.length} registered companies`)}</span>
          </p>
        </div>
        <div className="dx-actions">
          <Link href="/superadmin/katalog" className="btn secondary">{t("Katalog dokumen", "Document catalogue")}</Link>
          <Link href="/superadmin/perusahaan" className="btn primary">{t("Atur kebutuhan", "Manage requirements")}<IconArrow size={15} /></Link>
        </div>
      </header>

      {/* ---------- bento: kotak masuk + empat metrik ---------- */}
      <section className="sa-bento" aria-label={t("Ikhtisar", "Overview")}>
        <article className="sa-tile sa-inbox">
          <div className="sa-tile-h">
            <span className="l">{t("Permintaan pengecualian", "Exception requests")}</span>
            {data.pending.length > 0 && <Dot tone="info">{t("Menunggu keputusan", "Awaiting decision")}</Dot>}
          </div>
          <div className="sa-inbox-num">
            <b>{data.pending.length}</b>
            <span>{data.pending.length ? t("permintaan perlu diputuskan", "requests need a decision") : t("tidak ada yang menunggu", "nothing waiting")}</span>
          </div>
          {data.pending.length === 0 ? (
            <div className="sa-clear"><IconCheck size={16} aria-hidden="true" />{t("Semua permintaan dari perusahaan sudah diputuskan.", "Every company request has been decided.")}</div>
          ) : (
            <ul className="sa-inbox-list">
              {data.pending.slice(0, 4).map((x) => {
                const st = reqStatusLabel(x.requested_status, t);
                return (
                  <li key={x.id}>
                    <Link href="/superadmin/pengecualian">
                      <span className="t"><b>{x.company}</b><em>{x.type_name} · {when(x.created_at)}</em></span>
                      <Dot tone={st.tone}>{st.label}</Dot>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/superadmin/pengecualian" className="sa-tile-f">
            {data.pending.length > 4 ? t(`Lihat ${data.pending.length - 4} permintaan lainnya`, `View ${data.pending.length - 4} more requests`) : t("Buka kotak masuk", "Open the inbox")}
            <IconArrow size={14} />
          </Link>
        </article>

        <Link href="/superadmin/perusahaan" className="sa-tile">
          <span className="l">{t("Perusahaan", "Companies")}<IconArrow size={14} className="sa-arrow" /></span>
          <b className="v">{num(companies.length)}</b>
          <span className="sa-split" aria-hidden="true">
            <i className="na" style={{ width: `${share(excluded.length)}%` }} />
            <i className="custom" style={{ width: `${share(Math.max(0, custom.length - excluded.length))}%` }} />
          </span>
          <span className="s">{t(`${excluded.length} dengan pengecualian · ${custom.length} pengaturan khusus`, `${excluded.length} with exclusions · ${custom.length} custom`)}</span>
        </Link>

        <Link href="/superadmin/perusahaan" className="sa-tile">
          <span className="l">{t("Kategori tidak berlaku", "Excluded categories")}<IconArrow size={14} className="sa-arrow" /></span>
          <b className="v">{num(totalNA)}</b>
          <span className="s">{t(`tersebar di ${excluded.length} perusahaan, dikeluarkan dari perhitungan`, `across ${excluded.length} companies, left out of the calculation`)}</span>
        </Link>

        <Link href="/superadmin/profil" className="sa-tile">
          <span className="l">{t("Pengaturan khusus", "Custom settings")}<IconArrow size={14} className="sa-arrow" /></span>
          <b className="v">{num(custom.length)}</b>
          <span className="s">{t("perusahaan dengan status berbeda dari katalog", "companies whose statuses differ from the catalogue")}</span>
        </Link>

        <Link href="/superadmin/admin" className={`sa-tile ${unassigned.length ? "attn" : ""}`}>
          <span className="l">{t("Belum ada admin peninjau", "No reviewer assigned")}<IconArrow size={14} className="sa-arrow" /></span>
          <b className="v">{num(unassigned.length)}</b>
          <span className="s">{unassigned.length ? t("perusahaan belum bisa dikunci laporannya", "companies cannot have their report locked yet") : t("semua perusahaan punya peninjau", "every company has a reviewer")}</span>
        </Link>
      </section>

      {/* ---------- perusahaan (selebar halaman) ---------- */}
        <section className="dx-card" aria-label={t("Perusahaan", "Companies")}>
          <div className="dx-card-h">
            <div>
              <h2>{t("Perusahaan", "Companies")}</h2>
              <p>{t("Status kebutuhan dokumen dan penugasan peninjau tiap perusahaan", "Document requirement status and reviewer assignment per company")}</p>
            </div>
          </div>
          <div className="sa-pills" role="tablist" aria-label={t("Saring perusahaan", "Filter companies")}>
            {tabs.map(([k, l, n]) => (
              <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>{l}<span>{n}</span></button>
            ))}
          </div>
          {rows.length === 0 ? (
            <div className="dx-card-b"><Empty title={t("Tidak ada perusahaan pada saringan ini", "No companies match this filter")} /></div>
          ) : (
            <div className="sa-table-wrap" role="tabpanel">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>{t("Perusahaan", "Company")}</th>
                    <th className="n">{t("Wajib", "Required")}</th>
                    <th className="n">{t("Opsional", "Optional")}</th>
                    <th className="n">{t("Tidak berlaku", "N/A")}</th>
                    <th>{t("Admin peninjau", "Reviewer")}</th>
                    <th>{t("Periode", "Period")}</th>
                    <th aria-label={t("Buka", "Open")} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const p = c.period ? periodLabel(c.period.status, t) : null;
                    const href = `/superadmin/perusahaan/${c.id}`;
                    return (
                      <tr key={c.id} onClick={() => router.push(href)}>
                        <td>
                          <Link href={href} className="sa-co" onClick={(e) => e.stopPropagation()}>
                            <span className="av" aria-hidden="true">{initials(c.name)}</span>
                            <span><b>{c.name}</b><em>{[c.city, c.province].filter(Boolean).join(", ") || "—"}</em></span>
                          </Link>
                        </td>
                        <td className="n" data-l={t("Wajib ", "Required ")}>{c.required}</td>
                        <td className="n" data-l={t("Opsional ", "Optional ")}>{c.optional}</td>
                        <td className="n" data-l={t("Tidak berlaku ", "N/A ")}>{c.not_applicable ? <b className="na">{c.not_applicable}</b> : <span className="faint">0</span>}</td>
                        <td>{c.reviewers.length ? <span className="sa-rev">{c.reviewers.join(", ")}</span> : <Dot tone="warn">{t("Belum ada", "None")}</Dot>}</td>
                        <td>{p ? <Dot tone={p.tone}>{c.period!.year} · {p.label}</Dot> : <span className="faint">—</span>}</td>
                        <td className="go"><IconChevronRight size={16} aria-hidden="true" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      {/* ---------- aktivitas ---------- */}
        <section className="dx-card" aria-label={t("Aktivitas terbaru", "Recent activity")}>
          <div className="dx-card-h">
            <div>
              <h2>{t("Aktivitas terbaru", "Recent activity")}</h2>
              <p>{t("Perubahan kebutuhan, profil, katalog, dan akun", "Changes to requirements, profiles, catalogue and accounts")}</p>
            </div>
          </div>
          <div className="dx-card-b flush">
            {data.audit.length === 0 ? <p className="dx-empty">{t("Belum ada aktivitas.", "No activity yet.")}</p> : (
              <ol className="sa-feed cols">
                {data.audit.map((a) => {
                  const before = typeof a.before?.status === "string" ? a.before.status : null;
                  const after = typeof a.after?.status === "string" ? a.after.status : null;
                  const isReq = before && after && ["required", "optional", "not_applicable"].includes(after);
                  return (
                    <li key={a.id}>
                      <span className="dot" aria-hidden="true" />
                      <span className="t">
                        <b>{a.summary}</b>
                        {isReq && (
                          <span className="chg">
                            <Dot tone={reqStatusLabel(before!, t).tone}>{reqStatusLabel(before!, t).label}</Dot>
                            <span aria-hidden="true">→</span>
                            <Dot tone={reqStatusLabel(after!, t).tone}>{reqStatusLabel(after!, t).label}</Dot>
                          </span>
                        )}
                        <em>{a.user}{a.company ? ` · ${a.company}` : ""} · {when(a.at)}</em>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          <div className="dx-card-f"><Link href="/superadmin/audit" className="dx-link">{t("Buka log audit", "Open the audit log")}<IconArrow size={14} /></Link></div>
        </section>
    </>
  );
}
