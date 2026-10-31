"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setActiveCompanyHeader, setToken } from "./api";
import { onLangChange } from "./i18n";
import type { Company, CompanyBrief, Period, Role, Session, User } from "./types";

const PERIOD_KEY = "karbonlens.period";
const COMPANY_KEY = "karbonlens.company";

function readNum(key: string): number | null {
  try {
    return Number(window.localStorage.getItem(key)) || null;
  } catch {
    return null;
  }
}
function writeNum(key: string, v: number | null) {
  try {
    if (v) window.localStorage.setItem(key, String(v));
    else window.localStorage.removeItem(key);
  } catch {
    /* mode privat */
  }
}

interface SessionCtx {
  ready: boolean;
  user: User | null;
  role: Role | null;
  isAdmin: boolean;
  /** Pengelola sistem: tidak punya konteks perusahaan, hanya memakai halaman /superadmin. */
  isSuperadmin: boolean;
  /** Perusahaan aktif: milik akun perusahaan, atau yang sedang ditinjau admin. */
  company: Company | null;
  /** Admin: semua perusahaan yang ditugaskan. */
  companies: CompanyBrief[];
  /** Admin: memilih perusahaan yang ditinjau (null = kembali ke portofolio). */
  selectCompany: (id: number | null) => Promise<void>;
  periods: Period[];
  period: Period | null;
  setPeriodId: (id: number) => void;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: unknown) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  reloadCompany: () => Promise<void>;
  /** Versi data; naik setiap bahasa/perusahaan berubah supaya halaman memuat ulang. */
  epoch: number;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Session | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodIdState] = useState<number | null>(null);
  const [epoch, setEpoch] = useState(0);

  const pickPeriod = useCallback((list: Period[]) => {
    const stored = readNum(PERIOD_KEY);
    setPeriodIdState(list.find((p) => p.id === stored)?.id ?? list[0]?.id ?? null);
  }, []);

  /** Admin: muat profil & periode perusahaan yang dipilih (header X-Company-Id). */
  const loadCompany = useCallback(async (id: number | null) => {
    setActiveCompanyHeader(id);
    writeNum(COMPANY_KEY, id);
    if (!id) {
      setCompany(null);
      setPeriods([]);
      setPeriodIdState(null);
      return;
    }
    const [c, ps] = await Promise.all([api<Company>("/api/company"), api<Period[]>("/api/periods")]);
    setCompany(c);
    setPeriods(ps);
    pickPeriod(ps);
  }, [pickPeriod]);

  const apply = useCallback(async (s: Session) => {
    setToken(s.access_token);
    setData(s);
    if (s.user.role === "company") {
      setActiveCompanyHeader(null);
      setCompany(s.company);
      setPeriods(s.periods);
      pickPeriod(s.periods);
    } else if (s.user.role === "superadmin") {
      setActiveCompanyHeader(null);
      setCompany(null);
      setPeriods([]);
      setPeriodIdState(null);
    } else {
      const stored = readNum(COMPANY_KEY);
      const valid = s.companies.find((c) => c.id === stored)?.id ?? null;
      try {
        await loadCompany(valid);
      } catch {
        await loadCompany(null);
      }
    }
  }, [loadCompany, pickPeriod]);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setData(null);
      return;
    }
    try {
      await apply(await api<Session>("/api/auth/me"));
    } catch {
      setToken(null);
      setData(null);
    }
  }, [apply]);

  useEffect(() => {
    refresh().finally(() => setReady(true));
    const onUnauthorized = () => setData(null);
    window.addEventListener("karbonlens:unauthorized", onUnauthorized);
    const off = onLangChange(() => setEpoch((e) => e + 1));
    return () => {
      window.removeEventListener("karbonlens:unauthorized", onUnauthorized);
      off();
    };
  }, [refresh]);

  const value = useMemo<SessionCtx>(() => ({
    ready,
    user: data?.user ?? null,
    role: data?.user.role ?? null,
    isAdmin: data?.user.role === "admin",
    isSuperadmin: data?.user.role === "superadmin",
    company,
    companies: data?.companies ?? [],
    selectCompany: async (id) => {
      await loadCompany(id);
      setEpoch((e) => e + 1);
    },
    periods,
    period: periods.find((p) => p.id === periodId) ?? periods[0] ?? null,
    setPeriodId: (id: number) => {
      setPeriodIdState(id);
      writeNum(PERIOD_KEY, id);
    },
    login: async (email, password) => {
      const s = await api<Session>("/api/auth/login", { body: { email, password } });
      await apply(s);
      return s.user;
    },
    register: async (payload) => {
      await apply(await api<Session>("/api/auth/register", { body: payload }));
    },
    logout: () => {
      setToken(null);
      setActiveCompanyHeader(null);
      setData(null);
      setCompany(null);
      setPeriods([]);
    },
    refresh,
    reloadCompany: async () => {
      if (data?.user.role === "admin") await loadCompany(company?.id ?? null);
      else await refresh();
    },
    epoch,
  }), [data, company, periods, periodId, ready, apply, refresh, loadCompany, epoch]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession harus dipakai di dalam <SessionProvider>");
  return v;
}
