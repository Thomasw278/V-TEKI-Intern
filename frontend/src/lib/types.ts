/** company = akun perusahaan (mendaftar sendiri); admin = peninjau; superadmin = pengelola sistem (dibuat lewat CLI). */
export type Role = "company" | "admin" | "superadmin";

/** Status kebutuhan dokumen per perusahaan (diatur superadmin). */
export type ReqStatus = "required" | "optional" | "not_applicable";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  company_id: number | null;
}

export interface CompanyBrief {
  id: number;
  name: string;
  city: string | null;
  province: string | null;
  sector: string | null;
}

/** Baris portofolio admin: status terkini setiap perusahaan yang ditinjau. */
export interface AdminCompanyRow extends CompanyBrief {
  assigned_at: string | null;
  period: { id: number; year: number; status: Period["status"]; version: number } | null;
  waiting_review: number;
  documents: number;
  draft_factors: number;
  total_t: number | null;
  calc_version: number | null;
  last_activity: string | null;
}

export interface QueueItem {
  id: number;
  company_id: number;
  company: string;
  period_id: number;
  year: number;
  original_name: string;
  type_code: string | null;
  doc_number: string | null;
  submitted_at: string | null;
}

export interface Reviewer {
  name: string;
  email: string;
  assigned_at: string | null;
}

export interface Company {
  id: number;
  name: string;
  legal_id: string | null;
  sector: string;
  address: string | null;
  province: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  gwp_set: "AR5" | "AR6";
  allocation_method: "economic" | "mass";
  grid_system: "jamali" | "sumatera" | "kalimantan" | "sulawesi" | "lainnya";
  pome_treatment: "open" | "biogas";
  created_at: string;
}

export interface Period {
  id: number;
  year: number;
  status: "open" | "calculated" | "locked";
  version: number;
  locked_at: string | null;
}

export interface Session {
  access_token: string;
  user: User;
  company: Company | null;
  periods: Period[];
  companies: CompanyBrief[];
}

export interface Facility {
  id: number;
  name: string;
  type: "kebun" | "pabrik" | "gudang";
  area_ha: string | null;
  capacity_tph: string | null;
  soil_type: "mineral" | "gambut" | "campuran" | null;
  address: string | null;
}

export interface Product {
  id: number;
  code: string;
  name: string;
  cn_code: string | null;
  price_per_kg: string;
}

export interface Requirement {
  code: string;
  no: number;
  name: string;
  required: boolean;
  status: ReqStatus;
  status_reason: string | null;
  status_source: string;
  status_set_by: string | null;
  status_set_at: string | null;
  excluded: boolean;
  builtin: boolean;
  has_default: boolean;
  can_exclude: boolean;
  scope12: boolean;
  exception_pending?: boolean;
  scope: string;
  description: string;
  fields: string[];
  total: number;
  counted: number;
  pending: number;
  state: ReqState;
  rows?: number;
  progress?: number;
  items?: SubRequirement[];
}

export type ReqState = "complete" | "partial" | "default" | "in_review" | "missing" | "excluded";

export interface SubRequirement {
  key: string;
  label: string;
  hint: string;
  required: boolean;
  state: ReqState;
  detail: string;
}

export interface Issue {
  severity: "critical" | "warning" | "info";
  code: string;
  title: string;
  message: string;
  ref_type: string;
  ref_id: string | null;
}

export type DocStatus = "uploaded" | "processing" | "needs_review" | "validated" | "approved" | "rejected" | "failed";

export interface DocumentItem {
  id: number;
  period_id: number;
  type_code: string | null;
  original_name: string;
  mime: string | null;
  size_bytes: number;
  status: DocStatus;
  classify_confidence: number | null;
  extract_method: string | null;
  doc_number: string | null;
  supplier: string | null;
  doc_date: string | null;
  error: string | null;
  page_count?: number | null;
  extract_mode?: string | null;
  created_at: string;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
}

/** Kotak sumber: x/y ternormalisasi (PDF/gambar) atau baris/kolom (teks/lembar). */
export type BBox =
  | { page: number; x0: number; y0: number; x1: number; y1: number }
  | { page: number; r0: number; r1: number; c0: number; c1: number };

