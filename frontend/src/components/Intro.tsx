"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { Contours } from "./Contours";
import { LogoMark } from "./Icons";

// diingat lintas kunjungan; tombol "Putar ulang intro" di kaki halaman menghapusnya.
// Diberi versi: setiap kali isi video berubah, naikkan versinya agar semua pengunjung melihat yang baru sekali lagi.
const KEY = "karbonlens.intro.v2.seen";
const OLD_KEYS = ["karbonlens.intro.seen"];

type T = (id: string, en: string) => string;
type Scene = { key: string; dur: number; kicker: string; title: ReactNode; body: string; visual: ReactNode };

/**
 * Video perkenalan (animasi, ±28 detik, 7 adegan): mengapa KarbonLens dibutuhkan dan bagaimana cara kerjanya.
 * Diputar sekali pada kunjungan pertama. Kontrol: klik / → / Enter = adegan berikutnya, ← = sebelumnya,
 * Esc = lewati; segmen progres bisa diklik. Tidak diputar bila pengguna memilih gerak minim.
 */
export function Intro({ force = false, onDone }: { force?: boolean; onDone?: () => void }) {
  const t = useT();
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [i, setI] = useState(0);
  const timer = useRef<number | null>(null); // pergantian adegan
  const closing = useRef<number | null>(null); // tirai penutup (terpisah agar tidak ikut dibatalkan)
  const scenes = useMemo(() => buildScenes(t), [t]);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(KEY) === "1";
      OLD_KEYS.forEach((k) => window.localStorage.removeItem(k)); // penanda versi lama tidak dipakai lagi
    } catch {
      seen = false;
    }
    // ?intro di alamat = putar paksa (untuk demo/presentasi), juga mengabaikan preferensi gerak minim
    const asked = new URLSearchParams(window.location.search).has("intro");
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (asked || ((force || !seen) && !reduced)) {
      setI(0);
      setShow(true);
    } else onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [force]);

  const finish = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (closing.current) window.clearTimeout(closing.current);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* mode privat */
    }
    setShow(false);
    setLeaving(false);
    onDone?.();
  }, [onDone]);

  const skip = useCallback(() => {
    if (leaving) return;
    if (timer.current) window.clearTimeout(timer.current);
    setLeaving(true);
    closing.current = window.setTimeout(finish, 560);
  }, [leaving, finish]);

  const go = useCallback((n: number) => {
    if (leaving) return;
    if (n >= scenes.length) skip();
    else setI(Math.max(0, n));
  }, [leaving, scenes.length, skip]);

  // maju otomatis per adegan
  useEffect(() => {
    if (!show || leaving) return;
    timer.current = window.setTimeout(() => go(i + 1), scenes[i].dur);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [show, leaving, i, go, scenes]);

  useEffect(() => () => { if (closing.current) window.clearTimeout(closing.current); }, []);

  useEffect(() => {
    if (!show) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); skip(); }
      else if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") { e.preventDefault(); go(i + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [show, skip, go, i]);

  if (!show) return null;
  const s = scenes[i];
  return (
    <div className={`intro pv ${leaving ? "leaving" : ""}`} role="dialog" aria-modal="true" aria-label={t("Perkenalan KarbonLens", "KarbonLens introduction")}>
      <Contours className="intro-contours" animate />
      <div className="pv-glow" aria-hidden="true" />

      <div className="pv-top">
        <span className="pv-brand"><LogoMark size={22} />KarbonLens</span>
        <button type="button" className="pv-skip" onClick={skip}>{t("Lewati intro", "Skip intro")}<kbd>Esc</kbd></button>
      </div>

      <div className="pv-stage" onClick={() => go(i + 1)}>
        <div className="pv-scene" key={s.key}>
          <div className="pv-text">
            <span className="pv-kicker"><i>{String(i + 1).padStart(2, "0")}</i>{s.kicker}</span>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
          </div>
          <div className="pv-visual" aria-hidden="true">{s.visual}</div>
        </div>
      </div>

      <div className="pv-bar">
        <span className="pv-count" aria-live="polite">{String(i + 1).padStart(2, "0")} / {String(scenes.length).padStart(2, "0")}</span>
        <div className="pv-segs">
          {scenes.map((x, k) => (
            <button key={x.key} type="button" onClick={() => go(k)} aria-label={`${k + 1}. ${x.kicker}`} aria-current={k === i ? "step" : undefined}
              className={k < i ? "done" : k === i ? "now" : ""}>
              <i style={k === i ? { animationDuration: `${x.dur}ms` } : undefined} />
            </button>
          ))}
        </div>
        <button type="button" className="pv-next" onClick={() => go(i + 1)} aria-label={t("Adegan berikutnya", "Next scene")}>
          {i === scenes.length - 1 ? t("Mulai", "Start") : t("Berikutnya", "Next")}<span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ naskah adegan */

function buildScenes(t: T): Scene[] {
  return [
    {
      key: "why", dur: 4600, kicker: t("Mengapa", "Why"),
      title: <>{t("Pembeli di Eropa kini bertanya:", "Buyers in Europe now ask:")} <em>{t("berapa emisi di balik setiap ton?", "how much carbon is in every tonne?")}</em></>,
      body: t("Regulasi CBAM Uni Eropa menuntut data emisi tertanam produk yang dapat ditelusuri sampai ke sumbernya.",
        "The EU CBAM regulation asks for embedded product emissions that can be traced back to their source."),
      visual: <RouteVisual t={t} />,
    },
    {
      key: "docs", dur: 4000, kicker: t("Datanya sudah ada", "The data exists"),
      title: <>{t("Jawabannya ada di dokumen", "The answer is in documents")} <em>{t("yang sudah Anda punya.", "you already have.")}</em></>,
      body: t("Tagihan listrik, faktur BBM, rekap pupuk, laporan produksi, dan laporan limbah. Tidak perlu formulir baru.",
        "Electricity bills, fuel invoices, fertiliser summaries, production and waste reports. No new forms."),
      visual: <DocsVisual t={t} />,
    },
    {
      key: "read", dur: 4400, kicker: t("Dibaca otomatis", "Read automatically"),
      title: <>{t("Unggah, lalu angkanya", "Upload, and the figures")} <em>{t("terbaca sendiri.", "read themselves.")}</em></>,
      body: t("PDF, scan miring, atau foto. Setiap angka disimpan bersama posisi asalnya di halaman dokumen.",
        "PDFs, skewed scans or photos. Every figure is stored with where it sits on the page."),
      visual: <ReadVisual t={t} />,
    },
    {
      key: "review", dur: 4000, kicker: t("Diperiksa dua peran", "Checked by two roles"),
      title: <>{t("Perusahaan mengajukan,", "The company submits,")} <em>{t("peninjau menyetujui.", "the reviewer approves.")}</em></>,
      body: t("Yang menyiapkan data tidak bisa menyetujui datanya sendiri. Setiap koreksi tercatat di jejak audit.",
        "Whoever prepares the data cannot approve it. Every correction is recorded in the audit trail."),
      visual: <ReviewVisual t={t} />,
    },
    {
      key: "calc", dur: 4600, kicker: t("Dihitung per produk", "Calculated per product"),
      title: <>{t("Dari liter dan kWh", "From litres and kWh")} <em>{t("ke setiap ton CPO dan PKO.", "to every tonne of CPO and PKO.")}</em></>,
      body: t("Data aktivitas × faktor emisi × GWP, dibagi ke produk. Batas CBAM dihitung berdampingan.",
        "Activity data × emission factor × GWP, allocated to products. The CBAM boundary is calculated alongside."),
      visual: <CalcVisual t={t} />,
    },
    {
      key: "report", dur: 4200, kicker: t("Siap dilaporkan", "Ready to report"),
      title: <>{t("Dikunci, lalu terbit", "Locked, then issued")} <em>{t("pernyataan yang bisa dicek.", "as a verifiable statement.")}</em></>,
      body: t("Pernyataan PDF dengan kode verifikasi dan sidik SHA-256, plus ekspor XLSX dan XML untuk importir.",
        "A PDF statement with a verification code and SHA-256 fingerprint, plus XLSX and XML exports for importers."),
      visual: <ReportVisual t={t} />,
    },
    {
      key: "brand", dur: 3600, kicker: "KarbonLens",
      title: <>{t("Emisi tertanam produk,", "Embedded product emissions,")} <em>{t("dihitung dari dokumen Anda.", "calculated from your documents.")}</em></>,
      body: t("Mulai dari dokumen periode lalu. Hasil pertama biasanya terlihat di hari yang sama.",
        "Start with last period's documents. The first result usually shows up the same day."),
      visual: <BrandVisual t={t} />,
    },
  ];
}

/* ------------------------------------------------------------------ visual tiap adegan */

function RouteVisual({ t }: { t: T }) {
  return (
    <div className="pv-route">
      <svg viewBox="0 0 520 300">
        <defs>
          <pattern id="pv-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" fill="rgba(200,240,90,.22)" /></pattern>
        </defs>
        <rect width="520" height="300" fill="url(#pv-dots)" rx="18" />
        <path id="pv-path" className="pv-arc" d="M90 230 C 170 60, 340 40, 430 92" />
        <circle r="7" className="pv-ship"><animateMotion dur="2.6s" begin="0.5s" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".4 0 .2 1"><mpath href="#pv-path" /></animateMotion></circle>
        <circle cx="90" cy="230" r="6" className="pv-node" /><circle cx="430" cy="92" r="6" className="pv-node" />
      </svg>
      <span className="pv-chip a"><b>Indonesia</b>{t("CPO · PKO", "CPO · PKO")}</span>
      <span className="pv-chip b"><b>{t("Uni Eropa", "European Union")}</b>{t("Importir", "Importer")}</span>
      <span className="pv-ask">? t CO₂e / t</span>
    </div>
  );
}

function DocsVisual({ t }: { t: T }) {
  const docs = [
    [t("Tagihan listrik PLN", "PLN electricity bill"), t("198.400 kWh", "198,400 kWh")],
    [t("Faktur BBM", "Fuel invoice"), t("41.200 L", "41,200 L")],
    [t("Rekap pupuk", "Fertiliser summary"), t("1.218 t N", "1,218 t N")],
    [t("Laporan POME", "POME report"), t("76.800 m³", "76,800 m³")],
  ];
  return (
    <div className="pv-docs">
      {docs.map(([name, val], k) => (
        <div key={name} className={`pv-doc d${k}`}>
          <b>{name}</b>
          <span className="ln" style={{ width: "72%" }} /><span className="ln" style={{ width: "54%" }} />
          <span className="val">{val}</span>
          <span className="ln" style={{ width: "64%" }} />
        </div>
      ))}
    </div>
  );
}

function ReadVisual({ t }: { t: T }) {
  const fields = [
    [t("Volume BBM", "Fuel volume"), t("41.200 L", "41,200 L"), "98%"],
    [t("kWh dibeli", "kWh purchased"), t("2.424.000", "2,424,000"), "97%"],
    [t("TBS diolah", "FFB processed"), t("128.000 t", "128,000 t"), "99%"],
  ];
  return (
    <div className="pv-read">
      <div className="pv-paper">
        <b>{t("Faktur solar · Agustus", "Diesel invoice · August")}</b>
        <span className="ln" style={{ width: "60%" }} />
        <div className="row"><span>{t("Jenis BBM", "Fuel")}</span><span>Biosolar B40</span></div>
        <div className="row hit"><span>{t("Volume diserahkan", "Volume delivered")}</span><span>41.200 L</span></div>
        <span className="ln" style={{ width: "80%" }} /><span className="ln" style={{ width: "48%" }} />
        <div className="row"><span>{t("Harga satuan", "Unit price")}</span><span>Rp 12.750</span></div>
        <div className="pv-beam" />
      </div>
      <div className="pv-fields">
        <span className="h">{t("Hasil pembacaan", "Extracted")}</span>
        {fields.map(([k, v, c], n) => (
          <div key={k} className="f" style={{ animationDelay: `${1.3 + n * 0.45}s` }}><span>{k}</span><b>{v}</b><em>{c}</em></div>
        ))}
      </div>
    </div>
  );
}

function ReviewVisual({ t }: { t: T }) {
  return (
    <div className="pv-review">
      <div className="pv-role">
        <span className="av">BS</span>
        <b>{t("Akun perusahaan", "Company account")}</b>
        <em>{t("Memeriksa & mengajukan", "Checks & submits")}</em>
      </div>
      <div className="pv-flow"><span className="pv-packet">{t("3 dokumen", "3 documents")}</span></div>
      <div className="pv-role admin">
        <span className="av">RK</span>
        <b>{t("Admin peninjau", "Reviewer")}</b>
        <em>{t("Menyetujui atau mengembalikan", "Approves or returns")}</em>
        <span className="pv-stamp">✓ {t("Disetujui", "Approved")}</span>
      </div>
    </div>
  );
}

function useCount(target: number, delay: number, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / ms));
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, delay, ms]);
  return v;
}

