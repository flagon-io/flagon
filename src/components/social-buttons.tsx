'use client';

import { useEffect, useState } from 'react';
import { SiApple, SiGithub, SiGoogle } from '@icons-pack/react-simple-icons';
import { signIn } from '@/lib/auth-client';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';

type ProviderId = 'google' | 'github' | 'apple';

const PROVIDERS: { id: ProviderId; label: string; icon: React.ReactNode }[] = [
  { id: 'google', label: 'Continue with Google', icon: <SiGoogle size={16} color="currentColor" /> },
  { id: 'github', label: 'Continue with GitHub', icon: <SiGithub size={16} color="currentColor" /> },
  { id: 'apple', label: 'Continue with Apple', icon: <SiApple size={16} color="currentColor" /> },
];

export function SocialButtons() {
  const [enabled, setEnabled] = useState<Partial<Record<ProviderId, boolean>>>({});

  useEffect(() => {
    fetch('/api/providers')
      .then((r) => r.json())
      .then(setEnabled)
      .catch(() => setEnabled({}));
  }, []);

  return (
    <div className="space-y-2">
      {PROVIDERS.map((p) => {
        const on = Boolean(enabled[p.id]);
        return (
          <button
            key={p.id}
            type="button"
            disabled={!on}
            title={on ? undefined : 'Not configured yet'}
            onClick={() => on && signIn.social({ provider: p.id, callbackURL: '/app' })}
            className={cn(buttonVariants({ variant: 'secondary' }), 'w-full')}
          >
            {p.icon}
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
