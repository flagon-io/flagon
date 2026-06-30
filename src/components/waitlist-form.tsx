'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiBase } from '@/lib/site';

export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');
    const res = await fetch(`${apiBase}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) {
      setState('done');
      if (body?.status === 'approved') {
        setMessage("You're approved! Check your email to create your account now.");
      } else if (body?.created) {
        setMessage("You're on the list. We'll email you when your spot opens.");
      } else {
        setMessage("You're already on the waitlist. Sit tight, we'll be in touch.");
      }
    } else {
      setState('error');
      setMessage(body?.message ?? 'Something went wrong. Try again.');
    }
  }

  if (state === 'done') {
    return (
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-foreground">
        {message}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <Input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
      />
      <Button type="submit" size="lg" disabled={state === 'loading'} className="shrink-0">
        Join the waitlist
      </Button>
      {state === 'error' && <p className="text-sm text-red-400 sm:hidden">{message}</p>}
    </form>
  );
}
