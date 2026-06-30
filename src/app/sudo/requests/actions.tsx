'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';

const OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'planned', label: 'Planned' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'declined', label: 'Declined' },
];

/** Inline status picker for a building-block request — PATCHes and refreshes. */
export function RequestStatusSelect({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function change(next: string) {
    const prev = value;
    setValue(next); // optimistic
    setError(null);
    const res = await fetch(`/api/sudo/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      setValue(prev); // revert
      const body = await res.json().catch(() => null);
      setError(body?.message ?? 'Failed');
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      <Select
        value={value}
        onValueChange={change}
        options={OPTIONS}
        ariaLabel="Request status"
        className={`w-36 ${pending ? 'opacity-60' : ''}`}
      />
    </div>
  );
}
