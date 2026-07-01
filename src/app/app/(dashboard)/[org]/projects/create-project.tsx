'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { appPath } from '@/lib/site';
import { createProject } from '../actions';

export function CreateProject({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createProject(orgSlug, { name });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push(appPath(`/${orgSlug}/projects/${res.data.id}`));
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New project
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create project"
        description="A project is one application or service you run. Capabilities attach to it per environment; environments are shared across every project."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-project-form" disabled={busy || !name.trim()}>
              Create project
            </Button>
          </>
        }
      >
        <form id="create-project-form" onSubmit={submit}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Name</span>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Web" />
          </label>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </form>
      </Modal>
    </>
  );
}
