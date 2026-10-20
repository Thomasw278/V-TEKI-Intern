"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { Contours } from "./Contours";

const KEY = "karbonlens.intro.seen";

/**
 * Film pembuka ±6,6 detik, diputar sekali per sesi browser:
 * tiga dokumen datang → sinar pemindai → angka ditandai → angka mengalir ke pusat →
 * cincin terbentuk dan menghitung SEE → nama aplikasi → tirai lingkaran membuka halaman.
 * Bisa dilewati (klik, Esc, Enter, tombol). Tidak diputar bila pengguna memilih gerak minim.
 */
export function Intro({ force = false, onDone }: { force?: boolean; onDone?: () => void }) {
  const t = useT();
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [count, setCount] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(KEY) === "1";
    } catch {
      seen = false;
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if ((force || !seen) && !reduced) setShow(true);
    else onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [force]);

  const finish = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    try {
      window.sessionStorage.setItem(KEY, "1");
    } catch {
      /* mode privat */
    }
    setShow(false);
    setLeaving(false);
    onDone?.();
  }, [onDone]);

  const skip = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    timers.current.push(window.setTimeout(finish, 560));
  }, [leaving, finish]);

  useEffect(() => {
    if (!show) return;
    document.body.style.overflow = "hidden";
    // penghitung SEE: 3,5 s → 4,6 s
    const start = performance.now() + 3500;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / 1100));
      setCount(1.006 * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    timers.current.push(window.setTimeout(finish, 6700));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [show, finish, skip]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  if (!show) return null;
  return (
    <div className={`intro ${leaving ? "leaving" : ""}`} onClick={skip} role="dialog" aria-label={t("Pembukaan KarbonLens", "KarbonLens intro")}>
      <Contours className="intro-contours" animate />
      <div className="intro-stage" aria-hidden="true">
        <div className="i-doc a">
          <span className="t">{t("Tagihan listrik", "Electricity bill")}</span>
          <span className="ln" style={{ width: "62%" }} />
          <span className="ln" style={{ width: "80%" }} />
          <span className="ln" style={{ width: "45%" }} />
          <span className="val"><span>{t("Pemakaian", "Usage")}</span><span>{t("198.400", "198,400")} kWh</span></span>
          <span className="ln" style={{ width: "70%" }} />
          <span className="ln" style={{ width: "55%" }} />
        </div>
        <div className="i-doc b">
          <span className="t">{t("Faktur BBM", "Fuel invoice")}</span>
          <span className="ln" style={{ width: "50%" }} />
          <span className="ln" style={{ width: "86%" }} />
          <span className="ln" style={{ width: "72%" }} />
          <span className="ln" style={{ width: "64%" }} />
          <span className="val"><span>Biosolar B40</span><span>{t("16.000", "16,000")} L</span></span>
          <span className="ln" style={{ width: "40%" }} />
        </div>
        <div className="i-doc c">
          <span className="t">{t("Laporan lab POME", "POME lab report")}</span>
          <span className="val"><span>Volume</span><span>{t("72.000", "72,000")} m³</span></span>
          <span className="ln" style={{ width: "76%" }} />
          <span className="ln" style={{ width: "58%" }} />
          <span className="ln" style={{ width: "84%" }} />
          <span className="ln" style={{ width: "48%" }} />
        </div>
        <div className="i-beam" />
        <span className="i-tag a">{t("198.400", "198,400")} kWh</span>
        <span className="i-tag b">{t("16.000", "16,000")} L</span>
        <span className="i-tag c">{t("72.000", "72,000")} m³</span>
        <div className="i-core">
          <svg viewBox="0 0 260 260">
            <circle cx="130" cy="130" r="120" fill="none" stroke="#26513B" strokeWidth="2" />
            <circle className="i-ring" cx="130" cy="130" r="120" fill="none" stroke="#C8F05A" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 130 130)" />
          </svg>
          <div>
            <div className="i-num">{count.toLocaleString(t("id-ID", "en-US"), { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</div>
            <div className="i-unit">{t("t CO₂e per ton produk", "t CO₂e per tonne of product")}</div>
          </div>
        </div>
        <div className="i-word">
          <b>KarbonLens</b>
          <span>{t("Emisi tertanam produk, dihitung dari dokumen Anda", "Embedded product emissions, calculated from your documents")}</span>
        </div>
      </div>
      <div className="i-caption" aria-hidden="true">
        <span>{t("Mengumpulkan dokumen operasional", "Collecting operational documents")}</span>
        <span>{t("Membaca angka di posisi mana pun", "Reading figures wherever they sit")}</span>
        <span>{t("Menghitung emisi per sumber", "Calculating emissions per source")}</span>
        <span>{t("Membagi ke setiap ton produk", "Allocating to every tonne of product")}</span>
      </div>
      <button type="button" className="btn on-dark sm i-skip" onClick={(e) => { e.stopPropagation(); skip(); }}>{t("Lewati intro", "Skip intro")}</button>
      <div className="i-progress" />
    </div>
  );
}

export function replayIntro() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* abaikan */
  }
}
