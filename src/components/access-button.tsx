'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { VariantProps } from 'class-variance-authority';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { apiBase, appBase } from '@/lib/site';

/**
 * A sign-up CTA whose label adapts to the instance mode: "Request access" when
 * waitlist mode is on (and the founder slot is taken), otherwise a normal
 * registration label. Always links to /app/signup, which itself adapts.
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
  const [waitlist, setWaitlist] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/waitlist`)
      .then((r) => r.json())
      .then((c: { enabled?: boolean; signupOpen?: boolean }) =>
        setWaitlist(Boolean(c.enabled && !c.signupOpen)),
      )
      .catch(() => setWaitlist(false));
  }, []);

  // Before config resolves, show the registration label (the common case).
  const label = waitlist ? waitlistLabel : registerLabel;

  return (
    <Link href={`${appBase}/app/signup`} className={cn(buttonVariants({ variant, size }), className)}>
      {label}
    </Link>
  );
}
