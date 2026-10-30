"use client";

import Link from "next/link";
import { useState } from "react";
import { ContributionBars, EmissionFlow, GroupLegend, Waterfall } from "@/components/charts";
import { Contours } from "@/components/Contours";
import { IconArrow, IconChevron } from "@/components/Icons";
import { Badge, Button, CountUp, Empty, ErrorBox, Loading, PageHead, useLoad, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { num, pct, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useSummary } from "@/lib/summary";
import type { Calculation } from "@/lib/types";

export default function KalkulasiPage() {
  const t = useT();
  const { period, company, reloadCompany, epoch } = useSession();
  const { refreshSummary } = useSummary();
  const toast = useToast();
  const [gwp, setGwp] = useState<"AR5" | "AR6">(company?.gwp_set ?? "AR5");
  const [alloc, setAlloc] = useState<"economic" | "mass">(company?.allocation_method ?? "economic");
  const [view, setView] = useState<"flow" | "waterfall">("flow");
  const [open, setOpen] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const { data: calc, error, loading, reload, setData } = useLoad(async () => {
    if (!period) return null;
    try {
      return await api<Calculation>(`/api/periods/${period.id}/calculation`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }, [period?.id, epoch]);

  const canRun = period?.status !== "locked";

  const run = async (g = gwp, a = alloc) => {
    if (!period) return;
    setRunning(true);
    setRunError(null);
    try {
      const c = await api<Calculation>(`/api/periods/${period.id}/calculate`, { body: { gwp_set: g, allocation_method: a } });
      setData(c);
      toast(t(`Kalkulasi versi ${c.version} selesai`, `Calculation version ${c.version} finished`));
      reloadCompany();
      refreshSummary();
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  if (!period) return null;
  if (loading && !calc && !error) return <Loading rows={2} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;

  const total = calc?.total_t ?? 0;
  const share = (v: number) => (total ? (v / total) * 100 : 0);

  return (
    <>
      <PageHead title={t("Kalkulasi emisi", "Emission calculation")}
        description={calc
          ? t(`Versi ${calc.version}, dihitung ${when(calc.created_at)} dengan GWP ${calc.gwp_set} dan alokasi ${calc.allocation_method === "economic" ? "nilai jual" : "massa"}.`,
            `Version ${calc.version}, calculated ${when(calc.created_at)} with GWP ${calc.gwp_set} and ${calc.allocation_method === "economic" ? "economic" : "mass"} allocation.`)
          : t("Dokumen yang sudah diajukan dan disetujui ikut dihitung.", "Submitted and approved documents are included.")}>
        <div className="stack tight">
          <span className="tiny strong muted">GWP</span>
          <div className="segmented" role="group" aria-label={t("Set GWP", "GWP set")}>
            {(["AR5", "AR6"] as const).map((g) => (
              <button key={g} aria-pressed={gwp === g} disabled={!canRun} onClick={() => { setGwp(g); if (calc && canRun) run(g, alloc); }}>{g}</button>
            ))}
          </div>
        </div>
        <div className="stack tight">
          <span className="tiny strong muted">{t("Alokasi ke produk", "Allocation")}</span>
          <div className="segmented" role="group" aria-label={t("Metode alokasi", "Allocation method")}>
            {([["economic", t("Nilai jual", "Economic")], ["mass", t("Massa", "Mass")]] as const).map(([k, l]) => (
              <button key={k} aria-pressed={alloc === k} disabled={!canRun} onClick={() => { setAlloc(k); if (calc && canRun) run(gwp, k); }}>{l}</button>
            ))}
          </div>
        </div>
        {canRun && <Button variant="primary" onClick={() => run()} loading={running} style={{ alignSelf: "flex-end" }}>{calc ? t("Hitung ulang", "Recalculate") : t("Jalankan kalkulasi", "Run calculation")}</Button>}
      </PageHead>

      {runError && <div className="banner bad anim-shake" role="alert"><span className="grow">{runError}</span></div>}
      {calc?.has_draft_factors && (
        <div className="banner warn">
          <span className="grow"><b>{t("Hasil masih draf.", "Draft result.")}</b> {t("Ada faktor emisi yang belum disetujui admin peninjau, jadi laporan final belum bisa diterbitkan.", "Some emission factors are not approved by the reviewer yet, so the final report cannot be issued.")}</span>
          <Link href="/faktor" className="btn warn sm">{t("Lihat faktor", "View factors")}</Link>
        </div>
      )}

      {!calc ? (
        <section className="panel">
          <Empty title={t("Belum ada kalkulasi untuk periode ini", "No calculation for this period yet")}>
            {t("Ajukan dokumen lalu tekan Jalankan kalkulasi. Kategori limbah cair yang belum punya dokumen memakai nilai bawaan literatur dan ditandai.",
              "Submit documents, then press Run calculation. Wastewater without documents uses literature defaults and is flagged.")}
          </Empty>
        </section>
      ) : (
        <>
          <section className="overview box-3d-contrast" data-ui="true" aria-label={t("Hasil per produk", "Results per product")}>
            <Contours className="contours" rings={7} />
            <div>
              <div className="ov-label">{t(`Total emisi periode ${period.year}`, `Total emissions, period ${period.year}`)}</div>
              <div className="ov-big"><CountUp value={calc.total_t} /></div>
              <div className="ov-unit">{t(`t CO₂e · CO₂ biogenik ${num(calc.biogenic_co2_t)} t dilaporkan terpisah`, `t CO₂e · biogenic CO₂ ${num(calc.biogenic_co2_t)} t reported separately`)}</div>
              <div className="split-bar" aria-hidden="true">
                <span style={{ width: `${share(calc.direct_t)}%`, background: "#43b47c" }} />
                <span style={{ width: `${share(calc.indirect_t)}%`, background: "#d1bb3b" }} />
                <span style={{ width: `${share(calc.upstream_t)}%`, background: "#64a2e6" }} />
              </div>
              <div className="split-legend">
                <span><i style={{ background: "#43b47c" }} />{t("Langsung", "Direct")} {num(calc.direct_t)} t</span>
                <span><i style={{ background: "#d1bb3b" }} />{t("Listrik", "Electricity")} {num(calc.indirect_t)} t</span>
                <span><i style={{ background: "#64a2e6" }} />{t("Hulu", "Upstream")} {num(calc.upstream_t)} t</span>
              </div>
            </div>
            <div>
              <div className="ov-label" style={{ marginBottom: 10 }}>{t("SEE per produk, t CO₂e per ton", "SEE per product, t CO₂e per tonne")}</div>
              {calc.allocations.map((a) => (
                <div key={a.code} className="prod-row">
                  <span className="code">{a.code}<span>{a.name}</span></span>
                  <span className="see"><CountUp value={a.see_total} digits={3} /></span>
                  <span className="meta">{t(`langsung ${num(a.see_direct, 3)} · tidak langsung ${num(a.see_indirect, 3)} · porsi ${pct(a.share)}`, `direct ${num(a.see_direct, 3)} · indirect ${num(a.see_indirect, 3)} · share ${pct(a.share)}`)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel" aria-label={t("Visual emisi", "Emission visual")}>
            <div className="panel-head">
              <h2>{view === "flow" ? t("Aliran emisi dari sumber ke produk", "Emission flow from source to product") : t("Sumbangan tiap komponen ke total", "Each component's contribution to the total")}</h2>
              <div className="segmented only-wide" role="group" aria-label={t("Jenis grafik", "Chart type")}>
                <button aria-pressed={view === "flow"} onClick={() => setView("flow")}>{t("Aliran", "Flow")}</button>
                <button aria-pressed={view === "waterfall"} onClick={() => setView("waterfall")}>{t("Akumulasi", "Cumulative")}</button>
              </div>
            </div>
            <div key={view} className="anim-rise">
              <div className="only-wide">{view === "flow" ? <EmissionFlow lines={calc.lines} allocations={calc.allocations} height={400} /> : <Waterfall lines={calc.lines} total={calc.total_t} />}</div>
              <div className="only-narrow"><ContributionBars lines={calc.lines} total={calc.total_t} /></div>
            </div>
            <div style={{ marginTop: 12 }}><GroupLegend /></div>
          </section>

          <section className="panel flush" data-ui="true" aria-label={t("Rincian komponen", "Component breakdown")}>
            <div className="panel-head">
              <div><h2>{t("Rincian per komponen", "Breakdown by component")}</h2><div className="sub">{t("Buka baris untuk melihat rumus dengan angka sebenarnya", "Open a row to see the formula with the actual numbers")}</div></div>
            </div>
            <div style={{ padding: "4px 8px 10px" }}>
              <div className="comp-row head" aria-hidden="true">
                <span>{t("Komponen", "Component")}</span><span className="hide-t">{t("Data aktivitas", "Activity data")}</span><span className="hide-t">{t("Faktor", "Factor")}</span>
                <span style={{ textAlign: "right" }}>t CO₂e</span><span className="hide-t">{t("Sumber", "Source")}</span><span />
              </div>
              {calc.lines.map((l) => {
                const on = open === l.key;
                return (
                  <div key={l.key} style={{ borderTop: "1px solid var(--line-2)" }}>
                    <button type="button" className="comp-row" aria-expanded={on} onClick={() => setOpen(on ? null : l.key)}>
                      <span style={{ minWidth: 0 }}><b className="small wrap" style={{ display: "block" }}>{l.name}</b><span className="tiny muted">{l.scope}</span></span>
                      <span className="tiny hide-t num wrap">{l.activity}</span>
                      <span className="tiny hide-t muted wrap">{l.factor}</span>
                      <span className="small strong num" style={{ textAlign: "right" }}>{num(l.value_t)}<span className="tiny muted" style={{ fontWeight: 400, display: "block" }}>{num(share(l.value_t), 1)}%</span></span>
                      <span className="hide-t"><Badge tone={l.source === "default" ? "warn" : "ok"} pip>{l.source === "default" ? t("Nilai bawaan", "Default") : t("Dokumen", "Documents")}</Badge></span>
                      <IconChevron size={16} style={{ transform: on ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                    </button>
                    {on && (
                      <div className="formula">
                        <small>{t("Rumus", "Formula")}</small>
                        <span>{l.formula}</span>
                        <span className="c">{l.calc} = {num(l.value_t, 1)} t CO₂e</span>
                        {calc.defaults_used?.[l.key] && <small style={{ color: "#f2d38a" }}>{calc.defaults_used[l.key]}</small>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel" aria-label={t("Alokasi produk", "Product allocation")}>
            <div className="panel-head"><div><h2>{t("Alokasi ke produk", "Allocation to products")}</h2><div className="sub">{calc.allocation_method === "economic" ? t("Menurut nilai jual (tonase × harga)", "By economic value (tonnes × price)") : t("Menurut massa produk", "By product mass")}</div></div></div>
            <div className="table-wrap">
              <table className="table cards">
                <thead><tr><th>{t("Produk", "Product")}</th><th className="num">{t("Tonase (t)", "Tonnes")}</th><th className="num">{t("Harga (Rp/kg)", "Price (Rp/kg)")}</th><th className="num">{t("Porsi", "Share")}</th><th className="num">SEE {t("langsung", "direct")}</th><th className="num">SEE {t("tidak langsung", "indirect")}</th><th className="num">SEE total</th></tr></thead>
                <tbody>
                  {calc.allocations.map((a) => (
                    <tr key={a.code}>
                      <td className="primary"><b>{a.code}</b> <span className="muted small">{a.name}</span></td>
                      <td data-label={t("Tonase (t)", "Tonnes")} className="num">{num(a.tonnes)}</td>
                      <td data-label={t("Harga (Rp/kg)", "Price (Rp/kg)")} className="num">{num(a.price)}</td>
                      <td data-label={t("Porsi", "Share")} className="num">{pct(a.share)}</td>
                      <td data-label={`SEE ${t("langsung", "direct")}`} className="num">{num(a.see_direct, 3)}</td>
                      <td data-label={`SEE ${t("tidak langsung", "indirect")}`} className="num">{num(a.see_indirect, 3)}</td>
                      <td data-label="SEE total" className="num"><b>{num(a.see_total, 3)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny muted" style={{ marginTop: 10 }}>{t("SEE = (E langsung + E hulu) × porsi ÷ tonase + E listrik × porsi ÷ tonase, dalam t CO₂e per ton produk.", "SEE = (E direct + E upstream) × share ÷ tonnes + E electricity × share ÷ tonnes, in t CO₂e per tonne of product.")}</p>
          </section>

          <div className="inline" style={{ justifyContent: "flex-end" }}>
            <Link href="/laporan" className="btn primary">{t("Lanjut ke laporan", "Continue to report")}<IconArrow size={16} /></Link>
          </div>
        </>
      )}
    </>
  );
}
