'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { setProjectTeam } from '../../actions';

type Team = { id: string; name: string };

export function ProjectTeam({
  orgSlug,
  projectId,
  teamId,
  teams,
  canManage,
}: {
  orgSlug: string;
  projectId: string;
  teamId: string | null;
  teams: Team[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!canManage) {
    const t = teams.find((x) => x.id === teamId);
    return <span className="text-sm text-muted">Owned by {t ? t.name : 'no team'}</span>;
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Owned by
      <Select
        value={teamId ?? ''}
        onValueChange={async (v) => {
          setBusy(true);
          await setProjectTeam(orgSlug, projectId, v || null);
          setBusy(false);
          router.refresh();
        }}
        ariaLabel="Owning team"
        options={[{ value: '', label: 'No team' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
        className={busy ? 'w-48 opacity-60' : 'w-48'}
      />
    </label>
  );
}
