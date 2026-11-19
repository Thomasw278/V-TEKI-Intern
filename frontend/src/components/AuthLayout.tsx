"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { DotField } from "./LandingParts";
import { Brand, Toggles } from "./ui";

/** Kerangka halaman masuk & daftar: panel merek di kiri (desktop), formulir di kanan. */
export function AuthLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const t = useT();
  return (
    <div className="auth">
      <aside className="auth-side">
        <DotField />
        <Link href="/" className="brand" style={{ color: "var(--band-ink)" }}><Brand size={28} /></Link>
        <div className="quote">
          <span className="w3-label"><i>CBAM</i>{t("Emisi tertanam produk", "Embedded product emissions")}</span>
          <h2>{t("Setiap angka emisi", "Every emission figure")} <span className="dim">{t("bisa ditunjukkan asalnya.", "can show where it came from.")}</span></h2>
          <p>{t(
            "Perusahaan mengunggah dokumen operasional, sistem membaca angkanya, dan admin peninjau menyetujui sebelum laporan CBAM dikunci.",
            "Companies upload operational documents, the system reads the figures, and an assigned reviewer approves them before the CBAM report is locked.",
          )}</p>
          <div className="facts">
            <div><b>10</b><span>{t("kategori dokumen", "document categories")}</span></div>
            <div><b>3</b><span>{t("peran: perusahaan, peninjau, pengelola", "roles: company, reviewer, administrator")}</span></div>
            <div><b>AR5/6</b><span>{t("set GWP IPCC", "IPCC GWP sets")}</span></div>
          </div>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-top">
          <Link href="/" className="brand"><Brand size={26} /></Link>
          <Toggles />
        </div>
        <div className="auth-body"><div className={`auth-card ${wide ? "wide" : ""} anim-rise`}>{children}</div></div>
        <p className="auth-foot">© {new Date().getFullYear()} KarbonLens · {t("Data setiap perusahaan terpisah dan terenkripsi saat dikirim.", "Each company's data is isolated and encrypted in transit.")}</p>
      </main>
    </div>
  );
}
