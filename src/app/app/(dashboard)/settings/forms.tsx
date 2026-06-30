'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type AccountUser = { name: string; email: string; username: string | null; image: string | null };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ProfileForm({ user }: { user: AccountUser }) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? '');
  const [username, setUsername] = useState(user.username ?? '');
  const [image, setImage] = useState(user.image ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setBusy(true);
    const { error } = await authClient.updateUser({
      name,
      image: image.trim() || undefined,
      username: username.trim() || undefined,
    });
    setBusy(false);
    if (error) return setError(error.message ?? 'Could not save changes.');
    setMsg('Saved');
    router.refresh();
  }

  return (
    <Section title="Profile" description="How you appear across Flagon.">
      <form onSubmit={save} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Username</span>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} className="font-mono" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Avatar URL</span>
          <Input
            type="url"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Email</span>
          <Input value={user.email} disabled />
          <span className="mt-1 block text-xs text-muted">
            Email changes aren&rsquo;t self-serve yet. Contact support to update it.
          </span>
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || !name.trim()}>
            Save profile
          </Button>
          {msg && <span className="text-sm text-emerald-500">{msg}</span>}
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
      </form>
    </Section>
  );
}

export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== confirm) return setError('New passwords do not match.');
    setBusy(true);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (error) return setError(error.message ?? 'Could not change password.');
    setMsg('Password updated. Other sessions were signed out.');
    setCurrent('');
    setNext('');
    setConfirm('');
  }

  return (
    <Section title="Password" description="Changing your password signs out your other sessions.">
      <form onSubmit={save} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Current password</span>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">New password</span>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Confirm new password</span>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || !current || !next}>
            Update password
          </Button>
          {msg && <span className="text-sm text-emerald-500">{msg}</span>}
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
      </form>
    </Section>
  );
}
