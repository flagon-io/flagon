import { Suspense } from 'react';
import { isWaitlistEnabled } from '@/server/config';
import { SignUp } from './register';

// Server component: the signup mode is driven by the SERVER waitlist flag (the
// same one `signupAllowed()` enforces), so the UI can never disagree with the
// gate. No NEXT_PUBLIC mirror to fall out of sync.
export default function SignUpPage() {
  return (
    <Suspense>
      <SignUp waitlist={isWaitlistEnabled()} />
    </Suspense>
  );
}
