'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Trash2, UserPlus } from 'lucide-react';
import { organization } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { appHref } from '@/lib/site';

type Member = {
  id: string;
  role: string;
  name: string;
  email: string;
  username: string | null;
  isSelf: boolean;
};
type Invite = { id: string; email: string; role: string; expiresAt: string };

const ROLES = ['member', 'admin'] as const;

function roleVariant(role: string) {
  return role === 'owner' ? 'brand' : role === 'admin' ? 'success' : 'neutral';
}

export function MembersManager({
  orgId,
  members,
  invites,
  canManage,
}: {
  orgId: string;
  members: Member[];
  invites: Invite[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('member');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  function openInvite() {
    setEmail('');
    setRole('member');
    setError(null);
    setInviteOpen(true);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await organization.inviteMember({ email, role, organizationId: orgId });
    setBusy(false);
    if (error) return setError(error.message ?? 'Could not send invite');
    setEmail('');
    setInviteOpen(false);
    refresh();
  }

  async function changeRole(memberId: string, next: string) {
    await organization.updateMemberRole({ memberId, role: next as 'member' | 'admin', organizationId: orgId });
    refresh();
  }
  async function removeMember(memberIdOrEmail: string) {
    await organization.removeMember({ memberIdOrEmail, organizationId: orgId });
    refresh();
  }
  async function cancelInvite(invitationId: string) {
    await organization.cancelInvitation({ invitationId });
    refresh();
  }
  function copyInviteLink(id: string) {
    navigator.clipboard?.writeText(appHref('/invitations')).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="mt-8 space-y-10">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={openInvite}>
            <UserPlus className="size-4" /> Invite member
          </Button>
        </div>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite member"
        description="They'll get an email invitation to join this organization."
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="invite-form" disabled={busy || !email}>
              Send invite
            </Button>
          </>
        }
      >
        <form id="invite-form" onSubmit={invite} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Email</span>
            <Input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
            />
          </label>
          <div>
            <span className="mb-1.5 block text-sm font-medium">Role</span>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as (typeof ROLES)[number])}
              options={ROLES.map((r) => ({ value: r, label: r }))}
              ariaLabel="Invite role"
              className="w-40"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      </Modal>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Members</h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {m.name} {m.isSelf && <span className="text-xs text-muted">(you)</span>}
                    </div>
                    <div className="text-xs text-muted">{m.email}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && !m.isSelf && m.role !== 'owner' ? (
                      <div className="flex items-center justify-end gap-2">
                        <Select
                          value={m.role}
                          onValueChange={(v) => changeRole(m.id, v)}
                          options={ROLES.map((r) => ({ value: r, label: r }))}
                          ariaLabel="Member role"
                          className="w-28"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove member"
                          onClick={() => removeMember(m.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <Badge variant={roleVariant(m.role)}>{m.role}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {invites.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Pending invites</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{i.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={roleVariant(i.role)}>{i.role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => copyInviteLink(i.id)}>
                          {copied === i.id ? (
                            <>
                              <Check className="size-3.5" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="size-3.5" /> Copy link
                            </>
                          )}
                        </Button>
                        {canManage && (
                          <Button variant="ghost" size="sm" onClick={() => cancelInvite(i.id)}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
