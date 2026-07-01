'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { organization } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { appPath } from '@/lib/site';

type Org = { id: string; name: string; slug: string; logo: string | null };

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

export function OrgSettingsForm({ org, canManage }: { org: Org; canManage: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(org.name);
  const [slug, setSlug] = useState(org.slug);
  const [logo, setLogo] = useState(org.logo ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setBusy(true);
    const { error } = await organization.update({
      organizationId: org.id,
      data: { name, slug, logo: logo.trim() || undefined },
    });
    setBusy(false);
    if (error) return setError(error.message ?? 'Could not save changes.');
    setMsg('Saved');
    // Changing the slug changes the URL — follow it.
    if (slug !== org.slug) router.push(appPath(`/${slug}/settings`));
    else router.refresh();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">General</h2>
      <p className="mt-1 text-sm text-muted">Your organization&rsquo;s name, URL, and logo.</p>
      <form onSubmit={save} className="mt-4 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} required />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">URL slug</span>
          <div className="flex items-center rounded-lg border border-border bg-input focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
            <span className="pl-3 text-sm text-muted">flagon.io/</span>
            <input
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              disabled={!canManage}
              required
              className="w-full bg-transparent px-1 py-2 font-mono text-sm outline-none disabled:opacity-60"
            />
          </div>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Logo URL</span>
          <Input
            type="url"
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
            placeholder="https://…"
            disabled={!canManage}
          />
        </label>
        {canManage && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy || !name.trim() || !slug.trim()}>
              Save changes
            </Button>
            {msg && <span className="text-sm text-emerald-500">{msg}</span>}
            {error && <span className="text-sm text-red-400">{error}</span>}
          </div>
        )}
      </form>
    </section>
  );
}

export function DangerZone({ org }: { org: { id: string; name: string; slug: string } }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    setBusy(true);
    setError(null);
    const { error } = await organization.delete({ organizationId: org.id });
    if (error) {
      setBusy(false);
      return setError(error.message ?? 'Could not delete organization.');
    }
    // Hard navigation: /app re-resolves to a remaining org or onboarding.
    window.location.assign(appPath('/'));
  }

  return (
    <section className="rounded-xl border border-red-500/30 bg-red-500/[0.03] p-6">
      <h2 className="text-sm font-semibold text-red-400">Danger zone</h2>
      <p className="mt-1 text-sm text-muted">
        Deleting <span className="font-medium text-foreground">{org.name}</span> permanently removes
        its projects, environments, and members. This cannot be undone.
      </p>
      <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}>
        Delete organization
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${org.name}?`}
        description="This is permanent. Type the slug to confirm."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={busy || confirm !== org.slug} onClick={del}>
              Delete forever
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Type <span className="font-mono text-foreground">{org.slug}</span> to confirm
          </span>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="font-mono" autoFocus />
        </label>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </Modal>
    </section>
  );
}
