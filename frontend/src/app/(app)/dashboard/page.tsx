"use client";

import Link from "next/link";
import { ContributionBars, EmissionFlow, GroupLegend } from "@/components/charts";
import { Contours } from "@/components/Contours";
import { IconArrow, IconCalc, IconInbox, IconUpload } from "@/components/Icons";
import { Badge, CountUp, Empty, ErrorBox, Loading, PageHead, useLoad } from "@/components/ui";
import { api } from "@/lib/api";
import { initials, num, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Dashboard, Issue, ReqState } from "@/lib/types";

function issueHref(i: Issue): string {
  if (i.ref_type === "document" && i.ref_id) return `/dokumen/${i.ref_id}`;
  if (i.ref_type === "factor") return "/faktor";
  if (["PENDING_REVIEW", "DOC_REJECTED", "WAITING_APPROVAL"].includes(i.code)) return "/validasi";
  return "/dokumen";
}

export default function DashboardPage() {
  const t = useT();
  const { user, period, company, isAdmin, epoch } = useSession();
  const { data, error, loading, reload } = useLoad(
    () => (period ? api<Dashboard>(`/api/periods/${period.id}/dashboard`) : Promise.resolve(null)),
    [period?.id, epoch],
  );

  const STATE: Record<ReqState, string> = {
    complete: t("Lengkap", "Complete"), partial: t("Sebagian", "Partial"), in_review: t("Dalam proses", "In progress"),
    default: t("Nilai bawaan", "Default value"), missing: t("Belum ada", "Missing"),
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

  return (
    <>
      <PageHead
        eyebrow={isAdmin ? <><Badge tone="info">{t("Mode peninjau", "Reviewer mode")}</Badge>{company?.name}</> : undefined}
        title={t(`Ringkasan periode ${data.period.year}`, `Period ${data.period.year} overview`)}
        description={isAdmin
          ? t("Anda melihat data perusahaan ini sebagai admin peninjau.", "You are viewing this company's data as its reviewer.")
          : <>{t("Selamat datang", "Welcome")}, {user?.name.split(" ")[0]}. {calc ? t(`Hasil dari kalkulasi versi ${calc.version}, ${when(calc.created_at)}.`, `Results from calculation version ${calc.version}, ${when(calc.created_at)}.`) : t("Belum ada kalkulasi untuk periode ini.", "No calculation for this period yet.")}</>}>
        {isAdmin ? (
          <Link href="/validasi" className="btn primary"><IconInbox size={16} />{t("Tinjau pengajuan", "Review submissions")}</Link>
        ) : (
          <>
            <Link href="/dokumen#unggah" className="btn secondary"><IconUpload size={16} />{t("Unggah dokumen", "Upload documents")}</Link>
            <Link href="/kalkulasi" className="btn primary"><IconCalc size={16} />{t("Kalkulasi", "Calculate")}</Link>
          </>
        )}
      </PageHead>

      <section className="overview page-enter" aria-label={t("Hasil periode", "Period results")}>
        <Contours className="contours" rings={7} />
        <div>
          <div className="ov-label">{t("Total emisi tertanam", "Total embedded emissions")} · {company?.name}</div>
          {calc ? (
            <>
              <div className="ov-big"><CountUp value={calc.total_t} /></div>
              <div className="ov-unit">{t(`t CO₂e selama ${data.period.year}`, `t CO₂e during ${data.period.year}`)}</div>
              <div className="split-bar" aria-hidden="true">
                <span style={{ width: `${share(calc.direct_t)}%`, background: "#43b47c" }} />
                <span style={{ width: `${share(calc.indirect_t)}%`, background: "#d1bb3b" }} />
                <span style={{ width: `${share(calc.upstream_t)}%`, background: "#64a2e6" }} />
              </div>
              <div className="split-legend">
                <span><i style={{ background: "#43b47c" }} />{t("Langsung", "Direct")} {num(share(calc.direct_t), 1)}%</span>
                <span><i style={{ background: "#d1bb3b" }} />{t("Listrik dibeli", "Purchased electricity")} {num(share(calc.indirect_t), 1)}%</span>
                <span><i style={{ background: "#64a2e6" }} />{t("Hulu", "Upstream")} {num(share(calc.upstream_t), 1)}%</span>
              </div>
            </>
          ) : (
            <>
              <div className="ov-big" style={{ color: "var(--band-muted)" }}>—</div>
              <div className="ov-unit">{t("Ajukan dokumen lalu jalankan kalkulasi untuk melihat total.", "Submit documents, then run a calculation to see the total.")}</div>
            </>
          )}
        </div>
        <div>
          <div className="ov-label" style={{ marginBottom: 10 }}>{t("Emisi tertanam spesifik (SEE) per produk", "Specific embedded emissions (SEE) per product")}</div>
          {calc?.allocations.length ? calc.allocations.map((a) => (
            <div key={a.code} className="prod-row">
              <span className="code">{a.code}<span>{a.name}</span></span>
              <span className="see"><CountUp value={a.see_total} digits={3} /></span>
              <span className="meta">{t(`${num(a.tonnes)} t diproduksi · porsi ${num(a.share * 100, 1)}% · t CO₂e per ton`, `${num(a.tonnes)} t produced · share ${num(a.share * 100, 1)}% · t CO₂e per tonne`)}</span>
            </div>
          )) : <div className="ov-unit">{t("Muncul setelah kalkulasi.", "Shown after a calculation.")}</div>}
        </div>
        {calc?.has_draft_factors && (
          <div className="ov-note"><span>{t("Hasil masih draf: ada faktor emisi yang belum disetujui admin.", "Draft result: some emission factors are not yet approved by the reviewer.")}</span><Link href="/faktor">{t("Lihat faktor", "View factors")}</Link></div>
        )}
      </section>

      <div className="kpis">
        <div className="kpi"><div className="k">{t("Dokumen", "Documents")}</div><div className="v">{data.documents_total}</div><div className="d">{t(`${reading} sedang dibaca`, `${reading} being read`)}</div></div>
        <div className="kpi"><div className="k">{isAdmin ? t("Menunggu persetujuan", "Awaiting approval") : t("Perlu diperiksa", "To check")}</div><div className="v">{isAdmin ? submitted : toCheck + returned}</div><div className="d">{isAdmin ? t("dari perusahaan ini", "from this company") : returned ? t(`${returned} dikembalikan admin`, `${returned} returned by reviewer`) : t("sebelum diajukan", "before submitting")}</div></div>
        <div className="kpi"><div className="k">{t("Kategori wajib", "Required categories")}</div><div className="v">{reqDone}<small>/ {reqRequired.length}</small></div><div className="d">{t("punya dokumen tervalidasi", "have validated documents")}</div></div>
        <div className="kpi"><div className="k">{t("Isu kritis", "Critical issues")}</div><div className="v" style={{ color: critical.length ? "var(--bad)" : undefined }}>{critical.length}</div><div className="d">{critical.length ? t("perlu ditangani", "need attention") : t("tidak ada", "none")}</div></div>
      </div>

      <section className="panel" aria-label={t("Tahapan periode", "Period stages")}>
        <div className="panel-head">
          <div><h2>{t(`Tahapan periode ${data.period.year}`, `Period ${data.period.year} stages`)}</h2><div className="sub">{locked ? t("Data dikunci", "Data locked") : t("Data masih bisa diubah", "Data can still change")}</div></div>
        </div>
        <ol className="journey">
          {steps.map((s, i) => (
            <li key={s.name} className={`jstep ${s.state}`}>
              <div className="track"><span className="dot">{s.state === "done" ? "✓" : i + 1}</span><span className="line" /></div>
              <b>{s.name}</b>
              <span className="s">{s.sub}</span>
            </li>
          ))}
        </ol>
        <div className="next-step">
          <span>{next.text}</span>
          <Link href={next.href} className="btn primary sm">{next.cta}<IconArrow size={15} /></Link>
        </div>
      </section>

      <div className="split">
        <section className="panel" aria-label={t("Asal emisi", "Emission sources")}>
          <div className="panel-head">
            <div><h2>{t("Dari sumber ke produk", "From source to product")}</h2><div className="sub">{t("Lebar pita sebanding dengan t CO₂e", "Ribbon width is proportional to t CO₂e")}</div></div>
            <Link href="/kalkulasi" className="small strong">{t("Rincian rumus", "Formula details")}</Link>
          </div>
          {calc ? (
            <>
              <div className="only-wide"><EmissionFlow lines={calc.lines} allocations={calc.allocations} height={340} compact /></div>
              <div className="only-narrow"><ContributionBars lines={calc.lines} total={calc.total_t} /></div>
              <div style={{ marginTop: 10 }}><GroupLegend /></div>
            </>
          ) : <Empty title={t("Belum ada kalkulasi", "No calculation yet")}>{t("Diagram aliran muncul setelah kalkulasi pertama.", "The flow diagram appears after the first calculation.")}</Empty>}
        </section>

        <section className="panel" aria-label={t("Perlu ditangani", "Needs attention")}>
          <div className="panel-head">
            <h2>{t("Perlu ditangani", "Needs attention")}</h2>
            {critical.length ? <Badge tone="bad" pip>{t(`${critical.length} kritis`, `${critical.length} critical`)}</Badge> : <Badge tone="ok" pip>{t("Tidak ada yang kritis", "Nothing critical")}</Badge>}
          </div>
          {data.issues.length === 0 && <Empty title={t("Semua aturan lolos", "All checks pass")}>{t("Tidak ada isu validasi untuk periode ini.", "There are no validation issues for this period.")}</Empty>}
          <div className="list">
            {data.issues.slice(0, 6).map((i, k) => (
              <Link key={k} href={issueHref(i)} className="list-row">
                <span className={`sev ${i.severity}`} />
                <span className="body"><b>{i.title}</b><span className="clamp-2">{i.message}</span></span>
                <IconArrow size={15} className="faint" />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="split">
        <section className="panel" aria-label={t("Kelengkapan dokumen", "Document coverage")}>
          <div className="panel-head">
            <div><h2>{t("Kelengkapan dokumen", "Document coverage")}</h2><div className="sub">{t(`${reqDone} dari ${reqRequired.length} kategori wajib terpenuhi`, `${reqDone} of ${reqRequired.length} required categories covered`)}</div></div>
            <Link href="/dokumen" className="small strong">{t("Kelola dokumen", "Manage documents")}</Link>
          </div>
          <div className="grid-2" style={{ gap: "0 24px" }}>
            {data.requirements.map((r) => (
              <Link key={r.code} href="/dokumen" className="list-row" style={{ borderTop: "1px solid var(--line-2)" }}>
                <span className={`state-icon ${r.state}`}>{r.state === "complete" ? "✓" : r.state === "default" ? "!" : ""}</span>
                <span className="body"><b style={{ fontSize: 14 }}>{r.name}</b><span>{STATE[r.state]}{!r.required ? ` · ${t("opsional", "optional")}` : ""}</span></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="panel" aria-label={t("Aktivitas terbaru", "Recent activity")}>
          <div className="panel-head"><h2>{t("Aktivitas terbaru", "Recent activity")}</h2></div>
          {data.activity.length === 0 && <Empty title={t("Belum ada aktivitas", "No activity yet")} />}
          <div className="list">
            {data.activity.map((a, i) => (
              <div key={i} className="list-row">
                <span className="avatar round" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(a.user)}</span>
                <span className="body"><b style={{ fontSize: 13.5 }}>{a.user}</b><span>{a.summary}</span></span>
                <span className="tiny faint" style={{ whiteSpace: "nowrap" }}>{when(a.at)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
