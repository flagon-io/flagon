'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { AuthCard } from '@/components/auth-card';
import { Field, SubmitButton } from '@/components/form';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setLoading(false);
      setError(error.message ?? 'Could not reset password');
      return;
    }
    router.push('/app/signin');
    router.refresh();
  }

  if (!token) {
    return (
      <AuthCard title="Invalid reset link">
        <p className="text-sm text-muted">
          This link is invalid or has expired.{' '}
          <Link href="/app/forgot-password" className="text-brand-500 hover:text-brand-400">
            Request a new one
          </Link>
          .
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      alt={
        <Link href="/app/signin" className="font-medium text-brand-500 hover:text-brand-400">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="At least 8 characters."
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <SubmitButton loading={loading}>Reset password</SubmitButton>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
