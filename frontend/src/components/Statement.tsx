"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LogoMark } from "@/components/Icons";
import { longDate, num, sig } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import type { StatementData } from "@/lib/types";
import "@/app/statement.css";

/**
 * Pernyataan Hasil Perhitungan Emisi Tertanam: dokumen A4 siap cetak.
 *
 * Isi disusun sebagai blok-blok (kop, identitas, hasil, tabel, …). Setelah huruf dimuat, tinggi setiap
 * blok diukur lalu blok dibagi ke lembar A4 secara berurutan. Setiap lembar mendapat bingkai, watermark
 * segel KarbonLens, kop berjalan, dan nomor halaman "X dari N". Cetak = lembar yang sama persis.
 */

type T = (id: string, en: string) => string;
/** keep: blok tidak boleh sendirian di lembar baru; bila tak muat, blok sebelumnya ikut pindah. */
type Block = { key: string; node: ReactNode; keep?: boolean };

// geometri lembar (mm): 297 tinggi − 16 atas − 12 bawah − kaki 10 = 259; lembar lanjutan dikurangi kop berjalan 13
const FIRST_MM = 256;
const REST_MM = 243;

export function StatementDocument({ data, origin, onLayout }: {
  data: StatementData;
  /** Alamat situs untuk tautan cek keaslian (mis. https://karbonlens.id). */
  origin: string;
  /** Dipanggil setelah lembar selesai dibagi (jumlah lembar). */
  onLayout?: (pages: number) => void;
}) {
  const { t, lang } = useLang();
  const blocks = useMemo(() => buildBlocks(data, origin, t), [data, origin, t]);
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][] | null>(null);
  const layoutCb = useRef(onLayout);
  layoutCb.current = onLayout;

  useLayoutEffect(() => {
    let alive = true;
    const run = () => {
      const root = measureRef.current;
      if (!root || !alive) return;
      const mm = (root.querySelector<HTMLElement>("[data-mm]")?.getBoundingClientRect().height ?? 378) / 100;
      const heights = Array.from(root.querySelectorAll<HTMLElement>(":scope > [data-block]")).map((el) => el.getBoundingClientRect().height);
      const out: number[][] = [[]];
      let used = 0;
      let cap = FIRST_MM * mm;
      heights.forEach((h, i) => {
        const cur = out[out.length - 1];
        if (cur.length && used + h > cap) {
          cap = REST_MM * mm;
          if (blocks[i].keep && cur.length > 1 && cur[cur.length - 1] === i - 1 && heights[i - 1] + h <= cap) {
            cur.pop();
            out.push([i - 1, i]);
            used = heights[i - 1] + h;
          } else {
            out.push([i]);
            used = h;
          }
        } else {
          cur.push(i);
          used += h;
        }
      });
      setPages(out);
    };
    run();
    // ukur ulang setelah huruf (Instrument Sans, Gloock) selesai dimuat
    document.fonts?.ready.then(run).catch(() => undefined);
    return () => { alive = false; };
  }, [blocks]);

  useEffect(() => {
    if (pages) layoutCb.current?.(pages.length);
  }, [pages]);

  const final = data.status === "final";
  const total = pages?.length ?? 1;
  return (
    <div className="sd-root" lang={lang}>
      {/* pengukur tak terlihat: lebar sama dengan area isi lembar */}
      <div ref={measureRef} className="sd-measure sd-type" aria-hidden="true">
        <div data-mm style={{ height: "100mm", position: "absolute", width: 1 }} />
        {blocks.map((b) => <div key={b.key} data-block className="sd-block">{b.node}</div>)}
      </div>

      <div className="sd-pages" style={{ visibility: pages ? "visible" : "hidden" }}>
        {(pages ?? [blocks.map((_, i) => i)]).map((idx, p) => (
          <section key={p} className="sd-page" aria-label={t(`Halaman ${p + 1} dari ${total}`, `Page ${p + 1} of ${total}`)}>
            <Watermark id={`sd-ring-${p}`} year={data.period.year} t={t} />
            {!final && <div className="sd-draftmark" aria-hidden="true">{t("DRAF", "DRAFT")}</div>}
            <div className="sd-frame" aria-hidden="true"><i /><i /><i /><i /></div>
            {p > 0 && (
              <header className="sd-run">
                <span className="sd-run-brand"><LogoMark size={15} /><b>KarbonLens</b><span>{t("Pernyataan emisi tertanam", "Embedded emissions statement")}</span></span>
                <span>{data.company.name} · {data.number}</span>
              </header>
            )}
            <div className="sd-body sd-type">
              {idx.map((i) => <div key={blocks[i].key} className="sd-block">{blocks[i].node}</div>)}
            </div>
            <footer className="sd-foot">
              <span>KarbonLens · {data.number}</span>
              <span className="sd-foot-mid">{final && data.code ? `${t("Kode verifikasi", "Verification code")} ${data.code}` : t("Draf · bukan untuk pelaporan resmi", "Draft · not for official reporting")}</span>
              <span>{t(`Halaman ${p + 1} dari ${total}`, `Page ${p + 1} of ${total}`)}</span>
            </footer>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hiasan lembar */

/** Watermark: segel melingkar dengan teks KarbonLens dan tanda merek di tengah. */
function Watermark({ id, year, t }: { id: string; year: number; t: T }) {
  const ring = `KARBONLENS ✦ ${t("PERNYATAAN EMISI TERTANAM", "EMBEDDED EMISSIONS STATEMENT")} ✦ ${t("PERIODE", "PERIOD")} ${year} ✦ `;
  return (
    <svg className="sd-wm" viewBox="0 0 400 400" aria-hidden="true">
      <defs><path id={id} d="M200,200 m-158,0 a158,158 0 1,1 316,0 a158,158 0 1,1 -316,0" /></defs>
      <circle cx="200" cy="200" r="192" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="200" cy="200" r="184" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="200" cy="200" r="134" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="200" cy="200" r="128" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" />
      <text fill="currentColor" fontSize="17" fontWeight="700" letterSpacing="3" style={{ fontFamily: "var(--font)" }}>
        <textPath href={`#${id}`} textLength="985" lengthAdjust="spacing">{ring}</textPath>
      </text>
      <g transform="translate(120 112) scale(5)" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <g strokeWidth="1.6">
          <path d="M 4 10.5 V 5.5 A 1.5 1.5 0 0 1 5.5 4 H 10.5" /><path d="M 21.5 4 H 26.5 A 1.5 1.5 0 0 1 28 5.5 V 10.5" />
          <path d="M 4 21.5 V 26.5 A 1.5 1.5 0 0 0 5.5 28 H 10.5" /><path d="M 21.5 28 H 26.5 A 1.5 1.5 0 0 0 28 26.5 V 21.5" />
        </g>
        <path d="M 8 11.5 C 12 9.5 18 13.5 24 10.5" strokeWidth="1.1" /><path d="M 8 16 C 13 13.5 17 18.5 24 15.5" strokeWidth="1.4" />
        <path d="M 8 20.5 C 13.5 18 18.5 23 24 21" strokeWidth="1.1" />
      </g>
      <text x="200" y="300" textAnchor="middle" fill="currentColor" fontSize="30" style={{ fontFamily: "var(--display)" }}>KarbonLens</text>
    </svg>
  );
}

/** Cap pengesahan elektronik di kotak tanda tangan admin peninjau (hanya pernyataan final). */
function Seal({ year, date, t }: { year: number; date: string; t: T }) {
  const ring = `${t("DISAHKAN ELEKTRONIK", "ELECTRONICALLY ENDORSED")} ✦ KARBONLENS ✦ `;
  return (
    <svg className="sd-seal" viewBox="0 0 200 200" aria-hidden="true">
      <defs><path id="sd-seal-ring" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0" /></defs>
      <circle cx="100" cy="100" r="94" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="100" cy="100" r="58" fill="none" stroke="currentColor" strokeWidth="1" />
      <text fill="currentColor" fontSize="13.5" fontWeight="700" letterSpacing="1.5" style={{ fontFamily: "var(--font)" }}>
        <textPath href="#sd-seal-ring" textLength="462" lengthAdjust="spacing">{ring}</textPath>
      </text>
      <text x="100" y="94" textAnchor="middle" fill="currentColor" fontSize="25" style={{ fontFamily: "var(--display)" }}>FINAL</text>
      <text x="100" y="114" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="700" letterSpacing="2" style={{ fontFamily: "var(--font)" }}>{year}</text>
      <text x="100" y="131" textAnchor="middle" fill="currentColor" fontSize="9" style={{ fontFamily: "var(--font)" }}>{date}</text>
    </svg>
  );
}

function Heading({ n, title }: { n: number; title: string }) {
  return <h2 className="sd-h2"><span className="sd-n">{String(n).padStart(2, "0")}</span>{title}</h2>;
}

/* ------------------------------------------------------------------ isi */

const pct = (part: number, whole: number) => (whole > 0 ? `${num((part / whole) * 100, 1)}%` : "—");

function buildBlocks(d: StatementData, origin: string, t: T): Block[] {
  const c = d.calculation;
  const final = d.status === "final";
  const co = d.company;
  const y = d.period.year;
  const issued = final ? longDate(d.issued_at) : longDate(d.generated_at);
  const economic = c.allocation_method === "economic";
  const gwp = c.gwp_set === "AR6" ? { ch4: "27", n2o: "273" } : { ch4: "28", n2o: "265" };
  const address = [co.address, co.city, co.province, co.postal_code].filter(Boolean).join(", ");
  const verifyUrl = `${origin.replace(/\/$/, "")}/verifikasi`;
  const facType = (x: string) => ({ kebun: t("kebun", "plantation"), pabrik: t("pabrik", "mill"), gudang: t("gudang", "warehouse") }[x] ?? x);
  const groupName = { direct: t("Langsung", "Direct"), indirect: t("Tidak langsung", "Indirect"), upstream: t("Hulu", "Upstream") };
  const lines = c.lines.filter((l) => Math.abs(l.value_t) >= 0.0005).sort((a, b) => b.value_t - a.value_t);
  const defaults = Object.entries(c.defaults_used ?? {});
  const hasDefaultLine = lines.some((l) => l.source === "default");
  let n = 0;
  const no = () => ++n;
  const B = (key: string, node: ReactNode): Block => ({ key, node });

  const out: Block[] = [];
  /** Satu bagian bernomor = beberapa blok. Judul selalu menempel pada blok pertama (tidak yatim di dasar lembar). */
  const section = (key: string, title: string, parts: ReactNode[]) => {
    const n = no();
    parts.forEach((part, i) => out.push(B(`${key}-${i}`, i === 0
      ? <div className="sd-sec"><Heading n={n} title={title} />{part}</div>
      : <div className="sd-cont">{part}</div>)));
  };

  /* kop & judul */
  out.push(B("mast", (
    <>
      <div className="sd-mast">
        <div className="sd-brand">
          <LogoMark size={34} />
          <div><b>KarbonLens</b><span>{t("Platform perhitungan emisi tertanam produk", "Embedded product emissions platform")}</span></div>
        </div>
        <dl className="sd-meta">
          <dt>{t("Nomor", "Number")}</dt><dd className="mono">{d.number}</dd>
          <dt>{final ? t("Diterbitkan", "Issued") : t("Dicetak", "Printed")}</dt><dd>{issued}</dd>
          <dt>{t("Revisi", "Revision")}</dt><dd>{d.period.revision}</dd>
        </dl>
      </div>
      <div className="sd-micro" aria-hidden="true">{`KARBONLENS · ${d.number} · ${d.code ?? t("DRAF", "DRAFT")} · `.repeat(8)}</div>
      <div className="sd-title">
        <div className="sd-kicker">{t(`Periode pelaporan 1 Januari – 31 Desember ${y}`, `Reporting period 1 January – 31 December ${y}`)}</div>
        <h1>{t("Pernyataan Hasil Perhitungan", "Statement of Embedded")}<br />{t("Emisi Tertanam", "Emissions Calculation Results")}</h1>
        <div className="sd-alt">{t("Statement of Embedded Emissions Calculation Results", "Pernyataan Hasil Perhitungan Emisi Tertanam")}</div>
        <span className={`sd-pill ${final ? "final" : "draft"}`}>
          <i />{final ? t(`Final · periode dikunci · revisi ${d.period.revision}`, `Final · period locked · revision ${d.period.revision}`)
            : t("Draf · periode belum dikunci", "Draft · period not locked")}
        </span>
      </div>
    </>
  )));

  if (!final) {
    out.push(B("draft", (
      <div className="sd-callout">
        <b>{t("Dokumen ini masih draf", "This document is still a draft")}</b>
        <ul>{d.notes.map((x) => <li key={x}>{x}</li>)}</ul>
        <p>{t("Pernyataan final beserta nomor revisi, kode verifikasi, dan sidik data terbit otomatis setelah admin peninjau mengunci periode pelaporan.",
          "The final statement, with its revision number, verification code and data fingerprint, is issued automatically once the reviewer locks the reporting period.")}</p>
      </div>
    )));
  }

  out.push(B("intro", (
    <div className="sd-lead">
      <p>{t("Dengan ini dinyatakan bahwa emisi tertanam (", "This statement sets out the embedded emissions (")}<em>embedded emissions</em>
        {t(") atas produk yang dihasilkan oleh ", ") of products manufactured by ")}<b>{co.name}</b>
        {t(" selama periode pelaporan ", " during the reporting period ")}<b>{t(`1 Januari – 31 Desember ${y}`, `1 January – 31 December ${y}`)}</b>
        {t(" telah dihitung melalui platform KarbonLens. Perhitungan memakai data aktivitas dari dokumen operasional yang diajukan perusahaan dan ditinjau oleh admin peninjau yang ditugaskan, dengan pendekatan yang mengacu pada metodologi Mekanisme Penyesuaian Karbon Perbatasan Uni Eropa (",
          ", as calculated on the KarbonLens platform. The calculation uses activity data from operational documents submitted by the company and reviewed by its assigned reviewer, following an approach based on the methodology of the European Union ")}
        <em>Carbon Border Adjustment Mechanism</em>{t(", CBAM). Rincian hasil perhitungan disajikan pada bagian-bagian berikut.", " (CBAM). The results are set out in the sections below.")}</p>
    </div>
  )));

  /* 1. identitas */
  section("id", t("Identitas pelapor", "Reporting entity"), [
    <dl key="dl" className="sd-id">
      <dt>{t("Nama perusahaan", "Company name")}</dt><dd>{co.name}</dd>
      <dt>{t("NPWP / NIB", "Tax / business ID")}</dt><dd>{co.legal_id || "—"}</dd>
      <dt>{t("Alamat", "Address")}</dt><dd>{address ? `${address}, Indonesia` : "—"}</dd>
      <dt>{t("Sektor", "Sector")}</dt><dd>{co.sector || "—"}</dd>
      <dt>{t("Instalasi", "Installations")}</dt>
      <dd>{d.facilities.length ? d.facilities.map((f, i) => (
        <Fragment key={i}>{i > 0 && "; "}{f.name} <span className="sd-soft">({facType(f.type)}{f.capacity_tph ? `, ${num(f.capacity_tph)} ${t("t TBS/jam", "t FFB/h")}` : ""}{f.area_ha ? `, ${num(f.area_ha)} ha` : ""})</span></Fragment>
      )) : "—"}</dd>
      <dt>{t("Kalkulasi", "Calculation")}</dt>
      <dd>{t(`Versi ${c.version}`, `Version ${c.version}`)} · {longDate(c.created_at)}{c.created_by ? ` · ${c.created_by}` : ""}</dd>
    </dl>,
  ]);

  /* 2. ringkasan */
  const groups = [
    { k: "direct", name: t("Emisi langsung", "Direct emissions"), sub: t("Scope 1 · bahan bakar, pupuk, lahan, POME, limbah", "Scope 1 · fuel, fertiliser, land, POME, waste"), v: c.direct_t },
    { k: "indirect", name: t("Emisi tidak langsung", "Indirect emissions"), sub: t("Scope 2 · listrik yang dibeli", "Scope 2 · purchased electricity"), v: c.indirect_t },
    { k: "upstream", name: t("Emisi hulu", "Upstream emissions"), sub: t("Material prekursor & transportasi", "Precursor materials & transport"), v: c.upstream_t },
  ];
  section("sum", t("Ringkasan hasil perhitungan", "Summary of results"), [
    <div key="hero" className="sd-hero">
      <div>
        <div className="sd-lbl">{t("Total emisi tertanam", "Total embedded emissions")}</div>
        <div className="sd-big">{num(c.total_t, 1)}</div>
        <div className="sd-unit">{t(`t CO₂e · periode ${y} · GWP IPCC ${c.gwp_set}`, `t CO₂e · period ${y} · IPCC ${c.gwp_set} GWP`)}</div>
        {c.biogenic_co2_t > 0 && <div className="sd-unit sd-bio">{t(`CO₂ biogenik (di luar total): ${num(c.biogenic_co2_t, 1)} t`, `Biogenic CO₂ (outside the total): ${num(c.biogenic_co2_t, 1)} t`)}</div>}
      </div>
      <div className="sd-rows">
        {groups.map((g) => (
          <div key={g.k}>
            <span><b>{g.name}</b><small>{g.sub}</small></span>
            <em>{num(g.v, 1)} t<small>{pct(g.v, c.total_t)}</small></em>
            <span className="sd-hbar"><i style={{ width: c.total_t > 0 ? `${Math.max(0, Math.min(100, (g.v / c.total_t) * 100))}%` : 0 }} /></span>
          </div>
        ))}
      </div>
    </div>,
    <p key="p">{t("Total emisi tertanam instalasi selama periode pelaporan adalah ", "Total embedded emissions of the installation over the reporting period are ")}
      <b>{num(c.total_t, 1)} t CO₂e</b>{t(". Jumlah tersebut terdiri atas emisi langsung sebesar ", ". This consists of direct emissions of ")}
      {num(c.direct_t, 1)} t CO₂e ({pct(c.direct_t, c.total_t)}){t(", emisi tidak langsung dari listrik yang dibeli sebesar ", ", indirect emissions from purchased electricity of ")}
      {num(c.indirect_t, 1)} t CO₂e ({pct(c.indirect_t, c.total_t)}){t(", serta emisi hulu dari material prekursor dan transportasi sebesar ", ", and upstream emissions from precursor materials and transport of ")}
      {num(c.upstream_t, 1)} t CO₂e ({pct(c.upstream_t, c.total_t)}).
      {c.biogenic_co2_t > 0 && t(` Emisi CO₂ biogenik sebesar ${num(c.biogenic_co2_t, 1)} t dicatat terpisah dan tidak termasuk dalam total.`,
        ` Biogenic CO₂ of ${num(c.biogenic_co2_t, 1)} t is recorded separately and is not included in the total.`)}</p>,
  ]);

  /* 3. SEE per produk */
  section("see", t("Emisi tertanam spesifik per produk", "Specific embedded emissions per product"), [
    <table key="tb" className="sd-table sd-see">
      <thead><tr>
        <th>{t("Produk", "Product")}</th><th>{t("Kode CN", "CN code")}</th><th className="sd-r">{t("Produksi (t)", "Output (t)")}</th>
        <th className="sd-r">{t("Porsi alokasi", "Allocation share")}</th><th className="sd-r">{t("SEE langsung", "Direct SEE")}</th>
        <th className="sd-r">{t("SEE tidak langsung", "Indirect SEE")}</th><th className="sd-r">{t("SEE total", "Total SEE")}</th>
      </tr></thead>
      <tbody>
        {c.allocations.map((a) => (
          <tr key={a.code}>
            <td><b>{a.code}</b><span className="sd-sub">{a.product_name || a.name}</span></td>
            <td className="mono">{a.cn_code || "—"}</td>
            <td className="sd-r">{num(a.tonnes, 1)}</td><td className="sd-r">{num(a.share * 100, 1)}%</td>
            <td className="sd-r">{num(a.see_direct, 4)}</td><td className="sd-r">{num(a.see_indirect, 4)}</td>
            <td className="sd-r sd-seev">{num(a.see_total, 4)}</td>
          </tr>
        ))}
      </tbody>
    </table>,
    <p key="note" className="sd-note">{t("SEE (", "SEE (")}<em>specific embedded emissions</em>{t(") dinyatakan dalam t CO₂e per ton produk. Emisi instalasi dialokasikan ke setiap produk berdasarkan ", ") is expressed in t CO₂e per tonne of product. Installation emissions are allocated to each product by ")}
      {economic ? t("nilai ekonomi (harga jual) produk", "the economic value (selling price) of each product") : t("massa produk", "product mass")}
      {t(". SEE total merupakan penjumlahan SEE langsung dan SEE tidak langsung; emisi hulu termasuk dalam SEE langsung.", ". Total SEE is the sum of direct and indirect SEE; upstream emissions are included in direct SEE.")}</p>,
  ]);

  /* 4. rincian komponen */
  section("lines", t("Rincian komponen emisi", "Emission components"), [
    <table key="tb" className="sd-table">
      <thead><tr>
        <th>{t("Komponen", "Component")}</th><th>{t("Kelompok", "Group")}</th><th>Scope</th>
        <th className="sd-r">t CO₂e</th><th className="sd-r" style={{ width: "34mm" }}>{t("Porsi", "Share")}</th>
      </tr></thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.key}>
            <td>{l.name}{l.source === "default" && <sup className="sd-dag">†</sup>}</td>
            <td>{groupName[l.group] ?? l.group}</td><td className="sd-soft">{l.scope}</td>
            <td className="sd-r">{num(l.value_t, 1)}</td>
            <td className="sd-r"><span className="sd-share"><span className={`sd-bar ${l.group}`}><i style={{ width: `${c.total_t > 0 ? Math.max(0, Math.min(100, (l.value_t / c.total_t) * 100)) : 0}%` }} /></span>{pct(l.value_t, c.total_t)}</span></td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><td colSpan={3}>{t("Total emisi tertanam", "Total embedded emissions")}</td><td className="sd-r">{num(c.total_t, 1)}</td><td className="sd-r">100%</td></tr></tfoot>
    </table>,
    ...(hasDefaultLine ? [<p key="dag" className="sd-note">† {t("Komponen ini memakai nilai bawaan literatur karena data dokumen tidak tersedia.", "This component uses a literature default because document data is not available.")}</p>] : []),
  ]);

  /* 5. batas & cakupan */
  section("scope", t("Batas dan cakupan perhitungan", "Calculation boundary and coverage"), [
    ...(c.excluded.length ? [
      <p key="p">{t("Kategori berikut dinyatakan tidak berlaku untuk instalasi ini dan dikeluarkan dari batas perhitungan. Kategori yang dikecualikan tidak diisi dengan nilai nol, melainkan tidak dihitung sama sekali; alasan dan pihak yang menetapkannya tercatat dalam log audit KarbonLens.",
        "The following categories do not apply to this installation and are outside the calculation boundary. Excluded categories are not filled with zero; they are not calculated at all. The reason and the person who set the status are recorded in the KarbonLens audit log.")}</p>,
      <ul key="ul" className="sd-list">
        {c.excluded.map((x) => (
          <li key={x.code}><b>{x.name}</b>{x.reason ? ` — ${x.reason}` : ""}
            <span className="sd-soft"> ({[x.set_by && t(`ditetapkan ${x.set_by}`, `set by ${x.set_by}`), x.set_at && longDate(x.set_at)].filter(Boolean).join(", ") || t("bawaan katalog", "catalogue default")})</span></li>
        ))}
      </ul>,
    ] : [<p key="p">{t("Seluruh kategori sumber emisi dalam katalog KarbonLens berlaku untuk instalasi ini dan diperhitungkan.", "Every emission source category in the KarbonLens catalogue applies to this installation and has been calculated.")}</p>]),
    defaults.length ? (
      <Fragment key="def">
        <p>{t("Untuk kategori berikut, data dokumen tidak tersedia sehingga perhitungan memakai nilai bawaan dari literatur:", "For the following categories no document data is available, so the calculation uses literature defaults:")}</p>
        <ul className="sd-list">{defaults.map(([k, v]) => <li key={k}>{v}</li>)}</ul>
      </Fragment>
    ) : <p key="def">{t("Tidak ada kategori yang memakai nilai bawaan literatur; seluruh angka aktivitas berasal dari dokumen perusahaan.", "No category uses a literature default; every activity figure comes from the company's documents.")}</p>,
  ]);

  /* 6. metodologi */
  section("method", t("Metodologi", "Methodology"), [
    <p key="1">{t(`Emisi setiap komponen dihitung dengan pola data aktivitas × faktor emisi × potensi pemanasan global (GWP). Nilai GWP yang dipakai adalah IPCC ${c.gwp_set} dengan CH₄ = ${gwp.ch4} dan N₂O = ${gwp.n2o}. Fraksi biogenik bahan bakar campuran (biosolar) dipisahkan dari fraksi fosil, dan CO₂ biogenik dilaporkan terpisah dari total.`,
      `Emissions for each component follow the pattern activity data × emission factor × global warming potential (GWP). The GWP values are IPCC ${c.gwp_set}, with CH₄ = ${gwp.ch4} and N₂O = ${gwp.n2o}. The biogenic fraction of blended fuel (biodiesel) is separated from the fossil fraction, and biogenic CO₂ is reported separately from the total.`)}</p>,
    <p key="2">{t("Data aktivitas diambil dari dokumen operasional yang diunggah perusahaan, dibaca oleh sistem, diperiksa dan diajukan oleh perusahaan, lalu disetujui oleh admin peninjau. Setiap angka tertaut ke dokumen dan halaman sumbernya; jejak data lengkap tersedia dalam ekspor XLSX periode ini.",
      "Activity data comes from operational documents uploaded by the company, read by the system, checked and submitted by the company, and then approved by the reviewer. Every figure links to its source document and page; the full data trail is available in this period's XLSX export.")}</p>,
    <p key="3">{t(`Emisi instalasi dialokasikan ke produk berdasarkan ${economic ? "nilai ekonomi (harga jual)" : "massa"}. Faktor emisi dibekukan saat kalkulasi versi ${c.version} dijalankan pada ${longDate(c.created_at)}, sehingga perubahan faktor sesudahnya tidak memengaruhi pernyataan ini.`,
      `Installation emissions are allocated to products by ${economic ? "economic value (selling price)" : "mass"}. Emission factors were frozen when calculation version ${c.version} ran on ${longDate(c.created_at)}, so later factor changes do not affect this statement.`)}</p>,
  ]);

  /* 7. faktor emisi */
  if (d.factors.length) {
    section("factors", t("Faktor emisi yang dipakai", "Emission factors used"), [
      <table key="tb" className="sd-table sd-compact">
        <thead><tr><th>{t("Faktor", "Factor")}</th><th className="sd-r">{t("Nilai", "Value")}</th><th>{t("Satuan", "Unit")}</th><th>{t("Sumber", "Source")}</th></tr></thead>
        <tbody>
          {d.factors.map((f) => (
            <tr key={f.code}>
              <td>{f.name}{f.status !== "approved" && <span className="sd-tag">{t("draf", "draft")}</span>}</td>
              <td className="sd-r">{sig(f.value)}</td><td className="sd-soft">{f.unit}</td><td className="sd-soft">{f.source}</td>
            </tr>
          ))}
        </tbody>
      </table>,
    ]);
  }

  /* 8. pernyataan & pengesahan */
  section("sign", t("Pernyataan dan pengesahan", "Declaration and endorsement"), [
    <p key="p">{final
      ? t(`Pernyataan ini diterbitkan secara elektronik oleh KarbonLens setelah periode pelaporan ${y} dikunci oleh admin peninjau pada ${longDate(d.period.locked_at)}. Sejak dikunci, data aktivitas, faktor emisi, dan hasil kalkulasi periode ini tidak dapat diubah. Koreksi hanya dapat dilakukan melalui revisi baru, yang akan menerbitkan pernyataan dengan nomor revisi berikutnya dan menandai pernyataan ini sebagai digantikan.`,
        `This statement was issued electronically by KarbonLens after the reviewer locked the ${y} reporting period on ${longDate(d.period.locked_at)}. Once locked, the activity data, emission factors and calculation results for the period cannot be changed. Corrections can only be made through a new revision, which issues a statement with the next revision number and marks this one as superseded.`)
      : t("Pernyataan ini masih berupa draf karena periode pelaporan belum dikunci oleh admin peninjau. Angka di dalamnya masih dapat berubah dan dokumen ini belum dapat dipakai untuk pelaporan resmi.",
        "This statement is still a draft because the reviewer has not locked the reporting period. Its figures may still change and the document cannot yet be used for official reporting.")}</p>,
    <Fragment key="signs">
      <p className="sd-place">{co.city || "Indonesia"}, {issued}</p>
      <div className="sd-signs">
        <div className="sd-sign">
          <span className="sd-role">{t("Disusun oleh", "Prepared by")}</span>
          <span className="sd-space">{t("Disahkan elektronik", "Endorsed electronically")}</span>
          <span className="sd-who">{c.created_by || "—"}</span>
          <span className="sd-smeta">{t(`Akun perusahaan · kalkulasi v${c.version}`, `Company account · calculation v${c.version}`)}</span>
        </div>
        <div className="sd-sign">
          <span className="sd-role">{t("Ditinjau & dikunci oleh", "Reviewed & locked by")}</span>
          <span className="sd-space">{final ? "" : t("Menunggu penguncian", "Awaiting lock")}</span>
          {final && <Seal year={y} date={longDate(d.period.locked_at)} t={t} />}
          <span className="sd-who">{d.period.locked_by || "—"}</span>
          <span className="sd-smeta">{t("Admin peninjau", "Reviewer")}{final ? ` · ${longDate(d.period.locked_at)}` : ""}</span>
        </div>
        <div className="sd-sign">
          <span className="sd-role">{t("Penanggung jawab perusahaan", "Company representative")}</span>
          <span className="sd-space">{t("Tanda tangan & cap perusahaan", "Signature & company stamp")}</span>
          <span className="sd-who blank">&nbsp;</span>
          <span className="sd-smeta">{t("Nama & jabatan", "Name & title")}</span>
        </div>
      </div>
    </Fragment>,
  ]);

  /* 9. keaslian */
  section("verify", t("Keaslian dokumen", "Document authenticity"), [
    final && d.code ? (
      <div key="v" className="sd-verify">
        <div>
          <span className="sd-k">{t("Kode verifikasi", "Verification code")}</span>
          <div className="sd-code">{d.code}</div>
          <span className="sd-k">{t("Cek keaslian di", "Verify at")}</span>
          <div className="sd-url">{verifyUrl}</div>
        </div>
        <div>
          <p>{t("Pihak mana pun dapat mencocokkan dokumen ini dengan data di KarbonLens dengan memasukkan kode verifikasi di alamat tersebut. Halaman cek menampilkan nama perusahaan, periode, revisi, total emisi, dan SEE per produk yang tercatat. Bila ada angka yang berbeda atau statusnya digantikan, dokumen ini tidak berlaku.",
            "Anyone can match this document against KarbonLens records by entering the verification code at that address. The check page shows the company name, period, revision, total emissions and SEE per product on record. If any figure differs, or the status shows superseded, this document is not valid.")}</p>
          <span className="sd-k">{t("Sidik data (SHA-256)", "Data fingerprint (SHA-256)")}</span>
          <div className="sd-hash">{d.sha256}</div>
        </div>
      </div>
    ) : (
      <div key="v" className="sd-verify pending">
        <p>{t("Kode verifikasi dan sidik data (SHA-256) belum tersedia. Keduanya terbit otomatis saat admin peninjau mengunci periode pelaporan, sehingga dokumen final dapat dicek keasliannya oleh importir atau verifikator.",
          "The verification code and data fingerprint (SHA-256) are not available yet. Both are issued automatically when the reviewer locks the reporting period, so importers or verifiers can check the final document.")}</p>
      </div>
    ),
    <p key="fine" className="sd-fine"><b>{t("Penafian. ", "Disclaimer. ")}</b>{t(
      "Pernyataan ini merupakan hasil perhitungan berdasarkan dokumen operasional yang diajukan perusahaan dan ditinjau admin peninjau di KarbonLens. Pernyataan ini bukan laporan verifikasi oleh verifikator terakreditasi dan tidak menggantikan verifikasi pihak ketiga yang dipersyaratkan regulasi. Metodologi CBAM dipakai sebagai acuan perhitungan; cakupan produk dan kewajiban pelaporan mengikuti regulasi yang berlaku bagi penerima dokumen.",
      "This statement presents calculation results based on operational documents submitted by the company and reviewed on KarbonLens. It is not a verification report by an accredited verifier and does not replace any third-party verification required by regulation. The CBAM methodology is used as the calculation reference; product scope and reporting obligations follow the regulations that apply to the recipient of this document.")}</p>,
  ]);
  out[out.length - 1].keep = true; // penafian tidak sendirian di lembar terakhir

  return out;
}
