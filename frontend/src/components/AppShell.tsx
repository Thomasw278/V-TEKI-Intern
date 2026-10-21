"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { api } from "@/lib/api";
import { initials, periodLabel, roleLabel } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useSummary } from "@/lib/summary";
import type { DocumentItem } from "@/lib/types";
import {
  IconBuilding, IconCalc, IconCheck, IconChevron, IconFactor, IconFile, IconHome, IconInbox, IconLogout, IconMenu,
  IconReport, IconSearch, IconSettings, IconSwap, IconTable, IconX, LogoMark,
} from "./Icons";
import { Badge, Toggles } from "./ui";

type NavItem = { href: string; label: string; short: string; icon: ReactNode; group: string; count?: number; countTone?: "info" };

function useNav(): NavItem[] {
  const t = useT();
  const { isAdmin, company } = useSession();
  const { summary } = useSummary();
  const st = summary?.document_status ?? {};
  const toCheck = (st.needs_review ?? 0) + (st.rejected ?? 0);
  const submitted = st.validated ?? 0;
  const drafts = summary?.issues.find((i) => i.code === "FACTOR_DRAFT") ? Number(summary.issues.find((i) => i.code === "FACTOR_DRAFT")!.title.match(/\d+/)?.[0] ?? 0) : 0;

  if (isAdmin) {
    const items: NavItem[] = [
      { href: "/admin", label: t("Perusahaan saya", "My companies"), short: t("Portofolio", "Portfolio"), icon: <IconBuilding />, group: t("Portofolio", "Portfolio") },
    ];
    if (company) {
      const g = t("Perusahaan dipilih", "Selected company");
      items.push(
        { href: "/dashboard", label: t("Ringkasan", "Overview"), short: t("Ringkasan", "Overview"), icon: <IconHome />, group: g },
        { href: "/validasi", label: t("Tinjau pengajuan", "Review submissions"), short: t("Tinjau", "Review"), icon: <IconInbox />, group: g, count: submitted, countTone: "info" },
        { href: "/dokumen", label: t("Dokumen", "Documents"), short: t("Dokumen", "Docs"), icon: <IconFile />, group: g },
        { href: "/data", label: t("Data aktivitas", "Activity data"), short: "Data", icon: <IconTable />, group: g },
        { href: "/faktor", label: t("Faktor emisi", "Emission factors"), short: t("Faktor", "Factors"), icon: <IconFactor />, group: g, count: drafts },
        { href: "/kalkulasi", label: t("Kalkulasi", "Calculation"), short: t("Hitung", "Calculate"), icon: <IconCalc />, group: g },
        { href: "/laporan", label: t("Laporan & penguncian", "Report & lock"), short: t("Laporan", "Report"), icon: <IconReport />, group: g },
      );
    }
    items.push({ href: "/pengaturan", label: company ? t("Profil & akun", "Profile & account") : t("Akun saya", "My account"), short: t("Akun", "Account"), icon: <IconSettings />, group: t("Pengaturan", "Settings") });
    return items;
  }
  const gData = t("Data & dokumen", "Data & documents");
  return [
    { href: "/dashboard", label: t("Ringkasan", "Overview"), short: t("Beranda", "Home"), icon: <IconHome />, group: t("Ikhtisar", "Overview") },
    { href: "/dokumen", label: t("Kebutuhan & unggah", "Requirements & upload"), short: t("Dokumen", "Docs"), icon: <IconFile />, group: gData },
    { href: "/validasi", label: t("Periksa & ajukan", "Check & submit"), short: t("Periksa", "Check"), icon: <IconCheck />, group: gData, count: toCheck },
    { href: "/data", label: t("Data aktivitas", "Activity data"), short: "Data", icon: <IconTable />, group: gData },
    { href: "/faktor", label: t("Faktor emisi", "Emission factors"), short: t("Faktor", "Factors"), icon: <IconFactor />, group: t("Emisi", "Emissions") },
    { href: "/kalkulasi", label: t("Kalkulasi CBAM", "CBAM calculation"), short: t("Hitung", "Calculate"), icon: <IconCalc />, group: t("Emisi", "Emissions") },
    { href: "/laporan", label: t("Tinjauan & laporan", "Review & report"), short: t("Laporan", "Report"), icon: <IconReport />, group: t("Pelaporan", "Reporting") },
    { href: "/pengaturan", label: t("Perusahaan & akun", "Company & account"), short: t("Akun", "Account"), icon: <IconSettings />, group: t("Pengaturan", "Settings") },
  ];
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const { user, isAdmin, company, logout } = useSession();
  const { summary, refreshSummary } = useSummary();
  const nav = useNav();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    setOpen(false);
    refreshSummary();
  }, [pathname, refreshSummary]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const current = nav.find((n) => isActive(n.href));
  const groups = nav.reduce<{ name: string; items: NavItem[] }[]>((acc, n) => {
    const g = acc.find((x) => x.name === n.group);
    if (g) g.items.push(n);
    else acc.push({ name: n.group, items: [n] });
    return acc;
  }, []);
  const tabs = isAdmin
    ? (company ? ["/admin", "/validasi", "/dokumen", "/kalkulasi", "/laporan"] : ["/admin", "/pengaturan"])
    : ["/dashboard", "/dokumen", "/validasi", "/kalkulasi", "/laporan"];
  const tabItems = tabs.map((h) => nav.find((n) => n.href === h)).filter(Boolean) as NavItem[];
  const signOut = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="shell">
      {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label={t("Navigasi utama", "Main navigation")}>
        <div className="inline nowrap" style={{ justifyContent: "space-between" }}>
          <Link href={isAdmin ? "/admin" : "/dashboard"} className="brand">
            <LogoMark size={26} />
            <span className="brand-text">
              <span className="brand-wordmark">KarbonLens</span>
              <span className="brand-badge">AUDIT OS</span>
            </span>
          </Link>
          <button className="btn ghost icon sm menu-btn" onClick={() => setOpen(false)} aria-label={t("Tutup menu", "Close menu")}><IconX size={18} /></button>
        </div>
        <ContextCard />
        <nav className="nav">
          {groups.map((g) => (
            <div key={g.name} style={{ display: "contents" }}>
              <div className="nav-group">{g.name}</div>
              {g.items.map((n) => (
                <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined}>
                  {n.icon}<span>{n.label}</span>
                  {!!n.count && <span className={`count mono ${n.countTone ?? ""}`}>{n.count}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar round">{initials(user?.name ?? "?")}</span>
          <span className="who"><b>{user?.name}</b><span>{roleLabel(user?.role, t)}</span></span>
          <button className="btn ghost icon sm" onClick={signOut} title={t("Keluar", "Sign out")} aria-label={t("Keluar", "Sign out")}><IconLogout size={17} /></button>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button className="btn ghost icon menu-btn" onClick={() => setOpen(true)} aria-label={t("Buka menu", "Open menu")}><IconMenu /></button>
          <Link href={isAdmin ? "/admin" : "/dashboard"} className="brand-m">
            <LogoMark size={24} />
            <span className="brand-wordmark" style={{ fontSize: 16 }}>KarbonLens</span>
          </Link>
          <div className="crumbs">
            {company && <span className="hide-s ellipsis" style={{ maxWidth: 260 }}>{company.name}</span>}
            {company && summary && <span className="sep hide-s">/</span>}
            {summary && <span className="hide-s">{t("Periode", "Period")} {summary.period.year}</span>}
            {(company || summary) && <span className="sep hide-s">/</span>}
            <b className="ellipsis">{current?.label ?? "KarbonLens"}</b>
          </div>
          <span className="spacer" />
          {summary && <span className="hide-m"><PeriodBadge status={summary.period.status} /></span>}
          <button className="search-btn" onClick={() => setPalette(true)} aria-label={t("Cari", "Search")}>
            <IconSearch size={16} /><span>{t("Cari dokumen atau halaman", "Search documents or pages")}</span><kbd>Ctrl K</kbd>
          </button>
          <Toggles />
          <UserMenu onSignOut={signOut} />
        </header>
        <main className="content" id="main">{children}</main>
      </div>

      <nav className="tabbar" aria-label={t("Navigasi cepat", "Quick navigation")}>
        {tabItems.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined}>
            {n.icon}<span>{n.short}</span>{!!n.count && <span className="dot" />}
          </Link>
        ))}
      </nav>
      {palette && <Palette nav={nav} onClose={() => setPalette(false)} />}
    </div>
  );
}

function PeriodBadge({ status }: { status: string }) {
  const t = useT();
  const p = periodLabel(status, t);
  return <Badge tone={p.tone} pip>{p.label}</Badge>;
}

/** Kartu konteks: perusahaan aktif + periode. Admin dapat berganti perusahaan dari sini. */
function ContextCard() {
  const t = useT();
  const router = useRouter();
  const { isAdmin, company, companies, selectCompany, periods, period, setPeriodId } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const choose = async (id: number | null) => {
    setOpen(false);
    await selectCompany(id);
    router.push(id ? "/dashboard" : "/admin");
  };

  return (
    <div className="stack tight" ref={ref} style={{ position: "relative" }}>
      {isAdmin ? (
        <button type="button" className="ctx-card" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="avatar">{company ? initials(company.name) : <IconBuilding size={16} />}</span>
          <span className="who">
            <b>{company?.name ?? t("Pilih perusahaan", "Choose a company")}</b>
            <span>{company ? [company.city, company.province].filter(Boolean).join(", ") || t("Sedang ditinjau", "Under review") : t(`${companies.length} perusahaan ditugaskan`, `${companies.length} companies assigned`)}</span>
          </span>
          <IconSwap size={16} />
        </button>
      ) : (
        <div className="ctx-card" style={{ cursor: "default" }}>
          <span className="avatar">{initials(company?.name ?? "?")}</span>
          <span className="who"><b>{company?.name}</b><span>{company?.sector}</span></span>
        </div>
      )}
      {open && (
        <div className="menu-pop" style={{ left: 0, right: 0, top: "100%", minWidth: 0 }} role="menu">
          <button type="button" onClick={() => choose(null)}><IconBuilding size={16} />{t("Semua perusahaan", "All companies")}</button>
          {companies.map((c) => (
            <button key={c.id} type="button" className="opt" role="menuitemradio" aria-checked={company?.id === c.id} onClick={() => choose(c.id)}>
              <span className="avatar" style={{ width: 26, height: 26, fontSize: 11, borderRadius: 7 }}>{initials(c.name)}</span>
              <span className="wrap" style={{ flex: 1 }}>{c.name}</span>
            </button>
          ))}
          {!companies.length && <div className="tiny muted" style={{ padding: 10 }}>{t("Belum ada perusahaan yang ditugaskan.", "No companies assigned yet.")}</div>}
        </div>
      )}
      {periods.length > 0 && (
        <label className="field" style={{ gap: 4 }}>
          <span className="sr-only">{t("Periode pelaporan", "Reporting period")}</span>
          <select className="select" style={{ height: 36, fontSize: 13.5 }} value={period?.id ?? ""} onChange={(e) => setPeriodId(Number(e.target.value))}>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {t("Periode", "Period")} {p.year}{p.version > 1 ? ` · v${p.version}` : ""}{p.status === "locked" ? ` · ${t("dikunci", "locked")}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function UserMenu({ onSignOut }: { onSignOut: () => void }) {
  const t = useT();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button type="button" className="btn ghost icon" style={{ width: 40, padding: 0 }} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t("Menu akun", "Account menu")}>
        <span className="avatar round" style={{ width: 32, height: 32 }}>{initials(user?.name ?? "?")}</span>
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <div className="head"><b>{user?.name}</b><span>{user?.email}</span><div style={{ marginTop: 6 }}><Badge tone="info">{roleLabel(user?.role, t)}</Badge></div></div>
          <Link href="/pengaturan#akun" onClick={() => setOpen(false)}><IconSettings size={16} />{t("Pengaturan akun", "Account settings")}</Link>
          <button type="button" onClick={onSignOut}><IconLogout size={16} />{t("Keluar", "Sign out")}</button>
        </div>
      )}
    </div>
  );
}

/** Palet perintah (Ctrl K): buka halaman atau dokumen periode aktif. */
function Palette({ nav, onClose }: { nav: NavItem[]; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const { period } = useSession();
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    if (!period) return;
    api<DocumentItem[]>(`/api/periods/${period.id}/documents`).then(setDocs).catch(() => setDocs([]));
  }, [period]);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pages = nav.filter((n) => !s || n.label.toLowerCase().includes(s))
      .map((n) => ({ key: n.href, label: n.label, sec: t("Halaman", "Pages"), go: n.href, icon: n.icon }));
    const ds = docs.filter((d) => !s || d.original_name.toLowerCase().includes(s) || (d.doc_number ?? "").toLowerCase().includes(s))
      .slice(0, 12).map((d) => ({ key: `d${d.id}`, label: d.original_name, sec: t("Dokumen", "Documents"), go: `/dokumen/${d.id}`, icon: <IconFile size={16} /> }));
    return [...pages, ...ds];
  }, [q, nav, docs, t]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    if (e.key === "Enter" && items[sel]) go(items[sel].go);
  };

  let lastSec = "";
  return (
    <div className="palette" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette-box" role="dialog" aria-label={t("Cari", "Search")}>
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey}
          placeholder={t("Ketik nama halaman, berkas, atau nomor dokumen…", "Type a page, file name or document number…")} aria-label={t("Cari", "Search")} />
        <div className="palette-list" role="listbox">
          {items.map((it, i) => {
            const head = it.sec !== lastSec ? <div className="sec">{it.sec}</div> : null;
            lastSec = it.sec;
            return (
              <div key={it.key}>
                {head}
                <button type="button" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => go(it.go)}>
                  {it.icon}<span className="wrap">{it.label}</span><IconChevron size={14} className="k" style={{ transform: "rotate(-90deg)" }} />
                </button>
              </div>
            );
          })}
          {!items.length && <div className="empty"><b>{t("Tidak ada hasil", "No results")}</b></div>}
        </div>
      </div>
    </div>
  );
}
