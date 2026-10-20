"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconFile, IconSearch, IconTrash, IconUpload } from "@/components/Icons";
import { Badge, Button, Dialog, Empty, ErrorBox, Loading, PageHead, StatusBadge, useLoad, useToast } from "@/components/ui";
import { api, uploadWithProgress } from "@/lib/api";
import { bytes, when, type Tone } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useSummary } from "@/lib/summary";
import type { DocumentItem, ReqState, Requirement } from "@/lib/types";

const ACCEPT = ".pdf,.xlsx,.xlsm,.csv,.txt,.docx,.png,.jpg,.jpeg,.tif,.tiff,.webp,.bmp";
type Upload = { id: number; names: string; count: number; pct: number; error?: string };

export default function DokumenPage() {
  const t = useT();
  const { period, isAdmin, epoch } = useSession();
  const { refreshSummary } = useSummary();
  const toast = useToast();
  const writable = !isAdmin && period?.status !== "locked";
  const [tab, setTab] = useState<"req" | "docs">("req");
  const [filter, setFilter] = useState<"all" | "required" | "todo">("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [q, setQ] = useState("");
  const [uploadType, setUploadType] = useState("");
  const [over, setOver] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [confirmDel, setConfirmDel] = useState<DocumentItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const STATE: Record<ReqState, { label: string; tone: Tone }> = {
    complete: { label: t("Lengkap", "Complete"), tone: "ok" },
    partial: { label: t("Sebagian", "Partial"), tone: "warn" },
    in_review: { label: t("Dalam proses", "In progress"), tone: "info" },
    default: { label: t("Nilai bawaan", "Default value"), tone: "bad" },
    missing: { label: t("Belum ada", "Missing"), tone: "neutral" },
  };

  const reqs = useLoad(() => (period ? api<Requirement[]>(`/api/periods/${period.id}/requirements`) : Promise.resolve([])), [period?.id, epoch]);
  const docs = useLoad(() => (period ? api<DocumentItem[]>(`/api/periods/${period.id}/documents`) : Promise.resolve([])), [period?.id, epoch]);
  const reloadDocs = docs.reload;
  const reloadReqs = reqs.reload;

  const busy = (docs.data ?? []).some((d) => d.status === "uploaded" || d.status === "processing");
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => { reloadDocs(true); reloadReqs(true); }, 1800);
    return () => clearInterval(id);
  }, [busy, reloadDocs, reloadReqs]);

  useEffect(() => {
    if (window.location.hash === "#unggah") setTimeout(() => dropRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 200);
  }, []);

  const sendFiles = async (files: FileList | File[]) => {
    if (!period || !files.length || !writable) return;
    const list = Array.from(files);
    const form = new FormData();
    list.forEach((f) => form.append("files", f));
    if (uploadType) form.append("type_code", uploadType);
    const id = Date.now();
    setUploads((u) => [{ id, names: list.map((f) => f.name).join(", "), count: list.length, pct: 0 }, ...u]);
    try {
      await uploadWithProgress(`/api/periods/${period.id}/documents`, form, (pct) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, pct } : x))));
      setUploads((u) => u.filter((x) => x.id !== id));
      toast(t(`${list.length} berkas diunggah. Sistem sedang membacanya.`, `${list.length} files uploaded. The system is reading them.`));
      setTab("docs");
      reloadDocs(true);
      reloadReqs(true);
      refreshSummary();
    } catch (e) {
      setUploads((u) => u.map((x) => (x.id === id ? { ...x, error: (e as Error).message } : x)));
      toast((e as Error).message, "error");
    }
  };

  const remove = async (d: DocumentItem) => {
    setConfirmDel(null);
    try {
      await api(`/api/documents/${d.id}`, { method: "DELETE" });
      toast(t("Dokumen dihapus", "Document deleted"));
      reloadDocs(true);
      reloadReqs(true);
      refreshSummary();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const all = useMemo(() => reqs.data ?? [], [reqs.data]);
  const list = docs.data ?? [];
  const catName = (code: string | null) => all.find((r) => r.code === code)?.name ?? t("Belum dikenali", "Not recognised");

  if (!period) return null;
  if (reqs.loading && !reqs.data) return <Loading rows={2} />;
  if (reqs.error) return <ErrorBox error={reqs.error} onRetry={() => reqs.reload()} />;

  const required = all.filter((r) => r.required);
  const requiredDone = required.filter((r) => r.state === "complete" || r.state === "partial").length;
  const cats = all.filter((r) => (filter === "required" ? r.required : filter === "todo" ? r.state !== "complete" : true));
  const toCheck = list.filter((d) => d.status === "needs_review" || d.status === "rejected").length;
  const defaults = all.filter((r) => r.state === "default").length;
  const docList = list.filter((d) => (!typeFilter || d.type_code === typeFilter) && (!q || `${d.original_name} ${d.doc_number ?? ""} ${d.supplier ?? ""}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <PageHead title={t("Dokumen", "Documents")}
        description={isAdmin
          ? t("Kebutuhan data dan semua dokumen yang diunggah perusahaan ini.", "Data requirements and every document this company uploaded.")
          : t("Sepuluh kategori yang dipakai perhitungan. Unggah apa saja yang Anda punya: sistem mengenali jenisnya dan membaca angkanya.",
            "The ten categories used in the calculation. Upload whatever you have: the system recognises the type and reads the figures.")}>
        {writable && <Button variant="primary" onClick={() => inputRef.current?.click()}><IconUpload size={16} />{t("Unggah dokumen", "Upload documents")}</Button>}
      </PageHead>

      <div className="kpis">
        <div className="kpi"><div className="k">{t("Kategori wajib", "Required categories")}</div><div className="v">{requiredDone}<small>/ {required.length}</small></div><div className="d">{t("punya dokumen tervalidasi", "have validated documents")}</div></div>
        <div className="kpi"><div className="k">{t("Dokumen", "Documents")}</div><div className="v">{list.length}</div><div className="d">{busy ? t("sebagian sedang dibaca", "some are being read") : t("semua sudah dibaca", "all read")}</div></div>
        <div className="kpi"><div className="k">{t("Perlu diperiksa", "To check")}</div><div className="v">{toCheck}</div><div className="d">{t("sebelum diajukan ke admin", "before submitting to the reviewer")}</div></div>
        <div className="kpi"><div className="k">{t("Memakai nilai bawaan", "Using defaults")}</div><div className="v" style={{ color: defaults ? "var(--bad)" : undefined }}>{defaults}</div><div className="d">{t("kategori tanpa dokumen asli", "categories without documents")}</div></div>
      </div>

      {writable && (
        <section className="panel" id="unggah" aria-label={t("Unggah dokumen", "Upload documents")}>
          <div ref={dropRef}
            className={`dropzone ${over ? "over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) sendFiles(e.dataTransfer.files); }}>
            <span className="ic"><IconUpload size={22} /></span>
            <b>{t("Tarik berkas ke sini atau pilih dari komputer", "Drop files here or choose from your computer")}</b>
            <span className="small muted">{t("PDF, hasil scan, foto, Excel, CSV, Word, atau TXT. Maksimal 50 MB per berkas.", "PDF, scans, photos, Excel, CSV, Word or TXT. Up to 50 MB per file.")}</span>
            <div className="inline" style={{ justifyContent: "center", marginTop: 6 }}>
              <select className="select" style={{ width: "auto", minWidth: 220 }} value={uploadType} onChange={(e) => setUploadType(e.target.value)} aria-label={t("Kategori dokumen", "Document category")}>
                <option value="">{t("Kenali kategori otomatis", "Detect category automatically")}</option>
                {all.map((r) => <option key={r.code} value={r.code}>{r.no}. {r.name}</option>)}
              </select>
              <Button variant="primary" onClick={() => inputRef.current?.click()}>{t("Pilih berkas", "Choose files")}</Button>
            </div>
            <input ref={inputRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { if (e.target.files) sendFiles(e.target.files); e.target.value = ""; }} />
          </div>
          {uploads.map((u) => (
            <div key={u.id} className="upl">
              <IconFile size={16} />
              <span className="name">{u.count > 1 ? t(`${u.count} berkas`, `${u.count} files`) : u.names}</span>
              {u.error ? <span className="tiny" style={{ color: "var(--bad)" }}>{u.error}</span>
                : <span className="bar"><span className="meter" style={{ display: "block" }}><span style={{ width: `${u.pct}%` }} /></span></span>}
            </div>
          ))}
        </section>
      )}
      {!isAdmin && period.status === "locked" && (
        <div className="banner info">{t("Periode ini sudah dikunci admin. Dokumen tidak bisa ditambah atau diubah.", "This period has been locked by the reviewer. Documents cannot be added or changed.")}</div>
      )}

      <div className="inline" style={{ justifyContent: "space-between" }}>
        <div className="segmented" role="tablist" aria-label={t("Tampilan", "View")}>
          <button role="tab" aria-pressed={tab === "req"} aria-selected={tab === "req"} onClick={() => setTab("req")}>{t("Kebutuhan", "Requirements")}</button>
          <button role="tab" aria-pressed={tab === "docs"} aria-selected={tab === "docs"} onClick={() => setTab("docs")}>{t("Semua dokumen", "All documents")} ({list.length})</button>
        </div>
        {tab === "req" ? (
          <div className="segmented" role="group" aria-label={t("Saring kategori", "Filter categories")}>
            <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{t("Semua", "All")}</button>
            <button aria-pressed={filter === "required"} onClick={() => setFilter("required")}>{t("Wajib", "Required")}</button>
            <button aria-pressed={filter === "todo"} onClick={() => setFilter("todo")}>{t("Belum lengkap", "Incomplete")}</button>
          </div>
        ) : (
          <div className="inline">
            <div className="input-affix" style={{ minWidth: 0, flex: "1 1 220px" }}>
              <input className="input" style={{ paddingRight: 36 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama, nomor, pemasok", "Search name, number, supplier")} aria-label={t("Cari dokumen", "Search documents")} />
              <IconSearch size={16} className="affix" />
            </div>
            <select className="select" style={{ width: "auto", flex: "0 1 220px" }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label={t("Saring kategori", "Filter by category")}>
              <option value="">{t("Semua kategori", "All categories")}</option>
              {all.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {tab === "req" ? (
        <div className="req-grid">
          {cats.map((r) => (
            <article key={r.code} className={`req ${r.state}`}>
              <div className="req-top">
                <span className="req-no">{r.state === "complete" ? "✓" : r.no}</span>
                <span className="t"><b>{r.name}</b><span>{r.scope}{r.required ? "" : ` · ${t("opsional", "optional")}`}</span></span>
                <Badge tone={STATE[r.state].tone}>{STATE[r.state].label}</Badge>
              </div>
              <p className="small muted">{r.description}</p>
              {r.items && r.items.length > 0 && (
                <div className="req-items">
                  {r.items.map((s) => (
                    <div key={s.key} className="req-item">
                      <span className={`state-icon ${s.state}`}>{s.state === "complete" ? "✓" : s.state === "default" ? "!" : ""}</span>
                      <span className="lbl"><b>{s.label}</b>{!s.required && <span className="faint"> · {t("opsional", "optional")}</span>}<span>{s.hint}</span></span>
                      <span className="st">{s.detail || STATE[s.state].label}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="req-foot">
                <span>{t(`${r.total} dokumen · ${r.counted} dihitung`, `${r.total} documents · ${r.counted} counted`)}{r.pending ? t(` · ${r.pending} dalam proses`, ` · ${r.pending} in progress`) : ""}</span>
                <span className="spacer" />
                {r.total > 0 && <button type="button" className="btn ghost sm" onClick={() => { setTypeFilter(r.code); setTab("docs"); }}>{t("Lihat dokumen", "View documents")}</button>}
                {writable && <button type="button" className="btn secondary sm" onClick={() => { setUploadType(r.code); inputRef.current?.click(); }}><IconUpload size={14} />{t("Unggah", "Upload")}</button>}
              </div>
            </article>
          ))}
          {!cats.length && <Empty title={t("Semua kategori sudah lengkap", "Every category is complete")} />}
        </div>
      ) : (
        <section className="panel flush" aria-label={t("Daftar dokumen", "Document list")}>
          {docs.error ? <div style={{ padding: 16 }}><ErrorBox error={docs.error} onRetry={() => docs.reload()} /></div> : docList.length === 0 ? (
            <Empty icon={<IconFile />} title={list.length ? t("Tidak ada yang cocok", "No matches") : t("Belum ada dokumen", "No documents yet")}>
              {list.length ? t("Ubah kata kunci atau saringan kategori.", "Change the search term or category filter.") : t("Dokumen yang diunggah akan muncul di sini.", "Uploaded documents will appear here.")}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table cards">
                <thead><tr><th>{t("Berkas", "File")}</th><th>{t("Kategori", "Category")}</th><th>Status</th><th>{t("Nomor / pemasok", "Number / supplier")}</th><th>{t("Diunggah", "Uploaded")}</th><th /></tr></thead>
                <tbody>
                  {docList.map((d) => (
                    <tr key={d.id}>
                      <td className="primary">
                        <Link href={`/dokumen/${d.id}`} className="strong wrap" style={{ color: "var(--ink)" }}>{d.original_name}</Link>
                        <div className="tiny muted">{bytes(d.size_bytes)}{d.page_count ? ` · ${d.page_count} ${t("hal.", "pp.")}` : ""}</div>
                      </td>
                      <td data-label={t("Kategori", "Category")} className="small">{d.type_code ? catName(d.type_code) : <Badge tone="warn">{t("Belum dikenali", "Not recognised")}</Badge>}</td>
                      <td data-label="Status"><StatusBadge status={d.status} /></td>
                      <td data-label={t("Nomor / pemasok", "Number / supplier")} className="small"><span className="wrap">{[d.doc_number, d.supplier].filter(Boolean).join(" · ") || "—"}</span></td>
                      <td data-label={t("Diunggah", "Uploaded")} className="small muted">{when(d.created_at)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <Link href={`/dokumen/${d.id}`} className="btn ghost sm">{t("Buka", "Open")}</Link>
                        {writable && d.status !== "approved" && (
                          <button type="button" className="btn ghost icon sm" onClick={() => setConfirmDel(d)} aria-label={t(`Hapus ${d.original_name}`, `Delete ${d.original_name}`)}><IconTrash size={15} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <Dialog open={!!confirmDel} title={t("Hapus dokumen?", "Delete document?")} onClose={() => setConfirmDel(null)}
        actions={<><Button variant="ghost" onClick={() => setConfirmDel(null)}>{t("Batal", "Cancel")}</Button><Button variant="danger" onClick={() => confirmDel && remove(confirmDel)}>{t("Hapus", "Delete")}</Button></>}>
        <p className="wrap">{t(`${confirmDel?.original_name} akan dihapus dan angkanya tidak lagi dihitung.`, `${confirmDel?.original_name} will be deleted and its figures will no longer be counted.`)}</p>
      </Dialog>
    </>
  );
}
