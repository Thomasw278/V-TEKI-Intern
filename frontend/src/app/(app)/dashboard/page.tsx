"use client";

import Link from "next/link";
import { useState } from "react";
import { IconArrow, IconCalc, IconCheck, IconChevronRight, IconInbox, IconRefresh, IconUpload, IconWarn } from "@/components/Icons";
import { Button, CountUp, Empty, ErrorBox, Loading, useLoad, useToast } from "@/components/ui";
import { ExcludedNote } from "@/components/requirements";
import { api } from "@/lib/api";
import { initials, num, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useSummary } from "@/lib/summary";
import type { Dashboard, Issue } from "@/lib/types";

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
  const [tab, setTab] = useState<"src" | "cbam">("src");
  const { data, error, loading, reload } = useLoad(
    () => (period ? api<Dashboard>(`/api/periods/${period.id}/dashboard`) : Promise.resolve(null)),
    [period?.id, epoch],
  );

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
  const doneSteps = steps.filter((s) => s.state === "done").length;
  const outside = (cbam?.outside ?? []).filter((o) => o.value_t >= 0.5).sort((a, b) => b.value_t - a.value_t);
  const products = (calc?.allocations ?? []).slice(0, 2);
  const docsLine = [
    t(`${data.documents_total} dokumen`, `${data.documents_total} documents`),
    isAdmin ? t(`${submitted} menunggu Anda`, `${submitted} awaiting you`) : t(`${toCheck + returned} perlu diperiksa`, `${toCheck + returned} to check`),
    t(`${reqDone} dari ${reqRequired.length} kategori wajib terpenuhi`, `${reqDone} of ${reqRequired.length} required categories covered`),
  ].join(" · ");

  return (
    <>
      <header className="dx-head">
        <div className="dx-titles">
          <h1>{t("Ringkasan", "Overview")}</h1>
          <p>
            <span>{company?.name}</span>
            <span aria-hidden="true">·</span>
            <span>{t(`Periode ${data.period.year}`, `Period ${data.period.year}`)}</span>
            <span aria-hidden="true">·</span>
            <span>{calc ? t(`Kalkulasi v${calc.version}, ${when(calc.created_at)}`, `Calculation v${calc.version}, ${when(calc.created_at)}`) : t("Belum ada kalkulasi", "No calculation yet")}</span>
            {isAdmin && <span className="dx-pill info">{t("Mode peninjau", "Reviewer mode")}</span>}
            {locked ? <span className="dx-pill ok">{t("Dikunci", "Locked")}</span>
              : calc?.has_draft_factors && <Link href="/faktor" className="dx-pill warn">{t("Hasil draf", "Draft result")}</Link>}
          </p>
        </div>
        <div className="dx-actions">
          {isAdmin ? (
            <Link href="/validasi" className="btn primary"><IconInbox size={16} />{t("Tinjau pengajuan", "Review submissions")}</Link>
          ) : (
            <>
              <Link href="/dokumen#unggah" className="btn secondary"><IconUpload size={16} />{t("Unggah dokumen", "Upload documents")}</Link>
              <Link href="/kalkulasi" className="btn primary"><IconCalc size={16} />{t("Kalkulasi", "Calculate")}</Link>
            </>
          )}
        </div>
      </header>

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
        <div className="dx-alert" role="alert">
          <IconWarn size={16} aria-hidden="true" />
          <span className="grow">{t(`Data berubah ${when(calc.stale_since ?? null)}. Angka di bawah berasal dari kalkulasi sebelumnya.`,
            `Data changed ${when(calc.stale_since ?? null)}. The figures below come from the previous calculation.`)}</span>
          {canCalc && <Button size="sm" loading={recalc} onClick={recalculate}><IconRefresh size={14} />{t("Hitung ulang", "Recalculate")}</Button>}
        </div>
      )}

      {/* ---------- metrik utama: empat kartu setara ---------- */}
      <section className="dx-kpis" aria-label={t("Hasil periode", "Period results")}>
        <article className="dx-card dx-kpi">
          <p className="l">{t("Total emisi tertanam", "Total embedded emissions")}</p>
          <p className={`v ${calc?.stale ? "stale" : ""}`}>{calc ? <CountUp value={calc.total_t} /> : "—"}<span className="u">t CO₂e</span></p>
          <div className="f">
            {calc ? (
              <>
                <span className="dx-seg" aria-hidden="true">
                  <i className="direct" style={{ width: `${share(calc.direct_t)}%` }} />
                  <i className="indirect" style={{ width: `${share(calc.indirect_t)}%` }} />
                  <i className="upstream" style={{ width: `${share(calc.upstream_t)}%` }} />
                </span>
                {t(`${num(share(calc.direct_t), 1)}% emisi langsung`, `${num(share(calc.direct_t), 1)}% direct emissions`)}
              </>
            ) : t("Muncul setelah kalkulasi", "Shown after a calculation")}
          </div>
        </article>
        {(products.length ? products : [null, null]).map((a, i) => (
          <article key={a?.code ?? i} className="dx-card dx-kpi">
            <p className="l">{a ? t(`SEE ${a.code}`, `SEE ${a.code}`) : t("SEE produk", "Product SEE")}</p>
            <p className="v">{a ? <CountUp value={a.see_total} digits={3} /> : "—"}<span className="u">{t("t CO₂e/t", "t CO₂e/t")}</span></p>
            <div className="f">{a ? t(`${num(a.tonnes)} t diproduksi · porsi ${num(a.share * 100, 1)}%`, `${num(a.tonnes)} t produced · ${num(a.share * 100, 1)}% share`) : t("Per ton produk", "Per tonne of product")}</div>
          </article>
        ))}
        <article className="dx-card dx-kpi">
          <p className="l">{t("Menurut batas CBAM", "Within the CBAM boundary")}</p>
          <p className="v">{cbam ? num(cbam.embedded_total_t) : "—"}<span className="u">t CO₂e</span></p>
          <div className="f">{cbam ? t(`${num(share(cbam.embedded_total_t), 1)}% dari total · Annex IV`, `${num(share(cbam.embedded_total_t), 1)}% of the total · Annex IV`)
            : calc ? t("Hitung ulang untuk melihat", "Recalculate to see it") : t("Muncul setelah kalkulasi", "Shown after a calculation")}</div>
        </article>
      </section>

      {/* ---------- baris 1: komposisi + progres ---------- */}
      <div className="dx-row">
        <section className="dx-card" aria-label={t("Komposisi emisi", "Emission composition")}>
          <div className="dx-card-h">
            <div>
              <h2>{t("Komposisi emisi", "Emission composition")}</h2>
              <p>{tab === "src" ? t("Kontribusi tiap sumber terhadap total, dalam t CO₂e", "Each source's contribution to the total, in t CO₂e")
                : t("Jejak karbon produk dibandingkan batas CBAM", "Product footprint compared with the CBAM boundary")}</p>
            </div>
            {cbam && (
              <div className="dx-tabs" role="tablist" aria-label={t("Tampilan komposisi", "Composition view")}>
                <button role="tab" aria-selected={tab === "src"} onClick={() => setTab("src")}>{t("Per sumber", "By source")}</button>
                <button role="tab" aria-selected={tab === "cbam"} onClick={() => setTab("cbam")}>{t("Batas CBAM", "CBAM boundary")}</button>
              </div>
            )}
          </div>
          <div className="dx-card-b">
            {!calc ? (
              <Empty title={t("Belum ada kalkulasi", "No calculation yet")}>{t("Komposisi muncul setelah kalkulasi pertama.", "The composition appears after the first calculation.")}</Empty>
            ) : tab === "src" || !cbam ? (
              <ul className="dx-bars" role="tabpanel">
                {lines.map((l) => (
                  <li key={l.key}>
                    <span className="track">
                      <span className={`fill ${l.group}`} style={{ width: `${Math.max(2, (l.value_t / maxLine) * 100)}%` }} />
                      <span className="name"><i className={l.group} aria-hidden="true" />{l.name}{l.source === "default" && <sup title={t("Nilai bawaan literatur", "Literature default")}>†</sup>}</span>
                    </span>
                    <span className="v">{num(l.value_t)}</span>
                    <span className="p">{num(share(l.value_t), 1)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div role="tabpanel">
                <div className="dx-compare">
                  <div>
                    <span>{t("Jejak karbon produk", "Product footprint")}</span>
                    <b>{num(calc.total_t)} <small>t CO₂e</small></b>
                    <span className="dx-line"><i style={{ width: "100%" }} /></span>
                    <em>{t("Kebun sampai pabrik, semua gas rumah kaca", "Plantation to mill, all greenhouse gases")}</em>
                  </div>
                  <div>
                    <span>{t("Batas CBAM", "CBAM boundary")}</span>
                    <b>{num(cbam.embedded_total_t)} <small>t CO₂e</small></b>
                    <span className="dx-line cbam"><i style={{ width: `${Math.max(1, share(cbam.embedded_total_t))}%` }} /></span>
                    <em>{t("Pabrik saja: CO₂ pembakaran, listrik, prekursor", "Mill only: combustion CO₂, electricity, precursors")}</em>
                  </div>
                </div>
                <p className="dx-sub">{t("Di luar batas CBAM", "Outside the CBAM boundary")}</p>
                <ul className="dx-list">
                  {outside.map((o) => (
                    <li key={o.key}><span><b>{o.name}</b><em>{o.reason}</em></span><span className="v">{num(o.value_t)} t</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {calc && (
            <div className="dx-card-f">
              <span className="dx-legend">
                <span><i className="direct" />{t("Langsung", "Direct")}</span>
                <span><i className="indirect" />{t("Listrik", "Electricity")}</span>
                <span><i className="upstream" />{t("Hulu", "Upstream")}</span>
              </span>
              <Link href="/kalkulasi" className="dx-link">{t("Rincian rumus", "Formula details")}<IconArrow size={14} /></Link>
            </div>
          )}
        </section>

        <section className="dx-card" aria-label={t("Progres periode", "Period progress")}>
          <div className="dx-card-h">
            <div>
              <h2>{t("Progres periode", "Period progress")}</h2>
              <p>{t(`${doneSteps} dari ${steps.length} tahap selesai`, `${doneSteps} of ${steps.length} stages done`)}</p>
            </div>
            <span className="dx-pct">{Math.round((doneSteps / steps.length) * 100)}%</span>
          </div>
          <div className="dx-card-b">
            <span className="dx-progress" aria-hidden="true"><i style={{ width: `${(doneSteps / steps.length) * 100}%` }} /></span>
            <ol className="dx-steps">
              {steps.map((s) => (
                <li key={s.name} className={s.state}>
                  <span className="ic" aria-hidden="true">{s.state === "done" ? <IconCheck size={12} /> : null}</span>
                  <span className="n">{s.name}</span>
                  <span className="s">{s.sub}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="dx-card-f dx-next">
            <p><span>{t("Langkah berikutnya", "Next step")}</span>{next.text}</p>
            <Link href={next.href} className="btn primary sm">{next.cta}<IconArrow size={14} /></Link>
          </div>
        </section>
      </div>

      {/* ---------- baris 2: tindakan + aktivitas ---------- */}
      <div className="dx-row">
        <section className="dx-card" aria-label={t("Perlu ditangani", "Needs attention")}>
          <div className="dx-card-h">
            <div>
              <h2>{t("Perlu ditangani", "Needs attention")}</h2>
              <p>{docsLine}</p>
            </div>
            {critical.length > 0 && <span className="dx-pill bad">{t(`${critical.length} kritis`, `${critical.length} critical`)}</span>}
          </div>
          <div className="dx-card-b flush">
            {data.issues.length === 0 ? (
              <p className="dx-empty">{t("Tidak ada isu untuk periode ini.", "There are no issues for this period.")}</p>
            ) : (
              <ul className="dx-issues">
                {data.issues.slice(0, 5).map((i, k) => (
                  <li key={k}>
                    <Link href={issueHref(i)}>
                      <span className={`dot ${i.severity}`} aria-hidden="true" />
                      <span className="t"><b>{i.title}</b><em>{i.message}</em></span>
                      <IconChevronRight size={16} className="faint" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {data.issues.length > 5 && (
            <div className="dx-card-f"><Link href="/validasi" className="dx-link">{t(`Lihat ${data.issues.length - 5} lainnya`, `View ${data.issues.length - 5} more`)}<IconArrow size={14} /></Link></div>
          )}
        </section>

        <section className="dx-card" aria-label={t("Aktivitas terbaru", "Recent activity")}>
          <div className="dx-card-h">
            <div>
              <h2>{t("Aktivitas terbaru", "Recent activity")}</h2>
              <p>{t("Tercatat di jejak audit", "Recorded in the audit trail")}</p>
            </div>
          </div>
          <div className="dx-card-b flush">
            {data.activity.length === 0 ? <p className="dx-empty">{t("Belum ada aktivitas.", "No activity yet.")}</p> : (
              <ul className="dx-acts">
                {data.activity.slice(0, 6).map((a, i) => (
                  <li key={i}>
                    <span className="av" aria-hidden="true">{initials(a.user)}</span>
                    <span className="t"><b>{a.summary}</b><em>{a.user} · {when(a.at)}</em></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
