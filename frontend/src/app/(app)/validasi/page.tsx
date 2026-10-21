"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconArrow, IconCheck, IconInbox } from "@/components/Icons";
import { Badge, Button, Empty, ErrorBox, Loading, PageHead, StatusBadge, useLoad, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { loadDocTypes } from "@/lib/doctypes";
import { when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useSummary } from "@/lib/summary";
import type { DocumentItem, DocType } from "@/lib/types";

/** Perusahaan: dokumen yang perlu diperiksa / dikembalikan. Admin: dokumen yang diajukan. */
export default function ReviewQueue() {
  const t = useT();
  const { period, isAdmin, epoch } = useSession();
  const { refreshSummary } = useSummary();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const [view, setView] = useState<"todo" | "done">("todo");
  const { data, error, loading, reload } = useLoad(async () => {
    if (!period) return null;
    const [docs, types] = await Promise.all([api<DocumentItem[]>(`/api/periods/${period.id}/documents`), loadDocTypes()]);
    return { docs, types };
  }, [period?.id, epoch]);

  const groups = useMemo(() => {
    const docs = data?.docs ?? [];
    if (isAdmin) {
      return {
        todo: docs.filter((d) => d.status === "validated").sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? "")),
        done: docs.filter((d) => d.status === "approved" || d.status === "rejected"),
      };
    }
    return {
      todo: docs.filter((d) => d.status === "needs_review" || d.status === "rejected" || d.status === "failed")
        .sort((a, b) => Number(b.status === "rejected") - Number(a.status === "rejected")),
      done: docs.filter((d) => d.status === "validated" || d.status === "approved"),
    };
  }, [data, isAdmin]);

  if (!period) return null;
  if (loading && !data) return <Loading rows={1} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data) return null;

  const typeName = (code: string | null) => data.types.find((x: DocType) => x.code === code)?.name ?? t("Belum dikenali", "Not recognised");
  const list = view === "todo" ? groups.todo : groups.done;
  const approve = async (d: DocumentItem) => {
    setBusy(d.id);
    try {
      await api(`/api/documents/${d.id}/approve`, { method: "POST" });
      toast(t(`${d.original_name} disetujui`, `${d.original_name} approved`));
      reload(true);
      refreshSummary();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead
        title={isAdmin ? t("Tinjau pengajuan", "Review submissions") : t("Periksa & ajukan", "Check & submit")}
        description={isAdmin
          ? t("Dokumen yang sudah diperiksa perusahaan. Buka untuk membandingkan angka dengan dokumen aslinya, lalu setujui atau kembalikan.",
            "Documents the company has checked. Open one to compare the figures with the original, then approve or return it.")
          : t("Pastikan angka yang dibaca sistem sesuai dokumen, lalu ajukan ke admin peninjau. Dokumen yang dikembalikan admin muncul paling atas.",
            "Make sure the figures the system read match the document, then submit them to the reviewer. Documents returned by the reviewer appear first.")} />

      <div className="segmented" role="tablist" aria-label={t("Tampilan", "View")} style={{ alignSelf: "flex-start" }}>
        <button role="tab" aria-selected={view === "todo"} aria-pressed={view === "todo"} onClick={() => setView("todo")}>
          {isAdmin ? t("Menunggu persetujuan", "Awaiting approval") : t("Perlu diperiksa", "To check")} ({groups.todo.length})
        </button>
        <button role="tab" aria-selected={view === "done"} aria-pressed={view === "done"} onClick={() => setView("done")}>
          {isAdmin ? t("Sudah ditinjau", "Reviewed") : t("Sudah diajukan", "Submitted")} ({groups.done.length})
        </button>
      </div>

      <section className="panel flush" data-ui="true">
        {list.length === 0 ? (
          <Empty icon={view === "todo" ? <IconCheck /> : <IconInbox />}
            title={view === "todo" ? (isAdmin ? t("Tidak ada pengajuan yang menunggu", "No submissions waiting") : t("Semua dokumen sudah diajukan", "Every document has been submitted"))
              : t("Belum ada", "Nothing yet")}
            action={!isAdmin && view === "todo" ? <Link href="/dokumen#unggah" className="btn secondary">{t("Unggah dokumen lain", "Upload more documents")}</Link> : undefined}>
            {view === "todo" && isAdmin ? t("Pengajuan baru dari perusahaan akan muncul di sini.", "New submissions from the company will appear here.") : undefined}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table cards">
              <thead><tr><th>{t("Dokumen", "Document")}</th><th>{t("Kategori", "Category")}</th><th>Status</th><th>{isAdmin ? t("Diajukan", "Submitted") : t("Diunggah", "Uploaded")}</th><th /></tr></thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.id}>
                    <td className="primary">
                      <Link href={`/dokumen/${d.id}`} className="strong wrap" style={{ color: "var(--ink)" }}>{d.original_name}</Link>
                      {d.status === "rejected" && d.review_note && <div className="tiny" style={{ color: "var(--bad)" }}>{t("Catatan admin", "Reviewer note")}: {d.review_note}</div>}
                      {d.status !== "rejected" && (d.doc_number || d.supplier) && <div className="tiny muted wrap">{[d.doc_number, d.supplier].filter(Boolean).join(" · ")}</div>}
                    </td>
                    <td data-label={t("Kategori", "Category")} className="small">{typeName(d.type_code)}</td>
                    <td data-label="Status"><StatusBadge status={d.status} /></td>
                    <td data-label={isAdmin ? t("Diajukan", "Submitted") : t("Diunggah", "Uploaded")} className="small muted">{when(isAdmin ? d.submitted_at : d.created_at)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {isAdmin && d.status === "validated" && period.status !== "locked" && (
                        <Button size="sm" variant="ghost" loading={busy === d.id} onClick={() => approve(d)} title={t("Setujui tanpa membuka", "Approve without opening")}>
                          <IconCheck size={14} />{t("Setujui", "Approve")}
                        </Button>
                      )}
                      <Link href={`/dokumen/${d.id}`} className="btn secondary sm">
                        {isAdmin ? t("Tinjau", "Review") : d.status === "rejected" ? t("Perbaiki", "Fix") : t("Periksa", "Check")}<IconArrow size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {!isAdmin && groups.done.some((d) => d.status === "validated") && view === "todo" && (
        <p className="small muted"><Badge tone="info">{groups.done.filter((d) => d.status === "validated").length}</Badge> {t("dokumen menunggu persetujuan admin peninjau.", "documents are waiting for reviewer approval.")}</p>
      )}
    </>
  );
}
