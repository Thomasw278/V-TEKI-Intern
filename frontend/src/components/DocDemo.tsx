"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";

type T = (id: string, en: string) => string;

/**
 * Demo di hero: tiga dokumen dengan tata letak berbeda dibaca bergantian.
 * Sinar pemindai lewat, angka yang diambil ditandai satu per satu, lalu hasilnya
 * muncul di panel kanan beserta cara angka itu ditemukan.
 */
type Field = { k: string; v: string; m: string; hl: string };
type Scene = { id: string; tab: string; skew?: boolean; note: string; paper: ReactNode; fields: Field[] };

const H = ({ id, on, skip, children }: { id: string; on: string[]; skip?: boolean; children: ReactNode }) => (
  <span className={`hl ${on.includes(id) ? "on" : ""} ${skip ? "skip" : ""}`}><span>{children}</span></span>
);

function scenes(on: string[], t: T): Scene[] {
  return [
    {
      id: "tabel", tab: t("Faktur bertabel", "Tabular invoice"),
      note: t("Baris subtotal dikenali dan tidak dihitung dua kali.", "The subtotal row is recognised and not counted twice."),
      fields: [
        { k: t("Baris 1 · Biosolar B40", "Row 1 · Biosolar B40"), v: t("12.000 L", "12,000 L"), m: t("kolom Qty", "Qty column"), hl: "r1" },
        { k: t("Baris 2 · Biosolar B40", "Row 2 · Biosolar B40"), v: t("4.000 L", "4,000 L"), m: t("kolom Qty", "Qty column"), hl: "r2" },
        { k: t("Penggunaan", "Usage"), v: t("Genset pabrik", "Mill genset"), m: t("keterangan di bawah", "note below"), hl: "use" },
      ],
      paper: (
        <>
          <div className="ttl">Faktur penjualan BBM</div>
          <div className="sub">PT Energi Sumatra Mandiri</div>
          <div className="boxes">
            <div className="box"><small>No. faktur</small><b>INV/0921</b></div>
            <div className="box"><small>Tanggal</small><b>14-10-2025</b></div>
            <div className="box"><small>Pelanggan</small><b>PKS Sei</b></div>
          </div>
          <table>
            <thead><tr><th>Uraian</th><th className="r">Qty</th><th>Sat.</th></tr></thead>
            <tbody>
              <tr><td>Biosolar B40 industri</td><td className="r"><H id="r1" on={on}>12.000</H></td><td>L</td></tr>
              <tr><td>Biosolar B40 industri</td><td className="r"><H id="r2" on={on}>4.000</H></td><td>L</td></tr>
              <tr><td><b>Subtotal</b></td><td className="r"><H id="sub" on={on} skip><b>16.000</b></H></td><td>L</td></tr>
            </tbody>
          </table>
          <div className="sk" style={{ width: "40%", marginTop: 12 }} />
          <div style={{ fontSize: 10.5, color: "#5d6b62" }}>Keterangan: <H id="use" on={on}>untuk genset pabrik</H></div>
        </>
      ),
    },
    {
      id: "atas", tab: t("Angka di atas label", "Figure above label"),
      note: t("Pada laporan ringkas angka sering ditulis besar di atas keterangannya.", "Summary reports often print the figure large, above its caption."),
      fields: [
        { k: t("Volume BBM", "Fuel volume"), v: t("1.533.400 L", "1,533,400 L"), m: t("nilai di atas label", "value above label"), hl: "vol" },
        { k: t("Jenis BBM", "Fuel type"), v: "Biosolar B40", m: t("label kiri", "left label"), hl: "type" },
      ],
      paper: (
        <>
          <div className="ttl">Ringkasan konsumsi energi 2025</div>
          <div className="sub">Divisi pabrik · disusun bagian teknik</div>
          <div className="sk" style={{ width: "86%" }} /><div className="sk" style={{ width: "70%" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "14px 0" }}>
            <div style={{ border: "1px solid #d7ded4", borderRadius: 6, padding: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}><H id="vol" on={on}>1.533.400</H></div>
              <div style={{ fontSize: 10, color: "#7a887f" }}>Total liter bahan bakar setahun</div>
            </div>
            <div style={{ border: "1px solid #d7ded4", borderRadius: 6, padding: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>312</div>
              <div style={{ fontSize: 10, color: "#7a887f" }}>Hari operasi</div>
            </div>
          </div>
          <div style={{ fontSize: 10.5 }}>Jenis bahan bakar: <H id="type" on={on}>Biosolar B40</H></div>
          <div className="sk" style={{ width: "60%", marginTop: 10 }} /><div className="sk" style={{ width: "76%" }} />
        </>
      ),
    },
    {
      id: "scan", tab: t("Scan miring", "Skewed scan"), skew: true,
      note: t("Halaman hasil scan diluruskan dulu, lalu dibaca dengan OCR.", "Scanned pages are straightened first, then read with OCR."),
      fields: [
        { k: t("kWh dibeli", "kWh purchased"), v: t("198.400 kWh", "198,400 kWh"), m: t("LWBP + WBP di bawah label", "LWBP + WBP below label"), hl: "kwh" },
        { k: t("Bulan tagihan", "Billing month"), v: t("Agustus 2025", "August 2025"), m: t("label periode", "period label"), hl: "bln" },
      ],
      paper: (
        <>
          <div className="ttl">Tagihan listrik</div>
          <div className="sub">ID pelanggan 5123 4567 8901 · Tarif I-3/TM</div>
          <div className="boxes">
            <div className="box"><small>Periode</small><b><H id="bln" on={on}>Agustus 2025</H></b></div>
            <div className="box"><small>Daya</small><b>1.110 kVA</b></div>
            <div className="box"><small>Faktor kali</small><b>800</b></div>
          </div>
          <div className="sk" style={{ width: "80%" }} /><div className="sk" style={{ width: "64%" }} />
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Pemakaian</th><th className="r">LWBP</th><th className="r">WBP</th></tr></thead>
            <tbody><tr><td>kWh</td><td className="r"><H id="kwh" on={on}>165.300</H></td><td className="r"><H id="kwh" on={on}>33.100</H></td></tr></tbody>
          </table>
          <div className="sk" style={{ width: "50%", marginTop: 12 }} />
        </>
      ),
    },
  ];
}

const ORDER: Record<string, string[]> = { tabel: ["r1", "r2", "sub", "use"], atas: ["vol", "type"], scan: ["bln", "kwh"] };

export function DocDemo() {
  const t = useT();
  const [idx, setIdx] = useState(0);
  const [on, setOn] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const ids = ["tabel", "atas", "scan"];
  const id = ids[idx];

  useEffect(() => {
    setOn([]);
    const steps = ORDER[id];
    const ts = steps.map((s, i) => window.setTimeout(() => setOn((x) => [...x, s]), 1500 + i * 650));
    return () => ts.forEach(window.clearTimeout);
  }, [id]);

  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => setIdx((i) => (i + 1) % ids.length), 6000);
    return () => window.clearTimeout(t);
  }, [idx, paused, ids.length]);

  const sc = scenes(on, t)[idx];
  return (
    <div className="demo" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="demo-tabs" role="group" aria-label={t("Contoh tata letak dokumen", "Sample document layouts")}>
        {scenes([], t).map((s, i) => (
          <button type="button" key={s.id} aria-pressed={i === idx} onClick={() => setIdx(i)}>
            {s.tab}
            {i === idx && !paused && <span className="prog" key={`p${idx}`} />}
          </button>
        ))}
      </div>
      <div className="demo-body">
        <div className="demo-paper-wrap">
          <div key={sc.id} className="demo-beam" />
          <div className={`demo-paper ${sc.skew ? "skew" : ""}`} key={`p-${sc.id}`}>{sc.paper}</div>
        </div>
        <div className="demo-out" aria-live="polite">
          <h3>{t("Hasil pembacaan", "Extraction result")} <span className="badge ok" style={{ fontSize: 11 }}>{on.length ? t("terbaca", "read") : t("membaca", "reading")}</span></h3>
          {sc.fields.map((f) => (
            <div key={f.k} className={`demo-field ${on.includes(f.hl) ? "on" : ""}`}>
              <span className="k">{f.k}</span>
              <span className="v">{f.v}</span>
              <span className="m">{f.m}</span>
            </div>
          ))}
          <p className="demo-note">{sc.note}</p>
        </div>
      </div>
    </div>
  );
}
