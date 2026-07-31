"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Select } from "@flagon/design";
import {
  addTeamMemberAction,
  removeTeamMemberAction,
  setTeamMemberRoleAction,
} from "../actions";

type Member = {
  userId: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
};
type Available = { userId: string; name: string; email: string; username: string | null };

const TEAM_ROLES = [
  { value: "maintainer", label: "Maintainer" },
  { value: "member", label: "Member" },
];

export function TeamMembersManager({
  slug,
  teamKey,
  members,
  available,
  canManage,
}: {
  slug: string;
  teamKey: string;
  members: Member[];
  available: Available[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addUser, setAddUser] = useState("");
  const [addRole, setAddRole] = useState<"maintainer" | "member">("member");
  const [adding, startAdd] = useTransition();

  function run(id: string, fn: () => Promise<{ error?: string }>) {
    setBusy(id);
    setError(null);
    fn().then((res) => {
      setBusy(null);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function add() {
    if (!addUser) return;
    setError(null);
    startAdd(async () => {
      const res = await addTeamMemberAction(slug, teamKey, addUser, addRole);
      if (res.error) return setError(res.error);
      setAddUser("");
      setAddRole("member");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {canManage && available.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/8 bg-white/2 p-3">
          <div className="flex min-w-52 flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-400">Add a member</span>
            <Select
              ariaLabel="Org member to add"
              value={addUser}
              onValueChange={setAddUser}
              placeholder="Choose a person…"
              options={available.map((a) => ({
                value: a.userId,
                label: a.username ? `${a.name} (@${a.username})` : `${a.name} · ${a.email}`,
              }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-400">Role</span>
            <Select
              ariaLabel="Team role"
              value={addRole}
              onValueChange={(v) => setAddRole(v as "maintainer" | "member")}
              options={TEAM_ROLES}
            />
          </div>
          <Button variant="secondary" onClick={add} disabled={adding || !addUser}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      ) : null}

      {members.length === 0 ? (
        <p className="text-sm text-zinc-500">No members yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/8 rounded-lg border border-white/8">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-100">{m.name}</p>
                <p className="truncate text-xs text-zinc-500">
                  {m.username ? `@${m.username} · ` : ""}
                  {m.email}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {canManage ? (
                  <Select
                    ariaLabel="Team role"
                    value={m.role}
                    disabled={busy === m.userId}
                    onValueChange={(v) =>
                      run(m.userId, () =>
                        setTeamMemberRoleAction(slug, teamKey, m.userId, v as "maintainer" | "member"),
                      )
                    }
                    className="px-2 py-1 text-xs"
                    options={TEAM_ROLES}
                  />
                ) : (
                  <span className="text-xs capitalize text-zinc-400">{m.role}</span>
                )}
                {canManage ? (
                  <button
                    type="button"
                    disabled={busy === m.userId}
                    onClick={() =>
                      run(m.userId, () => removeTeamMemberAction(slug, teamKey, m.userId))
                    }
                    className="text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
