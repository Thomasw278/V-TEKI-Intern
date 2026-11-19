"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ContributionBars, EmissionFlow, GroupLegend } from "@/components/charts";
import { IconArrow, IconCheck, IconMenu, IconX, LogoMark } from "@/components/Icons";
import { Intro, replayIntro } from "@/components/Intro";
import { AuditPanels, DotField, Pipeline, ProductWindow, SecHead, Ticker } from "@/components/LandingParts";
import { Toggles } from "@/components/ui";
import { Ways } from "@/components/Ways";
import { useLang } from "@/lib/i18n";
import { SAMPLE_ALLOCATIONS, sampleLines } from "@/lib/sample";
import { useSession } from "@/lib/session";

type T = (id: string, en: string) => string;

function LandingNav({ items, ariaLabel }: { items: [string, string][]; ariaLabel: string }) {
  const containerRef = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ x: number; w: number; h: number; opacity: number } | null>(null);

  const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const target = e.currentTarget;
    setBox({
      x: target.offsetLeft,
      w: target.offsetWidth,
      h: target.offsetHeight || 36,
      opacity: 1,
    });
  };

  const handleMouseLeave = () => {
    setBox((prev) => (prev ? { ...prev, opacity: 0 } : null));
  };

  return (
    <nav
      ref={containerRef}
      aria-label={ariaLabel}
      className="sliding-nav-container"
      onMouseLeave={handleMouseLeave}
    >
      {box && (
        <span
          className="sliding-nav-box"
          aria-hidden="true"
          style={{
            transform: `translate3d(${box.x}px, -50%, 0)`,
            width: `${box.w}px`,
            height: `${box.h}px`,
            opacity: box.opacity,
          }}
        />
      )}
      {items.map(([href, label]) => (
        <a key={href} href={href} onMouseEnter={handleMouseEnter}>
          {label}
        </a>
      ))}
    </nav>
  );
}

const DOCS = (t: T) => [
  [t("Pasokan material", "Material supply"), t("Kuantitas, pemasok, negara asal, SEE pemasok", "Quantity, supplier, origin, supplier SEE"), t("Prekursor", "Precursors")],
  [t("Energi & listrik", "Energy & electricity"), t("kWh dibeli per bulan (LWBP + WBP), kWh dijual, ID pelanggan", "kWh purchased per month (off-peak + peak), kWh sold, customer ID"), "Scope 2"],
  [t("BBM energi fosil", "Fossil fuel"), t("Jenis & campuran BBM, liter, penggunaan genset atau kendaraan", "Fuel type & blend, litres, genset or vehicle use"), "Scope 1"],
  [t("Pupuk aplikasi kebun", "Fertiliser application"), t("Jenis, massa, kadar N, tandan kosong", "Type, mass, N content, empty fruit bunches"), "Scope 1 · N₂O"],
  [t("Lahan kebun & panen", "Plantation land & harvest"), t("Blok, luas, jenis tanah, TBS dipanen", "Block, area, soil type, FFB harvested"), t("Scope 1 · lahan", "Scope 1 · land")],
  [t("Pabrik & produksi", "Mill & production"), t("TBS diolah, CPO, PKO, produk lain", "FFB processed, CPO, PKO, other products"), t("Pembagi SEE", "SEE denominator")],
  [t("Limbah cair (POME)", "Wastewater (POME)"), t("Volume, COD masuk & keluar, biogas tertangkap", "Volume, inlet & outlet COD, biogas captured"), "Scope 1 · CH₄"],
  [t("Transportasi & logistik", "Transport & logistics"), t("Muatan, jarak, moda angkutan", "Load, distance, transport mode"), t("Hulu", "Upstream")],
  [t("Limbah padat & B3", "Solid & hazardous waste"), t("Jenis limbah, massa, metode olah", "Waste type, mass, treatment"), "Scope 1/3"],
  [t("Air & bukti pendukung", "Water & supporting evidence"), t("Volume air diambil, sumber", "Water abstracted, source"), t("Pemeriksa silang", "Cross-check")],
];