export interface Alternative {
  value: string;
  unit: string;
  confidence: number;
  snippet: string | null;
  page: number | null;
  bbox: BBox | null;
  method: string | null;
}

export interface ExtractedField {
  id: number;
  item: number;
  key: string;
  label: string;
  value_text: string | null;
  value_num: string | null;
  unit: string | null;
  confidence: number;
  snippet: string | null;
  page: number | null;
  bbox: BBox | null;
  alternatives: Alternative[] | null;
  method: string | null;
  confirmed: boolean;
  source: "auto" | "manual";
}

export interface LayoutPage {
  n: number;
  kind: "pdf" | "image" | "text" | "sheet";
  w: number;
  h: number;
  ocr: boolean;
  name?: string;
  lines?: string[];
  rows?: string[][];
}

export interface DocumentDetail extends DocumentItem {
  fields: ExtractedField[];
  issues: Issue[];
  notes: string[] | null;
  layout: { method: string; pages: LayoutPage[] } | null;
  text_preview: string | null;
}

export interface ActivitySource {
  doc_id: number;
  doc_name: string;
  item: number;
  value: number;
  note: string;
}

export interface ActivityRow {
  category: string;
  metric: string;
  unit: string;
  value: number;
  sources: ActivitySource[];
}

export interface ActivityData {
  rows: ActivityRow[];
  defaults_used: Record<string, string>;
  summary: {
    ffb_processed_t: number; electricity_mwh: number; fuel_l: number; n_applied_t: number;
    pome_m3: number; peat_ha: number; transport_tkm: number; products: { code: string; tonnes: number }[];
  };
}

export interface DocTypeField {
  key: string;
  label: string;
  unit: string;
  kind: "number" | "text";
  required: boolean;
  default?: string | null;
}

export interface DocType {
  code: string;
  no: number;
  name: string;
  required: boolean;
  scope: string;
  description: string;
  fields: DocTypeField[];
}

export interface CalcLine {
  key: string;
  name: string;
  group: "direct" | "indirect" | "upstream";
  scope: string;
  activity: string;
  factor: string;
  formula: string;
  calc: string;
  value_t: number;
  source: "document" | "default";
}

export interface Allocation {
  code: string;
  name: string;
  tonnes: number;
  price: number;
  share: number;
  see_direct: number;
  see_indirect: number;
  see_total: number;
}

export interface Calculation {
  id: number;
  version: number;
  gwp_set: "AR5" | "AR6";
  allocation_method: "economic" | "mass";
  created_at: string | null;
  has_draft_factors: boolean;
  direct_t: number;
  indirect_t: number;
  upstream_t: number;
  total_t: number;
  biogenic_co2_t: number;
  electricity_sold_mwh: number;
  lines: CalcLine[];
  allocations: Allocation[];
  defaults_used: Record<string, string>;
  excluded?: ExcludedCategory[];
}

/** Kategori "Tidak berlaku": dikeluarkan dari perhitungan dan dicantumkan di laporan. */
export interface ExcludedCategory {
  code: string;
  name: string;
  reason: string | null;
  set_by: string | null;
  set_at: string | null;
  source: string;
}

export interface Dashboard {
  period: { id: number; year: number; status: Period["status"] };
  requirements: Requirement[];
  complete_categories: number;
  document_status: Partial<Record<DocStatus, number>>;
  documents_total: number;
  issues: Issue[];
  calculation: null | {
    id: number;
    version: number;
    created_at: string | null;
    total_t: number;
    direct_t: number;
    indirect_t: number;
    upstream_t: number;
    has_draft_factors: boolean;
    lines: CalcLine[];
    allocations: Allocation[];
  };
  activity: { user: string; summary: string; at: string | null }[];
}

export interface Factor {
  id: number;
  code: string;
  name: string;
  value: string;
  unit: string;
  source: string;
  status: "draft" | "approved";
  version: number;
  approved_at: string | null;
}

export interface Gate {
  key: string;
  name: string;
  ok: boolean;
  note: string;
}

