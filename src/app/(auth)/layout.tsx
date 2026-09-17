import Link from "next/link";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ka } from "@/lib/i18n/ka";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight hover:opacity-80"
        >
          {ka.auth.appName}
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
