'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '@/lib/auth-client';
import { AuthCard } from '@/components/auth-card';
import { Field, SubmitButton } from '@/components/form';
import { Input } from '@/components/ui/input';
import { SocialButtons, OrDivider } from '@/components/social-buttons';

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // One field, two paths: an "@" means email, otherwise treat it as a username.
    const { error } = identifier.includes('@')
      ? await signIn.email({ email: identifier, password })
      : await signIn.username({ username: identifier, password });
    if (error) {
      setLoading(false);
      setError(error.message ?? 'Could not sign in');
      return;
    }
    router.push('/app');
    router.refresh();
  }

  return (
    <AuthCard
      title="Sign in to Flagon"
      alt={
        <>
          New to Flagon?{' '}
          <Link href="/app/signup" className="font-medium text-brand-500 hover:text-brand-400">
            Create an account
          </Link>
        </>
      }
    >
      <SocialButtons />
      <OrDivider />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Email or username"
          value={identifier}
          onChange={setIdentifier}
          autoComplete="username"
        />
        <div className="relative">
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            Password
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {/* Positioned in the label row, but placed after the input in the DOM so
              tab order is username → password → here (not username → here → password). */}
          <Link
            href="/app/forgot-password"
            className="absolute right-0 top-0 text-xs text-muted hover:text-foreground"
          >
            Forgot password?
          </Link>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <SubmitButton loading={loading}>Sign in</SubmitButton>
      </form>
    </AuthCard>
  );
}
