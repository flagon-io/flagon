import { cn } from '@/lib/cn';

const MASK = 'radial-gradient(70% 60% at 50% 30%, black, transparent)';
const GLOW = 'radial-gradient(40rem 24rem at 50% 0%, var(--glow), transparent 70%)';

// Shared marketing page hero: the blueprint grid + vermilion glow treatment from
// the homepage, so every top-of-page reads as part of one branded surface instead
// of a bare heading. Pass actions/badges as children.
export function MarketingHero({
  eyebrow,
  title,
  subtitle,
  align = 'left',
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'left' | 'center';
  children?: React.ReactNode;
}) {
  const centered = align === 'center';
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        className="bg-grid pointer-events-none absolute inset-0"
        style={{ maskImage: MASK, WebkitMaskImage: MASK }}
      />
      <div className="pointer-events-none absolute inset-x-0 -top-40 h-120" style={{ background: GLOW }} />
      <div className={cn('relative mx-auto max-w-6xl px-6 pb-16 pt-20 sm:pt-24', centered && 'text-center')}>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        {subtitle && (
          <p className={cn('mt-5 text-lg text-muted', centered ? 'mx-auto max-w-xl' : 'max-w-3xl')}>{subtitle}</p>
        )}
        {children && (
          <div className={cn('mt-7 flex flex-wrap gap-3', centered && 'justify-center')}>{children}</div>
        )}
      </div>
    </section>
  );
}
