import { Logo } from '@/components/logo';
import { siteUrl } from '@/lib/site';

/**
 * Centered auth layout: logo, heading, a bordered form card, and an optional
 * bordered "alternate action" box below it.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  alt,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  alt?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <a href={siteUrl} aria-label="Flagon home">
            <Logo size={28} />
          </a>
          <h1 className="mt-6 text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm">{children}</div>
        {alt && (
          <div className="mt-4 rounded-xl border border-border p-4 text-center text-sm text-muted">
            {alt}
          </div>
        )}
      </div>
    </div>
  );
}
