'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signUp } from '@/lib/auth-client';
import { AuthCard } from '@/components/auth-card';
import { Field, SubmitButton } from '@/components/form';
import { SocialButtons, OrDivider } from '@/components/social-buttons';
import { WaitlistForm } from '@/components/waitlist-form';

/**
 * `waitlist` is the SERVER truth (`isWaitlistEnabled()` → `WAITLIST_ENABLED`), the
 * same flag `signupAllowed()` gates on. Driving the UI from it means the signup
 * page can never claim "invite-only" while the server quietly allows registration
 * (or vice versa).
 */
export function SignUp({ waitlist }: { waitlist: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Approved people arrive from the invite email with ?register and skip the
  // waitlist view. The founder / anyone approved can also switch to it below.
  const forceRegister = searchParams.has('register');
  const initialEmail = searchParams.get('email') ?? '';
  const invite = searchParams.get('invite');
  const [mode, setMode] = useState<'register' | 'waitlist'>(
    waitlist && !forceRegister ? 'waitlist' : 'register',
  );

  if (mode === 'waitlist') {
    return (
      <AuthCard
        title="Request early access"
        subtitle="Flagon is invite-only right now. Join the waitlist and we’ll email you an invite when your spot opens."
        alt={
          <>
            Got an invite, or the account owner?{' '}
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

  return (
    <RegisterForm
      onWaitlist={() => setMode('waitlist')}
      router={router}
      initialEmail={initialEmail}
      invite={invite}
    />
  );
}

function RegisterForm({
  router,
  onWaitlist,
  initialEmail,
  invite,
}: {
  router: ReturnType<typeof useRouter>;
  onWaitlist: () => void;
  initialEmail: string;
  invite: string | null;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(initialEmail);
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
    // If they came from an invite, drop them back on the accept screen.
    router.push(invite ? `/app/invite/${invite}` : '/app');
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
