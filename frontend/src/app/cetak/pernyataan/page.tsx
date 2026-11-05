"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { IconBack, IconDownload } from "@/components/Icons";
import { StatementDocument } from "@/components/Statement";
import { Button, ErrorBox, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { StatementData } from "@/lib/types";

/** Lebar lembar A4 dalam piksel CSS (210 mm). */
const A4_PX = 793.7;

/**
 * Lembar pernyataan siap cetak, tanpa kerangka aplikasi.
 * ?periode=<id>  periode yang dicetak
 * ?embed=1       dipakai sebagai pratinjau di halaman /pernyataan (tanpa bilah alat; tinggi dikirim ke induk)
 */
export default function PrintStatementPage() {
  return (
    <Suspense fallback={<div className="sd-state"><Spinner /></div>}>
      <PrintStatement />
    </Suspense>
  );
}

function PrintStatement() {
  const t = useT();
  const sp = useSearchParams();
  const periodId = Number(sp.get("periode")) || null;
  const embed = sp.get("embed") === "1";
  const autoPrint = sp.get("cetak") === "1";
  const { ready, user, period, epoch } = useSession();
  const id = periodId ?? period?.id ?? null;
  const [data, setData] = useState<StatementData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [zoom, setZoom] = useState(1);
  const [laidOut, setLaidOut] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    api<StatementData>(`/api/periods/${id}/statement`).then(setData).catch(setError);
  }, [id]);

  useEffect(() => {
    if (ready && user) load();
  }, [ready, user, load, epoch]);

  // perkecil lembar di layar sempit (cetak selalu 100%)
  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - (embed ? 24 : 32)) / A4_PX));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [embed]);

  // nama berkas PDF bawaan browser mengikuti judul dokumen
  useEffect(() => {
    if (!data) return;
    const prev = document.title;
    document.title = `${t("Pernyataan Emisi Tertanam", "Embedded Emissions Statement")} - ${data.company.name} - ${data.period.year} R${data.period.revision}${data.status === "draft" ? ` (${t("DRAF", "DRAFT")})` : ""}`;
    return () => { document.title = prev; };
  }, [data, t]);

  // pratinjau tertanam: beri tahu halaman induk tinggi konten & kesiapan cetak
  useEffect(() => {
    if (!embed || !laidOut) return;
    const post = () => window.parent?.postMessage({ type: "karbonlens:statement", height: document.documentElement.scrollHeight, ready: true }, window.location.origin);
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [embed, laidOut, zoom]);

  useEffect(() => {
    if (autoPrint && laidOut) {
      const h = window.setTimeout(() => window.print(), 300);
      return () => window.clearTimeout(h);
    }
  }, [autoPrint, laidOut]);

  if (!ready) return <div className="sd-state"><Spinner /></div>;
  if (!user) {
    return (
      <div className="sd-state">
        <div className="stack" style={{ alignItems: "center" }}>
          <p>{t("Masuk terlebih dulu untuk membuka pernyataan.", "Sign in first to open the statement.")}</p>
          <Link href="/login" className="btn primary">{t("Masuk", "Sign in")}</Link>
        </div>
      </div>
    );
  }
  if (!id) return <div className="sd-state"><p>{t("Periode pelaporan tidak ditemukan.", "Reporting period not found.")}</p></div>;
  if (error) return <div className="sd-state"><div style={{ maxWidth: 520, width: "100%" }}><ErrorBox error={error} onRetry={load} /></div></div>;
  if (!data) return <div className="sd-state"><Spinner /></div>;

  return (
    <div className={`sd-canvas ${embed ? "embed" : ""}`} style={{ ["--sd-zoom" as string]: zoom }}>
      {!embed && (
        <div className="sd-toolbar">
          <div className="inline" style={{ gap: 10, minWidth: 0 }}>
            <Link href="/pernyataan" className="btn ghost icon" aria-label={t("Kembali", "Back")}><IconBack size={18} /></Link>
            <div className="t">
              <b>{data.company.name} · {data.number}</b>
              <span>{data.status === "final" ? t("Final · siap dicetak", "Final · ready to print") : t("Draf · belum dikunci", "Draft · not locked")}</span>
            </div>
          </div>
          <Button variant="primary" onClick={() => window.print()} disabled={!laidOut}>
            <IconDownload size={16} />{t("Cetak / simpan PDF", "Print / save as PDF")}
          </Button>
        </div>
      )}
      <StatementDocument data={data} origin={window.location.origin} onLayout={() => setLaidOut(true)} />
    </div>
  );
}
