'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function WaitlistRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function act(action: 'approve' | 'reject') {
    setError(null);
    const res = await fetch(`/api/sudo/waitlist/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.message ?? 'Failed');
      return;
    }
    startTransition(() => router.refresh());
  }

  if (status === 'approved' || status === 'converted') {
    return <span className="text-xs text-muted">-</span>;
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      <Button size="sm" onClick={() => act('approve')} disabled={pending}>
        Approve
      </Button>
      <Button variant="secondary" size="sm" onClick={() => act('reject')} disabled={pending}>
        Reject
      </Button>
    </div>
  );
}
