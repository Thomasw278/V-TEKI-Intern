"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { DocViewer } from "@/components/DocViewer";
import { IconBack, IconCheck, IconRefresh, IconSend, IconUndo, IconX } from "@/components/Icons";
import { Badge, Button, ConfMeter, Dialog, ErrorBox, Loading, PageHead, StatusBadge, useLoad, useToast } from "@/components/ui";
import { api, ApiError, downloadFile } from "@/lib/api";
import { loadDocTypes } from "@/lib/doctypes";
import { describeMethod, num, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useSummary } from "@/lib/summary";
import type { DocType, DocTypeField, DocumentDetail, ExtractedField, Issue } from "@/lib/types";

const keyOf = (item: number, key: string) => `${item}:${key}`;

function shown(f: ExtractedField | undefined, spec?: DocTypeField): string {
  if (!f) return "";
  if (spec?.kind === "number" && f.value_num !== null && f.value_num !== undefined) {
    const v = Number(f.value_num);
    return num(v, Number.isInteger(v) ? 0 : Math.min(3, (String(f.value_num).split(".")[1] ?? "").length));
  }
  return f.value_text ?? "";
}

export default function DocumentDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { period, isAdmin, epoch } = useSession();
  const { refreshSummary } = useSummary();
  const toast = useToast();
  const [selId, setSelId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<Issue[] | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const { data, error, loading, reload, setData } = useLoad(async () => {
    const [doc, types] = await Promise.all([api<DocumentDetail>(`/api/documents/${id}`), loadDocTypes()]);
    return { doc, types };
  }, [id, epoch]);

  const doc = data?.doc;
  const processing = doc?.status === "uploaded" || doc?.status === "processing";
  useEffect(() => {
    if (!processing) return;
    const iv = setInterval(() => reload(true), 1800);
    return () => clearInterval(iv);
  }, [processing, reload]);

  const type: DocType | undefined = data?.types.find((x) => x.code === doc?.type_code);
  const nItems = useMemo(() => Math.max(1, ...(doc?.fields ?? []).map((f) => (f.item ?? 0) + 1)), [doc?.fields]);
  const byKey = useMemo(() => {
    const m = new Map<string, ExtractedField>();
    (doc?.fields ?? []).forEach((f) => m.set(keyOf(f.item ?? 0, f.key), f));
    return m;
  }, [doc?.fields]);

  useEffect(() => {
    if (!doc || selId !== null || !doc.fields.length) return;
    const first = [...doc.fields].sort((a, b) => Number(a.confirmed) - Number(b.confirmed) || a.confidence - b.confidence)[0];
    setSelId(first.id);
  }, [doc, selId]);

  if (loading && !data) return <Loading rows={2} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data || !doc) return null;

  const locked = period?.status === "locked";
  // perusahaan mengoreksi sebelum disetujui; admin boleh mengoreksi saat meninjau
  const editable = !locked && !processing && (isAdmin ? doc.status === "validated" : doc.status !== "approved");
  const selected = doc.fields.find((f) => f.id === selId) ?? null;
  const issues = serverIssues ?? doc.issues;
  const critical = issues.filter((i) => i.severity === "critical");
  const low = doc.fields.filter((f) => f.confidence < 0.75 && !f.confirmed).length;
  const specs = type?.fields ?? [];
  const multi = nItems > 1;
  const pending = Object.keys(edits).length > 0;

  const update = (d: DocumentDetail) => { setData({ doc: d, types: data.types }); setServerIssues(null); refreshSummary(); };
  const run = async (key: string, fn: () => Promise<DocumentDetail | void>, ok?: string) => {
    setBusy(key);
    try {
      const d = await fn();
      if (d) update(d);
      if (ok) toast(ok);
    } catch (e) {
      const err = e as ApiError;
      const det = err.detail as { detail?: { issues?: Issue[] } } | undefined;
      if (det?.detail?.issues) setServerIssues(det.detail.issues);
      toast(err.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const save = (item: number, key: string) => {
    const k = keyOf(item, key);
    const value = edits[k];
    if (value === undefined) return;
    const f = byKey.get(k);
    if (f && value === shown(f, specs.find((s) => s.key === key))) {
      setEdits(({ [k]: _, ...rest }) => rest);
      return;
    }
    if (!f && !value.trim()) {
      setEdits(({ [k]: _, ...rest }) => rest);
      return;
    }
    run(`f-${k}`, async () => {
      const d = f
        ? await api<DocumentDetail>(`/api/documents/${doc.id}/fields/${f.id}`, { method: "PATCH", body: { value } })
        : await api<DocumentDetail>(`/api/documents/${doc.id}/fields`, { body: { key, value, item } });
      setEdits(({ [k]: _, ...rest }) => rest);
      return d;
    }, t("Disimpan", "Saved"));
  };
  const onKey = (item: number, key: string) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); save(item, key); }
    if (e.key === "Escape") setEdits(({ [keyOf(item, key)]: _, ...rest }) => rest);
  };

  const pageInfo = doc.layout?.pages ?? [];
  const ocr = pageInfo.some((p) => p.ocr);
  const meta = [
    type ? `${type.no}. ${type.name}` : t("Kategori belum dikenali", "Category not recognised"),
    (() => { const n = pageInfo.length || doc.page_count || 1; return `${n} ${pageInfo[0]?.kind === "sheet" ? t("lembar", n === 1 ? "sheet" : "sheets") : t("halaman", n === 1 ? "page" : "pages")}`; })(),
    ocr ? t("dibaca dengan OCR", "read with OCR") : null,
    doc.doc_number ? `${t("No.", "No.")} ${doc.doc_number}` : null,
    doc.supplier, doc.doc_date,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <Link href={isAdmin ? "/validasi" : "/dokumen"} className="inline small strong" style={{ gap: 6 }}>
        <IconBack size={16} />{isAdmin ? t("Kembali ke pengajuan", "Back to submissions") : t("Kembali ke dokumen", "Back to documents")}
      </Link>
      <PageHead eyebrow={<StatusBadge status={doc.status} />} title={<span className="wrap">{doc.original_name}</span>} description={meta}>
        {!isAdmin && !locked && doc.status !== "approved" && (
          <Button size="sm" variant="ghost" loading={busy === "re"} onClick={() => run("re", async () => {
            await api(`/api/documents/${doc.id}/reprocess`, { method: "POST" });
            await reload(true);
          }, t("Dokumen dibaca ulang", "Document re-read"))}><IconRefresh size={15} />{t("Baca ulang", "Re-read")}</Button>
        )}
      </PageHead>

      {processing && <div className="banner info"><span className="spinner" /><span className="grow">{t("Sistem sedang membaca dokumen: membuang watermark, menjalankan OCR bila perlu, lalu mencari label dan angka.", "The system is reading the document: removing watermarks, running OCR if needed, then finding labels and figures.")}</span></div>}
      {doc.status === "rejected" && doc.review_note && (
        <div className="banner bad"><span className="grow"><b>{t("Dikembalikan admin", "Returned by the reviewer")}</b> · {when(doc.reviewed_at)}<br />{doc.review_note}</span></div>
      )}
      {doc.status === "validated" && !isAdmin && (
        <div className="banner info"><span className="grow">{t(`Diajukan ${when(doc.submitted_at)}. Menunggu persetujuan admin peninjau; angka sudah ikut dalam kalkulasi draf.`, `Submitted ${when(doc.submitted_at)}. Waiting for reviewer approval; figures are already in draft calculations.`)}</span></div>
      )}
      {doc.status === "approved" && (
        <div className="banner ok"><IconCheck size={16} /><span className="grow">{t(`Disetujui admin ${when(doc.reviewed_at)}.`, `Approved by the reviewer ${when(doc.reviewed_at)}.`)}</span></div>
      )}
      {doc.error && <div className="banner warn"><span className="grow">{doc.error}</span></div>}

      <div className="viewer-layout">
        <DocViewer doc={doc} selected={selected} onSelect={(f) => setSelId(f.id)}
          onDownload={() => downloadFile(`/api/documents/${doc.id}/file`, doc.original_name).catch((e) => toast((e as Error).message, "error"))} />

        <div className="stack">
          <section className="panel" aria-label={t("Hasil pembacaan", "Extraction result")}>
            <div className="panel-head" style={{ marginBottom: 12 }}>
              <div>
                <h2>{t("Hasil pembacaan", "Extraction result")}</h2>
                <div className="sub">
                  {t(`${doc.fields.length} angka`, `${doc.fields.length} values`)}{multi ? t(` · ${nItems} baris`, ` · ${nItems} rows`) : ""}{low ? t(` · ${low} perlu dicek`, ` · ${low} to check`) : ""}
                </div>
              </div>
              {editable && !isAdmin && (
                <select className="select" style={{ width: "auto", maxWidth: "100%", height: 36, fontSize: 13.5 }} value={doc.type_code ?? ""} aria-label={t("Kategori dokumen", "Document category")}
                  onChange={(e) => run("type", () => api<DocumentDetail>(`/api/documents/${doc.id}`, { method: "PATCH", body: { type_code: e.target.value } }), t("Kategori diubah, dokumen dibaca ulang", "Category changed, document re-read"))}>
                  <option value="" disabled>{t("Pilih kategori…", "Choose category…")}</option>
                  {data.types.map((x) => <option key={x.code} value={x.code}>{x.no}. {x.name}</option>)}
                </select>
              )}
            </div>

            {(doc.notes ?? []).length > 0 && (
              <ul className="tiny muted" style={{ margin: "0 0 14px", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {(doc.notes ?? []).map((n) => <li key={n}>{n}</li>)}
              </ul>
            )}
            {!type && <p className="small muted">{t("Pilih kategori agar sistem tahu angka apa yang dicari.", "Choose a category so the system knows which figures to look for.")}</p>}

            {type && Array.from({ length: nItems }).map((_, item) => (
              <div key={item} className={`item-card ${multi ? "multi" : ""}`}>
                {multi && (
                  <div className="item-head">
                    <span>{t("Baris", "Row")} {item + 1}</span>
                    <span className="spacer" />
                    {editable && (
                      <button type="button" className="btn ghost icon sm" aria-label={t(`Hapus baris ${item + 1}`, `Delete row ${item + 1}`)} title={t("Hapus baris (mis. subtotal yang ikut terbaca)", "Delete row (e.g. a subtotal that was read)")}
                        onClick={() => run(`del${item}`, () => api<DocumentDetail>(`/api/documents/${doc.id}/items/${item}`, { method: "DELETE" }), t(`Baris ${item + 1} dihapus`, `Row ${item + 1} deleted`))}><IconX size={14} /></button>
                    )}
                  </div>
                )}
                <div className="fields">
                {specs.filter((s) => !multi || s.required || byKey.has(keyOf(item, s.key))).map((spec) => {
                  const k = keyOf(item, spec.key);
                  const f = byKey.get(k);
                  const active = !!f && f.id === selId;
                  const value = edits[k] ?? shown(f, spec);
                  const lowConf = !!f && f.confidence < 0.75 && !f.confirmed;
                  return (
                    <div key={spec.key} className={`frow ${active ? "active" : ""} ${spec.kind === "text" && value.length > 20 ? "wide" : ""}`} onClick={() => f && setSelId(f.id)}>
                      <span className="lab">
                        {spec.label}{spec.unit ? ` (${spec.unit})` : ""}
                        {!spec.required && !multi && <span className="faint">· {t("opsional", "optional")}</span>}
                        {lowConf && <Badge tone="warn">{t("cek", "check")}</Badge>}
                        {f?.confirmed && <span style={{ color: "var(--ok)" }}>✓</span>}
                      </span>
                      <span className="inline nowrap" style={{ gap: 6 }} title={f ? `${t("Keyakinan", "Confidence")} ${Math.round(f.confidence * 100)}%` : undefined}>
                        <ConfMeter value={f?.confidence ?? 0} empty={!f} />
                        <span className="tiny num muted">{f ? `${Math.round(f.confidence * 100)}%` : "—"}</span>
                      </span>
                      {editable ? (
                        <div className="edit">
                          <input className={`input ${spec.kind === "number" ? "num" : ""}`} inputMode={spec.kind === "number" ? "decimal" : undefined}
                            aria-label={`${spec.label}${multi ? ` ${t("baris", "row")} ${item + 1}` : ""}`} value={value}
                            placeholder={f ? "" : t("Belum terbaca — isi manual", "Not read — enter manually")}
                            onFocus={() => f && setSelId(f.id)} onChange={(e) => setEdits((x) => ({ ...x, [k]: e.target.value }))} onKeyDown={onKey(item, spec.key)} />
                          {edits[k] !== undefined && <Button size="sm" variant="primary" loading={busy === `f-${k}`} onClick={() => save(item, spec.key)}>{t("Simpan", "Save")}</Button>}
                        </div>
                      ) : (
                        <span className="val" style={{ gridColumn: "1 / -1" }}>{value || "—"}{value && spec.unit ? <span className="u">{spec.unit}</span> : null}</span>
                      )}
                      {f?.method && <span className="how">{f.source === "manual" ? t("diisi manual", "entered manually") : describeMethod(f.method, t)}</span>}
                    </div>
                  );
                })}
                </div>
              </div>
            ))}
            {editable && pending && <p className="tiny muted" style={{ marginTop: 10 }}>{t("Tekan Enter atau Simpan untuk menyimpan perubahan.", "Press Enter or Save to keep your changes.")}</p>}
          </section>

          {selected && (
            <section className="panel anim-rise" key={selected.id} aria-label={t("Asal angka", "Value origin")}>
              <div className="panel-head" style={{ marginBottom: 10 }}>
                <div><h2>{selected.label}{multi ? ` · ${t("baris", "row")} ${(selected.item ?? 0) + 1}` : ""}</h2>
                  <div className="sub">{selected.page !== null ? `${t("halaman", "page")} ${(selected.bbox?.page ?? selected.page ?? 0) + 1} · ` : ""}{describeMethod(selected.method, t)}</div></div>
              </div>
              <div className="inline" style={{ alignItems: "baseline", gap: 8 }}>
                <span className="display" style={{ fontSize: 32, lineHeight: 1 }}>{shown(selected, specs.find((s) => s.key === selected.key)) || "—"}</span>
                <span className="muted">{selected.unit}</span>
              </div>
              {selected.snippet && <div className="snippet" style={{ marginTop: 12 }}>{selected.snippet}</div>}
              {!!selected.alternatives?.length && (
                <div className="stack tight" style={{ marginTop: 12 }}>
                  <span className="tiny muted">{t("Kandidat lain (kotak kuning di dokumen). Klik untuk memakainya.", "Other candidates (yellow boxes in the document). Click to use one.")}</span>
                  <div className="inline" style={{ gap: 6 }}>
                    {selected.alternatives.map((a, i) => (
                      <button type="button" key={i} className="alt-chip" disabled={!editable}
                        onClick={() => run(`alt${i}`, () => api<DocumentDetail>(`/api/documents/${doc.id}/fields/${selected.id}`, { method: "PATCH", body: { alt_index: i } }), t(`Memakai ${a.value}`, `Using ${a.value}`))}>
                        {a.value} {a.unit} <span className="faint">· {Math.round(a.confidence * 100)}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {editable && !selected.confirmed && (
                <Button size="sm" style={{ marginTop: 14 }} loading={busy === "conf"}
                  onClick={() => run("conf", () => api<DocumentDetail>(`/api/documents/${doc.id}/fields/${selected.id}`, { method: "PATCH", body: {} }), t("Dikonfirmasi", "Confirmed"))}>
                  <IconCheck size={15} />{t("Angka ini benar", "This value is correct")}
                </Button>
              )}
            </section>
          )}

          <section className="panel" aria-label={t("Aturan validasi", "Validation rules")}>
            <div className="panel-head" style={{ marginBottom: 6 }}>
              <h2>{t("Aturan validasi", "Validation rules")}</h2>
              {critical.length ? <Badge tone="bad" pip>{t(`${critical.length} kritis`, `${critical.length} critical`)}</Badge> : <Badge tone="ok" pip>{t("Lolos", "Passing")}</Badge>}
            </div>
            {issues.length === 0 ? <p className="small muted">{t("Semua aturan lolos.", "All rules pass.")}</p> : (
              <div className="list">
                {issues.map((i, k) => (
                  <div key={k} className="list-row" style={{ padding: "10px 0" }}>
                    <span className={`sev ${i.severity}`} />
                    <span className="body"><b style={{ fontSize: 14 }}>{i.title}</b><span>{i.message}</span></span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {!locked && !processing && (
            <section className="panel" aria-label={t("Tindakan", "Actions")}>
              {isAdmin ? (
                doc.status === "validated" ? (
                  <div className="stack tight">
                    <b>{t("Keputusan peninjau", "Reviewer decision")}</b>
                    <p className="small muted">{t("Setujui bila angka sesuai dokumen, atau kembalikan ke perusahaan dengan catatan.", "Approve when the figures match the document, or return it to the company with a note.")}</p>
                    <div className="inline" style={{ marginTop: 6 }}>
                      <Button variant="danger" onClick={() => setRejectOpen(true)}><IconUndo size={15} />{t("Kembalikan", "Return")}</Button>
                      <Button variant="primary" style={{ flex: 1 }} disabled={pending} loading={busy === "apr"}
                        onClick={() => run("apr", () => api<DocumentDetail>(`/api/documents/${doc.id}/approve`, { method: "POST" }), t("Dokumen disetujui", "Document approved"))}>
                        <IconCheck size={15} />{t("Setujui dokumen", "Approve document")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="small muted">{doc.status === "approved" ? t("Dokumen sudah Anda setujui.", "You have approved this document.")
                    : t("Dokumen belum diajukan perusahaan. Tindakan peninjauan tersedia setelah diajukan.", "The company has not submitted this document yet. Review actions become available after submission.")}</p>
                )
              ) : doc.status === "approved" ? (
                <p className="small muted">{t("Dokumen sudah disetujui dan dikunci dari perubahan.", "The document is approved and locked from changes.")}</p>
              ) : (
                <div className="stack tight">
                  <b>{doc.status === "validated" ? t("Sudah diajukan", "Already submitted") : t("Ajukan ke admin peninjau", "Submit to the reviewer")}</b>
                  <p className="small muted">{t("Dengan mengajukan, Anda menyatakan semua angka di atas sesuai dokumen. Angka langsung ikut kalkulasi draf.",
                    "By submitting you confirm every value above matches the document. The figures join draft calculations right away.")}</p>
                  <Button variant="primary" block style={{ marginTop: 6 }} loading={busy === "val"} disabled={pending || doc.status === "validated"}
                    onClick={() => run("val", () => api<DocumentDetail>(`/api/documents/${doc.id}/validate`, { method: "POST" }), t("Diajukan ke admin peninjau", "Submitted to the reviewer"))}>
                    <IconSend size={15} />{doc.status === "validated" ? t("Menunggu persetujuan", "Awaiting approval") : doc.status === "rejected" ? t("Ajukan ulang", "Resubmit") : t("Semua angka benar, ajukan", "All values correct, submit")}
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      <Dialog open={rejectOpen} title={t("Kembalikan ke perusahaan", "Return to the company")} onClose={() => setRejectOpen(false)}
        actions={<>
          <Button variant="ghost" onClick={() => setRejectOpen(false)}>{t("Batal", "Cancel")}</Button>
          <Button variant="danger" disabled={reason.trim().length < 3} loading={busy === "rej"} onClick={() => {
            setRejectOpen(false);
            run("rej", () => api<DocumentDetail>(`/api/documents/${doc.id}/reject`, { body: { reason: reason.trim() } }), t("Dokumen dikembalikan", "Document returned"));
            setReason("");
          }}>{t("Kembalikan", "Return")}</Button>
        </>}>
        <label className="field">
          <span className="label">{t("Catatan untuk perusahaan", "Note for the company")}</span>
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
            placeholder={t("mis. Volume baris 2 tidak sesuai faktur; periksa kolom Qty.", "e.g. Row 2 volume doesn't match the invoice; check the Qty column.")} />
        </label>
      </Dialog>
    </>
  );
}
