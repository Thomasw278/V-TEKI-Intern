"use client";

import { useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";

type T = (id: string, en: string) => string;

/** Peragaan strategi pembacaan: posisi label dan angka yang berbeda-beda di dokumen nyata. */
type Way = { id: string; title: string; desc: string; why: string[]; doc: ReactNode };

const L = ({ children }: { children: ReactNode }) => <span className="hl on skip"><span>{children}</span></span>;
const V = ({ children }: { children: ReactNode }) => <span className="hl on"><span><b>{children}</b></span></span>;

const ways = (t: T): Way[] => [
  {
    id: "kanan", title: t("Angka di kanan label", "Figure right of the label"),
    desc: t("Bentuk paling umum: keterangan di kiri, nilai di ujung baris, kadang dipisah titik-titik.", "The most common form: caption on the left, value at the end of the line, sometimes joined by dots."),
    why: [t("Satu baris dengan label “Volume”", "Same line as the “Volume” label"), t("Satuan liter cocok dengan field", "The litre unit matches the field"), t("Nilai wajar untuk satu faktur", "A plausible value for one invoice")],
    doc: (<>
      <div className="rowx"><span className="lbl">No. faktur</span><span>INV/SOL/0921</span></div>
      <div className="rowx"><span className="lbl">Jenis BBM</span><span>Biosolar B40</span></div>
      <div className="rowx"><L>Volume diserahkan</L><span style={{ flex: 1, borderBottom: "1px dotted #b7c3ba", margin: "0 8px 4px" }} /><V>16.000 L</V></div>
      <div className="rowx"><span className="lbl">Harga satuan</span><span>Rp [HARGA]</span></div>
    </>),
  },
  {
    id: "bawah", title: t("Angka di bawah label", "Figure below the label"),
    desc: t("Formulir dan tagihan sering menaruh judul kolom di atas, nilainya di baris berikutnya.", "Forms and bills often put the column title on top and the value on the next line."),
    why: [t("Label tepat di atas, kolom sejajar", "Label directly above, same column"), t("Angka di kolom sebelah diabaikan", "Figures in neighbouring columns are ignored"), t("Satuan kWh ada di judul kolom", "The kWh unit comes from the column title")],
    doc: (<>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div><div className="lbl">Stand awal</div><div>1.204.880</div></div>
        <div><div className="lbl">Stand akhir</div><div>1.205.128</div></div>
        <div><L>Pemakaian (kWh)</L><div style={{ marginTop: 6 }}><V>198.400</V></div></div>
      </div>
      <div className="rowx" style={{ marginTop: 10 }}><span className="lbl">Faktor kali</span><span>800</span></div>
    </>),
  },
  {
    id: "atas", title: t("Angka di atas label", "Figure above the label"),
    desc: t("Laporan ringkas menulis angka besar lebih dulu, keterangannya kecil di bawah.", "Summary reports print the big figure first and a small caption below."),
    why: [t("Keterangan tepat di bawah angka", "Caption directly below the figure"), t("Angka paling menonjol di blok itu", "The most prominent figure in that block"), t("Satuan diwarisi dari keterangan", "Unit inherited from the caption")],
    doc: (<>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ border: "1px solid #e2e7df", borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 20 }}><V>72.000</V></div><L>Volume POME (m³) setahun</L>
        </div>
        <div style={{ border: "1px solid #e2e7df", borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>3</div><div className="lbl">Kolam anaerob</div>
        </div>
      </div>
    </>),
  },
  {
    id: "tabel", title: t("Tabel dengan banyak baris", "Tables with many rows"),
    desc: t("Setiap baris jadi data tersendiri. Baris jumlah dikenali agar tidak dihitung dua kali.", "Every row becomes its own record. Total rows are recognised so nothing is counted twice."),
    why: [t("Judul kolom dikenali: Jenis, Massa, Kadar N", "Column titles recognised: Type, Mass, N content"), t("Tiga baris pupuk diambil terpisah", "Three fertiliser rows read separately"), t("Baris “Jumlah” dilewati", "The “Jumlah” (total) row is skipped")],
    doc: (<>
      <div className="rowx"><L>Jenis pupuk</L><L>Massa (kg)</L><L>N %</L></div>
      <div className="rowx"><span>NPK 15-15-6-4</span><V>42.500</V><V>15</V></div>
      <div className="rowx"><span>Urea</span><V>18.000</V><V>46</V></div>
      <div className="rowx"><span>MOP</span><V>10.000</V><V>0</V></div>
      <div className="rowx" style={{ color: "#7a887f" }}><b>Jumlah</b><b>70.500</b><span /></div>
    </>),
  },
  {
    id: "jumlah", title: t("Dijumlahkan dari beberapa bagian", "Added up from several parts"),
    desc: t("Tagihan PLN memisah pemakaian luar waktu beban puncak (LWBP) dan waktu beban puncak (WBP).", "PLN bills split off-peak (LWBP) and peak (WBP) usage."),
    why: [t("LWBP dan WBP ditemukan dalam satu tagihan", "LWBP and WBP found in the same bill"), t("Keduanya dijumlah: 165.300 + 33.100", "Both are added: 165,300 + 33,100"), t("Dicocokkan dengan baris TOTAL bila ada", "Checked against the TOTAL row when present")],
    doc: (<>
      <div className="rowx"><span className="lbl">Periode</span><span>Agustus 2025</span></div>
      <div className="rowx"><L>LWBP</L><V>165.300 kWh</V></div>
      <div className="rowx"><L>WBP</L><V>33.100 kWh</V></div>
      <div className="rowx"><span className="lbl">kVArh</span><span>12.040</span></div>
    </>),
  },
  {
    id: "scan", title: t("Scan miring atau terbalik", "Skewed or upside-down scans"),
    desc: t("Halaman diputar dan diluruskan otomatis, lalu dibaca OCR. Salah baca umum seperti O jadi 0 dikoreksi.", "Pages are rotated and straightened automatically, then read with OCR. Common misreads such as O for 0 are corrected."),
    why: [t("Kemiringan 3° diluruskan", "3° skew straightened"), t("OCR bahasa Indonesia + Inggris", "Indonesian + English OCR"), t("“8.0OO” dibaca sebagai 8.000", "“8.0OO” is read as 8,000")],
    doc: (<div style={{ transform: "rotate(-3deg)" }}>
      <div className="rowx"><span className="lbl">Surat jalan</span><span>SJ-118/X</span></div>
      <div className="rowx"><L>Jumlah solar</L><V>8.0OO liter</V></div>
      <div className="rowx"><span className="lbl">Untuk</span><span>Genset</span></div>
    </div>),
  },
  {
    id: "watermark", title: t("Watermark & sel terbungkus", "Watermarks & wrapped cells"),
    desc: t("Huruf watermark diagonal (mis. SINTETIS, COPY) dibuang sebelum dibaca. Nama yang terbungkus dua baris di tabel digabung kembali.",
      "Diagonal watermark letters (e.g. SINTETIS, COPY) are removed before reading. Names wrapped over two table lines are joined back."),
    why: [t("Huruf diagonal & pucat tidak masuk ke baris tabel", "Diagonal, faint letters never leak into table rows"),
      t("“…Oli & Bahan” + “Kimia)” digabung jadi satu nama", "“…Oli & Bahan” + “Kimia)” joined into one name"),
      t("Total 2.761 kg dicocokkan dengan jumlah baris", "The 2,761 kg total is checked against the rows")],
    doc: (<div style={{ position: "relative" }}>
      <span aria-hidden="true" style={{ position: "absolute", left: "18%", top: "18%", fontSize: 44, fontWeight: 800, color: "#e8ece6", transform: "rotate(-32deg)", letterSpacing: 4, textDecoration: "line-through", textDecorationColor: "#c23b2b" }}>SINTETIS</span>
      <div className="rowx" style={{ position: "relative" }}><L>Jenis limbah B3</L><L>Jumlah (kg)</L></div>
      <div className="rowx" style={{ position: "relative" }}><span>Oli bekas</span><V>1.506</V></div>
      <div className="rowx" style={{ position: "relative", alignItems: "center" }}><V>Kemasan bekas B3 (Jerigen/Drum Oli & Bahan Kimia)</V><V>213</V></div>
      <div className="rowx" style={{ position: "relative", color: "#7a887f" }}><b>TOTAL</b><b>2.761</b></div>
    </div>),
  },
];

export function Ways() {
  const t = useT();
  const [sel, setSel] = useState(0);
  const WAYS = ways(t);
  const w = WAYS[sel];
  return (
    <div className="ways">
      <div className="way-list" role="group" aria-label={t("Cara angka ditemukan", "How figures are found")}>
        {WAYS.map((x, i) => (
          <button type="button" key={x.id} className="way" aria-pressed={i === sel} onClick={() => setSel(i)}>
            <b>{x.title}</b>
            <span>{x.desc}</span>
          </button>
        ))}
      </div>
      <div className="way-stage">
        <div className="mini" key={w.id}>
          {w.doc}
          <div className="why">
            <span className="tiny" style={{ color: "#5d6c64" }}>{t("Mengapa angka ini yang dipilih", "Why this figure was chosen")}</span>
            {w.why.map((y) => <span key={y} className="why-item">{y}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
