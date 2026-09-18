import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Logo } from "@/components/logo";
import { MARKETING_SITE_URL } from "@/lib/site";

interface AuthCardProps {
  title: string;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

// Shared shell for /login, /signup, /verify-email: logo + heading, then the
// form directly on the page background - no bordered card - with a footer link
// below it.
export function AuthCard({ title, subtitle, footer, children }: AuthCardProps) {
  return (
    <main className="relative flex min-h-full flex-1 flex-col items-center justify-center gap-6 bg-background p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <Link
          href={MARKETING_SITE_URL}
          aria-label="Flagon home"
          className="opacity-90 transition-opacity hover:opacity-100"
        >
          <Logo className="h-9 w-9" />
        </Link>
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && (
          <p className="max-w-xs text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>

      <div className="w-full max-w-sm">{children}</div>

      {footer && <p className="text-sm text-muted-foreground">{footer}</p>}
    </main>
  );
}
