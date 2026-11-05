"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { IconCheck, IconShield, IconWarn, IconX } from "@/components/Icons";
import { Button, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { longDate, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { StatementCheck } from "@/lib/types";

/** Halaman publik (tanpa login): mencocokkan pernyataan cetak dengan data yang tercatat di KarbonLens. */
export default function VerifyPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><Spinner /></div>}>
      <Verify />
    </Suspense>
  );
}

/** "e5e509fb529f348a" → "E5E5-09FB-529F-348A" (sambil mengetik). */
const formatCode = (raw: string) => (raw.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 16).match(/.{1,4}/g) ?? []).join("-");

function Verify() {
  const t = useT();
  const sp = useSearchParams();
  const [code, setCode] = useState(formatCode(sp.get("kode") ?? ""));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StatementCheck | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const check = useCallback(async (value: string) => {
    setResult(null);
    setProblem(null);
    if (value.replace(/-/g, "").length !== 16) {
      setProblem(t("Kode verifikasi terdiri atas 16 karakter (angka 0–9 dan huruf A–F).", "A verification code has 16 characters (digits 0–9 and letters A–F)."));
      return;
    }
    setBusy(true);
    try {
      setResult(await api<StatementCheck>(`/api/public/statements/${value}`));
    } catch (e) {
      setProblem(e instanceof ApiError && e.status === 404
        ? t("Kode ini tidak terdaftar. Dokumen yang memuat kode ini tidak diterbitkan oleh KarbonLens atau kodenya salah ketik.",
          "This code is not registered. The document carrying it was not issued by KarbonLens, or the code was mistyped.")
        : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [t]);

  // tautan dari dokumen (…/verifikasi?kode=…) langsung dicek
  const initial = sp.get("kode");
  useEffect(() => {
    if (initial) check(formatCode(initial));
  }, [initial, check]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    check(code);
  };

  return (
    <AuthLayout wide>
      <h1>{t("Cek keaslian pernyataan", "Verify a statement")}</h1>
      <p className="lead">{t("Masukkan kode verifikasi yang tercetak pada Pernyataan Hasil Perhitungan Emisi Tertanam. Hasil cek menampilkan angka yang tercatat di KarbonLens untuk dicocokkan dengan dokumen.",
        "Enter the verification code printed on the Statement of Embedded Emissions Calculation Results. The check shows the figures on record in KarbonLens so you can compare them with the document.")}</p>
      <form onSubmit={submit} className="verify-form" noValidate>
        <div className="field grow">
          <label htmlFor="code">{t("Kode verifikasi", "Verification code")}</label>
          <input id="code" className="input mono verify-input" value={code} onChange={(e) => setCode(formatCode(e.target.value))}
            placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} inputMode="text" aria-describedby="code-hint" autoFocus={!initial} />
          <span id="code-hint" className="tiny muted">{t("Tercantum di bagian Keaslian dokumen dan di kaki setiap halaman.", "Shown in the Document authenticity section and in every page footer.")}</span>
        </div>
        <Button type="submit" variant="primary" size="lg" loading={busy}>{t("Cek", "Check")}</Button>
      </form>

      <div aria-live="polite">
        {problem && (
          <div className="verify-result bad" role="alert">
            <span className="verify-icon"><IconX size={20} /></span>
            <div><b>{t("Tidak dapat diverifikasi", "Could not be verified")}</b><p className="small wrap">{problem}</p></div>
          </div>
        )}
        {result && <Result r={result} />}
      </div>
    </AuthLayout>
  );
}

function Result({ r }: { r: StatementCheck }) {
  const t = useT();
  const valid = r.status === "valid";
  return (
    <div className={`verify-result ${valid ? "ok" : "warn"}`}>
      <span className="verify-icon">{valid ? <IconCheck size={20} /> : <IconWarn size={20} />}</span>
      <div className="stack" style={{ gap: 14, minWidth: 0, flex: 1 }}>
        <div>
          <b>{valid ? t("Pernyataan terdaftar dan berlaku", "Statement registered and in force") : t("Pernyataan ini sudah digantikan", "This statement has been superseded")}</b>
          <p className="small wrap">{valid
            ? t("Cocokkan angka di bawah dengan dokumen. Bila ada yang berbeda, dokumen tersebut tidak sah.", "Compare the figures below with the document. If any differ, the document is not valid.")
            : t(`Periode ini dibuka kembali untuk revisi pada ${longDate(r.superseded_at)}.${r.replaced_by ? ` Gunakan pernyataan ${r.replaced_by}.` : " Pernyataan revisi baru belum terbit."}`,
              `This period was reopened for revision on ${longDate(r.superseded_at)}.${r.replaced_by ? ` Use statement ${r.replaced_by}.` : " The new revision has not been issued yet."}`)}</p>
        </div>
        <dl className="kv">
          <dt>{t("Nomor dokumen", "Document number")}</dt><dd className="mono">{r.number}</dd>
          <dt>{t("Perusahaan", "Company")}</dt><dd>{r.company ?? "—"}{r.legal_id ? ` · ${r.legal_id}` : ""}</dd>
          <dt>{t("Periode", "Period")}</dt><dd>{r.year} · {t(`revisi ${r.revision}`, `revision ${r.revision}`)}</dd>
          <dt>{t("Diterbitkan", "Issued")}</dt><dd>{longDate(r.issued_at)}</dd>
          <dt>{t("Total emisi tertanam", "Total embedded emissions")}</dt><dd>{num(r.total_t, 1)} t CO₂e</dd>
        </dl>
        {r.products.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t("Produk", "Product")}</th><th className="num">{t("SEE total (t CO₂e/t)", "Total SEE (t CO₂e/t)")}</th></tr></thead>
              <tbody>{r.products.map((p) => <tr key={p.code}><td><b>{p.code}</b> <span className="muted">{p.name}</span></td><td className="num">{num(p.see_total, 4)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <div>
          <div className="tiny muted">{t("Sidik data (SHA-256)", "Data fingerprint (SHA-256)")}</div>
          <div className="mono tiny wrap" style={{ overflowWrap: "anywhere" }}>{r.sha256}</div>
        </div>
        <p className="tiny muted wrap" style={{ display: "flex", gap: 8 }}><IconShield size={14} style={{ flex: "none", marginTop: 2 }} />
          {t("Halaman ini hanya menampilkan ringkasan. Data aktivitas dan dokumen sumber perusahaan tidak dibuka untuk umum.", "This page only shows a summary. The company's activity data and source documents are not public.")}</p>
      </div>
    </div>
  );
}
