"use client";

import { reqSourceLabel, reqStatusLabel, when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { ExcludedCategory } from "@/lib/types";
import { IconMinus, IconShield, IconX } from "./Icons";
import { Badge } from "./ui";

/** Ikon per status kebutuhan: status tidak boleh hanya dibedakan lewat warna. */
export function StatusIcon({ status, size = 13 }: { status: string; size?: number }) {
  if (status === "required") return <IconShield size={size} aria-hidden="true" />;
  if (status === "optional") return <IconMinus size={size} aria-hidden="true" />;
  return <IconX size={size} aria-hidden="true" />;
}

export function ReqStatusBadge({ status, label }: { status: string; label?: string }) {
  const t = useT();
  const s = reqStatusLabel(status, t);
  return <Badge tone={s.tone}><StatusIcon status={status} />{label ?? s.label}</Badge>;
}

/** Catatan "N kategori dikecualikan dari perhitungan" yang bisa dibuka untuk melihat alasannya. */
export function ExcludedNote({ items }: { items: ExcludedCategory[] }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <details className="note-box">
      <summary>
        <StatusIcon status="not_applicable" size={15} />
        <span><b>{t(`${items.length} kategori dikecualikan dari perhitungan`, `${items.length} ${items.length === 1 ? "category is" : "categories are"} excluded from the calculation`)}</b>
          <span className="muted small"> · {t("tidak berlaku untuk perusahaan ini, bukan diisi nol", "not applicable to this company, not filled with zero")}</span></span>
      </summary>
      <div className="body">
        {items.map((x) => (
          <div key={x.code} className="stack tight" style={{ gap: 2 }}>
            <b className="wrap">{x.name}</b>
            <span className="wrap">{x.reason || t("Tanpa alasan tertulis", "No written reason")}</span>
            <span className="tiny muted">{x.set_by ? `${x.set_by} · ` : ""}{reqSourceLabel(x.source, t)}{x.set_at ? ` · ${when(x.set_at)}` : ""}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