function CalcVisual({ t }: { t: T }) {
  const cpo = useCount(0.961, 1500);
  const pko = useCount(1.338, 1700);
  const fmt = (x: number) => x.toLocaleString(t("id-ID", "en-US"), { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const bars = [[t("POME — CH₄", "POME — CH₄"), 100, "d"], [t("Pupuk — N₂O", "Fertiliser — N₂O"), 25, "d"], [t("Listrik", "Electricity"), 10.4, "i"], [t("Urea", "Urea"), 6.5, "d"], ["BBM", 2.4, "d"]] as const;
  return (
    <div className="pv-calc">
      <div className="pv-bars">
        {bars.map(([n, w, g], k) => (
          <div key={n} className="b"><span>{n}</span><i className={g} style={{ width: `${Math.max(4, w)}%`, animationDelay: `${0.2 + k * 0.12}s` }} /></div>
        ))}
      </div>
      <div className="pv-see">
        <div><span>SEE CPO</span><b>{fmt(cpo)}</b><em>t CO₂e / t</em></div>
        <div><span>SEE PKO</span><b>{fmt(pko)}</b><em>t CO₂e / t</em></div>
      </div>
    </div>
  );
}

function ReportVisual({ t }: { t: T }) {
  return (
    <div className="pv-report">
      <div className="pv-sheet">
        <span className="hd"><LogoMark size={16} />KarbonLens</span>
        <b>{t("Pernyataan Hasil Perhitungan Emisi Tertanam", "Embedded Emissions Calculation Statement")}</b>
        <span className="ln" style={{ width: "86%" }} /><span className="ln" style={{ width: "70%" }} />
        <div className="big">28.913 <small>t CO₂e</small></div>
        <span className="ln" style={{ width: "78%" }} /><span className="ln" style={{ width: "52%" }} />
        <span className="code"><span>3342-E704-2CAB-E6C9</span></span>
        <span className="seal">FINAL</span>
      </div>
      <div className="pv-files"><span>PDF</span><span>XLSX</span><span>XML</span></div>
    </div>
  );
}

function BrandVisual({ t }: { t: T }) {
  return (
    <div className="pv-brandmark">
      <span className="ring"><LogoMark size={92} /></span>
      <b>KarbonLens</b>
      <div className="facts">
        <span>{t("10 kategori dokumen", "10 document categories")}</span>
        <span>{t("2 peran terpisah", "2 separate roles")}</span>
        <span>{t("SEE per produk", "SEE per product")}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pemasangan */

export function replayIntro() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* abaikan */
  }
}

/**
 * Intro untuk kunjungan pertama ke halaman mana pun (mis. langsung membuka /dashboard atau /superadmin).
 * Memakai komponen & kunci penyimpanan yang sama dengan halaman utama, jadi hanya diputar sekali.
 * Halaman utama memasang intro-nya sendiri (bisa diputar ulang); halaman cetak & cek publik dilewati.
 */
export function FirstVisitIntro() {
  const pathname = usePathname() ?? "/";
  if (pathname === "/" || pathname.startsWith("/cetak") || pathname.startsWith("/verifikasi")) return null;
  return <Intro />;
}
