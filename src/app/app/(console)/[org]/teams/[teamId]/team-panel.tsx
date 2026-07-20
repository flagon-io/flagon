"use client";

import { appPath } from "@/lib/urls";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2, UserRound, X } from "lucide-react";
import {
  Notice,
  buttonClass,
  dangerButtonClass,
  hintClass,
} from "@/components/form-ui";
import { Label, Select } from "@/ui";
import {
  addTeamMemberAction,
  deleteTeamAction,
  removeTeamMemberAction,
} from "../actions";

export type TeamPanelMember = {
  userId: string;
  username: string | null;
  name: string;
  email: string;
};

export type AddableMember = { userId: string; label: string };

/**
 * Team roster management: add org members to the team, remove them, and
 * (for owners/admins) delete the team. Deleting a team also removes any
 * project access it granted.
 */
export function TeamPanel({
  orgSlug,
  teamId,
  members,
  addable,
  canManage,
}: {
  orgSlug: string;
  teamId: string;
  members: TeamPanelMember[];
  addable: AddableMember[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!selected) {
      setError("Choose a member to add.");
      return;
    }
    setPending(true);
    const result = await addTeamMemberAction(orgSlug, teamId, selected);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSelected("");
    router.refresh();
  }

  async function remove(userId: string) {
    setError(null);
    const result = await removeTeamMemberAction(orgSlug, teamId, userId);
    if (!result.ok) setError(result.message);
    router.refresh();
  }

  async function destroy() {
    setError(null);
    setPending(true);
    const result = await deleteTeamAction(orgSlug, teamId);
    if (!result.ok) {
      setPending(false);
      setConfirmingDelete(false);
      setError(result.message);
      return;
    }
    router.push(appPath(`/${orgSlug}/teams`));
    router.refresh();
  }

  return (
    <div>
      {error ? <Notice tone="error">{error}</Notice> : null}

      {canManage ? (
        <form
          onSubmit={add}
          className="flex flex-wrap items-end gap-3 border border-white/10 bg-white/2 p-4"
        >
          <div className="min-w-56 flex-1">
            <Label htmlFor="team-add-member">Add a member</Label>
            <Select
              id="team-add-member"
              value={selected}
              onValueChange={setSelected}
              placeholder={
                addable.length
                  ? "Choose an organization member"
                  : "Everyone is already on this team"
              }
              disabled={!addable.length}
              options={addable.map((member) => ({
                value: member.userId,
                label: member.label,
              }))}
            />
          </div>
          <button
            type="submit"
            disabled={pending || !addable.length}
            className={buttonClass}
          >
            {pending ? "Adding..." : "Add to team"}
          </button>
        </form>
      ) : null}

      {members.length ? (
        <ul className="mt-4 divide-y divide-white/5 border border-white/10">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 bg-white/3 text-zinc-500"
              >
                <UserRound className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-100">
                  {member.username ? (
                    <Link
                      href={appPath(`/${orgSlug}/members/${member.username}`)}
                      className="transition hover:text-teal-300 hover:underline"
                    >
                      {member.name}
                    </Link>
                  ) : (
                    member.name
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-zinc-500">
                  {member.username ? `${member.username} · ` : ""}
                  {member.email}
                </div>
              </div>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => remove(member.userId)}
                  aria-label={`Remove ${member.name} from the team`}
                  className="rounded-md p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-red-400"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${hintClass} mt-4`}>
          Nobody on this team yet.
          {canManage ? " Add organization members above." : ""}
        </p>
      )}

      {canManage ? (
        <div className="mt-12 border border-red-500/20 p-4">
          <h2 className="text-sm font-semibold text-zinc-100">Danger zone</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            Deleting the team removes its roster and any project access it
            granted. Members keep their organization membership.
          </p>
          <div className="mt-3 flex items-center gap-3">
            {confirmingDelete ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={destroy}
                  className={dangerButtonClass}
                >
                  {pending ? "Deleting..." : "Yes, delete this team"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="text-sm text-zinc-500 transition hover:text-zinc-300"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className={`${dangerButtonClass} inline-flex items-center gap-1.5`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete team
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
