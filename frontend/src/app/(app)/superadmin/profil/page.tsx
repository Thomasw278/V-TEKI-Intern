"use client";

import { useState } from "react";
import { IconFlow, IconPlus, IconSearch } from "@/components/Icons";
import { MIN_REASON, ReasonField, ReqStatusBadge, StatusSegment } from "@/components/superadmin";
import { Button, Dialog, Empty, ErrorBox, Loading, PageHead, useLoad, useToast } from "@/components/ui";
import { superApi } from "@/lib/api";
import { when } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { ProfileApplyResult, ReqStatus, RequirementProfile, SuperCompanyRow } from "@/lib/types";

type Draft = { id: number | null; name: string; description: string; items: Record<string, ReqStatus> };

/** Profil kebutuhan: templat status yang disalin ke perusahaan saat diterapkan. */
export default function ProfilesPage() {
  const t = useT();
  const toast = useToast();
  const { epoch } = useSession();
  const { data, error, loading, reload } = useLoad(async () => {
    const [profiles, types, companies] = await Promise.all([superApi.profiles(), superApi.docTypes(), superApi.companies()]);
    return { profiles, types: types.filter((x) => x.active), companies };
  }, [epoch]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [applying, setApplying] = useState<RequirementProfile | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await superApi.saveProfile(draft.id, { name: draft.name.trim(), description: draft.description.trim() || null, items: draft.items });
      toast(t("Profil disimpan", "Profile saved"));
      setDraft(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Loading rows={2} />;
  if (error) return <ErrorBox error={error} onRetry={() => reload()} />;
  if (!data) return null;
  const typeName = (code: string) => data.types.find((x) => x.code === code)?.name ?? code;

  return (
    <>
      <PageHead title={t("Profil kebutuhan", "Requirement profiles")}
        description={t("Templat seperti \"PKS terintegrasi kebun\" atau \"PKS tanpa kebun\". Menerapkan profil menyalin statusnya ke perusahaan; mengubah profil kemudian tidak mengubah perusahaan yang sudah memakainya.",
          "Templates such as \"integrated mill\" or \"mill without plantation\". Applying a profile copies its statuses to companies; editing the profile later does not change companies that already use it.")}>
        <Button variant="primary" onClick={() => setDraft({ id: null, name: "", description: "", items: {} })}><IconPlus size={15} />{t("Buat profil", "Create profile")}</Button>
      </PageHead>

      {data.profiles.length === 0 ? (
        <Empty icon={<IconFlow />} title={t("Belum ada profil kebutuhan", "No requirement profiles yet")}>{t("Buat profil untuk mengatur banyak perusahaan sejenis sekaligus.", "Create a profile to configure many similar companies at once.")}</Empty>
      ) : (
        <div className="grid-2">
          {data.profiles.map((p) => (
            <section key={p.id} className="panel" aria-label={p.name}>
              <div className="panel-head"><div><h2 className="wrap">{p.name}</h2><div className="sub wrap">{p.description || "—"}</div></div></div>
              <div className="list">
                {Object.entries(p.items).map(([code, st]) => (
                  <div key={code} className="list-row"><span className="body"><b className="wrap" style={{ fontSize: 13.5 }}>{typeName(code)}</b></span><ReqStatusBadge status={st} /></div>
                ))}
                {!Object.keys(p.items).length && <span className="small muted">{t("Belum ada status yang diatur.", "No statuses set.")}</span>}
              </div>
              <div className="inline" style={{ marginTop: 14, justifyContent: "space-between" }}>
                <span className="tiny muted">{t("Diubah", "Updated")} {when(p.updated_at ?? p.created_at)}</span>
                <div className="inline">
                  <Button variant="ghost" size="sm" onClick={() => setDraft({ id: p.id, name: p.name, description: p.description ?? "", items: { ...p.items } })}>{t("Ubah", "Edit")}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDraft({ id: null, name: t(`Salinan ${p.name}`, `Copy of ${p.name}`), description: p.description ?? "", items: { ...p.items } })}>{t("Duplikasi", "Duplicate")}</Button>
                  <Button variant="primary" size="sm" onClick={() => setApplying(p)}>{t("Terapkan ke perusahaan", "Apply to companies")}</Button>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={!!draft} title={draft?.id ? t("Ubah profil", "Edit profile") : t("Buat profil", "Create profile")} onClose={() => setDraft(null)}
        actions={<><Button variant="ghost" onClick={() => setDraft(null)}>{t("Batal", "Cancel")}</Button><Button variant="primary" loading={busy} disabled={(draft?.name.trim().length ?? 0) < 3} onClick={save}>{t("Simpan profil", "Save profile")}</Button></>}>
        {draft && (
          <>
            <div className="field"><label htmlFor="p-name">{t("Nama", "Name")}</label><input id="p-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="p-desc">{t("Deskripsi", "Description")}</label><textarea id="p-desc" className="textarea" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
            <div className="stack tight">
              <b className="small">{t("Status per jenis dokumen", "Status per document type")}</b>
              <span className="tiny muted">{t("Jenis yang tidak dicentang dibiarkan seperti status perusahaan saat profil diterapkan.", "Unticked types keep the company's current status when the profile is applied.")}</span>
              {data.types.map((x) => {
                const on = !!draft.items[x.code];
                return (
                  <div key={x.code} className="stack tight" style={{ padding: "8px 0", borderTop: "1px solid var(--line-2)" }}>
                    <label className="inline" style={{ gap: 8 }}>
                      <input type="checkbox" checked={on} onChange={(e) => {
                        const items = { ...draft.items };
                        if (e.target.checked) items[x.code] = x.default_status === "not_applicable" && !x.can_exclude ? "required" : x.default_status;
                        else delete items[x.code];
                        setDraft({ ...draft, items });
                      }} />
                      <span className="small wrap">{x.no}. {x.name}</span>
                    </label>
                    {on && <StatusSegment value={draft.items[x.code]} req={x} label={t(`Status ${x.name}`, `Status of ${x.name}`)}
                      onChange={(v) => setDraft({ ...draft, items: { ...draft.items, [x.code]: v } })} />}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Dialog>

      {applying && <ApplyDialog profile={applying} companies={data.companies} onClose={() => setApplying(null)} onDone={() => { setApplying(null); reload(true); }} />}
    </>
  );
}

function ApplyDialog({ profile, companies, onClose, onDone }: {
  profile: RequirementProfile; companies: SuperCompanyRow[]; onClose: () => void; onDone: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [ids, setIds] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState<ProfileApplyResult | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (dry: boolean) => {
    setBusy(true);
    try {
      const r = await superApi.applyProfile(profile.id, ids, dry, reason.trim() || null);
      if (dry) setPlan(r);
      else {
        toast(t(`Profil diterapkan ke ${affected} perusahaan`, `Profile applied to ${affected} ${affected === 1 ? "company" : "companies"}`));
        onDone();
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: number) => {
    setPlan(null);
    setIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  };
  const shown = companies.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  const affected = plan?.companies.filter((c) => c.changes.length).length ?? 0;
  const min = plan?.needs_reason ? MIN_REASON : 5;

  return (
    <Dialog open title={t(`Terapkan profil "${profile.name}"`, `Apply profile "${profile.name}"`)} onClose={onClose}
      actions={<><Button variant="ghost" onClick={onClose}>{t("Batal", "Cancel")}</Button>
        {!plan ? <Button variant="primary" loading={busy} disabled={!ids.length} onClick={() => run(true)}>{t(`Lihat perubahan untuk ${ids.length} perusahaan`, `Preview changes for ${ids.length} ${ids.length === 1 ? "company" : "companies"}`)}</Button>
          : <Button variant="primary" loading={busy} disabled={!affected || reason.trim().length < min} onClick={() => run(false)}>{t(`Terapkan ke ${affected} perusahaan`, `Apply to ${affected} ${affected === 1 ? "company" : "companies"}`)}</Button>}</>}>
      {!plan ? (
        <>
          <div className="inline" style={{ justifyContent: "space-between" }}>
            <div className="input-affix" style={{ flex: "1 1 200px" }}>
              <input className="input" style={{ paddingRight: 36 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari perusahaan", "Search companies")} aria-label={t("Cari perusahaan", "Search companies")} />
              <IconSearch size={16} className="affix" />
            </div>
            <Button size="sm" variant="ghost" onClick={() => setIds(ids.length === shown.length ? [] : shown.map((c) => c.id))}>
              {ids.length === shown.length && shown.length ? t("Batalkan pilihan", "Clear selection") : t("Pilih semua", "Select all")}
            </Button>
          </div>
          <fieldset className="stack tight" style={{ maxHeight: 260, overflow: "auto", border: 0, padding: 0, margin: 0 }}>
            <legend className="sr-only">{t("Perusahaan", "Companies")}</legend>
            {shown.map((c) => (
              <label key={c.id} className="inline" style={{ gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" checked={ids.includes(c.id)} onChange={() => toggle(c.id)} style={{ marginTop: 3 }} />
                <span className="small wrap">{c.name}</span>
              </label>
            ))}
          </fieldset>
        </>
      ) : (
        <div className="stack tight">
          <b className="small">{t("Perubahan per perusahaan (belum disimpan)", "Changes per company (not saved yet)")}</b>
          {plan.companies.map((c) => (
            <div key={c.company_id} className="impact-period">
              <b className="wrap">{c.company}</b>
              {c.changes.length ? c.changes.map((ch) => (
                <span key={ch.code} className="inline" style={{ gap: 6 }}><span className="wrap">{ch.name}</span><ReqStatusBadge status={ch.before} /><span aria-hidden="true">→</span><ReqStatusBadge status={ch.after} /></span>
              )) : <span className="muted">{t("Tidak ada perubahan: status sudah sama.", "No changes: statuses already match.")}</span>}
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setPlan(null)}>{t("Ubah pilihan perusahaan", "Change company selection")}</Button>
          <ReasonField value={reason} onChange={setReason} min={min} id="apply-reason"
            hint={plan.needs_reason ? t(`Ada kategori Scope 1/2: minimal ${MIN_REASON} karakter.`, `Includes Scope 1/2 categories: at least ${MIN_REASON} characters.`) : undefined} />
        </div>
      )}
    </Dialog>
  );
}
