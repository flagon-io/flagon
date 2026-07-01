import { Suspense } from 'react';
import { count } from 'drizzle-orm';
import { db } from '@/server/db';
import { users } from '@/server/db/schema/auth';
import { isWaitlistEnabled } from '@/server/config';
import { SignUp } from './register';

// Server component: the signup mode is driven by the SERVER waitlist flag (the
// same one `signupAllowed()` enforces), so the UI can never disagree with the
// gate. And the self-serve "create your account" escape hatch only shows for the
// very first account (bootstrap) — once a user exists, uninvited visitors see only
// the waitlist; invited people arrive via their invite link (?register).
export default async function SignUpPage() {
  const [{ value: userCount }] = await db.select({ value: count() }).from(users);
  return (
    <Suspense>
      <SignUp waitlist={isWaitlistEnabled()} firstUser={userCount === 0} />
    </Suspense>
  );
}
