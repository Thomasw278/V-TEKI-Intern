"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { IconEye, IconShield } from "@/components/Icons";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function LoginPage() {
  const t = useT();
  const { login, user, ready, isAdmin, isSuperadmin } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) router.replace(isSuperadmin ? "/superadmin" : isAdmin ? "/admin" : "/dashboard");
  }, [ready, user, isAdmin, isSuperadmin, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError(t("Masukkan email yang valid.", "Enter a valid email address."));
    if (!password) return setError(t("Masukkan kata sandi.", "Enter your password."));
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      router.replace(u.role === "superadmin" ? "/superadmin" : u.role === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h1>{t("Masuk ke KarbonLens", "Sign in to KarbonLens")}</h1>
      <p className="lead">{t("Gunakan email perusahaan atau email admin peninjau Anda.", "Use your company email or your reviewer email.")}</p>
      <form onSubmit={submit} className="stack" style={{ marginTop: 28 }} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder={t("nama@perusahaan.co.id", "name@company.com")} aria-invalid={!!error && !email} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="pw">{t("Kata sandi", "Password")}</label>
          <div className="input-affix">
            <input id="pw" className="input" type={show ? "text" : "password"} autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="btn ghost icon sm" style={{ position: "absolute", right: 4 }} onClick={() => setShow((s) => !s)}
              aria-label={show ? t("Sembunyikan kata sandi", "Hide password") : t("Tampilkan kata sandi", "Show password")}><IconEye size={16} /></button>
          </div>
        </div>
        {error && <div className="banner bad anim-shake" role="alert">{error}</div>}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>{t("Masuk", "Sign in")}</Button>
      </form>
      <hr style={{ margin: "28px 0 20px" }} />
      <div className="stack tight">
        <p className="small">{t("Perusahaan belum terdaftar?", "Company not registered yet?")} <Link href="/register" className="strong">{t("Daftarkan perusahaan", "Register your company")}</Link></p>
        <div className="role-note">
          <IconShield size={18} style={{ flex: "none", marginTop: 2, color: "var(--primary)" }} />
          <span>{t(
            "Akun admin peninjau tidak bisa didaftarkan dari sini. Akun tersebut dibuat oleh pengelola sistem dan ditugaskan ke perusahaan tertentu.",
            "Reviewer accounts cannot be registered here. They are created by the system administrator and assigned to specific companies.",
          )}</span>
        </div>
      </div>
    </AuthLayout>
  );
}
