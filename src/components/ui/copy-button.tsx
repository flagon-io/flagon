'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from './button';

/** Icon button that copies `value` to the clipboard with a brief check confirmation. */
export function CopyButton({
  value,
  variant = 'secondary',
  label = 'Copy',
}: {
  value: string;
  variant?: 'secondary' | 'ghost';
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button type="button" size="icon" variant={variant} aria-label={label} onClick={copy}>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}
