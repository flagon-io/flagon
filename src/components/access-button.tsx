import Link from 'next/link';
import type { VariantProps } from 'class-variance-authority';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { appBase } from '@/lib/site';

// Build-time flag (inlined), so the label is known on first render — no client
// fetch, no flicker. Must match the server's WAITLIST_ENABLED.
const WAITLIST = process.env.NEXT_PUBLIC_WAITLIST_ENABLED === 'true';

/**
 * A sign-up CTA whose label reflects the instance mode: "Request access" in
 * waitlist mode, otherwise a normal registration label. Links to /app/signup,
 * which adapts (waitlist join vs. registration).
 */
export function AccessButton({
  className,
  registerLabel = 'Get started',
  waitlistLabel = 'Request access',
  variant,
  size,
}: {
  className?: string;
  registerLabel?: string;
  waitlistLabel?: string;
} & VariantProps<typeof buttonVariants>) {
  return (
    <Link href={`${appBase}/app/signup`} className={cn(buttonVariants({ variant, size }), className)}>
      {WAITLIST ? waitlistLabel : registerLabel}
    </Link>
  );
}
