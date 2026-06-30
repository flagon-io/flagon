'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { appHref } from '@/lib/site';

const LINKS = [
  { href: '/products', label: 'Products' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
];

/** Hamburger menu for the marketing nav on small screens (the inline links are
 *  hidden below `md`). Holds the section links plus Sign in. */
export function MarketingMobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = 'block rounded-md px-3 py-2 text-sm transition-colors';

  return (
    <div ref={ref} className="relative md:hidden">
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-card-muted hover:text-foreground"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  item,
                  active ? 'bg-card-muted font-medium text-foreground' : 'text-muted hover:bg-card-muted hover:text-foreground',
                )}
              >
                {l.label}
              </Link>
            );
          })}
          <div className="my-1 h-px bg-border" />
          <a href={appHref('/signin')} className={cn(item, 'text-muted hover:bg-card-muted hover:text-foreground')}>
            Sign in
          </a>
        </div>
      )}
    </div>
  );
}
