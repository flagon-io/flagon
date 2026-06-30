'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { organization } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { appPath } from '@/lib/site';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function NewOrgForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touchedSlug, setTouchedSlug] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const effectiveSlug = touchedSlug ? slug : slugify(name);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await organization.create({ name, slug: effectiveSlug });
    if (error || !data) {
      setLoading(false);
      setError(error?.message ?? 'Could not create organization');
      return;
    }
    await organization.setActive({ organizationId: data.id });
    router.push(appPath(`/${data.slug}`));
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Create your organization</h1>
      <p className="mt-2 text-sm text-muted">
        Organizations hold your projects, environments, and team. You can rename it later.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc" required />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">URL slug</span>
          <div className="flex items-center rounded-lg border border-border bg-input focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
            <span className="pl-3 text-sm text-muted">flagon.io/</span>
            <input
              value={effectiveSlug}
              onChange={(e) => {
                setTouchedSlug(true);
                setSlug(slugify(e.target.value));
              }}
              required
              className="w-full bg-transparent px-1 py-2 outline-none"
            />
          </div>
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button type="submit" size="lg" disabled={loading || !name} className="w-full">
          Create organization
        </Button>
      </form>
    </div>
  );
}
