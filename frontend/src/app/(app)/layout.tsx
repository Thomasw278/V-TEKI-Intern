"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui";
import { useSession } from "@/lib/session";
import { SummaryProvider } from "@/lib/summary";

/** Halaman yang tetap bisa dibuka admin tanpa memilih perusahaan. */
const ADMIN_FREE = ["/admin", "/pengaturan"];
/** Superadmin tidak punya konteks perusahaan: hanya ruang kerjanya sendiri dan akun. */
const SUPER_FREE = ["/superadmin", "/pengaturan"];

/** Semua halaman di grup (app) wajib login. Admin harus memilih perusahaan dulu. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { ready, user, isAdmin, isSuperadmin, company } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const needsCompany = isAdmin && !company && !ADMIN_FREE.some((p) => pathname.startsWith(p));
  const superOutside = isSuperadmin && !SUPER_FREE.some((p) => pathname.startsWith(p));
  const notSuper = !!user && !isSuperadmin && pathname.startsWith("/superadmin");

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (superOutside) router.replace("/superadmin");
    else if (needsCompany || notSuper) router.replace(isAdmin ? "/admin" : "/dashboard");
  }, [ready, user, needsCompany, superOutside, notSuper, isAdmin, router]);

  if (!ready || !user || needsCompany || superOutside || notSuper) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spinner />
      </div>
    );
  }
  return (
    <SummaryProvider>
      <AppShell>{children}</AppShell>
    </SummaryProvider>
  );
}
