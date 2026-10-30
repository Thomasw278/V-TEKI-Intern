"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from "react";
import { statusLabel, type Tone } from "@/lib/format";
import { locale, useLang, useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { IconMoon, IconSun, IconX, LogoMark } from "./Icons";

export { LogoMark };

/* ------------------------------------------------------------------ Logo & Brand */
export function Logo({ size = 28 }: { size?: number }) {
  return <LogoMark size={size} />;
}

export function Brand({ size = 26, showBadge = true, className = "" }: { size?: number; showBadge?: boolean; className?: string }) {
  return (
    <span className={`brand-identity ${className}`}>
      <LogoMark size={size} />
      <span className="brand-text">
        <span className="brand-wordmark">KarbonLens</span>
        {showBadge && <span className="brand-badge">AUDIT OS</span>}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ Tombol */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "accent" | "danger" | "warn" | "on-dark";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  loading?: boolean;
};
export function Button({ variant = "secondary", size = "md", block, loading, children, className = "", disabled, type = "button", ...rest }: BtnProps) {
  const cls = ["btn", variant, size !== "md" ? size : "", block ? "block" : "", loading ? "is-loading" : "", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="btn-spinner" aria-hidden="true" />}
      <span className="btn-content" style={loading ? { visibility: "hidden" } : undefined}>
        {children}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ Lencana */
export function Badge({ tone = "neutral", children, pip }: { tone?: Tone; children: ReactNode; pip?: boolean }) {
  return <span className={`badge ${tone}`}>{pip && <span className="pip" />}{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const s = statusLabel(status, t);
  return <Badge tone={s.tone} pip>{s.label}</Badge>;
}

/* ------------------------------------------------------------------ Judul halaman */
export function PageHead({ title, description, eyebrow, children }: {
  title: ReactNode; description?: ReactNode; eyebrow?: ReactNode; children?: ReactNode;
}) {
  return (
    <header className="page-head page-enter">
      <div className="titles">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </header>
  );
}

export function Spinner({ label }: { label?: string }) {
  const t = useT();
  return <span className="spinner" role="status" aria-label={label ?? t("Memuat", "Loading")} />;
}

export function Loading({ rows = 2 }: { rows?: number }) {
  const t = useT();
  return (
    <div className="stack" aria-busy="true" aria-label={t("Memuat data", "Loading data")}>
      <div className="skeleton" style={{ height: 40, width: "38%" }} />
      <div className="kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}</div>
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton" style={{ height: 220 }} />)}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="banner bad anim-shake" role="alert">
      <span className="grow">{msg}</span>
      {onRetry && <Button size="sm" onClick={onRetry}>{t("Coba lagi", "Try again")}</Button>}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="ic">{icon}</div>}
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Angka beranimasi */
export function CountUp({ value, digits = 0, duration = 1000 }: { value: number; digits?: number; duration?: number }) {
  const { lang } = useLang();
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setShown(a + (value - a) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  const text = new Intl.NumberFormat(lang === "en" ? "en-US" : "id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(shown);
  return <span className="num">{text}</span>;
}

/** Lima balok keyakinan: hijau ≥ 0,9 · kuning ≥ 0,75 · merah di bawahnya. Selalu disertai angka. */
export function ConfMeter({ value, empty }: { value: number; empty?: boolean }) {
  const color = value >= 0.9 ? "var(--ok)" : value >= 0.75 ? "var(--warn)" : "var(--bad)";
  const n = empty ? 0 : Math.max(1, Math.round(value * 5));
  return (
    <span className="conf" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ background: i < n ? color : undefined }} />)}
    </span>
  );
}

/* ------------------------------------------------------------------ Sakelar bahasa & tema */
export function Toggles({ onDark }: { onDark?: boolean }) {
  const { lang, setLang, t } = useLang();
  const { theme, toggle } = useTheme();
  return (
    <div className={`toggles ${onDark ? "on-dark" : ""}`}>
      <div className="lang-toggle" role="group" aria-label={t("Bahasa", "Language")}>
        <button type="button" aria-pressed={lang === "id"} onClick={() => setLang("id")} title="Bahasa Indonesia">ID</button>
        <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} title="English">EN</button>
      </div>
      <button type="button" className="theme-btn" onClick={toggle}
        aria-label={theme === "dark" ? t("Pakai tema terang", "Switch to light mode") : t("Pakai tema gelap", "Switch to dark mode")}
        title={theme === "dark" ? t("Tema terang", "Light mode") : t("Tema gelap", "Dark mode")}>
        {theme === "dark" ? <IconSun size={17} /> : <IconMoon size={17} />}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ Dialog */
export function Dialog({ open, title, children, onClose, actions }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void; actions?: ReactNode;
}) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="inline nowrap" style={{ alignItems: "flex-start" }}>
          <h2 style={{ flex: 1 }}>{title}</h2>
          <button type="button" className="btn ghost icon sm" onClick={onClose} aria-label={t("Tutup", "Close")}><IconX size={16} /></button>
        </div>
        <div className="stack" style={{ marginTop: 8 }}>{children}</div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Toast */
type ToastItem = { id: number; text: string; kind: "ok" | "error" };
const ToastCtx = createContext<(text: string, kind?: "ok" | "error") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, text, kind }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((x) => (
          <div key={x.id} className={`toast ${x.kind === "error" ? "error" : ""}`}>
            <span className="i">{x.kind === "error" ? "!" : "✓"}</span>
            <span>{x.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ------------------------------------------------------------------ Pemuat data */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, reload, setData };
}

/** Format angka sesuai bahasa aktif (dipakai di luar komponen yang sudah memakai `num`). */
export const fmtNumber = (n: number, digits = 0) =>
  new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
