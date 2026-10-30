"use client";

import { api } from "./api";
import { getLang } from "./i18n";
import type { DocType, DocTypeField } from "./types";

/** Skema field dokumen transportasi (mendukung konsumsi BBM langsung dan fallback ton-km). */
export const TRANSPORT_FIELDS: DocTypeField[] = [
  { key: "volume_l", label: "Kuantitas BBM", unit: "L", kind: "number", required: false },
  { key: "fuel_type", label: "Jenis BBM", unit: "", kind: "text", required: false, default: "solar" },
  { key: "load_t", label: "Muatan", unit: "t", kind: "number", required: false },
  { key: "distance_km", label: "Jarak", unit: "km", kind: "number", required: false },
  { key: "mode", label: "Moda", unit: "", kind: "text", required: false },
];

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
