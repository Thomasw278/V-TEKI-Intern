"use client";

import { useMemo, useState } from "react";
import { monthNames, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Allocation, CalcLine } from "@/lib/types";

/** Tiga kelompok emisi. Warna dari token CSS supaya sama baiknya di tema terang dan gelap. */
export const GROUP_COLOR = { direct: "var(--c-direct)", indirect: "var(--c-indirect)", upstream: "var(--c-upstream)" } as const;
type G = keyof typeof GROUP_COLOR;
const ORDER: G[] = ["direct", "indirect", "upstream"];

export function useGroupLabel() {
  const t = useT();
  return (g: G) => (g === "direct" ? t("Emisi langsung", "Direct emissions")
    : g === "indirect" ? t("Listrik dibeli", "Purchased electricity") : t("Hulu (material & angkutan)", "Upstream (materials & transport)"));
}

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div role="tooltip" className="chart-tip" style={{ left: tip.x, top: tip.y }}>
      <b>{tip.title}</b>
      {tip.lines.map((l) => <div key={l}>{l}</div>)}
    </div>
  );
}

const showAt = (e: React.MouseEvent, set: (t: Tip) => void, title: string, lines: string[]) => {
  const box = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
  set({ x: e.clientX - box.left, y: e.clientY - box.top, title, lines });
};

/**
 * Aliran emisi: sumber (komponen) → kelompok (langsung / listrik / hulu) → produk.
 * Lebar pita sebanding dengan t CO₂e. Nilai bawaan literatur diberi arsiran dan tanda *.
 */
