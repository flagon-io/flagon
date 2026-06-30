import Link from 'next/link';
import { WaitlistForm } from '@/components/waitlist-form';
import { buttonVariants } from '@/components/ui/button';
import { appBase } from '@/lib/site';

const WAITLIST = process.env.NEXT_PUBLIC_WAITLIST_ENABLED === 'true';

/**
 * Hero CTA. In waitlist mode it captures the waitlist; otherwise a direct
 * sign-up. Decided at build time (no client fetch, no flicker/skeleton).
 */
export function HeroAccess() {
  if (WAITLIST) {
    return (
      <>
        <WaitlistForm />
        <p className="mt-3 text-xs text-muted">
          No spam, no pitch decks. Got an invite?{' '}
          <Link
            href={`${appBase}/app/signup?register=1`}
            className="text-brand-500 hover:text-brand-400"
          >
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
