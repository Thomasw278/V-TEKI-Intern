"use client";

import { api } from "./api";
import { getLang } from "./i18n";
import type { DocType } from "./types";

const cache = new Map<string, Promise<DocType[]>>();

/** Katalog 10 jenis dokumen (di-cache per bahasa selama sesi). */
export function loadDocTypes(): Promise<DocType[]> {
  const key = getLang();
  let p = cache.get(key);
  if (!p) {
    p = api<DocType[]>("/api/document-types").catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, p);
  }
  return p;
}
