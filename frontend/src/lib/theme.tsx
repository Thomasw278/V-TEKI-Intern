"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Tema terang / gelap. Pilihan disimpan di browser; tanpa pilihan mengikuti sistem operasi.
 * Skrip kecil di <head> (lihat THEME_SCRIPT) memasang tema sebelum halaman tampil sehingga
 * tidak ada kedipan putih saat membuka aplikasi dalam mode gelap.
 */
export type Theme = "light" | "dark";
const KEY = "karbonlens.theme";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){}})();`;

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ theme: "light", setTheme: () => {}, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setThemeState(t === "dark" ? "dark" : "light");
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
    try {
      window.localStorage.setItem(KEY, t);
    } catch {
      /* mode privat */
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }), [theme, setTheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