export interface AuditEntry {
  id: number;
  user: string;
  action: string;
  entity: string;
  summary: string;
  reason: string | null;
  at: string | null;
}

export interface ExceptionRequest {
  id: number;
  company_id: number;
  company: string | null;
  type_code: string;
  type_name: string;
  requested_status: "optional" | "not_applicable";
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_by: string | null;
  created_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

/** Status kebutuhan efektif satu jenis dokumen untuk satu perusahaan. */
export interface CompanyRequirement {
  code: string;
  no: number;
  name: string;
  scope: string;
  status: ReqStatus;
  reason: string | null;
  source: string;
  set_by: string | null;
  set_at: string | null;
  default_status?: ReqStatus;
  overridden?: boolean;
  /** Nama profil bila status berasal dari profil kebutuhan. */
  source_profile?: string | null;
  description?: string;
  builtin: boolean;
  can_exclude: boolean;
  has_default: boolean;
  scope12: boolean;
  exception_pending: boolean;
}

/* ------------------------------------------------------------------ superadmin */
export interface SuperCompanyRow extends CompanyBrief {
  required: number;
  optional: number;
  not_applicable: number;
  overrides: number;
  pending_exceptions: number;
  reviewers: string[];
  period: { id: number; year: number; status: Period["status"]; version: number } | null;
}

export interface CatalogType {
  code: string;
  no: number;
  name: string;
  name_id: string;
  name_en: string | null;
  description: string;
  description_id: string;
  description_en: string | null;
  scope: string;
  default_status: ReqStatus;
  builtin: boolean;
  can_exclude: boolean;
  has_default: boolean;
  scope12: boolean;
  active: boolean;
  overrides: number;
}

export interface RequirementProfile {
  id: number;
  name: string;
  description: string | null;
  items: Record<string, ReqStatus>;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProfileApplyResult {
  dry_run: boolean;
  needs_reason: boolean;
  companies: { company_id: number; company: string; changes: { code: string; name: string; before: ReqStatus; after: ReqStatus; scope12: boolean }[] }[];
}

export interface RequirementChangePreview {
  code: string;
  name: string;
  before: ReqStatus;
  after: ReqStatus;
  changed: boolean;
  valid: boolean;
  error: string | null;
  scope12: boolean;
  needs_reason: boolean;
  emission_excluded: boolean;
  emission_restored: boolean;
}

/** Dampak satu atau beberapa perubahan status (POST .../requirements/preview, tidak menyimpan). */
export interface RequirementPreview {
  changes: RequirementChangePreview[];
  valid: boolean;
  needs_reason: boolean;
  scope12_excluded: string[];
  open_periods: {
    id: number; year: number; status: Period["status"]; version: number;
    calc_version: number | null; calc_total_t: number | null; removed_t: number;
    gates_changed: { key: string; name: string; before: boolean; after: boolean; note_before: string; note_after: string }[];
    lines_removed: { key: string; name: string; value_t: number }[];
  }[];
  locked_periods: { id: number; year: number; version: number }[];
}

export interface CompanyRequirementsDetail {
  company: { id: number; name: string; city: string | null; province: string | null };
  requirements: CompanyRequirement[];
  exceptions: ExceptionRequest[];
  periods: Pick<Period, "id" | "year" | "status" | "version">[];
  /** Snapshot status saat periode dikunci (baca saja). */
  locked_periods: { id: number; year: number; version: number; locked_at: string | null; statuses: { code: string; name: string; status: ReqStatus; reason: string | null }[] }[];
}

/** Isi 409 saat status sudah diubah superadmin lain. */
export interface RequirementConflict {
  code: string;
  name: string;
  expected: ReqStatus;
  current: ReqStatus;
  set_by: string | null;
  set_at: string | null;
}

export interface AuditActor {
  id: number;
  name: string;
  role: Role;
}

export interface AdminAccount {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string | null;
  companies: { id: number; name: string }[];
}

export interface SuperAuditEntry {
  id: number;
  user: string;
  user_id: number | null;
  company_id: number | null;
  company: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  summary: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string | null;
}
