import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./landing.css";
import { ToastProvider } from "@/components/ui";
import { LangProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { THEME_SCRIPT, ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "KarbonLens — AUDIT OS · Emisi Tertanam Produk (CBAM)",
  description: "Hitung emisi tertanam produk dari dokumen operasional perusahaan, diverifikasi oleh sistem audit presisi tinggi.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF8F5" },
    { media: "(prefers-color-scheme: dark)", color: "#111110" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* memasang tema sebelum halaman tampil (tanpa kedipan) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <LangProvider>
            <SessionProvider>
              <ToastProvider>{children}</ToastProvider>
            </SessionProvider>
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
