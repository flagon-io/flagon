'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Plus, Users } from 'lucide-react';
import { organization } from '@/lib/auth-client';
import { LogoMark } from '@/components/logo';
import { cn } from '@/lib/cn';
import { appPath } from '@/lib/site';

export type Org = { id: string; name: string; slug: string; role: string; logo?: string | null };

/** Org avatar: the org's configured logo, or the Flagon mark as a fallback. */
function OrgAvatar({ org, size = 20 }: { org: Org; size?: number }) {
  if (org.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={org.logo}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return <LogoMark size={size} />;
}

/**
 * Full-width organization selector that anchors the app sidebar header. Shows the
 * active org (logo/Flagon fallback + name) and opens a switcher with the user's
 * orgs plus quick links. Collapses to just the avatar when the sidebar is rail-only.
 */
export function OrgSwitcher({
  orgs,
  activeSlug,
  collapsed = false,
}: {
  orgs: Org[];
  activeSlug?: string;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = orgs.find((o) => o.slug === activeSlug) ?? orgs[0];

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

  async function select(org: Org) {
    setOpen(false);
    if (org.slug === active?.slug) return;
    setBusy(true);
    await organization.setActive({ organizationId: org.id });
    router.push(appPath(`/${org.slug}`));
    router.refresh();
    setBusy(false);
  }

  if (!active) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current organization: ${active.name}. Switch organization`}
        title={collapsed ? active.name : undefined}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium transition-colors',
          'hover:border-border hover:bg-card-muted',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          open && 'border-border bg-card-muted',
          collapsed && 'justify-center',
          busy && 'opacity-60',
        )}
      >
        <OrgAvatar org={active} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left">{active.name}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted" />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-2 w-64 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg',
            collapsed ? 'left-0' : 'left-0 right-0 w-auto',
          )}
        >
          <p className="px-2 py-1.5 text-xs text-muted">Organizations</p>
          {orgs.map((o) => (
            <button
              key={o.id}
              onClick={() => select(o)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-card-muted"
            >
              <OrgAvatar org={o} size={18} />
              <span className="min-w-0 flex-1 truncate text-left">{o.name}</span>
              <span className="shrink-0 text-xs text-muted">{o.role}</span>
              {o.slug === active.slug && <Check className="size-4 shrink-0 text-brand-500" />}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <Link
            href={appPath(`/${active.slug}/members`)}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted transition-colors hover:bg-card-muted hover:text-foreground"
          >
            <Users className="size-4" /> Members &amp; invites
          </Link>
          <Link
            href={appPath('/new')}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted transition-colors hover:bg-card-muted hover:text-foreground"
          >
            <Plus className="size-4" /> Create organization
          </Link>
        </div>
      )}
    </div>
  );
}
