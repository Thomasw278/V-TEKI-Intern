"use client";

import { getLang } from "./i18n";
import type {
  AdminAccount, AuditActor, CatalogType, CompanyRequirement, CompanyRequirementsDetail, ExceptionRequest, ProfileApplyResult,
  ReqStatus, RequirementConflict, RequirementPreview, RequirementProfile, SuperAuditEntry, SuperCompanyRow,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const TOKEN_KEY = "karbonlens.token";

/** Perusahaan yang sedang ditinjau oleh akun admin (dikirim sebagai header X-Company-Id). */
let activeCompany: number | null = null;
export const setActiveCompanyHeader = (id: number | null) => {
  activeCompany = id;
};

function baseHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Accept-Language": getLang() };
  const token = getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  if (activeCompany) h["X-Company-Id"] = String(activeCompany);
  return h;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* mode privat: abaikan */
  }
}

function messageFrom(status: number, body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length) {
      // error validasi Pydantic
      const first = d[0] as { msg?: string; loc?: unknown[] };
      const where = Array.isArray(first.loc) ? first.loc.slice(1).join(".") : "";
      return `${where ? where + ": " : ""}${first.msg ?? (getLang() === "en" ? "Invalid data" : "Data tidak valid")}`;
    }
    if (d && typeof d === "object" && "message" in d) return String((d as { message: string }).message);
  }
  const en = getLang() === "en";
  if (status === 0) return en ? "Cannot reach the API server. Make sure the backend is running." : "Tidak bisa terhubung ke server API. Pastikan backend berjalan.";
  return en ? `Request failed (${status})` : `Permintaan gagal (${status})`;
}

type Options = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const headers = baseHeaders();
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, messageFrom(0, null));
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/login")) {
      setToken(null);
      window.dispatchEvent(new Event("karbonlens:unauthorized"));
    }
    throw new ApiError(res.status, messageFrom(res.status, data), data);
  }
  return data as T;
}

/** Unggah dengan progres (XMLHttpRequest mendukung event upload.progress). */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    Object.entries(baseHeaders()).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: unknown = xhr.responseText;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* bukan JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(new ApiError(xhr.status, messageFrom(xhr.status, data), data));
    };
    xhr.onerror = () => reject(new ApiError(0, messageFrom(0, null)));
    xhr.send(form);
  });
}

/** Ambil berkas ber-otorisasi sebagai Blob (pratinjau PDF / unduhan ekspor). */
export async function fetchBlob(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(`${API_URL}${path}`, { headers: baseHeaders() });
  if (!res.ok) {
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* abaikan */
    }
    throw new ApiError(res.status, messageFrom(res.status, data), data);
  }
  const cd = res.headers.get("content-disposition") || "";
  const m = cd.match(/filename="?([^";]+)"?/i);
  return { blob: await res.blob(), filename: m ? m[1] : null };
}

export async function downloadFile(path: string, fallbackName: string) {
  const { blob, filename } = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Daftar perbedaan dari respons 409 "status sudah diubah superadmin lain". */
export function conflictsOf(e: unknown): RequirementConflict[] | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const d = (e.detail as { detail?: { conflicts?: RequirementConflict[] } } | null)?.detail;
  return d && typeof d === "object" && Array.isArray(d.conflicts) ? d.conflicts : null;
}

export type ReqChange = { code: string; status: ReqStatus; expected?: ReqStatus };

/** API ruang kerja superadmin (/api/superadmin). */
export const superApi = {
  companies: () => api<SuperCompanyRow[]>("/api/superadmin/companies"),
  requirements: (companyId: number | string) => api<CompanyRequirementsDetail>(`/api/superadmin/companies/${companyId}/requirements`),
  preview: (companyId: number, changes: ReqChange[], reason?: string | null) =>
    api<RequirementPreview>(`/api/superadmin/companies/${companyId}/requirements/preview`, { body: { changes, reason: reason || null } }),
  saveRequirements: (companyId: number, changes: ReqChange[], reason: string | null) =>
    api<{ changed: unknown[]; requirements: CompanyRequirement[] }>(`/api/superadmin/companies/${companyId}/requirements`, { method: "PUT", body: { changes, reason } }),
  docTypes: () => api<CatalogType[]>("/api/superadmin/doc-types"),
  createDocType: (body: Record<string, unknown>) => api<CatalogType>("/api/superadmin/doc-types", { body }),
  updateDocType: (code: string, body: Record<string, unknown>) => api<CatalogType>(`/api/superadmin/doc-types/${code}`, { method: "PATCH", body }),
  profiles: () => api<RequirementProfile[]>("/api/superadmin/profiles"),
  saveProfile: (id: number | null, body: { name: string; description: string | null; items: Record<string, ReqStatus> }) =>
    id ? api<RequirementProfile>(`/api/superadmin/profiles/${id}`, { method: "PATCH", body }) : api<RequirementProfile>("/api/superadmin/profiles", { body }),
  applyProfile: (id: number, companyIds: number[], dryRun: boolean, reason: string | null) =>
    api<ProfileApplyResult>(`/api/superadmin/profiles/${id}/apply`, { body: { company_ids: companyIds, dry_run: dryRun, reason } }),
  exceptions: (status: "pending" | "approved" | "rejected" | "all") => api<ExceptionRequest[]>(`/api/superadmin/exceptions?status=${status}`),
  decide: (id: number, decision: "approved" | "rejected", note: string | null) =>
    api<ExceptionRequest>(`/api/superadmin/exceptions/${id}/decide`, { body: { decision, note } }),
  admins: () => api<AdminAccount[]>("/api/superadmin/admins"),
  createAdmin: (body: { name: string; email: string; password: string }) => api<AdminAccount>("/api/superadmin/admins", { body }),
  updateAdmin: (id: number, body: { name?: string; is_active?: boolean; password?: string }) =>
    api<AdminAccount>(`/api/superadmin/admins/${id}`, { method: "PATCH", body }),
  assign: (adminId: number, companyId: number) => api<AdminAccount>(`/api/superadmin/admins/${adminId}/companies/${companyId}`, { method: "POST" }),
  unassign: (adminId: number, companyId: number) => api<AdminAccount>(`/api/superadmin/admins/${adminId}/companies/${companyId}`, { method: "DELETE" }),
  audit: (q: Record<string, string | number | null | undefined>) => {
    const qs = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => v !== null && v !== undefined && v !== "" && qs.set(k, String(v)));
    return api<SuperAuditEntry[]>(`/api/superadmin/audit?${qs}`);
  },
  auditActors: () => api<AuditActor[]>("/api/superadmin/audit/actors"),
};

/** API kebutuhan dokumen untuk akun perusahaan (dan admin peninjau, baca saja). */
export const requirementsApi = {
  mine: () => api<{ requirements: CompanyRequirement[]; exceptions: ExceptionRequest[] }>("/api/company/requirements"),
  requestException: (type_code: string, requested_status: "optional" | "not_applicable", reason: string) =>
    api<ExceptionRequest>("/api/company/exception-requests", { body: { type_code, requested_status, reason } }),
};
