"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import { useSession } from "./session";
import type { Dashboard } from "./types";

interface SummaryCtx {
  summary: Dashboard | null;
  refreshSummary: () => void;
}

const Ctx = createContext<SummaryCtx>({ summary: null, refreshSummary: () => {} });

/** Ringkasan periode aktif untuk navigasi (lencana jumlah) dan status di bilah atas. */
export function SummaryProvider({ children }: { children: ReactNode }) {
  const { period, epoch } = useSession();
  const [summary, setSummary] = useState<Dashboard | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!period) return setSummary(null);
    try {
      setSummary(await api<Dashboard>(`/api/periods/${period.id}/dashboard`));
    } catch {
      /* ringkasan bersifat pelengkap; halaman tetap jalan */
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load, epoch]);

  const refreshSummary = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 400);
  }, [load]);

  const value = useMemo(() => ({ summary, refreshSummary }), [summary, refreshSummary]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSummary = () => useContext(Ctx);
