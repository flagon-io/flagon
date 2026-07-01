'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/capabilities', label: 'Capabilities' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
];

/** Primary marketing nav with active-section highlighting. */
export function MarketingNavLinks() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-6 text-sm md:flex">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'transition-colors',
              active ? 'font-medium text-foreground' : 'text-muted hover:text-foreground',
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
