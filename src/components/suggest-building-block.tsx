'use client';

import { useState } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';
import { apiBase } from '@/lib/site';

/**
 * "What should we build next?" — developer intake for platform building blocks.
 * Opens a modal, posts to the feature-requests API (cross-origin to the API
 * subdomain via apiBase, like the waitlist).
 */
export function SuggestBuildingBlock({
  className,
  variant = 'ghost',
  label = 'Suggest a building block',
}: {
  className?: string;
  label?: string;
} & Pick<VariantProps<typeof buttonVariants>, 'variant'>) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    // Reset shortly after so the modal doesn't flicker on the way out.
    setTimeout(() => {
      setState('idle');
      setBody('');
      setEmail('');
      setError(null);
    }, 200);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');
    setError(null);
    try {
      const res = await fetch(`${apiBase}/feature-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setState('idle');
        return setError(data?.message ?? 'Something went wrong. Try again.');
      }
      setState('done');
    } catch {
      setState('idle');
      setError('Something went wrong. Try again.');
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(buttonVariants({ variant }), className)}>
        {label}
      </button>

      <Modal
        open={open}
        onClose={close}
        title="What should we build next?"
        description="Tell us the platform problem you keep rebuilding. We build the boring infrastructure so you don't have to."
        footer={
          state === 'done' ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" form="suggest-form" disabled={state === 'loading' || body.trim().length < 5}>
                Send it
              </Button>
            </>
          )
        }
      >
        {state === 'done' ? (
          <p className="py-2 text-sm text-muted">
            Got it, thank you. We read every one of these; they directly shape the roadmap.
          </p>
        ) : (
          <form id="suggest-form" onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">The building block</span>
              <Textarea
                autoFocus
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="e.g. A typed config service we don't have to host ourselves, with audit + rollback…"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">
                Email <span className="text-muted">(optional, if you want a reply)</span>
              </span>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </form>
        )}
      </Modal>
    </>
  );
}