export default function Landing() {
  const { lang, t } = useLang();
  const { user, isAdmin } = useSession();
  const [solid, setSolid] = useState(false);
  const [menu, setMenu] = useState(false);
  const [introKey, setIntroKey] = useState(0);
  const [forceIntro, setForceIntro] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll(".lp-sec").forEach((el) => el.classList.add("in-view"));
      return () => window.removeEventListener("scroll", onScroll);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    document.querySelectorAll(".lp-sec").forEach((el) => observer.observe(el));

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  const home = user ? (isAdmin ? "/admin" : "/dashboard") : null;
  const lines = sampleLines(lang);
  const NAV: [string, string][] = [
    ["#cara-kerja", t("Cara kerja", "How it works")], ["#pembacaan", t("Pembacaan dokumen", "Document reading")],
    ["#peran", t("Peran", "Roles")], ["#dokumen", t("Dokumen", "Documents")], ["#keamanan", t("Keamanan", "Security")],
  ];

  return (
    <div className="lp">
      <Intro key={introKey} force={forceIntro} />

      <header className={`lp-header ${solid || menu ? "solid" : ""}`}>
        <div className="lp-wrap bar">
          <Link href="/" className="brand">
            <LogoMark size={28} />
            <span className="brand-text">
              <span className="brand-wordmark">KarbonLens</span>
            </span>
          </Link>
          <LandingNav items={NAV} ariaLabel={t("Navigasi halaman", "Page navigation")} />
          <div className="right">
            <Toggles onDark={!solid && !menu} />
            {home ? (
              <Link href={home} className="btn primary hide-xs">{t("Buka aplikasi", "Open app")}</Link>
            ) : (
              <>
                <Link href="/login" className={`btn hide-xs ${solid || menu ? "ghost" : "on-dark"}`}>{t("Masuk", "Sign in")}</Link>
                <Link href="/register" className="btn accent hide-xs">{t("Daftarkan perusahaan", "Register company")}</Link>
              </>
            )}
            <button type="button" className={`btn icon mobile-toggle ${solid || menu ? "ghost" : "on-dark"}`} onClick={() => setMenu((m) => !m)}
              aria-expanded={menu} aria-label={menu ? t("Tutup menu", "Close menu") : t("Buka menu", "Open menu")}>
              {menu ? <IconX /> : <IconMenu />}
            </button>
          </div>
        </div>
      </header>
      {menu && (
        <div className="lp-mnav">
          {NAV.map(([href, label]) => <a key={href} href={href} onClick={() => setMenu(false)}>{label}</a>)}
          <div className="inline" style={{ marginTop: 8 }}>
            {home ? <Link href={home} className="btn primary block">{t("Buka aplikasi", "Open app")}</Link> : (
              <>
                <Link href="/login" className="btn secondary" style={{ flex: 1 }}>{t("Masuk", "Sign in")}</Link>
                <Link href="/register" className="btn primary" style={{ flex: 1 }}>{t("Daftar", "Register")}</Link>
              </>
            )}
          </div>
        </div>
      )}

      <main>
        <section className="w3-hero">
          <DotField />
          <div className="lp-wrap w3-hero-inner">
            <Link href="/verifikasi" className="w3-announce hero-title">
              <span className="tag">{t("Baru", "New")}</span>
              {t("Pernyataan emisi kini bisa dicek keasliannya", "Emission statements can now be verified")}
              <IconArrow size={14} />
            </Link>
            <h1 className="hero-title">
              {t("Emisi tertanam produk,", "Embedded product emissions,")}<br />
              <span className="dim">{t("dihitung dari dokumen Anda.", "calculated from your documents.")}</span>
            </h1>
            <p className="lead hero-text">{t(
              "Unggah tagihan PLN, faktur solar, rekap pupuk, dan manifest limbah. KarbonLens membaca angkanya, admin peninjau menyetujuinya, lalu emisi per ton CPO dan PKO dihitung dengan metodologi CBAM.",
              "Upload PLN bills, diesel invoices, fertiliser summaries and waste manifests. KarbonLens reads the figures, a reviewer approves them, and emissions per tonne of CPO and PKO are calculated with the CBAM methodology.",
            )}</p>
            <div className="w3-cta hero-ui">
              <Link href={home ?? "/register"} className="w3-btn primary">{home ? t("Buka aplikasi", "Open app") : t("Daftarkan perusahaan", "Register your company")}<IconArrow size={16} /></Link>
              <a href="#cara-kerja" className="w3-btn ghost"><span className="play" aria-hidden="true" />{t("Lihat cara kerja", "See how it works")}</a>
            </div>
          </div>
          <div className="lp-wrap w3-hero-shot hero-ui">
            <ProductWindow t={t} lang={lang} />
          </div>
        </section>

        <Ticker t={t} />

        <section className="lp-sec" id="cara-kerja">
          <div className="lp-wrap">
            <SecHead idx="01" label={t("Cara kerja", "How it works")}
              strong={t("Dokumen masuk satu per satu.", "Documents arrive one by one.")} dim={t("Emisinya dihitung sekaligus.", "Emissions are calculated at once.")}
              text={t("Empat tahap yang selalu berurutan. Setiap angka menyimpan jejak ke dokumen, halaman, dan posisi asalnya.",
                "Four stages, always in this order. Every figure keeps a trail to its document, page and position.")} />
            <Pipeline t={t} />
          </div>
        </section>

        <section className="lp-sec alt" id="pembacaan">
          <div className="lp-wrap">
            <SecHead idx="02" label={t("Pembacaan dokumen", "Document reading")}
              strong={t("Angka tidak pernah di tempat yang sama.", "Figures are never in the same place twice.")} dim={t("Mesin baca tetap menemukannya.", "The reader still finds them.")}
              text={t("Mesin baca memetakan posisi setiap kata, mencari label yang dikenalnya, lalu menilai kandidat angka di sekitarnya. Kandidat lain tetap disimpan agar bisa diganti dengan satu klik.",
                "The reader maps where every word sits, finds labels it knows, then scores the candidate figures around them. Other candidates are kept so you can switch with one click.")} />
            <div className="sec-ui">
              <Ways />
            </div>
          </div>
        </section>

        <section className="lp-sec" id="peran">
          <div className="lp-wrap">
            <SecHead idx="03" label={t("Peran", "Roles")}
              strong={t("Yang menyiapkan data", "Whoever prepares the data")} dim={t("tidak bisa menyetujuinya sendiri.", "cannot approve it themselves.")}
              text={t("Admin peninjau ditugaskan oleh pengelola sistem dan dapat menangani beberapa perusahaan sekaligus.",
                "Reviewers are assigned by the system administrator and can handle several companies at once.")} />
            <div className="roles sec-ui" data-ui="true">
              <article className="role">
                <span className="tag"><i>A</i>{t("Akun perusahaan", "Company account")}</span>
                <h3>{t("Menyiapkan dan mengajukan data", "Prepares and submits the data")}</h3>
                <p>{t("Didaftarkan sendiri oleh perusahaan dengan email perusahaan.", "Registered by the company itself with a company email.")}</p>
                <ul>
                  {[t("Mengisi profil, fasilitas, dan produk", "Fills in profile, facilities and products"),
                    t("Mengunggah 10 kategori dokumen", "Uploads the 10 document categories"),
                    t("Memeriksa hasil baca lalu mengajukan", "Checks the extracted figures, then submits"),
                    t("Menjalankan kalkulasi draf kapan saja", "Runs draft calculations at any time")].map((x) => <li key={x}><IconCheck size={16} /><span>{x}</span></li>)}
                </ul>
                <div className="foot">{t("Satu akun untuk setiap perusahaan. Data tidak terlihat oleh perusahaan lain.", "One account per company. Data is never visible to other companies.")}</div>
              </article>
              <article className="role dark">
                <DotField orbits={false} />
                <span className="tag"><i>B</i>{t("Admin peninjau", "Reviewer")}</span>
                <h3>{t("Menyetujui dan mengunci", "Approves and locks")}</h3>
                <p>{t("Dibuat oleh pengelola sistem, lalu ditugaskan ke perusahaan tertentu.", "Created by the system administrator, then assigned to specific companies.")}</p>
                <ul>
                  {[t("Melihat portofolio semua perusahaan yang ditinjau", "Sees a portfolio of every assigned company"),
                    t("Menyetujui atau mengembalikan dokumen dengan catatan", "Approves or returns documents with a note"),
                    t("Menyetujui faktor emisi yang dipakai", "Approves the emission factors used"),
                    t("Mengunci periode dan menerbitkan pernyataan final", "Locks the period and issues the final statement")].map((x) => <li key={x}><IconCheck size={16} /><span>{x}</span></li>)}
                </ul>
                <div className="foot">{t("Tidak bisa didaftarkan dari aplikasi, hanya lewat pengelola sistem.", "Cannot be registered from the app, only by the system administrator.")}</div>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-sec alt" id="dokumen">
          <div className="lp-wrap">
            <SecHead idx="04" label={t("Dokumen", "Documents")}
              strong={t("Sepuluh dokumen", "Ten documents")} dim={t("yang sudah dibuat perusahaan setiap bulan.", "your company already produces every month.")}
              text={t("Tidak perlu formulir baru. Sistem mengenali jenis dokumen dari isinya dan memberi tahu bila ada bulan yang belum terunggah.",
                "No new forms. The system recognises each document from its content and tells you when a month is missing.")} />
            <div className="doc-list sec-ui" data-ui="true">
              {DOCS(t).map(([name, reads, scope], i) => (
                <div key={name} className="doc-item">
                  <span className="no">{String(i + 1).padStart(2, "0")}</span>
                  <b>{name}</b>
                  <span className="reads">{reads}</span>
                  <span className="sc">{scope}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-sec">
          <div className="lp-wrap">
            <SecHead idx="05" label={t("Perhitungan", "Calculation")}
              strong={t("Dari setiap liter dan kWh", "From every litre and kWh")} dim={t("sampai ke setiap ton produk.", "to every tonne of product.")}
              text={t("Emisi dikelompokkan menjadi langsung, listrik, dan hulu, lalu dibagi ke produk menurut nilai jual atau massa. Arahkan kursor ke pita untuk melihat angkanya.",
                "Emissions are grouped into direct, electricity and upstream, then allocated to products by economic value or mass. Hover a ribbon to see its figures.")} />
            <div className="flow-card sec-ui" data-ui="true">
              <div className="inline" style={{ justifyContent: "space-between", marginBottom: 14 }}>
                <b>{t("Contoh pabrik kelapa sawit, periode 2025", "Example palm oil mill, period 2025")}</b>
                <GroupLegend />
              </div>
              <div className="only-wide"><EmissionFlow lines={lines} allocations={SAMPLE_ALLOCATIONS} height={420} /></div>
              <div className="only-narrow"><ContributionBars lines={lines} total={lines.reduce((s, l) => s + l.value_t, 0)} /></div>
              <div className="formula-strip">
                <span>{t("E = data aktivitas × faktor emisi × GWP", "E = activity data × emission factor × GWP")}</span>
                <span>{t("SEE = (E langsung + E hulu) × porsi ÷ ton produk + E listrik × porsi ÷ ton produk", "SEE = (E direct + E upstream) × share ÷ product tonnes + E electricity × share ÷ product tonnes")}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-sec w3-dark" id="keamanan">
          <DotField orbits={false} />
          <div className="lp-wrap">
            <SecHead idx="06" label={t("Keamanan & jejak audit", "Security & audit trail")}
              strong={t("26 dokumen masuk.", "26 documents in.")} dim={t("Satu pernyataan keluar.", "One statement out.")}
              text={t("Angka yang bisa dipertanggungjawabkan di depan auditor, karena setiap langkahnya tercatat.",
                "Figures you can defend in front of an auditor, because every step is on record.")} />
            <AuditPanels t={t} />
          </div>
        </section>

        <section className="lp-sec">
          <div className="lp-wrap">
            <div className="w3-final" data-ui="true">
              <DotField />
              <h2 className="sec-title">{t("Mulai dari dokumen periode lalu.", "Start with last period's documents.")} <span className="dim">{t("Hasil pertama di hari yang sama.", "First results the same day.")}</span></h2>
              <p className="sec-text">{t("Daftarkan perusahaan, tambahkan fasilitas dan produk, lalu unggah dokumen.", "Register your company, add facilities and products, then upload documents.")}</p>
              <div className="w3-cta sec-ui">
                <Link href={home ?? "/register"} className="w3-btn primary">{home ? t("Buka aplikasi", "Open app") : t("Daftarkan perusahaan", "Register your company")}<IconArrow size={16} /></Link>
                {!home && <Link href="/login" className="w3-btn ghost">{t("Masuk", "Sign in")}</Link>}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="cols">
            <div className="about">
              <Link href="/" className="brand">
                <LogoMark size={28} />
                <span className="brand-text">
                  <span className="brand-wordmark">KarbonLens</span>
                </span>
              </Link>
              <p>{t("Perhitungan emisi tertanam produk (CBAM) dari dokumen operasional perusahaan.", "Embedded product emissions (CBAM) calculated from operational company documents.")}</p>
            </div>
            <div>
              <h4>{t("Produk", "Product")}</h4>
              <ul>
                <li><a href="#cara-kerja">{t("Cara kerja", "How it works")}</a></li>
                <li><a href="#pembacaan">{t("Pembacaan dokumen", "Document reading")}</a></li>
                <li><a href="#dokumen">{t("Sepuluh dokumen", "Ten documents")}</a></li>
              </ul>
            </div>
            <div>
              <h4>{t("Akun", "Account")}</h4>
              <ul>
                <li><Link href="/login">{t("Masuk", "Sign in")}</Link></li>
                <li><Link href="/register">{t("Daftarkan perusahaan", "Register company")}</Link></li>
                <li><a href="#peran">{t("Tentang admin peninjau", "About reviewers")}</a></li>
              </ul>
            </div>
            <div>
              <h4>{t("Lainnya", "More")}</h4>
              <ul>
                <li><a href="#keamanan">{t("Keamanan", "Security")}</a></li>
                <li><button type="button" onClick={() => { replayIntro(); setForceIntro(true); setIntroKey((k) => k + 1); window.scrollTo({ top: 0 }); }}>{t("Putar ulang intro", "Replay intro")}</button></li>
              </ul>
            </div>
          </div>
          <div className="bottom">
            <span>© {new Date().getFullYear()} KarbonLens</span>
            <Toggles />
          </div>
        </div>
      </footer>
    </div>
  );
}
