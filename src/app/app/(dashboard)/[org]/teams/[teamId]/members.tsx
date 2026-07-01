'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TEAM_ROLES } from '@/lib/teams';
import { addTeamMember, removeTeamMember, setTeamMemberRole } from '../../actions';

type Person = {
  userId: string;
  label: string;
  email: string;
  orgRole: string;
  onTeam: boolean;
  teamRole: string;
};

const ROLE_OPTIONS = TEAM_ROLES.map((r) => ({ value: r, label: r[0]!.toUpperCase() + r.slice(1) }));

export function TeamMembersManager({
  orgSlug,
  teamId,
  canManage,
  people,
}: {
  orgSlug: string;
  teamId: string;
  canManage: boolean;
  people: Person[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addId, setAddId] = useState('');
  const [addRole, setAddRole] = useState<string>(TEAM_ROLES[0]);
  const [error, setError] = useState<string | null>(null);

  const onTeam = people.filter((p) => p.onTeam);
  const available = people.filter((p) => !p.onTeam);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return setError(res.error ?? 'Something went wrong.');
    router.refresh();
  }

  return (
    <section className="mt-8">
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={addId}
            onValueChange={setAddId}
            ariaLabel="Add a member to this team"
            options={[
              { value: '', label: available.length ? 'Add a member…' : 'Everyone is on this team' },
              ...available.map((p) => ({ value: p.userId, label: p.label })),
            ]}
            className="w-56"
          />
          <Select
            value={addRole}
            onValueChange={setAddRole}
            ariaLabel="Role for the new member"
            options={ROLE_OPTIONS}
            className="w-36"
          />
          <Button
            disabled={busy || !addId}
            onClick={() => {
              const id = addId;
              setAddId('');
              return run(() => addTeamMember(orgSlug, teamId, id, addRole));
            }}
          >
            <UserPlus className="size-4" /> Add
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {onTeam.length === 0 ? (
          <li className="p-4 text-center text-sm text-muted">No one is on this team yet.</li>
        ) : (
          onTeam.map((p) => (
            <li key={p.userId} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.label}</p>
                <p className="truncate text-xs text-muted">{p.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="neutral" title="Organization role">
                  org: {p.orgRole}
                </Badge>
                {canManage ? (
                  <Select
                    value={p.teamRole}
                    onValueChange={(role) =>
                      run(() => setTeamMemberRole(orgSlug, teamId, p.userId, role))
                    }
                    ariaLabel={`Team role for ${p.label}`}
                    options={ROLE_OPTIONS}
                    className="w-36"
                  />
                ) : (
                  <Badge variant="brand">{p.teamRole}</Badge>
                )}
                {canManage && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove from team"
                    disabled={busy}
                    onClick={() => run(() => removeTeamMember(orgSlug, teamId, p.userId))}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
