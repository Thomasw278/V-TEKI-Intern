"use client";

import { useState, type FormEvent } from "react";
import { IconPlus, IconUsers, IconX } from "@/components/Icons";
import { Badge, Button, Dialog, Empty, ErrorBox, Loading, PageHead, useLoad, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { AdminAccount, SuperCompanyRow } from "@/lib/types";

/** Akun admin peninjau & penugasannya (versi web dari perintah CLI create-admin / assign / unassign). */
export default function AdminsPage() {
  const t = useT();
  const toast = useToast();
  const { epoch } = useSession();
  const { data, error, loading, reload } = useLoad(async () => {
    const [admins, companies] = await Promise.all([api<AdminAccount[]>("/api/superadmin/admins"), api<SuperCompanyRow[]>("/api/superadmin/companies")]);
    return { admins, companies };
  }, [epoch]);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<number, string>>({});
  const [pw, setPw] = useState<{ a: AdminAccount; value: string } | null>(null);

  const call = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      reload(true);
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    } finally {
      setBusy(null);
    }
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (await call("create", () => api("/api/superadmin/admins", { body: form }), t(`Admin ${form.name} dibuat`, `Reviewer ${form.name} created`))) {
      setForm({ name: "", email: "", password: "" });
    }
  };

  if (loading && !data) return <Loading rows={2} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data) return null;

  return (
    <>
      <PageHead title={t("Admin peninjau", "Reviewers")}
        description={t("Admin peninjau menyetujui dokumen dan mengunci periode untuk perusahaan yang ditugaskan. Akun superadmin hanya bisa dibuat lewat CLI.",
          "Reviewers approve documents and lock periods for the companies assigned to them. Superadmin accounts can only be created from the CLI.")} />
      <div className="split">
        <section className="panel flush" aria-label={t("Daftar admin", "Reviewer list")}>
          {data.admins.length === 0 ? <Empty icon={<IconUsers />} title={t("Belum ada admin peninjau", "No reviewers yet")} /> : (
            <div className="list" style={{ padding: "6px 18px" }}>
              {data.admins.map((a) => {
                const free = data.companies.filter((c) => !a.companies.some((x) => x.id === c.id));
                return (
                  <div key={a.id} className="stack tight" style={{ padding: "14px 0", borderTop: "1px solid var(--line-2)", opacity: a.is_active ? 1 : 0.6 }}>
                    <div className="inline" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span style={{ minWidth: 0 }}>
                        <b className="wrap" style={{ display: "block" }}>{a.name} {!a.is_active && <Badge tone="bad">{t("Nonaktif", "Inactive")}</Badge>}</b>
                        <span className="tiny muted">{a.email} · {t("login terakhir", "last sign-in")} {a.last_login_at ? when(a.last_login_at) : "—"}</span>
                      </span>
                      <span className="inline">
                        <Button size="sm" variant="ghost" onClick={() => setPw({ a, value: "" })}>{t("Atur ulang sandi", "Reset password")}</Button>
                        <Button size="sm" variant={a.is_active ? "ghost" : "secondary"} loading={busy === `act${a.id}`}
                          onClick={() => call(`act${a.id}`, () => api(`/api/superadmin/admins/${a.id}`, { method: "PATCH", body: { is_active: !a.is_active } }),
                            a.is_active ? t("Admin dinonaktifkan", "Reviewer deactivated") : t("Admin diaktifkan", "Reviewer activated"))}>
                          {a.is_active ? t("Nonaktifkan", "Deactivate") : t("Aktifkan", "Activate")}
                        </Button>
                      </span>
                    </div>
                    <div className="inline" style={{ gap: 6 }}>
                      {a.companies.map((c) => (
                        <span key={c.id} className="badge" style={{ gap: 4 }}>
                          {c.name}
                          <button type="button" className="btn ghost icon sm" style={{ width: 20, height: 20, padding: 0 }} aria-label={t(`Cabut ${c.name}`, `Unassign ${c.name}`)}
                            onClick={() => call(`un${a.id}-${c.id}`, () => api(`/api/superadmin/admins/${a.id}/companies/${c.id}`, { method: "DELETE" }), t("Penugasan dicabut", "Assignment removed"))}><IconX size={12} /></button>
                        </span>
                      ))}
                      {!a.companies.length && <span className="tiny muted">{t("Belum ditugaskan ke perusahaan.", "Not assigned to any company.")}</span>}
                    </div>
                    {free.length > 0 && (
                      <div className="inline">
                        <select className="select" style={{ height: 34, fontSize: 13.5, flex: "1 1 200px", width: "auto" }} value={pick[a.id] ?? ""} onChange={(e) => setPick({ ...pick, [a.id]: e.target.value })} aria-label={t("Pilih perusahaan", "Choose a company")}>
                          <option value="">{t("Tugaskan ke perusahaan…", "Assign to a company…")}</option>
                          {free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <Button size="sm" disabled={!pick[a.id]} loading={busy === `as${a.id}`}
                          onClick={() => call(`as${a.id}`, () => api(`/api/superadmin/admins/${a.id}/companies/${pick[a.id]}`, { method: "POST" }), t("Admin ditugaskan", "Reviewer assigned")).then(() => setPick({ ...pick, [a.id]: "" }))}>
                          {t("Tugaskan", "Assign")}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <form className="panel" onSubmit={create}>
          <div className="panel-head"><h2>{t("Admin peninjau baru", "New reviewer")}</h2></div>
          <div className="stack">
            <div className="field"><label htmlFor="a-name">{t("Nama", "Name")}</label><input id="a-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} /></div>
            <div className="field"><label htmlFor="a-email">Email</label><input id="a-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div className="field"><label htmlFor="a-pw">{t("Kata sandi awal", "Initial password")}</label><input id="a-pw" className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} /><span className="tiny muted">{t("Minimal 8 karakter. Sampaikan ke admin lewat jalur aman.", "At least 8 characters. Share it with the reviewer through a secure channel.")}</span></div>
            <Button type="submit" variant="primary" block loading={busy === "create"}><IconPlus size={15} />{t("Buat admin", "Create reviewer")}</Button>
          </div>
        </form>
      </div>

      <Dialog open={!!pw} title={t(`Atur ulang sandi: ${pw?.a.name ?? ""}`, `Reset password: ${pw?.a.name ?? ""}`)} onClose={() => setPw(null)}
        actions={<><Button variant="ghost" onClick={() => setPw(null)}>{t("Batal", "Cancel")}</Button>
          <Button variant="primary" disabled={(pw?.value.length ?? 0) < 8} loading={busy === "pw"}
            onClick={() => pw && call("pw", () => api(`/api/superadmin/admins/${pw.a.id}`, { method: "PATCH", body: { password: pw.value } }), t("Kata sandi diganti", "Password changed")).then((ok) => ok && setPw(null))}>{t("Simpan", "Save")}</Button></>}>
        {pw && <div className="field"><label htmlFor="pw-new">{t("Kata sandi baru", "New password")}</label><input id="pw-new" className="input" type="password" autoComplete="new-password" value={pw.value} onChange={(e) => setPw({ ...pw, value: e.target.value })} /></div>}
      </Dialog>
    </>
  );
}