export function EmissionFlow({ lines, allocations, height = 380, compact = false }: {
  lines: CalcLine[]; allocations: Allocation[]; height?: number; compact?: boolean;
}) {
  const t = useT();
  const groupLabel = useGroupLabel();
  const [tip, setTip] = useState<Tip>(null);
  const [hover, setHover] = useState<string | null>(null);
  const W = compact ? 720 : 960;
  const H = height;
  const pad = 30;
  const gap = compact ? 8 : 10;
  const nodeW = 12;
  const [XL, XM, XR] = compact ? [262, 452, 606] : [300, 560, 800];

  const model = useMemo(() => {
    const src = lines.filter((l) => l.value_t > 0.5)
      .sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || b.value_t - a.value_t);
    const total = src.reduce((s, l) => s + l.value_t, 0) || 1;
    const groups = ORDER.map((g) => ({ g, value: src.filter((l) => l.group === g).reduce((s, l) => s + l.value_t, 0) }))
      .filter((x) => x.value > 0);
    const scale = (v: number, n: number) => (v / total) * (H - pad * 2 - gap * Math.max(n - 1, 0));
    let y = pad;
    const left = src.map((l) => { const h = Math.max(scale(l.value_t, src.length), 2); const node = { ...l, y, h }; y += h + gap; return node; });
    y = pad + 4;
    const midGap = 36;
    const midScale = (v: number) => (v / total) * (H - pad - 8 - midGap * Math.max(groups.length - 1, 0));
    const mid = groups.map((g) => { const h = Math.max(midScale(g.value), 3); const node = { ...g, y, h }; y += h + midGap; return node; });
    y = pad + 18;
    const right = allocations.map((p) => {
      const v = p.share * total;
      const h = Math.max(scale(v, allocations.length + 4), 3);
      const node = { ...p, value: v, y, h };
      y += h + gap * 4;
      return node;
    });
    const midCursor: Record<string, number> = Object.fromEntries(mid.map((m) => [m.g, m.y]));
    const links1 = left.map((l) => {
      const m = mid.find((x) => x.g === l.group)!;
      const h = (l.value_t / m.value) * m.h;
      const link = { id: l.key, g: l.group as G, x0: XL, y0: l.y, h0: l.h, x1: XM, y1: midCursor[l.group], h1: h, value: l.value_t, name: l.name };
      midCursor[l.group] += h;
      return link;
    });
    const prodCursor: Record<string, number> = Object.fromEntries(right.map((r) => [r.code, r.y]));
    const links2: typeof links1 = [];
    for (const m of mid) {
      let my = m.y;
      for (const r of right) {
        const h0 = m.h * r.share;
        const h1 = r.h * (m.value / total);
        links2.push({ id: `${m.g}-${r.code}`, g: m.g, x0: XM + nodeW, y0: my, h0, x1: XR, y1: prodCursor[r.code], h1, value: m.value * r.share, name: `${m.g}→${r.code}` });
        my += h0;
        prodCursor[r.code] += h1;
      }
    }
    let last = -Infinity;
    const labelY = left.map((n) => { const yy = Math.max(n.y + n.h / 2 + 4, last + 15); last = yy; return yy; });
    return { left, mid, right, links1, links2, total, labelY };
  }, [lines, allocations, H, XL, XM, XR, gap]);

  const ribbon = (x0: number, y0: number, h0: number, x1: number, y1: number, h1: number) => {
    const cx = (x0 + x1) / 2;
    return `M${x0},${y0} C${cx},${y0} ${cx},${y1} ${x1},${y1} L${x1},${y1 + h1} C${cx},${y1 + h1} ${cx},${y0 + h0} ${x0},${y0 + h0} Z`;
  };
  const share = (v: number) => t(`${num((v / model.total) * 100, 1)}% dari total`, `${num((v / model.total) * 100, 1)}% of total`);
  const linkName = (id: string, fallback: string) => {
    const [g, code] = id.split("-");
    return code ? `${groupLabel(g as G)} → ${code}` : fallback;
  };

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t("Aliran emisi dari sumber ke kelompok dan produk", "Emission flow from sources to groups and products")}
        onMouseLeave={() => { setTip(null); setHover(null); }}>
        <defs>
          <pattern id="flow-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeWidth="2" strokeOpacity=".55" />
          </pattern>
        </defs>
        {[...model.links1, ...model.links2].map((l, i) => {
          const dim = hover && hover !== l.g && hover !== l.id;
          return (
            <path key={l.id} d={ribbon(l.x0, l.y0, l.h0, l.x1, l.y1, l.h1)}
              style={{ fill: GROUP_COLOR[l.g], fillOpacity: dim ? 0.08 : 0.26, transition: "fill-opacity .2s", animation: `fade .8s ${0.15 + i * 0.03}s both` }}
              onMouseMove={(e) => { setHover(l.id); showAt(e, setTip, linkName(l.id, l.name), [`${num(l.value)} t CO₂e`, share(l.value)]); }} />
          );
        })}
        {model.left.map((n, i) => (
          <g key={n.key} onMouseEnter={() => setHover(n.key)}
            onMouseMove={(e) => showAt(e, setTip, n.name, [`${num(n.value_t)} t CO₂e`, share(n.value_t),
              n.source === "default" ? t("memakai nilai bawaan", "uses default values") : t("dari dokumen", "from documents")])}>
            <rect x={XL - nodeW} y={n.y} width={nodeW} height={n.h} rx="3" style={{ fill: GROUP_COLOR[n.group as G] }} />
            {n.source === "default" && <rect x={XL - nodeW} y={n.y} width={nodeW} height={n.h} rx="3" fill="url(#flow-hatch)" />}
            {(!compact || n.h > 9) && (
              <text x={XL - nodeW - 10} y={model.labelY[i]} textAnchor="end" fontSize="12.5" style={{ fill: "var(--chart-label)" }}>
                {n.name}{n.source === "default" ? " *" : ""}
                <tspan dx="6" style={{ fill: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{num(n.value_t)}</tspan>
              </text>
            )}
          </g>
        ))}
        {model.mid.map((m) => (
          <g key={m.g} onMouseEnter={() => setHover(m.g)} onMouseMove={(e) => showAt(e, setTip, groupLabel(m.g), [`${num(m.value)} t CO₂e`, share(m.value)])}>
            <rect x={XM} y={m.y} width={nodeW} height={m.h} rx="3" style={{ fill: GROUP_COLOR[m.g] }} />
            <text x={XM + nodeW / 2} y={m.y - 9} textAnchor="middle" fontSize="12" fontWeight="700" style={{ fill: "var(--chart-ink)" }}>{groupLabel(m.g)}</text>
          </g>
        ))}
        {model.right.map((r) => (
          <g key={r.code} onMouseMove={(e) => showAt(e, setTip, `${r.code} · ${r.name}`,
            [t(`${num(r.value)} t CO₂e dialokasikan`, `${num(r.value)} t CO₂e allocated`), `SEE ${num(r.see_total, 3)} t CO₂e/t`])}>
            <rect x={XR} y={r.y} width={nodeW} height={r.h} rx="3" style={{ fill: "var(--c-total)" }} />
            <text x={XR + nodeW + 10} y={r.y + r.h / 2 - 4} fontSize="14" fontWeight="800" style={{ fill: "var(--chart-ink)" }}>{r.code}</text>
            <text x={XR + nodeW + 10} y={r.y + r.h / 2 + 13} fontSize="12" style={{ fill: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>SEE {num(r.see_total, 3)}</text>
          </g>
        ))}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Batang horizontal kontribusi per sumber (dipakai di layar sempit dan sebagai alternatif aliran). */
export function ContributionBars({ lines, total }: { lines: CalcLine[]; total: number }) {
  const t = useT();
  const rows = lines.filter((l) => l.value_t > 0).sort((a, b) => b.value_t - a.value_t);
  const max = rows[0]?.value_t || 1;
  return (
    <div className="bars" role="list" aria-label={t("Kontribusi tiap sumber", "Contribution by source")}>
      {rows.map((l, i) => (
        <div key={l.key} className="bar-row" role="listitem" title={`${l.name}: ${num(l.value_t)} t CO₂e`}>
          <span className="n">{l.name}{l.source === "default" ? " *" : ""}</span>
          <span className="bar-track">
            <span className={`bar-fill ${l.source === "default" ? "hatch" : ""}`}
              style={{ width: `${Math.max(1, (l.value_t / max) * 100)}%`, animationDelay: `${0.1 + i * 0.05}s`, backgroundColor: GROUP_COLOR[l.group as G] }} />
          </span>
          <span className="num" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
            {num(l.value_t)} <span className="muted tiny">{num((l.value_t / (total || 1)) * 100, 0)}%</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function GroupLegend({ withDefault = true }: { withDefault?: boolean }) {
  const t = useT();
  const label = useGroupLabel();
  return (
    <div className="chart-legend">
      {ORDER.map((g) => <span key={g}><i style={{ background: GROUP_COLOR[g] }} />{label(g)}</span>)}
      {withDefault && <span><i className="hatch" style={{ backgroundColor: "var(--c-default)" }} />{t("* Nilai bawaan literatur", "* Literature default")}</span>}
    </div>
  );
}

/** Waterfall: setiap komponen menambah total, ditutup batang total. */
export function Waterfall({ lines, total }: { lines: CalcLine[]; total: number }) {
  const t = useT();
  const [tip, setTip] = useState<Tip>(null);
  const rows = lines.filter((l) => l.value_t > 0.5)
    .sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || b.value_t - a.value_t);
  const W = 900, H = 290, top = 22, base = H - 58, left = 8;
  const n = rows.length + 1;
  const slot = (W - left * 2) / n;
  const bw = Math.min(54, slot * 0.62);
  const y = (v: number) => base - (v / (total || 1)) * (base - top);
  let acc = 0;
  const short = (s: string) => s.split(/[\s—(]/)[0];
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t("Kontribusi tiap komponen terhadap total emisi", "Contribution of each component to total emissions")} onMouseLeave={() => setTip(null)}>
        <defs>
          <pattern id="wf-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeWidth="2" strokeOpacity=".55" />
          </pattern>
        </defs>
        <line x1={0} x2={W} y1={base} y2={base} style={{ stroke: "var(--chart-grid)" }} />
        {rows.map((l, i) => {
          const y0 = y(acc), y1 = y(acc + l.value_t);
          acc += l.value_t;
          const cum = acc;
          const x = left + i * slot + (slot - bw) / 2;
          return (
            <g key={l.key} onMouseMove={(e) => showAt(e, setTip, l.name, [`+${num(l.value_t)} t CO₂e`, t(`kumulatif ${num(cum)}`, `cumulative ${num(cum)}`)])}>
              {i > 0 && <line x1={x - (slot - bw)} x2={x} y1={y0} y2={y0} strokeDasharray="3 3" style={{ stroke: "var(--faint)" }} />}
              <rect x={x} y={y1} width={bw} height={Math.max(y0 - y1, 2)} rx="4"
                className="chart-bar-anim"
                style={{ fill: GROUP_COLOR[l.group as G], transformBox: "fill-box", transformOrigin: "bottom center", animation: `chart-grow-y 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${0.07 * i}s both` }} />
              {l.source === "default" && <rect x={x} y={y1} width={bw} height={Math.max(y0 - y1, 2)} rx="4" fill="url(#wf-hatch)" />}
              <text x={x + bw / 2} y={base + 18} textAnchor="middle" fontSize="11" style={{ fill: "var(--muted)" }}>{short(l.name)}</text>
              {y0 - y1 > 16 && <text x={x + bw / 2} y={y1 - 6} textAnchor="middle" fontSize="11" style={{ fill: "var(--chart-label)", fontVariantNumeric: "tabular-nums" }}>{num(l.value_t)}</text>}
            </g>
          );
        })}
        {(() => {
          const x = left + rows.length * slot + (slot - bw) / 2;
          return (
            <g>
              <rect x={x} y={y(total)} width={bw} height={base - y(total)} rx="4"
                className="chart-bar-anim"
                style={{ fill: "var(--c-total)", transformBox: "fill-box", transformOrigin: "bottom center", animation: `chart-grow-y 0.55s cubic-bezier(0.22, 1, 0.36, 1) ${0.07 * rows.length}s both` }} />
              <text x={x + bw / 2} y={base + 18} textAnchor="middle" fontSize="11" fontWeight="700" style={{ fill: "var(--chart-ink)" }}>Total</text>
              <text x={x + bw / 2} y={y(total) - 6} textAnchor="middle" fontSize="12" fontWeight="800" style={{ fill: "var(--chart-ink)", fontVariantNumeric: "tabular-nums" }}>{num(total)}</text>
            </g>
          );
        })()}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Batang bulanan satu seri (mis. kWh per bulan). Bulan kosong ditandai kotak putus-putus. */
export function MonthlyBars({ values, unit, label }: { values: (number | null)[]; unit: string; label: string }) {
  const t = useT();
  const [tip, setTip] = useState<Tip>(null);
  const names = monthNames();
  const max = Math.max(...values.map((v) => v ?? 0), 1);
  const W = 640, H = 200, base = 168, top = 14;
  const slot = W / 12, bw = slot * 0.56;
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} onMouseLeave={() => setTip(null)}>
        <line x1={0} x2={W} y1={base} y2={base} style={{ stroke: "var(--chart-grid)" }} />
        {values.map((v, i) => {
          const x = i * slot + (slot - bw) / 2;
          const h = v ? (v / max) * (base - top) : 0;
          return (
            <g key={i} onMouseMove={(e) => showAt(e, setTip, names[i], [v ? `${num(v)} ${unit}` : t("belum ada data", "no data yet")])}>
              <rect x={i * slot} y={top} width={slot} height={base - top} fill="transparent" />
              {v ? (
                <rect x={x} y={base - h} width={bw} height={h} rx="4"
                  className="chart-bar-anim"
                  style={{ fill: "var(--c-direct)", transformBox: "fill-box", transformOrigin: "bottom center", animation: `chart-grow-y 0.45s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.04}s both` }} />
              ) : (
                <rect x={x} y={top + 40} width={bw} height={base - top - 40} rx="4" fill="none" strokeDasharray="4 4" style={{ stroke: "var(--faint)" }} />
              )}
              <text x={x + bw / 2} y={base + 18} textAnchor="middle" fontSize="11" style={{ fill: "var(--muted)" }}>{names[i]}</text>
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}
