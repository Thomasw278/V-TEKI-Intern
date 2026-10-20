import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./landing.css";
import { ToastProvider } from "@/components/ui";
import { LangProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { THEME_SCRIPT, ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "KarbonLens — Emisi tertanam produk (CBAM)",
  description: "Hitung emisi tertanam produk dari dokumen operasional perusahaan, ditinjau oleh admin peninjau.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0a120e" },
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
