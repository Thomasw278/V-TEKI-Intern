"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchBlob } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { BBox, DocumentDetail, ExtractedField, LayoutPage } from "@/lib/types";
import { IconChevronLeft, IconChevronRight, IconDownload, IconEye, IconZoomIn, IconZoomOut } from "./Icons";
import { Badge } from "./ui";

type XY = Extract<BBox, { x0: number }>;
type RC = Extract<BBox, { r0: number }>;
const isXY = (b: BBox | null | undefined): b is XY => !!b && "x0" in b;
const isRC = (b: BBox | null | undefined): b is RC => !!b && "r0" in b;
const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Penampil dokumen dengan kotak sumber.
 * PDF/gambar dirender server (scan sudah diluruskan): kotak hijau = angka yang dipakai,
 * kotak kuning putus-putus = kandidat lain untuk field terpilih. Lembar kerja: sel ditandai. Teks: baris ditandai.
 */
export function DocViewer({ doc, selected, onSelect, onDownload }: {
  doc: DocumentDetail;
  selected: ExtractedField | null;
  onSelect: (f: ExtractedField) => void;
  onDownload: () => void;
}) {
  const t = useT();
  const pages: LayoutPage[] = doc.layout?.pages ?? [];
  const [n, setN] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showAll, setShowAll] = useState(true);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [imgError, setImgError] = useState<Record<number, string>>({});
  const stageRef = useRef<HTMLDivElement>(null);
  const page = pages[n];
  const visual = !!page && (page.kind === "pdf" || page.kind === "image");

  // pindah ke halaman field terpilih, lalu gulir kotaknya ke tengah penampil (bukan seluruh halaman)
  useEffect(() => {
    const p = selected?.bbox?.page ?? selected?.page;
    if (p !== undefined && p !== null && p !== n && p < pages.length) setN(p);
    const id = window.setTimeout(() => {
      const stage = stageRef.current;
      const el = stage?.querySelector(".src-box.active, td.active, mark.active") as HTMLElement | null;
      if (stage && el) {
        const sr = stage.getBoundingClientRect(), er = el.getBoundingClientRect();
        stage.scrollBy({ top: er.top - sr.top - stage.clientHeight / 2 + er.height / 2, left: er.left - sr.left - stage.clientWidth / 2 + er.width / 2, behavior: "smooth" });
      }
    }, 140);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.bbox]);

  useEffect(() => {
    if (!visual || urls[n] || imgError[n]) return;
    let cancelled = false;
    fetchBlob(`/api/documents/${doc.id}/pages/${n}`)
      .then(({ blob }) => { if (!cancelled) setUrls((u) => ({ ...u, [n]: URL.createObjectURL(blob) })); })
      .catch((e) => { if (!cancelled) setImgError((x) => ({ ...x, [n]: (e as Error).message })); });
    return () => { cancelled = true; };
  }, [doc.id, n, visual, urls, imgError]);

  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  const onPage = useMemo(() => doc.fields.filter((f) => (f.bbox?.page ?? f.page) === n), [doc.fields, n]);

  if (!pages.length) {
    return (
      <div className="viewer">
        <div className="viewer-stage"><div className="textdoc" style={{ whiteSpace: "pre-wrap" }}>{doc.text_preview || t("Belum ada pratinjau. Dokumen sedang dibaca.", "No preview yet. The document is being read.")}</div></div>
      </div>
    );
  }

  const alts = (selected?.alternatives ?? []).filter((a) => (a.bbox?.page ?? a.page) === n);
  const pageName = page.kind === "sheet" ? (page.name ? `${t("Lembar", "Sheet")} ${page.name}` : `${t("Lembar", "Sheet")} ${n + 1}`) : `${t("Halaman", "Page")} ${n + 1}`;

  return (
    <div className="viewer">
      <div className="viewer-bar">
        <button type="button" className="btn ghost icon sm" aria-label={t("Halaman sebelumnya", "Previous page")} disabled={n === 0} onClick={() => setN(n - 1)}><IconChevronLeft size={16} /></button>
        <span className="small strong" style={{ textAlign: "center" }}>{pageName} / {pages.length}</span>
        <button type="button" className="btn ghost icon sm" aria-label={t("Halaman berikutnya", "Next page")} disabled={n >= pages.length - 1} onClick={() => setN(n + 1)}><IconChevronRight size={16} /></button>
        {page.ocr && <Badge tone="info">OCR</Badge>}
        <span className="spacer" />
        {visual && (
          <span className="inline nowrap" style={{ gap: 2 }}>
            <button type="button" className="btn ghost icon sm" aria-label={t("Perkecil", "Zoom out")} onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}><IconZoomOut size={16} /></button>
            <span className="tiny num" style={{ minWidth: 38, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
            <button type="button" className="btn ghost icon sm" aria-label={t("Perbesar", "Zoom in")} onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(1)))}><IconZoomIn size={16} /></button>
          </span>
        )}
        <button type="button" className="btn ghost icon sm" aria-pressed={showAll} onClick={() => setShowAll((s) => !s)}
          title={showAll ? t("Tampilkan kotak terpilih saja", "Show the selected box only") : t("Tampilkan semua kotak", "Show all boxes")}
          aria-label={showAll ? t("Tampilkan kotak terpilih saja", "Show the selected box only") : t("Tampilkan semua kotak", "Show all boxes")}
          style={{ color: showAll ? "var(--primary)" : undefined }}><IconEye size={16} /></button>
        <button type="button" className="btn ghost icon sm" onClick={onDownload} aria-label={t("Unduh berkas asli", "Download original file")} title={t("Unduh berkas asli", "Download original file")}><IconDownload size={16} /></button>
      </div>

      <div className="viewer-stage" ref={stageRef}>
        {visual && (
          <div className="page-img" style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? 860 : undefined, aspectRatio: `${page.w} / ${page.h}` }}>
            {urls[n] ? <img src={urls[n]} alt={`${pageName} · ${doc.original_name}`} /> : imgError[n]
              ? <div className="empty small" style={{ position: "absolute", inset: 0 }}>{imgError[n]}</div>
              : <div className="skeleton" style={{ position: "absolute", inset: 0, borderRadius: 4 }} />}
            {onPage.map((f) => {
              if (!isXY(f.bbox)) return null;
              const active = selected?.id === f.id;
              if (!showAll && !active) return null;
              const b = f.bbox;
              return (
                <button type="button" key={f.id} className={`src-box ${active ? "active" : ""}`} aria-label={`${f.label}: ${f.value_text}`} title={`${f.label}: ${f.value_text}`}
                  style={{ left: `${b.x0 * 100}%`, top: `${b.y0 * 100}%`, width: `${(b.x1 - b.x0) * 100}%`, height: `${(b.y1 - b.y0) * 100}%` }}
                  onClick={() => onSelect(f)} />
              );
            })}
            {alts.map((a, i) => isXY(a.bbox) && (
              <span key={`alt${i}`} className="src-box alt" title={`${t("Kandidat", "Candidate")} ${i + 1}: ${a.value}`}
                style={{ left: `${a.bbox.x0 * 100}%`, top: `${a.bbox.y0 * 100}%`, width: `${(a.bbox.x1 - a.bbox.x0) * 100}%`, height: `${(a.bbox.y1 - a.bbox.y0) * 100}%` }} />
            ))}
          </div>
        )}
        {page.kind === "sheet" && <SheetView page={page} fields={onPage} selected={selected} onSelect={onSelect} showAll={showAll} />}
        {page.kind === "text" && <TextView page={page} fields={onPage} selected={selected} onSelect={onSelect} showAll={showAll} />}
      </div>
    </div>
  );
}

