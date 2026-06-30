'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { WaitlistForm } from '@/components/waitlist-form';
import { Skeleton } from '@/components/skeleton';
import { buttonVariants } from '@/components/ui/button';
import { apiBase, appBase } from '@/lib/site';

/**
 * Adapts the hero CTA to the instance config: a waitlist capture when waitlist
 * mode is on (and the founder slot is taken), otherwise a direct sign-up.
 */
export function HeroAccess() {
  const [waitlist, setWaitlist] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/waitlist`)
      .then((r) => r.json())
      .then((c: { enabled?: boolean; signupOpen?: boolean }) =>
        setWaitlist(Boolean(c.enabled && !c.signupOpen)),
      )
      .catch(() => setWaitlist(false));
  }, []);

  // Skeleton while we resolve config, sized to avoid layout shift.
  if (waitlist === null) return <Skeleton className="h-11.5 w-full max-w-md rounded-lg" />;

  if (waitlist) {
    return (
      <>
        <WaitlistForm />
        <p className="mt-3 text-xs text-muted">
          No spam, no pitch decks. Already approved?{' '}
          <Link href={`${appBase}/app/signup`} className="text-brand-500 hover:text-brand-400">
            Create your account
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Link href={`${appBase}/app/signup`} className={buttonVariants({ size: 'lg' })}>
        Create your account
      </Link>
      <Link href="/docs" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
        Read the docs
      </Link>
    </div>
  );
}
