"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconArrow, IconCheck, IconShield } from "@/components/Icons";
import { num } from "@/lib/format";
import { SAMPLE_ALLOCATIONS, sampleLines } from "@/lib/sample";
import type { CalcLine } from "@/lib/types";

type T = (id: string, en: string) => string;

/* ------------------------------------------------------------------ latar */

/** Bidang titik yang bergeser pelan, dipudarkan ke tepi, dengan beberapa orbit tipis. */
export function DotField({ orbits = true }: { orbits?: boolean }) {
  // orbit berputar lewat SMIL (pusat putar pasti di titik asal lokal); dimatikan bila pengguna minta gerak dikurangi
  const [still, setStill] = useState(true);
  useEffect(() => setStill(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches), []);
  return (
    <div className="w3-field" aria-hidden="true">
      <div className="w3-dots" />
      {orbits && (
        <svg className="w3-orbits" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
          {[
            { cx: 210, cy: 180, r: 120, d: 26, s: 0.42 },
            { cx: 1000, cy: 160, r: 150, d: 34, s: 0.36 },
            { cx: 600, cy: 110, r: 270, d: 48, s: 0.2 },
          ].map((o, i) => (
            <g key={i} transform={`translate(${o.cx} ${o.cy}) scale(1 ${o.s})`}>
              <circle r={o.r} className="w3-orbit-line" />
              <g transform={`rotate(${i * 120})`}>
                {!still && <animateTransform attributeName="transform" type="rotate" from={i * 120} to={i * 120 + 360} dur={`${o.d}s`} repeatCount="indefinite" />}
                <circle cx={o.r} r={3.5} className="w3-orbit-dot" />
              </g>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ judul bagian */

/** Label ber-indeks + judul dua nada (bagian kedua diredupkan) + paragraf singkat. */
export function SecHead({ idx, label, strong, dim, text, align = "center" }: {
  idx: string; label: string; strong: string; dim: string; text?: ReactNode; align?: "center" | "left";
}) {
  return (
    <div className={`w3-head ${align}`}>
      <span className="w3-label sec-title"><i>{idx}</i>{label}</span>
      <h2 className="sec-title">{strong} <span className="dim">{dim}</span></h2>
      {text && <p className="sec-text">{text}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ ticker */

export function Ticker({ t }: { t: T }) {
  const items = [
    "CBAM (EU) 2023/956", t("Regulasi pelaksana (EU) 2023/1773", "Implementing Reg. (EU) 2023/1773"), "IPCC 2006 · 2019 Refinement",
    "GWP AR5 · AR6", "GHG Protocol Scope 1 · 2 · 3", t("10 kategori dokumen", "10 document categories"),
    t("SEE t CO₂e per ton produk", "SEE t CO₂e per tonne of product"), t("Sidik data SHA-256", "SHA-256 data fingerprint"),
  ];
  const row = (hidden: boolean) => (
    <ul className="w3-ticker-row" aria-hidden={hidden || undefined}>
      {items.map((x) => <li key={x}>{x}</li>)}
    </ul>
  );
  return (
    <section className="w3-ticker" aria-label={t("Rujukan metodologi", "Methodology references")}>
      <div className="w3-ticker-track">{row(false)}{row(true)}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ jendela produk */

const total = (lines: CalcLine[]) => lines.reduce((s, l) => s + l.value_t, 0);

/** Cuplikan aplikasi (data contoh): daftar dokumen, metrik, kontribusi sumber, aktivitas peninjau. */
export function ProductWindow({ t, lang }: { t: T; lang: "id" | "en" }) {
  const lines = sampleLines(lang).filter((l) => l.value_t > 0).sort((a, b) => b.value_t - a.value_t);
  const sum = total(lines);
  const cpo = SAMPLE_ALLOCATIONS[0];
  const docs: [string, string, "ok" | "info" | "bad" | "warn", string, number][] = [
    [t("Tagihan PLN · Jan–Des", "PLN bills · Jan–Dec"), t("Energi", "Energy"), "ok", t("Disetujui", "Approved"), 98],
    [t("Faktur solar B40 · Agu", "B40 diesel invoice · Aug"), "BBM", "ok", t("Disetujui", "Approved"), 96],
    [t("Rekap pupuk kebun", "Fertiliser summary"), t("Pupuk", "Fertiliser"), "ok", t("Disetujui", "Approved"), 94],
    [t("Laporan POME triwulan", "Quarterly POME report"), "POME", "info", t("Diajukan", "Submitted"), 91],
    [t("Rekap produksi CPO/PKO", "CPO/PKO production"), t("Pabrik", "Mill"), "ok", t("Disetujui", "Approved"), 99],
    [t("Manifest limbah B3", "Hazardous waste manifest"), t("Limbah", "Waste"), "bad", t("Dikembalikan", "Returned"), 72],
    [t("Surat jalan TBS", "FFB delivery notes"), t("Transpor", "Transport"), "ok", t("Disetujui", "Approved"), 93],
    [t("Kontrak pasokan", "Supply contract"), "Material", "warn", t("Perlu dicek", "To check"), 81],
  ];
  const feed: [string, string, string?][] = [
    [t("Rina K. menyetujui faktur solar B40", "Rina K. approved the B40 diesel invoice"), t("2 mnt", "2 min")],
    [t("Sistem membaca laporan POME · 6 angka", "System read the POME report · 6 figures"), t("9 mnt", "9 min")],
    [t("Rina K. mengembalikan manifest limbah", "Rina K. returned the waste manifest"), t("24 mnt", "24 min"), t("Massa baris 3 tidak terbaca", "Row 3 mass is unreadable")],
    [t("Budi S. mengajukan 3 dokumen", "Budi S. submitted 3 documents"), t("1 jam", "1 h")],
    [t("Kalkulasi v3 · AR5 · alokasi ekonomi", "Calculation v3 · AR5 · economic allocation"), t("1 jam", "1 h")],
  ];
  const bars = [38, 44, 41, 52, 47, 58, 55, 61, 57, 66, 63, 70];
  return (
    <figure className="w3-window" aria-label={t("Contoh tampilan aplikasi KarbonLens", "Example KarbonLens app view")}>
      <div className="w3-titlebar">
        <span className="w3-lights" aria-hidden="true"><i /><i /><i /></span>
        <span className="w3-wtitle"><b>pks-sei-rokan</b> · {t("periode", "period")} 2025 · v3</span>
        <span className="w3-wbtn">{t("Contoh data", "Sample data")}</span>
      </div>
      <div className="w3-wbody">
        <aside className="w3-docs">
          <div className="w3-colhead">{t("Dokumen", "Documents")} <span className="w3-count">26</span></div>
          <ul>
            {docs.map(([name, cat, tone, status, conf], i) => (
              <li key={name} className={i === 1 ? "on" : undefined} style={{ animationDelay: `${0.25 + i * 0.06}s` }}>
                <span className="w3-cat">{cat}</span>
                <span className="w3-dname">{name}</span>
                <span className={`w3-chip ${tone}`}>{status}</span>
                <span className="w3-conf">{conf}%</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="w3-main">
          <div className="w3-metrics">
            <div className="w3-metric">
              <span className="k">{t("Total emisi", "Total emissions")}</span>
              <b>{num(sum, 1)}</b>
              <span className="u">t CO₂e · 2025</span>
              <span className="w3-spark" aria-hidden="true">{bars.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</span>
            </div>
            <div className="w3-metric">
              <span className="k">SEE CPO</span>
              <b>{num(cpo.see_total, 3)}</b>
              <span className="u">t CO₂e / t</span>
              <svg className="w3-ring" viewBox="0 0 36 36" aria-hidden="true">
                <circle cx="18" cy="18" r="14" />
                <circle cx="18" cy="18" r="14" className="v" strokeDasharray={`${cpo.share * 88} 88`} />
              </svg>
            </div>
            <div className="w3-metric">
              <span className="k">{t("Tervalidasi", "Validated")}</span>
              <b>24<small>/26</small></b>
              <span className="u">{t("2 menunggu peninjau", "2 awaiting review")}</span>
              <span className="w3-prog" aria-hidden="true"><i style={{ width: `${(24 / 26) * 100}%` }} /></span>
            </div>
          </div>
          <div className="w3-contrib">
            <div className="w3-colhead">{t("Kontribusi per sumber", "Contribution by source")}<span className="w3-mono">{t("t CO₂e", "t CO₂e")}</span></div>
            {lines.slice(0, 7).map((l, i) => (
              <div key={l.key} className="w3-crow" style={{ animationDelay: `${0.35 + i * 0.07}s` }}>
                <span className="n">{l.name}</span>
                <span className="bar"><i className={l.group} style={{ width: `${(l.value_t / lines[0].value_t) * 100}%` }} /></span>
                <span className="v">{num(l.value_t, 0)}</span>
                <span className="p">{num((l.value_t / sum) * 100, 1)}%</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="w3-feed">
          <div className="w3-colhead">{t("Aktivitas", "Activity")} <span className="w3-count">{t("hari ini", "today")}</span></div>
          <ul>
            {feed.map(([what, when, note], i) => (
              <li key={what} style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
                <span className="dot" aria-hidden="true" />
                <span className="w"><b>{what}</b>{note && <em>{note}</em>}</span>
                <span className="t">{when}</span>
              </li>
            ))}
          </ul>
          <div className="w3-log">{t("jejak", "trail")} › 26 {t("dokumen", "documents")} › {num(sum, 1)} t <span>✓</span></div>
        </aside>
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ cara kerja */

export function Pipeline({ t }: { t: T }) {
  const steps: [string, string, string][] = [
    [t("Unggah dokumen", "Upload documents"), t("PDF, scan, foto, Excel, CSV, atau Word. Kategori dikenali dari isi dan nama berkas.", "PDF, scans, photos, Excel, CSV or Word. The category is detected from content and file name."), t("Perusahaan", "Company")],
    [t("Dibaca otomatis", "Read automatically"), t("Watermark dibuang, scan diluruskan, angka dicari di kanan, bawah, atas label, maupun di tabel.", "Watermarks removed, scans straightened, figures found right of, below or above labels, or in tables."), t("Sistem", "System")],
    [t("Diperiksa & disetujui", "Checked & approved"), t("Perusahaan memastikan angka lalu mengajukan. Admin peninjau menyetujui atau mengembalikan dengan catatan.", "The company confirms the figures and submits. The reviewer approves or returns them with a note."), t("Perusahaan → admin", "Company → reviewer")],
    [t("Dihitung & dikunci", "Calculated & locked"), t("Emisi dibagi ke setiap ton produk. Periode dikunci, pernyataan terbit dengan kode verifikasi.", "Emissions are allocated to each tonne of product. The period is locked and a statement is issued with a verification code."), t("Admin peninjau", "Reviewer")],
  ];
  return (
    <ol className="w3-rail sec-ui">
      <span className="w3-track" aria-hidden="true"><i /></span>
      {steps.map(([title, text, who], i) => (
        <li key={title}>
          <span className="w3-node" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
          <span className="w3-step">{t("Tahap", "Step")} {String(i + 1).padStart(2, "0")}</span>
          <b>{title}</b>
          <p>{text}</p>
          <span className="w3-who">{who}</span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ jejak audit */

export function AuditPanels({ t }: { t: T }) {
  const cpo = SAMPLE_ALLOCATIONS[0];
  const cols: { k: string; v: string; h: number; kind: "base" | "cut" | "ok" | "out"; off?: number }[] = [
    { k: t("Diunggah", "Uploaded"), v: "26", h: 100, kind: "base" },
    { k: t("Dikembalikan", "Returned"), v: "−2", h: 8, kind: "cut", off: 92 },
    { k: t("Disetujui", "Approved"), v: "24", h: 92, kind: "ok" },
    { k: t("Pernyataan", "Statement"), v: "1", h: 7, kind: "out" },
  ];
  return (
    <>
      <div className="w3-panels sec-ui">
        <article className="w3-panel">
          <h3>{t("Setiap angka diperiksa dua kali", "Every figure is checked twice")}</h3>
          <p>{t("Perusahaan mengajukan, admin peninjau menyetujui atau mengembalikan. Hanya data yang disetujui masuk kalkulasi.",
            "The company submits; the reviewer approves or returns. Only approved data enters the calculation.")}</p>
          <div className="w3-chart" role="img" aria-label={t("26 dokumen diunggah, 2 dikembalikan, 24 disetujui, 1 pernyataan terbit", "26 documents uploaded, 2 returned, 24 approved, 1 statement issued")}>
            {cols.map((c) => (
              <div key={c.k} className="w3-col">
                <div className="w3-colarea">
                  <span className={`w3-bar ${c.kind}`} style={{ height: `${c.h}%`, bottom: c.off ? `${c.off - c.h}%` : 0 }}>
                    <em>{c.v}</em>
                  </span>
                </div>
                <span className="w3-colk">{c.k}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="w3-panel">
          <h3>{t("Hasilnya bisa dicek siapa pun", "Anyone can check the result")}</h3>
          <p>{t("Setelah periode dikunci, pernyataan terbit dengan kode verifikasi. Importir mencocokkannya tanpa perlu akun.",
            "Once the period is locked, a statement is issued with a verification code. Importers check it without an account.")}</p>
          <div className="w3-bignum">
            <div><b>{num(cpo.see_total, 3)}</b><span>t CO₂e / t<br />CPO · 2025</span></div>
            <a href="/verifikasi" className="w3-code"><IconShield size={15} /><span className="mono">3342-E704-2CAB-E6C9</span><IconArrow size={14} /></a>
            <small>{t("Kode contoh", "Sample code")}</small>
          </div>
        </article>
      </div>
      <ul className="w3-facts sec-ui">
        {[
          [t("Jejak ke halaman sumber", "Trail to the source page"), t("Klik angka mana pun untuk melihat kotak asalnya di dokumen. Koreksi tercatat beserta alasan dan pelakunya.", "Click any figure to see its source box in the document. Corrections are logged with the reason and who made them.")],
          [t("Data tiap perusahaan terpisah", "Each company's data is isolated"), t("Setiap permintaan diperiksa terhadap pemilik data. Admin hanya melihat perusahaan yang ditugaskan.", "Every request is checked against the data owner. Reviewers only see their assigned companies.")],
          [t("Dikunci, lalu revisi bernomor", "Locked, then numbered revisions"), t("Periode terkunci tidak bisa diubah. Koreksi menjadi revisi baru dan pernyataan lama ditandai digantikan.", "A locked period cannot change. Corrections become a new revision and the old statement is marked superseded.")],
        ].map(([b, p], i) => (
          <li key={b}><span className="i">0{i + 1}</span><b><IconCheck size={15} />{b}</b><p>{p}</p></li>
        ))}
      </ul>
    </>
  );
}
