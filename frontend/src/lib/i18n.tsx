"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Bahasa antarmuka (Indonesia / Inggris).
 *
 * Teks ditulis berpasangan di tempat pemakaiannya: t("Unggah dokumen", "Upload documents").
 * Dengan begitu tidak ada kunci terjemahan yang bisa hilang atau salah ketik, dan setiap
 * kalimat mudah dicari di kode. Pesan dari backend diterjemahkan oleh API (Accept-Language).
 */
export type Lang = "id" | "en";
const KEY = "karbonlens.lang";

let current: Lang = "id";
const listeners = new Set<(l: Lang) => void>();

/** Bahasa aktif untuk kode di luar komponen (format angka, header API). */
export const getLang = (): Lang => current;
export const locale = (): string => (current === "en" ? "en-US" : "id-ID");

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (id: string, en: string) => string;
}

const Ctx = createContext<LangCtx>({ lang: "id", setLang: () => {}, t: (id) => id });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("id");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      stored = null;
    }
    // bawaan Bahasa Indonesia; pilihan pengguna disimpan di browser
    const initial: Lang = stored === "en" ? "en" : "id";
    current = initial;
    setLangState(initial);
  }, []);

  useEffect(() => {
    current = lang;
    document.documentElement.lang = lang;
    listeners.forEach((fn) => fn(lang));
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    current = l;
    try {
      window.localStorage.setItem(KEY, l);
    } catch {
      /* mode privat */
    }
    setLangState(l);
  }, []);

  const t = useCallback((id: string, en: string) => (lang === "en" ? en : id), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;

/** Dipanggil saat bahasa berubah (mis. memuat ulang data dari API). */
export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
