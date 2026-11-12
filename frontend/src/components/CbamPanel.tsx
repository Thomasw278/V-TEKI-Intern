"use client";

import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { CbamResult } from "@/lib/types";

/**
 * Emisi tertanam menurut batas CBAM (Reg. (EU) 2023/956 Annex IV; Methodology Act Annex III; Guidance Document 3).
 * Ditampilkan berdampingan dengan jejak karbon produk agar terlihat apa yang masuk dan tidak masuk cakupan CBAM.
 */
export function CbamPanel({ cbam, footprint }: { cbam: CbamResult; footprint: number }) {
  const t = useT();
  const KIND = { direct: t("Langsung", "Direct"), indirect: t("Tidak langsung", "Indirect"), precursor: t("Prekursor", "Precursor") };
  return (
    <section className="panel cb-panel" aria-label={t("Batas CBAM", "CBAM boundary")}>
      <div className="db-phead">
        <div>
          <span className="db-k">Reg. (EU) 2023/956 · Annex IV</span>
          <h2>{t("Emisi tertanam menurut batas CBAM", "Embedded emissions within the CBAM boundary")}</h2>
          <p className="cb-sub">{t("Hanya instalasi (pabrik), hanya CO₂, GWP AR5, produk bersama dibagi menurut massa. Dilaporkan berdampingan dengan jejak karbon produk di atas.",
            "Installation only, CO₂ only, AR5 GWP, co-products split by mass. Reported alongside the product footprint above.")}</p>
        </div>
        <div className="cb-total"><b>{num(cbam.embedded_total_t)}</b><span>t CO₂e · {num(footprint > 0 ? (cbam.embedded_total_t / footprint) * 100 : 0, 1)}% {t("dari jejak karbon", "of the footprint")}</span></div>
      </div>

      <div className="cb-formula">
        <code>SEE<sub>g,dir</sub> = (AttrEm<sub>dir</sub> + Σ M<sub>i</sub> · SEE<sub>i,dir</sub>) / AL<sub>g</sub></code>
        <code>SEE<sub>g,indir</sub> = (AttrEm<sub>indir</sub> + Σ M<sub>i</sub> · SEE<sub>i,indir</sub>) / AL<sub>g</sub></code>
        <code>AttrEm<sub>indir</sub> = E<sub>el</sub> · EF<sub>el</sub></code>
      </div>

      <div className="cb-cols">
        <div>
          <h3>{t("Masuk batas CBAM", "Inside the boundary")}</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("Komponen", "Component")}</th><th>{t("Perhitungan", "Calculation")}</th><th className="num">t CO₂e</th></tr></thead>
              <tbody>
                {cbam.lines.map((l) => (
                  <tr key={l.key}>
                    <td><b className="small">{l.name}</b><div className="tiny muted">{KIND[l.kind]} · {l.formula}</div></td>
                    <td className="tiny mono muted wrap">{l.calc}</td>
                    <td className="num mono">{num(l.value_t, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3>{t("Di luar batas CBAM", "Outside the boundary")}</h3>
          <ul className="cb-out">
            {cbam.outside.filter((o) => o.value_t >= 0.05).map((o) => (
              <li key={o.key}><span><b>{o.name}</b><em>{o.reason}</em></span><span className="mono">{num(o.value_t, 1)} t</span></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 18 }}>
        <table className="table cards">
          <thead><tr><th>{t("Produk", "Product")}</th><th className="num">AL (t)</th><th className="num">{t("Porsi massa", "Mass share")}</th><th className="num">SEE dir</th><th className="num">SEE indir</th><th className="num">SEE total</th></tr></thead>
          <tbody>
            {cbam.allocations.map((a) => (
              <tr key={a.code}>
                <td className="primary"><b>{a.code}</b> <span className="muted small">{a.name}</span></td>
                <td data-label="AL (t)" className="num">{num(a.tonnes)}</td>
                <td data-label={t("Porsi massa", "Mass share")} className="num">{num(a.share * 100, 1)}%</td>
                <td data-label="SEE dir" className="num mono">{num(a.see_dir, 5)}</td>
                <td data-label="SEE indir" className="num mono">{num(a.see_indir, 5)}</td>
                <td data-label="SEE total" className="num mono"><b>{num(a.see_total, 5)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="cb-notes">
        <li>{t("Produk sawit (CPO/PKO) tidak tercantum di Annex I CBAM. Angka ini adalah pembanding bila metodologi CBAM dipakai sebagai acuan.",
          "Palm products (CPO/PKO) are not listed in CBAM Annex I. These figures are a comparison when the CBAM methodology is used as a reference.")}</li>
        {cbam.biomass_not_zero_rated_t > 0 && <li>{t(`Fraksi biodiesel (${num(cbam.biomass_not_zero_rated_t, 1)} t CO₂) dihitung seperti fosil karena belum ada bukti kriteria keberlanjutan RED II.`,
          `The biodiesel fraction (${num(cbam.biomass_not_zero_rated_t, 1)} t CO₂) is counted as fossil because RED II sustainability evidence is not provided.`)}</li>}
        <li>{t("Emisi tidak langsung hanya dikenai CBAM untuk semen, pupuk, dan bijih besi aglomerasi; tetap dilaporkan di sini.",
          "Indirect emissions only carry a CBAM obligation for cement, fertilisers and agglomerated iron ore; they are still reported here.")}</li>
      </ul>
    </section>
  );
}
