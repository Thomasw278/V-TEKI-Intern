"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ContributionBars, EmissionFlow, GroupLegend } from "@/components/charts";
import { Contours } from "@/components/Contours";
import { DocDemo } from "@/components/DocDemo";
import { IconArrow, IconCheck, IconHistory, IconLock, IconMenu, IconShield, IconX, LogoMark } from "@/components/Icons";
import { Intro, replayIntro } from "@/components/Intro";
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
      document.querySelectorAll(".lp-sec, .lp-standards, .lp-cta").forEach((el) => el.classList.add("in-view"));
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

    document.querySelectorAll(".lp-sec, .lp-standards, .lp-cta").forEach((el) => observer.observe(el));

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
              <span className="brand-badge">AUDIT OS</span>
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
        <section className="lp-hero">
          <Contours className="contours" rings={10} />
          <div className="lp-wrap">
            <div className="grid">
              <div>
                <span className="kicker hero-title"><b>CBAM</b>{t("Untuk eksportir ke Uni Eropa", "For exporters to the European Union")}</span>
                <h1 className="hero-title">{t("Emisi tertanam produk, dihitung dari dokumen yang sudah ada di meja Anda.", "Embedded product emissions, calculated from the documents already on your desk.")}</h1>
                <p className="lead hero-text">{t(
                  "Unggah tagihan PLN, faktur solar, rekap pupuk, dan manifest limbah. KarbonLens membaca angkanya di posisi mana pun, admin peninjau menyetujuinya, lalu emisi per ton CPO dan PKO dihitung dengan metodologi CBAM.",
                  "Upload PLN bills, diesel invoices, fertiliser summaries and waste manifests. KarbonLens reads the figures wherever they sit, a reviewer approves them, and emissions per tonne of CPO and PKO are calculated with the CBAM methodology.",
                )}</p>
                <div className="cta hero-ui">
                  <Link href={home ?? "/register"} className="btn accent lg">{home ? t("Buka aplikasi", "Open app") : t("Daftarkan perusahaan", "Register your company")}<IconArrow size={17} /></Link>
                  <a href="#cara-kerja" className="btn on-dark lg">{t("Lihat cara kerja", "See how it works")}</a>
                </div>
              </div>
              <div className="hero-ui">
                <DocDemo />
              </div>
            </div>
            <div className="stats hero-ui">
              <div><b>10</b><span>{t("kategori dokumen operasional yang dibaca", "operational document categories read")}</span></div>
              <div><b>6</b><span>{t("strategi mencari angka: kanan, bawah, atas, tabel, matriks, satuan", "ways to locate a figure: right, below, above, table, matrix, unit")}</span></div>
              <div><b>2</b><span>{t("peran terpisah: perusahaan mengajukan, admin menyetujui", "separate roles: the company submits, the reviewer approves")}</span></div>
              <div><b>t CO₂e/t</b><span>{t("emisi tertanam spesifik untuk setiap produk", "specific embedded emissions for every product")}</span></div>
            </div>
          </div>
        </section>

        <section className="lp-standards" aria-label={t("Rujukan metodologi", "Methodology references")}>
          <div className="lp-wrap">
            <span className="t">{t("Mengikuti rujukan", "Built on")}</span>
            <ul>
              <li>CBAM<small>(EU) 2023/956</small></li>
              <li>{t("Regulasi pelaksana", "Implementing Reg.")}<small>(EU) 2023/1773</small></li>
              <li>IPCC<small>2006 · 2019 Refinement</small></li>
              <li>GWP<small>AR5 · AR6</small></li>
              <li>GHG Protocol<small>Scope 1 · 2 · 3</small></li>
            </ul>
          </div>
        </section>

        <section className="lp-sec" id="cara-kerja">
          <div className="lp-wrap">
            <div className="head">
              <div className="sec-title">
                <div className="label">{t("Cara kerja", "How it works")}</div>
                <h2>{t("Dari tumpukan dokumen ke laporan yang bisa diaudit.", "From a pile of documents to an auditable report.")}</h2>
              </div>
              <p className="sec-text">{t(
                "Empat tahap yang selalu berurutan. Setiap angka menyimpan jejak ke dokumen, halaman, dan posisi asalnya, jadi peninjau dan auditor bisa memeriksa ulang kapan saja.",
                "Four stages, always in this order. Every figure keeps a trail to its document, page and position, so reviewers and auditors can check it again at any time.",
              )}</p>
            </div>
            <ol className="steps4 sec-ui" data-ui="true">
              <li>
                <span className="n">01</span>
                <b>{t("Unggah dokumen", "Upload documents")}</b>
                <p>{t("PDF, hasil scan, foto, Excel, CSV, atau Word. Kategori dikenali otomatis dari isi dan nama berkas.", "PDF, scans, photos, Excel, CSV or Word. The category is detected from the content and file name.")}</p>
                <span className="who"><IconCheck size={14} />{t("Perusahaan", "Company")}</span>
              </li>
              <li>
                <span className="n">02</span>
                <b>{t("Dibaca otomatis", "Read automatically")}</b>
                <p>{t("Watermark dibuang, scan diluruskan, angka dicari di kanan, bawah, atas label, maupun di tabel.", "Watermarks are removed, scans straightened, and figures found right of, below or above labels, or in tables.")}</p>
                <span className="who"><IconCheck size={14} />{t("Sistem", "System")}</span>
              </li>
              <li>
                <span className="n">03</span>
                <b>{t("Diperiksa & disetujui", "Checked & approved")}</b>
                <p>{t("Perusahaan memastikan angka lalu mengajukan. Admin peninjau menyetujui atau mengembalikan dengan catatan.", "The company confirms the figures and submits. The reviewer approves or returns them with a note.")}</p>
                <span className="who"><IconCheck size={14} />{t("Perusahaan → admin", "Company → reviewer")}</span>
              </li>
              <li>
                <span className="n">04</span>
                <b>{t("Dihitung & dikunci", "Calculated & locked")}</b>
                <p>{t("Emisi per sumber dibagi ke setiap ton produk. Admin mengunci periode, laporan XLSX dan XML siap diunduh.", "Emissions per source are allocated to each tonne of product. The reviewer locks the period; XLSX and XML reports are ready.")}</p>
                <span className="who"><IconCheck size={14} />{t("Admin peninjau", "Reviewer")}</span>
              </li>
            </ol>
          </div>
        </section>

        <section className="lp-sec alt" id="pembacaan">
          <div className="lp-wrap">
            <div className="head">
              <div className="sec-title">
                <div className="label">{t("Pembacaan dokumen", "Document reading")}</div>
                <h2>{t("Angka tidak selalu berada di tempat yang sama.", "Figures are never in the same place twice.")}</h2>
              </div>
              <p className="sec-text">{t(
                "Setiap pemasok punya format sendiri. Mesin baca memetakan posisi setiap kata, mencari label yang dikenalnya, lalu menilai kandidat angka di sekitarnya. Kandidat lain tetap disimpan agar Anda bisa menggantinya dengan satu klik.",
                "Every supplier has its own format. The reader maps where every word sits, finds labels it knows, then scores the candidate figures around them. Other candidates are kept so you can switch with one click.",
              )}</p>
            </div>
            <div className="sec-ui">
              <Ways />
            </div>
          </div>
        </section>

        <section className="lp-sec" id="peran">
          <div className="lp-wrap">
            <div className="head">
              <div className="sec-title">
                <div className="label">{t("Peran", "Roles")}</div>
                <h2>{t("Dua peran, satu alur yang tidak bisa dilompati.", "Two roles, one flow that can't be skipped.")}</h2>
              </div>
              <p className="sec-text">{t(
                "Perusahaan yang menyiapkan data tidak bisa menyetujui datanya sendiri. Admin peninjau ditugaskan oleh pengelola sistem dan dapat menangani beberapa perusahaan sekaligus.",
                "The company that prepares the data cannot approve its own data. Reviewers are assigned by the system administrator and can handle several companies at once.",
              )}</p>
            </div>
            <div className="roles sec-ui" data-ui="true">
              <article className="role">
                <span className="tag">{t("Akun perusahaan", "Company account")}</span>
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
                <Contours className="contours" rings={6} />
                <span className="tag">{t("Admin peninjau", "Reviewer")}</span>
                <h3>{t("Menyetujui dan mengunci", "Approves and locks")}</h3>
                <p>{t("Dibuat oleh pengelola sistem, lalu ditugaskan ke perusahaan tertentu.", "Created by the system administrator, then assigned to specific companies.")}</p>
                <ul>
                  {[t("Melihat portofolio semua perusahaan yang ditinjau", "Sees a portfolio of every assigned company"),
                    t("Menyetujui atau mengembalikan dokumen dengan catatan", "Approves or returns documents with a note"),
                    t("Menyetujui faktor emisi yang dipakai", "Approves the emission factors used"),
                    t("Mengunci periode dan menerbitkan laporan final", "Locks the period and issues the final report")].map((x) => <li key={x}><IconCheck size={16} /><span>{x}</span></li>)}
                </ul>
                <div className="foot">{t("Tidak bisa didaftarkan dari aplikasi — hanya lewat pengelola sistem.", "Cannot be registered from the app — only by the system administrator.")}</div>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-sec alt" id="dokumen">
          <div className="lp-wrap">
            <div className="head">
              <div className="sec-title">
                <div className="label">{t("Dokumen", "Documents")}</div>
                <h2>{t("Sepuluh dokumen yang sudah dibuat perusahaan setiap bulan.", "Ten documents your company already produces every month.")}</h2>
              </div>
              <p className="sec-text">{t(
                "Tidak perlu formulir baru. Sistem mengenali jenis dokumen dari isinya, mengambil hanya angka yang dipakai rumus, dan memberi tahu bila ada bulan yang belum terunggah.",
                "No new forms. The system recognises each document from its content, takes only the figures the formulas need, and tells you when a month is missing.",
              )}</p>
            </div>
            <div className="doc-list sec-ui" data-ui="true">
              {DOCS(t).map(([name, reads, scope], i) => (
                <div key={name} className="doc-item">
                  <span className="no">{String(i + 1).padStart(2, "0")}</span>
                  <b>{name}</b>
                  <span className="reads">{reads}</span>
                  <span className="sc badge">{scope}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-sec">
          <div className="lp-wrap">
            <div className="head">
              <div className="sec-title">
                <div className="label">{t("Perhitungan", "Calculation")}</div>
                <h2>{t("Dari setiap liter dan kilowatt-jam sampai ke setiap ton produk.", "From every litre and kilowatt-hour to every tonne of product.")}</h2>
              </div>
              <p className="sec-text">{t(
                "Emisi dikelompokkan menjadi langsung, listrik, dan hulu, lalu dibagi ke produk menurut nilai jual atau massa. Arahkan kursor ke pita untuk melihat angkanya.",
                "Emissions are grouped into direct, electricity and upstream, then allocated to products by economic value or mass. Hover a ribbon to see its figures.",
              )}</p>
            </div>
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

        <section className="lp-sec alt" id="keamanan">
          <div className="lp-wrap">
            <div className="head">
              <div className="sec-title">
                <div className="label">{t("Keamanan & jejak audit", "Security & audit trail")}</div>
                <h2>{t("Angka yang bisa dipertanggungjawabkan di depan auditor.", "Figures you can defend in front of an auditor.")}</h2>
              </div>
            </div>
            <div className="trust sec-ui" data-ui="true">
              <div>
                <IconHistory size={22} />
                <b>{t("Setiap angka punya asal", "Every figure has an origin")}</b>
                <p>{t("Klik angka mana pun untuk melihat kotak sumbernya di halaman dokumen. Koreksi tercatat beserta alasan dan pelakunya.", "Click any figure to see its source box on the document page. Corrections are logged with the reason and who made them.")}</p>
              </div>
              <div>
                <IconShield size={22} />
                <b>{t("Data tiap perusahaan terpisah", "Each company's data is isolated")}</b>
                <p>{t("Setiap permintaan diperiksa terhadap perusahaan pemilik data. Admin hanya melihat perusahaan yang ditugaskan kepadanya.", "Every request is checked against the company that owns the data. Reviewers only see the companies assigned to them.")}</p>
              </div>
              <div>
                <IconLock size={22} />
                <b>{t("Dikunci setelah ditinjau", "Locked after review")}</b>
                <p>{t("Periode yang dikunci tidak bisa diubah. Perubahan setelahnya menjadi revisi baru dengan nomor versi.", "A locked period cannot change. Later changes become a new, numbered revision.")}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-sec">
          <div className="lp-wrap">
            <div className="lp-cta" data-ui="true">
              <Contours className="contours" rings={7} />
              <div>
                <h2 className="sec-title">{t("Mulai dari dokumen periode lalu.", "Start with last period's documents.")}</h2>
                <p className="sec-text">{t("Daftarkan perusahaan, tambahkan fasilitas dan produk, lalu unggah dokumen. Hasil pertama biasanya terlihat di hari yang sama.",
                  "Register your company, add facilities and products, then upload documents. The first result usually shows up the same day.")}</p>
              </div>
              <div className="cta sec-ui">
                <Link href={home ?? "/register"} className="btn accent lg">{home ? t("Buka aplikasi", "Open app") : t("Daftarkan perusahaan", "Register your company")}</Link>
                {!home && <Link href="/login" className="btn on-dark lg">{t("Masuk", "Sign in")}</Link>}
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
                  <span className="brand-badge">AUDIT OS</span>
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
            <span>© {new Date().getFullYear()} KarbonLens AUDIT OS</span>
            <Toggles />
          </div>
        </div>
      </footer>
    </div>
  );
}
