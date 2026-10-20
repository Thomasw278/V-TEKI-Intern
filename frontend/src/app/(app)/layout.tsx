"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui";
import { useSession } from "@/lib/session";
import { SummaryProvider } from "@/lib/summary";

/** Halaman yang tetap bisa dibuka admin tanpa memilih perusahaan. */
const ADMIN_FREE = ["/admin", "/pengaturan"];

/** Semua halaman di grup (app) wajib login. Admin harus memilih perusahaan dulu. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { ready, user, isAdmin, company } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const needsCompany = isAdmin && !company && !ADMIN_FREE.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (needsCompany) router.replace("/admin");
  }, [ready, user, needsCompany, router]);

  if (!ready || !user || needsCompany) {
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
