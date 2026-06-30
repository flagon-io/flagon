'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { organization } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { appPath } from '@/lib/site';

export function InvitationActions({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    const { data, error } = await organization.acceptInvitation({ invitationId });
    if (error || !data) {
      setBusy(false);
      return setError(error?.message ?? 'Could not accept');
    }
    // Switch into the org we just joined.
    const orgId = (data as { invitation?: { organizationId?: string } }).invitation?.organizationId;
    if (orgId) await organization.setActive({ organizationId: orgId });
    router.push(appPath('/'));
    router.refresh();
  }

  async function decline() {
    setBusy(true);
    await organization.rejectInvitation({ invitationId });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      <Button size="sm" onClick={accept} disabled={busy}>
        Accept
      </Button>
      <Button variant="ghost" size="sm" onClick={decline} disabled={busy}>
        Decline
      </Button>
    </div>
  );
}
