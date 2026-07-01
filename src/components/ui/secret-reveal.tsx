'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './button';
import { CopyButton } from './copy-button';
import { cn } from '@/lib/cn';

export type RevealResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Design-system control for a stored secret that can be revealed on demand (e.g.
 * an SDK key). Shows a masked value with an eye toggle; on reveal it calls
 * `onReveal` (an async fetch that decrypts server-side), then offers copy. Any
 * failure (e.g. a key created before encryption existed) is surfaced inline — no
 * silent no-op.
 */
export function SecretReveal({
  masked,
  onReveal,
  canReveal = true,
  className,
}: {
  masked: string;
  onReveal: () => Promise<RevealResult>;
  canReveal?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setError(null);
    if (value) {
      setValue(null);
      return;
    }
    setBusy(true);
    const res = await onReveal();
    setBusy(false);
    if (res.ok) setValue(res.value);
    else setError(res.error);
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      <code className="truncate font-mono text-xs">{value ?? masked}</code>
      {canReveal && (
        <>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={value ? 'Hide key' : 'Reveal key'}
            onClick={toggle}
            disabled={busy}
          >
            {value ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
          {value && <CopyButton value={value} variant="ghost" label="Copy key" />}
        </>
      )}
      {error && <span className="shrink-0 text-xs text-red-400">{error}</span>}
    </span>
  );
}
