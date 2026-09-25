"use client";

import { useState } from "react";
import { Check, Copy, Trash2, UserPlus } from "lucide-react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  InputGroup,
  Label,
} from "@flagon-io/ui";
import { errorMessage } from "@/lib/client-fetch";
import { MemberRoleSelect } from "./member-role-select";

type InviteRow = { login: string; role: string };

/** An invitation whose email did not go out, so the inviter must share the link. */
type InviteLink = { email: string; url: string };

/** What the gateway's POST /api/orgs/[slug]/invitations returns on success. */
type InviteResponse = {
  status: "added" | "invited";
  email?: string;
  emailFailed?: boolean;
  inviteUrl?: string;
};

/**
 * The "Invite people" modal: several email/username rows, each with a role.
 * Remount it (via `key`) to start fresh each time it opens. Rows that fail stay
 * in the form with the reason, so the user can fix and resend just those.
 * Invitations whose email was not sent (no mail provider configured, or delivery
 * failed) are listed with their accept link and a copy button, so the inviter can
 * deliver it themselves. Owners are never invited directly: promote a member.
 */
export function InviteDialog({
  open,
  onOpenChange,
  slug,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  onInvited: () => Promise<void>;
}) {
  const [invites, setInvites] = useState<InviteRow[]>([{ login: "", role: "member" }]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<InviteLink[]>([]);

  function setInvite(i: number, patch: Partial<InviteRow>) {
    setInvites((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const list = invites.filter((r) => r.login.trim());
    if (list.length === 0) return;
    setAdding(true);
    setError(null);
    const failures: string[] = [];
    const unsent: InviteLink[] = [];
    for (const row of list) {
      const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: row.login.trim(), role: row.role }),
      });
      if (!res.ok) {
        failures.push(`${row.login.trim()}: ${await errorMessage(res, "couldn't invite")}`);
        continue;
      }
      const body = (await res.json().catch(() => null)) as InviteResponse | null;
      if (body?.status === "invited" && body.emailFailed && body.inviteUrl) {
        unsent.push({ email: body.email ?? row.login.trim(), url: body.inviteUrl });
      }
    }
    setAdding(false);
    await onInvited();
    const allLinks = [...links, ...unsent];
    setLinks(allLinks);
    if (failures.length > 0) {
      setError(failures.join("\n"));
      setInvites(list.filter((r) => failures.some((f) => f.startsWith(`${r.login.trim()}:`))));
      return;
    }
    if (allLinks.length > 0) {
      // Keep the dialog open so the inviter can copy the links.
      setInvites([]);
      return;
    }
    onOpenChange(false);
  }

  // Every row went through: only the unsent links (if any) remain to show.
  const done = invites.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <DialogTitle>Invite people</DialogTitle>
            <DialogDescription className="mt-1.5">
              Invite by email or username, and pick a role for each. Existing Flagon users join
              right away; anyone else gets an email with a link to register and join.
            </DialogDescription>
          </div>

          {links.length > 0 && (
            <div className="space-y-3">
              <Alert>
                {links.length === 1 ? "This invitation wasn't" : "These invitations weren't"}{" "}
                emailed. Copy the link and send it yourself; it expires in 7 days.
              </Alert>
              {links.map((l) => (
                <InviteLinkRow key={l.url} link={l} />
              ))}
            </div>
          )}

          {!done && (
            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr_9rem] gap-2 sm:grid">
                <Label className="text-xs text-muted-foreground">Email or username</Label>
                <Label className="text-xs text-muted-foreground">Role</Label>
              </div>
              {invites.map((row, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem_auto]">
                  <Input
                    autoFocus={i === 0}
                    placeholder="person@example.com"
                    value={row.login}
                    onChange={(e) => setInvite(i, { login: e.target.value })}
                  />
                  {/* Owners are made by promoting a member, never invited directly. */}
                  <MemberRoleSelect
                    value={row.role}
                    onChange={(r) => setInvite(i, { role: r })}
                    allowOwner={false}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setInvites((r) => r.filter((_, idx) => idx !== i))}
                    disabled={invites.length === 1}
                    aria-label="Remove row"
                    className="hidden size-9 disabled:opacity-30 sm:flex"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setInvites((r) => [...r, { login: "", role: "member" }])}
                className="w-fit gap-1.5"
              >
                <UserPlus className="size-4" />
                Add more
              </Button>
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="whitespace-pre-line">
              {error}
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            {done ? (
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={adding || invites.every((r) => !r.login.trim())}>
                  {adding ? "Sending..." : "Send invites"}
                </Button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One unsent invitation: the invitee, their accept link (read-only), and a copy button. */
function InviteLinkRow({ link }: { link: InviteLink }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the field stays selectable */
    }
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{link.email}</p>
      <InputGroup
        readOnly
        value={link.url}
        aria-label={`Invite link for ${link.email}`}
        onFocus={(e) => e.currentTarget.select()}
        inputClassName="font-mono text-xs"
        suffixClassName="p-0"
        suffix={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={copy}
            className="h-full rounded-none"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        }
      />
    </div>
  );
}
