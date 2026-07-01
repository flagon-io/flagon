'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { createTeam } from '../actions';

export function CreateTeam({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createTeam(orgSlug, { name });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setName('');
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New team
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create team"
        description="Teams own projects. Add people to a team to give them access to what it owns."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-team-form" disabled={busy || !name.trim()}>
              Create team
            </Button>
          </>
        }
      >
        <form id="create-team-form" onSubmit={submit}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Name</span>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Platform" />
          </label>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
