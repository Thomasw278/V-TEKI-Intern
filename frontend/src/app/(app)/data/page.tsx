"use client";

import Link from "next/link";
import { Fragment, useMemo } from "react";
import { MonthlyBars } from "@/components/charts";
import { Empty, ErrorBox, Loading, PageHead, useLoad } from "@/components/ui";
import { api } from "@/lib/api";
import { nice, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { ActivityData } from "@/lib/types";

const ORDER = ["material", "listrik", "bbm", "pupuk", "lahan", "produksi", "pome", "transport", "b3", "air"];

/** Angka hasil validasi yang masuk ke rumus, lengkap dengan dokumen dan baris asalnya. */
export default function DataPage() {
  const t = useT();
  const { period, isAdmin, epoch } = useSession();
  const CAT: Record<string, string> = {
    material: t("Pasokan material", "Material supply"), listrik: t("Energi & listrik", "Energy & electricity"), bbm: t("BBM energi fosil", "Fossil fuel"),
    pupuk: t("Pupuk aplikasi kebun", "Fertiliser application"), lahan: t("Lahan kebun & panen", "Plantation land & harvest"),
    produksi: t("Pabrik & produksi", "Mill & production"), pome: t("Limbah cair (POME)", "Wastewater (POME)"),
    transport: t("Transportasi & logistik", "Transport & logistics"), b3: t("Limbah padat & B3", "Solid & hazardous waste"), air: t("Air & bukti pendukung", "Water & supporting evidence"),
  };
  const { data, error, loading, reload } = useLoad(
    () => (period ? api<ActivityData>(`/api/periods/${period.id}/activity`) : Promise.resolve(null)), [period?.id, epoch]);

  const months = useMemo(() => {
    const out: (number | null)[] = Array(12).fill(null);
    data?.rows.filter((r) => r.category === "listrik" && r.unit === "kWh" && r.sources.some((s) => /\d{4}-\d{2}/.test(s.note || "")))
      .forEach((r) => r.sources.forEach((s) => {
        const m = /(\d{4})-(\d{2})/.exec(s.note || "");
        if (m && Number(m[1]) === period?.year) {
          const i = Number(m[2]) - 1;
          out[i] = (out[i] ?? 0) + s.value;
        }
      }));
    return out;
  }, [data, period?.year]);

  if (!period) return null;
  if (loading && !data) return <Loading rows={2} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data) return null;

  const s = data.summary;
  const grouped = ORDER.map((c) => ({ c, rows: data.rows.filter((r) => r.category === c) })).filter((g) => g.rows.length || data.defaults_used[g.c]);
  const filled = months.filter((m) => m !== null).length;

  const groupSources = (src: ActivityData["rows"][number]["sources"]) => {
    const m = new Map<number, { doc_id: number; doc_name: string; rows: number; value: number }>();
    src.forEach((x) => {
      const g = m.get(x.doc_id) ?? { doc_id: x.doc_id, doc_name: x.doc_name, rows: 0, value: 0 };
      g.rows += 1;
      g.value += x.value;
      m.set(x.doc_id, g);
    });
    return [...m.values()];
  };

  return (
    <>
      <PageHead title={t("Data aktivitas", "Activity data")}
        description={t("Angka dari dokumen yang sudah diajukan dan disetujui, dijumlahkan per kategori dalam satuan baku. Inilah yang dikalikan dengan faktor emisi.",
          "Figures from submitted and approved documents, summed per category in standard units. These are multiplied by the emission factors.")} />

      <div className="kpis">
        <div className="kpi"><div className="k">{t("TBS diolah", "FFB processed")}</div><div className="v">{num(s.ffb_processed_t)}<small>t</small></div><div className="d">{s.products.map((p) => `${p.code} ${num(p.tonnes)} t`).join(" · ") || "—"}</div></div>
        <div className="kpi"><div className="k">{t("Listrik dibeli", "Electricity purchased")}</div><div className="v">{num(s.electricity_mwh, 1)}<small>MWh</small></div><div className="d">{t(`${filled} dari 12 bulan`, `${filled} of 12 months`)}</div></div>
        <div className="kpi"><div className="k">{t("BBM", "Fuel")}</div><div className="v">{num(s.fuel_l)}<small>L</small></div><div className="d">{t("semua jenis", "all fuel types")}</div></div>
        <div className="kpi"><div className="k">{t("Nitrogen diaplikasikan", "Nitrogen applied")}</div><div className="v">{num(s.n_applied_t, 1)}<small>t N</small></div><div className="d">{t("pupuk kimia & organik", "chemical & organic")}</div></div>
      </div>

      {Object.entries(data.defaults_used).map(([k, why]) => (
        <div key={k} className="banner warn">
          <span className="grow"><b>{CAT[k] ?? k}</b> · {why}</span>
          {!isAdmin && <Link href="/dokumen#unggah" className="btn warn sm">{t("Unggah dokumen", "Upload document")}</Link>}
        </div>
      ))}

      <div className="split">
        <section className="panel" aria-label={t("Listrik per bulan", "Electricity per month")}>
          <div className="panel-head"><div><h2>{t("Listrik dibeli per bulan", "Electricity purchased per month")}</h2><div className="sub">{t(`${filled} dari 12 bulan ada tagihannya`, `${filled} of 12 months have a bill`)}</div></div></div>
          {filled ? <MonthlyBars values={months} unit="kWh" label={t("Pemakaian listrik per bulan", "Electricity use per month")} /> : <Empty title={t("Belum ada tagihan listrik tervalidasi", "No validated electricity bills yet")} />}
          {filled > 0 && filled < 12 && <p className="tiny muted" style={{ marginTop: 6 }}>{t("Kotak putus-putus adalah bulan yang belum punya tagihan.", "Dashed boxes are months without a bill.")}</p>}
        </section>
        <section className="panel" aria-label={t("Penjelasan", "Explanation")}>
          <div className="panel-head"><h2>{t("Dari dokumen ke angka baku", "From documents to standard units")}</h2></div>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8, color: "var(--ink-2)" }}>
            <li>{t("Satuan diseragamkan: kg menjadi ton, kWh menjadi MWh, liter tetap liter.", "Units are standardised: kg to tonnes, kWh to MWh, litres stay litres.")}</li>
            <li>{t("Pupuk dihitung sebagai nitrogen: massa × kadar N.", "Fertiliser counts as nitrogen: mass × N content.")}</li>
            <li>{t("Biosolar dipisah bagian fosil dan biogeniknya (B40 = 60% fosil).", "Biodiesel is split into fossil and biogenic parts (B40 = 60% fossil).")}</li>
            <li>{t("Tagihan PLN dengan blok LWBP dan WBP dihitung sebagai satu tagihan per bulan.", "PLN bills with LWBP and WBP blocks count as one bill per month.")}</li>
            <li>{t("Dokumen yang belum diajukan tidak ikut dijumlah.", "Documents not yet submitted are not counted.")}</li>
          </ul>
        </section>
      </div>

      <section className="panel flush" aria-label={t("Tabel data aktivitas", "Activity data table")}>
        {grouped.length === 0 ? <Empty title={t("Belum ada data aktivitas", "No activity data yet")}>{t("Ajukan dokumen agar angkanya muncul di sini.", "Submit documents so their figures show up here.")}</Empty> : (
          <div className="table-wrap">
            <table className="table cards">
              <thead><tr><th>Data</th><th className="num">{t("Jumlah", "Amount")}</th><th>{t("Satuan", "Unit")}</th><th>{t("Berasal dari", "Source documents")}</th></tr></thead>
              <tbody>
                {grouped.map((g) => (
                  <Fragment key={g.c}>
                    <tr className="group"><td colSpan={4}>{CAT[g.c] ?? g.c}</td></tr>
                    {data.defaults_used[g.c] && !g.rows.length && (
                      <tr><td colSpan={4} className="small" style={{ color: "var(--warn-ink)" }}>{t("Memakai nilai bawaan literatur sampai dokumen asli diunggah.", "Using literature defaults until a real document is uploaded.")}</td></tr>
                    )}
                    {g.rows.map((r) => (
                      <tr key={r.metric + r.unit}>
                        <td className="primary strong wrap">{r.metric}</td>
                        <td data-label={t("Jumlah", "Amount")} className="num strong">{nice(r.value)}</td>
                        <td data-label={t("Satuan", "Unit")} className="muted small">{r.unit}</td>
                        <td data-label={t("Berasal dari", "Source")}>
                          <div className="inline" style={{ gap: 6 }}>
                            {groupSources(r.sources).map((x) => (
                              <Link key={x.doc_id} href={`/dokumen/${x.doc_id}`} className="badge info wrap" style={{ height: "auto", minHeight: 24, padding: "3px 9px", whiteSpace: "normal" }} title={`${nice(x.value)} ${r.unit}`}>
                                {x.doc_name}{x.rows > 1 ? ` · ${x.rows} ${t("baris", "rows")}` : ""}
                              </Link>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
