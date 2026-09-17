import type { Metadata, Viewport } from "next";
import { Geist_Mono, Noto_Sans_Georgian } from "next/font/google";

import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ka } from "@/lib/i18n/ka";

import "./globals.css";

/**
 * Noto Sans Georgian covers Mkhedruli plus Latin, so Georgian and Latin text
 * share one set of metrics and mixed strings ("SCHOOL-HUB — დაფა") keep a
 * single baseline and x-height. It is wired to `--font-sans`, which
 * `globals.css` maps onto Tailwind's `font-sans`.
 */
const sans = Noto_Sans_Georgian({
  variable: "--font-sans",
  subsets: ["georgian", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${ka.auth.appName} — ${ka.auth.tagline}`,
    template: `%s · ${ka.auth.appName}`,
  },
  description: ka.auth.tagline,
  applicationName: ka.auth.appName,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: ka.pwa.appShortName,
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ka"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
