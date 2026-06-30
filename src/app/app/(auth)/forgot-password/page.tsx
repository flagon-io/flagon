'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { AuthCard } from '@/components/auth-card';
import { Field, SubmitButton } from '@/components/form';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await authClient.requestPasswordReset({ email, redirectTo: '/app/reset-password' });
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard
        title="Check your email"
        alt={
          <Link href="/app/signin" className="font-medium text-brand-500 hover:text-brand-400">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-muted">
          If an account exists for <span className="font-medium text-foreground">{email}</span>,
          we&apos;ve sent a link to reset your password. It expires in an hour.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
      alt={
        <>
          Remembered it?{' '}
          <Link href="/app/signin" className="font-medium text-brand-500 hover:text-brand-400">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <SubmitButton loading={loading}>Send reset link</SubmitButton>
      </form>
    </AuthCard>
  );
}
