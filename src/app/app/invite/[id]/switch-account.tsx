'use client';

import { useState } from 'react';
import { signOut } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

/** Sign out so the user can re-open the invite as the invited account. */
export function SwitchAccount() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
        window.location.reload();
      }}
    >
      Sign out & switch account
    </Button>
  );
}
