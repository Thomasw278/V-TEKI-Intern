import { getLang, locale } from "./i18n";

type T = (id: string, en: string) => string;
const cache = new Map<string, Intl.NumberFormat>();

/** 30778 → "30.778" (ID) / "30,778" (EN). */
export function num(value: number | string | null | undefined, digits = 0): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const key = `${locale()}:${digits}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
    cache.set(key, f);
  }
  return f.format(n);
}

/** Angka bulat tanpa desimal (2.639,9999 → 2.640), selain itu satu desimal. */
export const nice = (v: number) => num(v, Math.abs(v - Math.round(v)) < 0.01 ? 0 : 1);

export function pct(value: number, digits = 1): string {
  return `${num(value * 100, digits)}%`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${num(n / 1024, 0)} KB`;
  return `${num(n / 1024 / 1024, 1)} MB`;
}

function parseIso(iso: string): Date {
  // backend menyimpan UTC tanpa zona → tambahkan "Z"
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseIso(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const en = getLang() === "en";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return en ? "just now" : "baru saja";
  if (diff < 3600) return en ? `${Math.floor(diff / 60)} min ago` : `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return en ? `${Math.floor(diff / 3600)} h ago` : `${Math.floor(diff / 3600)} jam lalu`;
  return d.toLocaleDateString(locale(), { day: "2-digit", month: "short", year: "numeric" });
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : parseIso(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
}

export function initials(name: string): string {
  return name
    .replace(/^(PT|CV|UD)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

/** Status dokumen dalam alur dua peran: perusahaan memeriksa & mengajukan, admin menyetujui. */
export function statusLabel(status: string, t: T): { label: string; tone: Tone } {
  switch (status) {
    case "uploaded": return { label: t("Antre", "Queued"), tone: "neutral" };
    case "processing": return { label: t("Sedang dibaca", "Reading"), tone: "info" };
    case "needs_review": return { label: t("Perlu diperiksa", "Needs checking"), tone: "warn" };
    case "validated": return { label: t("Diajukan", "Submitted"), tone: "info" };
    case "approved": return { label: t("Disetujui", "Approved"), tone: "ok" };
    case "rejected": return { label: t("Dikembalikan", "Returned"), tone: "bad" };
    case "failed": return { label: t("Gagal dibaca", "Failed"), tone: "bad" };
    default: return { label: status, tone: "neutral" };
  }
}

export function periodLabel(status: string, t: T): { label: string; tone: Tone } {
  if (status === "locked") return { label: t("Dikunci", "Locked"), tone: "ok" };
  if (status === "calculated") return { label: t("Sudah dihitung", "Calculated"), tone: "info" };
  return { label: t("Terbuka", "Open"), tone: "warn" };
}

export const roleLabel = (role: string | undefined | null, t: T) =>
  role === "admin" ? t("Admin peninjau", "Reviewer") : t("Akun perusahaan", "Company account");

/** Teks angka gaya Indonesia/Inggris → string desimal untuk API ("12.000" → "12000", "45,5" → "45.5"). */
export function toDecimal(v: string): string | null {
  let s = (v || "").trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    const parts = s.split(",");
    s = parts.length > 2 || (parts[1]?.length === 3 && parts[0] !== "0") ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (s.includes(".")) {
    const parts = s.split(".");
    if (parts.length > 2 || (parts[1]?.length === 3 && parts[0] !== "0")) s = s.replace(/\./g, "");
  }
  return /^-?\d+(\.\d+)?$/.test(s) ? s : null;
}

/** "kanan+kiri+satuan" → "di kanan label · 3 cara sepakat". */
export function describeMethod(m: string | null | undefined, t: T): string {
  if (!m) return "";
  const TEXT: Record<string, [string, string]> = {
    kanan: ["di kanan label", "right of the label"], kiri: ["di kiri label", "left of the label"],
    bawah: ["di bawah label", "below the label"], atas: ["di atas label", "above the label"],
    satuan: ["dikenali dari satuan", "recognised by its unit"], matriks: ["persilangan baris dan kolom", "row × column crossing"],
    label: ["setelah label", "after the label"], pola: ["pola teks", "text pattern"], tabel: ["kolom tabel", "table column"],
    "tabel (sel terbungkus)": ["sel tabel dua baris", "wrapped table cell"], baris: ["baris rincian", "line item"],
    dokumen: ["berlaku untuk seluruh dokumen", "applies to the whole document"], manual: ["diisi manual", "entered manually"],
    item: ["baris rincian", "line item"], kop: ["kop surat", "letterhead"], total: ["baris TOTAL", "TOTAL row"],
    jumlah: ["jumlah baris", "sum of rows"], "jumlah baris": ["jumlah baris", "sum of rows"],
  };
  const tx = (k: string) => (TEXT[k] ? t(TEXT[k][0], TEXT[k][1]) : k);
  const parts = m.split("+").filter(Boolean);
  if (parts.includes("LWBP") || parts.includes("WBP")) return t("LWBP + WBP dijumlah", "LWBP + WBP added");
  if (parts[0] === "tabel" && (parts.includes("total") || parts.includes("jumlah"))) {
    return parts.includes("total") ? t("blok tabel, cocok dengan baris TOTAL", "table blocks, matches the TOTAL row")
      : t("jumlah blok tabel", "sum of table blocks");
  }
  const main = tx(parts[0]);
  const others = parts.slice(1).filter((p) => p !== "dokumen");
  const doc = parts.includes("dokumen") && parts[0] !== "dokumen" ? t(" · seluruh dokumen", " · whole document") : "";
  return others.length ? `${main} · ${others.length + 1} ${t("cara sepakat", "methods agree")}${doc}` : `${main}${doc}`;
}

export const MONTHS = {
  id: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
export const monthNames = () => MONTHS[getLang()];
