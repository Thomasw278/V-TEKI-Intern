"use client";

import Link from "next/link";
import { useState } from "react";
import { IconArrow, IconCalc, IconCheck, IconInbox, IconRefresh, IconUpload, IconWarn } from "@/components/Icons";
import { Badge, Button, CountUp, Empty, ErrorBox, Loading, PageHead, useLoad, useToast } from "@/components/ui";
import { ExcludedNote } from "@/components/requirements";
import { api } from "@/lib/api";
import { num, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useSummary } from "@/lib/summary";
import type { Dashboard, Issue, ReqState } from "@/lib/types";

function issueHref(i: Issue): string {
  if (i.ref_type === "document" && i.ref_id) return `/dokumen/${i.ref_id}`;
  if (i.ref_type === "factor") return "/faktor";
  if (["PENDING_REVIEW", "DOC_REJECTED", "WAITING_APPROVAL"].includes(i.code)) return "/validasi";
  return "/dokumen";
}

export default function DashboardPage() {
  const t = useT();
  const { period, company, isAdmin, epoch } = useSession();
  const { refreshSummary } = useSummary();
  const toast = useToast();
  const [recalc, setRecalc] = useState(false);
  const { data, error, loading, reload } = useLoad(
    () => (period ? api<Dashboard>(`/api/periods/${period.id}/dashboard`) : Promise.resolve(null)),
    [period?.id, epoch],
  );

  const STATE: Record<ReqState, string> = {
    complete: t("Lengkap", "Complete"), partial: t("Sebagian", "Partial"), in_review: t("Dalam proses", "In progress"),
    default: t("Nilai bawaan", "Default value"), missing: t("Belum ada", "Missing"),
    excluded: t("Tidak berlaku", "Not applicable"),
  };

  if (!period) return <Empty title={t("Belum ada periode pelaporan", "No reporting period yet")}>{t("Buka periode baru di menu Perusahaan & akun.", "Open a new period under Company & account.")}</Empty>;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data) return null;

  const calc = data.calculation;
  const st = data.document_status;
  const toCheck = st.needs_review ?? 0;
  const returned = st.rejected ?? 0;
  const submitted = st.validated ?? 0;
  const approved = st.approved ?? 0;
  const reading = (st.uploaded ?? 0) + (st.processing ?? 0);
  const locked = data.period.status === "locked";
  const total = calc?.total_t || 0;
  const share = (v: number) => (total ? (v / total) * 100 : 0);
  const reqRequired = data.requirements.filter((r) => r.required);
  const reqDone = reqRequired.filter((r) => r.state === "complete" || r.state === "partial").length;
  const critical = data.issues.filter((i) => i.severity === "critical");

  const steps = [
    { name: t("Unggah", "Upload"), sub: t(`${data.documents_total} dokumen`, `${data.documents_total} documents`), state: data.documents_total ? "done" : "active" },
    { name: t("Dibaca", "Read"), sub: reading ? t(`${reading} sedang dibaca`, `${reading} reading`) : t("selesai", "done"), state: !data.documents_total ? "todo" : reading ? "active" : "done" },
    { name: t("Diajukan", "Submitted"), sub: toCheck + returned ? t(`${toCheck + returned} perlu diperiksa`, `${toCheck + returned} to check`) : t(`${submitted + approved} diajukan`, `${submitted + approved} submitted`), state: !data.documents_total ? "todo" : toCheck + returned ? "active" : "done" },
    { name: t("Disetujui", "Approved"), sub: submitted ? t(`${submitted} menunggu admin`, `${submitted} awaiting reviewer`) : t(`${approved} disetujui`, `${approved} approved`), state: approved && !submitted ? "done" : submitted ? "active" : "todo" },
    { name: t("Kalkulasi", "Calculation"), sub: calc ? t(`versi ${calc.version}`, `version ${calc.version}`) : t("belum dijalankan", "not run yet"), state: calc ? "done" : approved + submitted ? "active" : "todo" },
    { name: t("Dikunci", "Locked"), sub: locked ? t("laporan final siap", "final report ready") : t("oleh admin", "by reviewer"), state: locked ? "done" : calc ? "active" : "todo" },
  ];

  const next = isAdmin
    ? submitted
      ? { text: t(`${submitted} dokumen menunggu persetujuan Anda.`, `${submitted} documents are waiting for your approval.`), href: "/validasi", cta: t("Tinjau pengajuan", "Review submissions") }
      : !locked && calc
        ? { text: t("Tidak ada pengajuan tertunda. Periksa syarat penguncian periode.", "No pending submissions. Check the lock requirements."), href: "/laporan", cta: t("Buka penguncian", "Open lock") }
        : { text: t("Menunggu perusahaan mengajukan dokumen.", "Waiting for the company to submit documents."), href: "/dokumen", cta: t("Lihat dokumen", "View documents") }
    : toCheck + returned
      ? { text: t(`${toCheck + returned} dokumen perlu Anda periksa sebelum diajukan.`, `${toCheck + returned} documents need checking before you submit them.`), href: "/validasi", cta: t("Periksa & ajukan", "Check & submit") }
      : reqDone < reqRequired.length
        ? { text: t(`${reqRequired.length - reqDone} kategori wajib belum punya dokumen.`, `${reqRequired.length - reqDone} required categories have no documents yet.`), href: "/dokumen", cta: t("Lihat kebutuhan", "See requirements") }
        : !calc
          ? { text: t("Semua kategori wajib terisi. Jalankan kalkulasi pertama.", "All required categories are filled. Run the first calculation."), href: "/kalkulasi", cta: t("Buka kalkulasi", "Open calculation") }
          : !locked
            ? { text: t("Hasil siap ditinjau admin sebelum periode dikunci.", "Results are ready for the reviewer before the period is locked."), href: "/laporan", cta: t("Lihat status tinjauan", "View review status") }
            : { text: t(`Periode ${data.period.year} sudah dikunci.`, `Period ${data.period.year} is locked.`), href: "/laporan", cta: t("Unduh laporan", "Download report") };

  const canCalc = data.period.status !== "locked";
  const recalculate = async () => {
    setRecalc(true);
    try {
      const c = await api<{ version: number }>(`/api/periods/${data.period.id}/calculate`, { body: {} });
      toast(t(`Kalkulasi v${c.version} selesai`, `Calculation v${c.version} finished`));
      await reload(true);
      refreshSummary();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setRecalc(false);
    }
  };
  const setup = data.setup;
  const onboarding = !isAdmin && setup && !(setup.documents && setup.submitted && setup.calculated);
  const firstSteps = setup ? [
    { done: setup.profile, title: t("Lengkapi profil perusahaan", "Complete the company profile"), sub: t("NPWP/NIB, alamat, dan minimal satu fasilitas", "Tax ID, address and at least one facility"), href: "/pengaturan", cta: t("Buka profil", "Open profile") },
    { done: setup.documents, title: t("Unggah dokumen pertama", "Upload the first documents"), sub: t("Tagihan listrik, faktur BBM, rekap produksi, dan lainnya", "Electricity bills, fuel invoices, production summaries and more"), href: "/dokumen#unggah", cta: t("Unggah", "Upload") },
    { done: setup.submitted, title: t("Periksa angka lalu ajukan", "Check the figures, then submit"), sub: t("Bandingkan hasil baca dengan dokumen aslinya", "Compare what was read with the original"), href: "/validasi", cta: t("Periksa", "Check") },
    { done: setup.calculated, title: t("Jalankan kalkulasi", "Run the calculation"), sub: t("Emisi per produk dihitung dari dokumen yang diajukan", "Emissions per product from submitted documents"), href: "/kalkulasi", cta: t("Hitung", "Calculate") },
  ] : [];

  const lines = calc ? [...calc.lines].filter((l) => l.value_t > 0.0005).sort((a, b) => b.value_t - a.value_t) : [];
  const maxLine = lines[0]?.value_t || 1;
  const cbam = calc?.cbam ?? null;
  const GROUP: Record<string, string> = { direct: t("Langsung", "Direct"), indirect: t("Listrik", "Electricity"), upstream: t("Hulu", "Upstream") };
  const stepIndex = Math.max(0, steps.findIndex((s) => s.state === "active"));
  const doneSteps = steps.filter((s) => s.state === "done").length;

  return (
    <>
      <PageHead
        eyebrow={isAdmin ? <><Badge tone="info">{t("Mode peninjau", "Reviewer mode")}</Badge>{company?.name}</> : <span className="db-meta">{company?.name}</span>}
        title={t(`Ringkasan periode ${data.period.year}`, `Period ${data.period.year} overview`)}
        description={<span className="db-meta">
          {calc ? t(`Kalkulasi v${calc.version} · ${when(calc.created_at)}`, `Calculation v${calc.version} · ${when(calc.created_at)}`) : t("Belum ada kalkulasi", "No calculation yet")}
          {" · "}{locked ? t("periode dikunci", "period locked") : t("data masih bisa diubah", "data can still change")}
        </span>}>
        {isAdmin ? (
          <Link href="/validasi" className="btn primary"><IconInbox size={16} />{t("Tinjau pengajuan", "Review submissions")}</Link>
        ) : (
          <>
            <Link href="/dokumen#unggah" className="btn secondary"><IconUpload size={16} />{t("Unggah dokumen", "Upload documents")}</Link>
            <Link href="/kalkulasi" className="btn primary"><IconCalc size={16} />{t("Kalkulasi", "Calculate")}</Link>
          </>
        )}
      </PageHead>

      <ExcludedNote items={data.requirements.filter((r) => r.excluded).map((r) => ({
        code: r.code, name: r.name, reason: r.status_reason, set_by: r.status_set_by, set_at: r.status_set_at, source: r.status_source,
      }))} />

      {onboarding && (
        <section className="panel onboarding" aria-label={t("Langkah awal", "Getting started")}>
          <div className="panel-head">
            <div><h2>{t("Langkah awal", "Getting started")}</h2><div className="sub">{t(`${firstSteps.filter((x) => x.done).length} dari 4 selesai`, `${firstSteps.filter((x) => x.done).length} of 4 done`)}</div></div>
          </div>
          <ol className="first-steps">
            {firstSteps.map((x, i) => {
              const current = i === firstSteps.findIndex((y) => !y.done);
              return (
                <li key={x.title} className={x.done ? "done" : current ? "current" : ""}>
                  <span className="n" aria-hidden="true">{x.done ? <IconCheck size={14} /> : i + 1}</span>
                  <span className="body"><b>{x.title}</b><span>{x.sub}</span></span>
                  {!x.done && <Link href={x.href} className={`btn sm ${current ? "primary" : "ghost"}`}>{x.cta}<IconArrow size={14} /></Link>}
                  <span className="sr-only">{x.done ? t("selesai", "done") : t("belum", "to do")}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {calc?.stale && (
        <div className="db-alert" role="alert">
          <IconWarn size={16} aria-hidden="true" />
          <span className="grow">{t(`Data berubah ${when(calc.stale_since ?? null)}. Angka di bawah dari kalkulasi sebelumnya; hitung ulang sebelum dipakai.`,
            `Data changed ${when(calc.stale_since ?? null)}. The figures below come from the previous calculation; recalculate before using them.`)}</span>
          {canCalc && <Button size="sm" loading={recalc} onClick={recalculate}><IconRefresh size={14} />{t("Hitung ulang", "Recalculate")}</Button>}
        </div>
      )}

      {/* ---------- metrik utama ---------- */}
      <section className="db-strip" aria-label={t("Hasil periode", "Period results")}>
        <div className="db-cell db-total">
          <span className="db-k">{t("Total emisi tertanam", "Total embedded emissions")}</span>
          {calc ? (
            <>
              <b className={`db-v xl ${calc.stale ? "is-stale" : ""}`}><CountUp value={calc.total_t} /></b>
              <span className="db-u">{t(`t CO₂e · jejak karbon produk ${data.period.year}`, `t CO₂e · product carbon footprint ${data.period.year}`)}</span>
              <div className="db-stack" aria-hidden="true">
                <i className="direct" style={{ width: `${share(calc.direct_t)}%` }} />
                <i className="indirect" style={{ width: `${share(calc.indirect_t)}%` }} />
                <i className="upstream" style={{ width: `${share(calc.upstream_t)}%` }} />
              </div>
              <div className="db-legend">
                <span><i className="direct" />{t("Langsung", "Direct")} <em>{num(share(calc.direct_t), 1)}%</em></span>
                <span><i className="indirect" />{t("Listrik", "Electricity")} <em>{num(share(calc.indirect_t), 1)}%</em></span>
                <span><i className="upstream" />{t("Hulu", "Upstream")} <em>{num(share(calc.upstream_t), 1)}%</em></span>
              </div>
            </>
          ) : (
            <>
              <b className="db-v xl muted">—</b>
              <span className="db-u">{t("Ajukan dokumen lalu jalankan kalkulasi.", "Submit documents, then run a calculation.")}</span>
            </>
          )}
        </div>
        {(calc?.allocations ?? []).slice(0, 2).map((a) => (
          <div key={a.code} className="db-cell">
            <span className="db-k">SEE {a.code}</span>
            <b className="db-v"><CountUp value={a.see_total} digits={3} /></b>
            <span className="db-u">{t("t CO₂e per ton", "t CO₂e per tonne")}</span>
            <span className="db-foot">{num(a.tonnes)} t · {t("porsi", "share")} {num(a.share * 100, 1)}%</span>
          </div>
        ))}
        <div className="db-cell">
          <span className="db-k">{t("Batas CBAM", "CBAM boundary")}</span>
          {cbam ? (
            <>
              <b className="db-v">{num(cbam.embedded_total_t)}</b>
              <span className="db-u">t CO₂e · Annex IV</span>
              <span className="db-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, share(cbam.embedded_total_t))}%` }} /></span>
              <span className="db-foot">{t(`${num(share(cbam.embedded_total_t), 1)}% dari jejak karbon`, `${num(share(cbam.embedded_total_t), 1)}% of the footprint`)}</span>
            </>
          ) : (
            <>
              <b className="db-v muted">—</b>
              <span className="db-foot">{calc ? t("Hitung ulang untuk melihat", "Recalculate to see it") : t("Setelah kalkulasi", "After a calculation")}</span>
            </>
          )}
        </div>
        <div className="db-stats">
          <Link href="/dokumen"><span className="db-k">{t("Dokumen", "Documents")}</span><b>{data.documents_total}</b><em>{reading ? t(`${reading} dibaca`, `${reading} reading`) : t("terunggah", "uploaded")}</em></Link>
          <Link href="/validasi"><span className="db-k">{isAdmin ? t("Menunggu Anda", "Awaiting you") : t("Perlu diperiksa", "To check")}</span><b className={(isAdmin ? submitted : toCheck + returned) ? "warn" : ""}>{isAdmin ? submitted : toCheck + returned}</b><em>{returned && !isAdmin ? t(`${returned} dikembalikan`, `${returned} returned`) : t("dokumen", "documents")}</em></Link>
          <Link href="/dokumen"><span className="db-k">{t("Kategori wajib", "Required")}</span><b>{reqDone}<small>/{reqRequired.length}</small></b><em>{t("terpenuhi", "covered")}</em></Link>
          <Link href="/validasi"><span className="db-k">{t("Isu kritis", "Critical")}</span><b className={critical.length ? "bad" : ""}>{critical.length}</b><em>{critical.length ? t("perlu ditangani", "need attention") : t("tidak ada", "none")}</em></Link>
          {calc?.has_draft_factors && <Link href="/faktor" className="draft"><span className="db-k">{t("Status hasil", "Result status")}</span><b className="warn">{t("Draf", "Draft")}</b><em>{t("ada faktor belum disetujui", "unapproved factors")}</em></Link>}
        </div>
      </section>

      {/* ---------- jalur periode ---------- */}
      <section className="db-rail" aria-label={t("Tahapan periode", "Period stages")}>
        <div className="db-rail-head">
          <span className="db-k">{t(`Tahapan periode ${data.period.year}`, `Period ${data.period.year} stages`)}</span>
          <span className="db-mono">{doneSteps}/{steps.length} {t("selesai", "done")}</span>
        </div>
        <ol>
          <span className="db-rail-track" aria-hidden="true"><i style={{ width: `${(Math.max(doneSteps - 0.5, 0) / (steps.length - 1)) * 100}%` }} /></span>
          {steps.map((s, i) => (
            <li key={s.name} className={s.state} aria-current={i === stepIndex && s.state === "active" ? "step" : undefined}>
              <span className="db-node" aria-hidden="true">{s.state === "done" ? <IconCheck size={12} /> : String(i + 1).padStart(2, "0")}</span>
              <b>{s.name}</b>
              <span>{s.sub}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="db-grid">
        {/* ---------- komposisi ---------- */}
        <section className="panel db-panel db-main" aria-label={t("Komposisi emisi", "Emission composition")}>
          <div className="db-phead">
            <div><span className="db-k">{t("Komposisi emisi", "Emission composition")}</span><h2>{t("Kontribusi per sumber", "Contribution by source")}</h2></div>
            <Link href="/kalkulasi" className="db-link">{t("Rincian rumus", "Formula details")}<IconArrow size={14} /></Link>
          </div>
          {calc ? (
            <div className="db-rows">
              <div className="db-row head"><span>{t("Sumber", "Source")}</span><span>{t("Kelompok", "Group")}</span><span /><span className="r">t CO₂e</span><span className="r">%</span></div>
              {lines.map((l) => (
                <div key={l.key} className="db-row">
                  <span className="n">{l.name}{l.source === "default" && <sup title={t("Nilai bawaan literatur", "Literature default")}>†</sup>}</span>
                  <span className="g">{GROUP[l.group] ?? l.group}</span>
                  <span className="bar"><i className={l.group} style={{ width: `${(l.value_t / maxLine) * 100}%` }} /></span>
                  <span className="r v">{num(l.value_t, 0)}</span>
                  <span className="r p">{num(share(l.value_t), 1)}</span>
                </div>
              ))}
            </div>
          ) : <Empty title={t("Belum ada kalkulasi", "No calculation yet")}>{t("Komposisi muncul setelah kalkulasi pertama.", "The composition appears after the first calculation.")}</Empty>}

          {cbam && calc && (
            <div className="db-cbam">
              <div className="db-cbam-head">
                <div>
                  <span className="db-k">{t("Pembanding regulasi", "Regulatory comparison")}</span>
                  <h3>{t("Jejak karbon produk vs batas CBAM", "Product footprint vs CBAM boundary")}</h3>
                </div>
                <span className="db-mono">Reg. (EU) 2023/956 · Annex IV</span>
              </div>
              <div className="db-compare">
                <div><span>{t("Jejak karbon produk", "Product footprint")}</span><span className="db-cbar"><i style={{ width: "100%" }} /></span><b>{num(calc.total_t)} t</b></div>
                <div><span>{t("Batas CBAM", "CBAM boundary")}</span><span className="db-cbar cbam"><i style={{ width: `${Math.max(1, share(cbam.embedded_total_t))}%` }} /></span><b>{num(cbam.embedded_total_t)} t</b></div>
              </div>
              <p className="db-note">{t("CBAM hanya menghitung instalasi (pabrik): CO₂ pembakaran stasioner, listrik yang dikonsumsi, dan prekursor. Di luar batas:",
                "CBAM covers the installation only: stationary combustion CO₂, electricity consumed and precursors. Outside the boundary:")}</p>
              <div className="db-chips">
                {cbam.outside.filter((o) => o.value_t >= 0.5).map((o) => <span key={o.key} title={o.reason}>{o.name}<em>{num(o.value_t)} t</em></span>)}
              </div>
            </div>
          )}
        </section>

        {/* ---------- perlu ditangani ---------- */}
        <section className="panel db-panel db-side" aria-label={t("Perlu ditangani", "Needs attention")}>
          <div className="db-phead">
            <div><span className="db-k">{t("Antrean", "Queue")}</span><h2>{t("Perlu ditangani", "Needs attention")}</h2></div>
            {critical.length ? <Badge tone="bad" pip>{t(`${critical.length} kritis`, `${critical.length} critical`)}</Badge> : <Badge tone="ok" pip>{t("Aman", "Clear")}</Badge>}
          </div>
          <div className="db-next">
            <span className="db-k accent">{t("Langkah berikutnya", "Next step")}</span>
            <p>{next.text}</p>
            <Link href={next.href} className="btn primary sm">{next.cta}<IconArrow size={14} /></Link>
          </div>
          {data.issues.length === 0 && <p className="db-empty">{t("Tidak ada isu validasi untuk periode ini.", "There are no validation issues for this period.")}</p>}
          <ol className="db-issues">
            {data.issues.slice(0, 6).map((i, k) => (
              <li key={k}>
                <Link href={issueHref(i)}>
                  <span className={`db-sev ${i.severity}`} aria-label={i.severity} />
                  <span className="b"><b>{i.title}</b><span>{i.message}</span></span>
                  <IconArrow size={14} className="faint" />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- kelengkapan ---------- */}
        <section className="panel db-panel db-main" aria-label={t("Kelengkapan dokumen", "Document coverage")}>
          <div className="db-phead">
            <div><span className="db-k">{t("Kelengkapan", "Coverage")} · {reqDone}/{reqRequired.length} {t("wajib", "required")}</span><h2>{t("Dokumen per kategori", "Documents by category")}</h2></div>
            <Link href="/dokumen" className="db-link">{t("Kelola dokumen", "Manage documents")}<IconArrow size={14} /></Link>
          </div>
          <div className="db-reqs">
            {data.requirements.map((r, i) => (
              <Link key={r.code} href="/dokumen" className="db-req">
                <span className="i">{String(i + 1).padStart(2, "0")}</span>
                <b>{r.name}</b>
                <span className={`db-chip ${r.state}`}>{STATE[r.state]}</span>
                <span className="o">{r.excluded ? "—" : r.required ? t("wajib", "required") : t("opsional", "optional")}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* ---------- aktivitas ---------- */}
        <section className="panel db-panel db-side" aria-label={t("Aktivitas terbaru", "Recent activity")}>
          <div className="db-phead"><div><span className="db-k">{t("Jejak audit", "Audit trail")}</span><h2>{t("Aktivitas terbaru", "Recent activity")}</h2></div></div>
          {data.activity.length === 0 && <p className="db-empty">{t("Belum ada aktivitas.", "No activity yet.")}</p>}
          <ol className="db-feed">
            {data.activity.map((a, i) => (
              <li key={i}>
                <span className="dot" aria-hidden="true" />
                <span className="b"><b>{a.summary}</b><span>{a.user}</span></span>
                <time className="db-mono">{when(a.at)}</time>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
