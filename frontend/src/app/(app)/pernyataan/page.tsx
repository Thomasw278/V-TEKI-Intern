"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconArrow, IconCheck, IconDownload, IconEye, IconLock, IconReport, IconShield, IconWarn } from "@/components/Icons";
import { Badge, Button, Empty, ErrorBox, Loading, PageHead, useLoad, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { longDate, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { StatementData } from "@/lib/types";

/** Pernyataan Hasil Perhitungan Emisi Tertanam: pratinjau lembar A4, status, dan cetak/simpan PDF. */
export default function StatementPage() {
  const t = useT();
  const toast = useToast();
  const { period, isAdmin, epoch } = useSession();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameH, setFrameH] = useState(1180);
  const [frameReady, setFrameReady] = useState(false);

  const { data, error, loading, reload } = useLoad(async () => {
    if (!period) return null;
    try {
      return await api<StatementData>(`/api/periods/${period.id}/statement`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return "none" as const;
      throw e;
    }
  }, [period?.id, period?.status, epoch]);

  // tinggi & kesiapan pratinjau dikirim oleh halaman cetak di dalam iframe
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "karbonlens:statement") return;
      if (typeof e.data.height === "number") setFrameH(Math.ceil(e.data.height));
      if (e.data.ready) setFrameReady(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  useEffect(() => setFrameReady(false), [period?.id, period?.status, epoch]);

  if (!period) return null;
  if (loading && !data) return <Loading rows={2} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data) return null;

  const head = (
    <PageHead title={t("Pernyataan emisi tertanam", "Embedded emissions statement")}
      description={t(`Dokumen resmi hasil perhitungan periode ${period.year}. Pernyataan final beserta kode verifikasinya terbit otomatis saat periode dikunci admin peninjau.`,
        `The official calculation statement for ${period.year}. The final statement and its verification code are issued automatically when the reviewer locks the period.`)} />
  );

  if (data === "none") {
    return (
      <>
        {head}
        <Empty icon={<IconReport />} title={t("Belum ada kalkulasi untuk periode ini", "No calculation for this period yet")}
          action={<Link href="/kalkulasi" className="btn primary">{t("Buka kalkulasi", "Open calculation")}<IconArrow size={15} /></Link>}>
          {t("Pernyataan disusun dari kalkulasi terakhir. Jalankan kalkulasi terlebih dulu.", "The statement is built from the latest calculation. Run a calculation first.")}
        </Empty>
      </>
    );
  }

  const final = data.status === "final";
  const c = data.calculation;
  const src = `/cetak/pernyataan?periode=${period.id}`;
  const verifyLink = data.code ? `${window.location.origin}/verifikasi?kode=${data.code}` : null;
  const print = () => {
    const w = frameRef.current?.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
  };
  const copy = async () => {
    if (!verifyLink) return;
    try {
      await navigator.clipboard.writeText(verifyLink);
      toast(t("Tautan cek keaslian disalin", "Verification link copied"));
    } catch {
      toast(verifyLink);
    }
  };

  return (
    <>
      {head}
      <div className="stmt-layout">
        <div className="stmt-preview" aria-label={t("Pratinjau pernyataan", "Statement preview")}>
          {!frameReady && <div className="stmt-loading"><span className="spinner" />{t("Menyusun lembar…", "Laying out pages…")}</div>}
          <iframe ref={frameRef} key={`${period.id}-${period.status}-${epoch}`} src={`${src}&embed=1`} title={t("Pratinjau pernyataan", "Statement preview")}
            className="stmt-frame" style={{ height: frameH, opacity: frameReady ? 1 : 0 }} />
        </div>

        <aside className="stmt-side">
          <section className="panel stack">
            <div className="inline" style={{ justifyContent: "space-between" }}>
              <span className="small muted">{t("Status dokumen", "Document status")}</span>
              {final ? <Badge tone="ok" pip>{t("Final", "Final")}</Badge> : <Badge tone="warn" pip>{t("Draf", "Draft")}</Badge>}
            </div>
            <div>
              <div className="tiny muted">{t("Nomor dokumen", "Document number")}</div>
              <div className="mono strong" style={{ fontSize: 14 }}>{data.number}</div>
            </div>
            <dl className="kv">
              <dt>{t("Periode", "Period")}</dt><dd>{data.period.year} · {t(`revisi ${data.period.revision}`, `revision ${data.period.revision}`)}</dd>
              <dt>{t("Total emisi", "Total emissions")}</dt><dd>{num(c.total_t, 1)} t CO₂e</dd>
              <dt>{t("Kalkulasi", "Calculation")}</dt><dd>v{c.version} · {longDate(c.created_at)}</dd>
              {final && <><dt>{t("Diterbitkan", "Issued")}</dt><dd>{longDate(data.issued_at)}</dd></>}
            </dl>
            <div className="stack tight">
              <Button variant="primary" block onClick={print} disabled={!frameReady}><IconDownload size={16} />{t("Cetak / simpan PDF", "Print / save as PDF")}</Button>
              <a className="btn secondary block" href={src} target="_blank" rel="noopener"><IconEye size={16} />{t("Buka di tab baru", "Open in a new tab")}</a>
            </div>
            <p className="tiny muted">{t("Pilih \"Simpan sebagai PDF\" di jendela cetak. Ukuran kertas A4, margin tidak perlu diatur.", "Choose \"Save as PDF\" in the print dialog. Paper size A4; no margins needed.")}</p>
          </section>

          {final && data.code ? (
            <section className="panel stack stmt-verify">
              <div className="inline" style={{ gap: 8 }}><IconShield size={18} className="ok-ink" /><b>{t("Kode verifikasi", "Verification code")}</b></div>
              <div className="stmt-code mono">{data.code}</div>
              <p className="small muted wrap">{t("Importir atau verifikator dapat mencocokkan dokumen cetak dengan data KarbonLens lewat halaman cek keaslian.",
                "Importers or verifiers can match the printed document against KarbonLens records on the verification page.")}</p>
              <div className="inline">
                <Button size="sm" onClick={copy}>{t("Salin tautan", "Copy link")}</Button>
                <a className="btn ghost sm" href={verifyLink!} target="_blank" rel="noopener">{t("Buka halaman cek", "Open check page")}<IconArrow size={14} /></a>
              </div>
            </section>
          ) : (
            <section className="panel stack">
              <div className="inline" style={{ gap: 8 }}><IconLock size={17} /><b>{t("Sebelum menjadi final", "Before it becomes final")}</b></div>
              <ul className="stmt-checks">
                {data.notes.map((n) => <li key={n}><IconWarn size={14} aria-hidden="true" /><span className="wrap">{n}</span></li>)}
                {data.notes.length === 0 && <li><IconCheck size={14} aria-hidden="true" /><span>{t("Data siap; menunggu penguncian.", "Data ready; awaiting lock.")}</span></li>}
              </ul>
              <Link href="/laporan" className="btn secondary sm" style={{ alignSelf: "flex-start" }}>
                {isAdmin ? t("Periksa syarat & kunci periode", "Check requirements & lock") : t("Lihat syarat penguncian", "See lock requirements")}<IconArrow size={14} />
              </Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