function hitMap(fields: ExtractedField[]) {
  const m = new Map<string, ExtractedField>();
  fields.forEach((f) => {
    if (!isRC(f.bbox)) return;
    for (let r = f.bbox.r0; r <= f.bbox.r1; r++) for (let c = f.bbox.c0; c <= f.bbox.c1; c++) if (!m.has(`${r}:${c}`)) m.set(`${r}:${c}`, f);
  });
  return m;
}

function SheetView({ page, fields, selected, onSelect, showAll }: {
  page: LayoutPage; fields: ExtractedField[]; selected: ExtractedField | null; onSelect: (f: ExtractedField) => void; showAll: boolean;
}) {
  const rows = page.rows ?? [];
  const width = Math.max(1, ...rows.map((r) => r.length));
  const hits = useMemo(() => hitMap(fields), [fields]);
  return (
    <div style={{ overflow: "auto", background: "#fff", borderRadius: 4 }}>
      <table className="sheet">
        <thead><tr><td className="rh" />{Array.from({ length: width }).map((_, c) => <td key={c} className="rh" style={{ textAlign: "center" }}>{COLS[c] ?? c + 1}</td>)}</tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              <td className="rh">{ri + 1}</td>
              {Array.from({ length: width }).map((_, c) => {
                const f = hits.get(`${ri}:${c}`);
                const active = !!f && selected?.id === f.id;
                const cls = f && (showAll || active) ? (active ? "active" : "hit") : "";
                return <td key={c} className={cls} title={f ? `${f.label}: ${f.value_text}` : undefined} onClick={f ? () => onSelect(f) : undefined} style={f ? { cursor: "pointer" } : undefined}>{r[c] ?? ""}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TextView({ page, fields, selected, onSelect, showAll }: {
  page: LayoutPage; fields: ExtractedField[]; selected: ExtractedField | null; onSelect: (f: ExtractedField) => void; showAll: boolean;
}) {
  const lines = page.lines ?? [];
  const byLine = useMemo(() => {
    const m = new Map<number, ExtractedField>();
    fields.forEach((f) => { if (isRC(f.bbox)) for (let r = f.bbox.r0; r <= f.bbox.r1; r++) if (!m.has(r)) m.set(r, f); });
    return m;
  }, [fields]);
  return (
    <div className="textdoc">
      {lines.map((ln, i) => {
        const f = byLine.get(i);
        const active = !!f && selected?.id === f.id;
        const content = ln || " ";
        return (
          <div key={i}>
            {f && (showAll || active)
              ? <mark className={active ? "active" : ""} onClick={() => onSelect(f)} style={{ cursor: "pointer" }}>{content}</mark>
              : content}
          </div>
        );
      })}
    </div>
  );
}
