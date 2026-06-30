'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUp } from '@/lib/auth-client';
import { AuthCard } from '@/components/auth-card';
import { Field, SubmitButton } from '@/components/form';
import { SocialButtons, OrDivider } from '@/components/social-buttons';
import { WaitlistForm } from '@/components/waitlist-form';
import { Skeleton } from '@/components/skeleton';
import { apiBase } from '@/lib/site';

type Mode = 'loading' | 'register' | 'waitlist';

export default function SignUpPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('loading');

  useEffect(() => {
    // Decide whether this instance takes registrations or a waitlist.
    fetch(`${apiBase}/waitlist`)
      .then((r) => r.json())
      .then((cfg: { enabled?: boolean; signupOpen?: boolean }) => {
        setMode(cfg.enabled && !cfg.signupOpen ? 'waitlist' : 'register');
      })
      .catch(() => setMode('register'));
  }, []);

  if (mode === 'loading') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-7 w-7" />
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="mt-6 space-y-2.5 rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="my-2 h-px w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'waitlist') {
    return (
      <AuthCard
        title="Request early access"
        subtitle="Flagon is invite-only right now. Join the waitlist and we’ll email you when your spot opens."
        alt={
          <>
            Already approved or the account owner?{' '}
            <button
              onClick={() => setMode('register')}
              className="font-medium text-brand-500 hover:text-brand-400"
            >
              Create your account
            </button>
          </>
        }
      >
        <WaitlistForm />
      </AuthCard>
    );
  }

  return <RegisterForm onWaitlist={() => setMode('waitlist')} router={router} />;
}

function RegisterForm({
  router,
  onWaitlist,
}: {
  router: ReturnType<typeof useRouter>;
  onWaitlist: () => void;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // No "name" field — keep it clean. We seed `name` from the username; users
    // can set a display name later in profile settings.
    const { error } = await signUp.email({ email, password, username, name: username });
    if (error) {
      setLoading(false);
      setError(error.message ?? 'Could not create account');
      return;
    }
    // Keep the button disabled through the redirect — the page navigates away.
    router.push('/app');
    router.refresh();
  }

  return (
    <AuthCard
      title="Create your Flagon account"
      alt={
        <>
          Already have an account?{' '}
          <Link href="/app/signin" className="font-medium text-brand-500 hover:text-brand-400">
            Sign in
          </Link>
        </>
      }
    >
      <SocialButtons />
      <OrDivider />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="At least 8 characters. Longer and more varied is stronger."
        />
        <Field
          label="Username"
          value={username}
          onChange={setUsername}
          autoComplete="username"
          placeholder="lowercase, no spaces"
          hint="Letters, numbers, and single hyphens. Can't begin or end with a hyphen."
        />
        {error && (
          <div className="text-sm text-red-400">
            {error}
            {/^signups are invite-only/i.test(error) && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={onWaitlist}
                  className="font-medium text-brand-500 hover:text-brand-400"
                >
                  Join the waitlist
                </button>
              </>
            )}
          </div>
        )}
        <SubmitButton loading={loading}>Create account</SubmitButton>
        <p className="text-xs leading-relaxed text-muted">
          By creating an account, you agree to Flagon&apos;s{' '}
          <Link href="/terms" className="text-foreground underline underline-offset-2 hover:text-brand-500">
            Terms of Service
          </Link>
          . For details on how we handle your data, see our{' '}
          <Link href="/privacy" className="text-foreground underline underline-offset-2 hover:text-brand-500">
            Privacy Policy
          </Link>
          . We&apos;ll occasionally send you account-related emails.
        </p>
      </form>
    </AuthCard>
  );
}
