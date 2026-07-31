"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { Button, Select } from "@flagon/design";
import { PROJECT_ACCESS_ROLES } from "@/lib/catalog";
import type { ProjectAccess } from "@/lib/projects-api";
import {
  addProjectAccessAction,
  removeProjectAccessAction,
  setProjectAccessRoleAction,
} from "../../actions";

const ROLE_OPTIONS = PROJECT_ACCESS_ROLES.map((r) => ({ value: r.value, label: r.label }));

type TeamOption = { key: string; name: string };

/**
 * Project access, GitHub-repository style: the teams that can act on a project,
 * each with a role. The owning team is an implicit admin shown at the top; other
 * teams are added with an explicit role. Managing access is owner/admin.
 */
export function ProjectAccessManager({
  slug,
  projectKey,
  access,
  teams,
  canManage,
}: {
  slug: string;
  projectKey: string;
  access: ProjectAccess;
  teams: TeamOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addTeam, setAddTeam] = useState("");
  const [addRole, setAddRole] = useState("read");
  const [adding, startAdd] = useTransition();

  const granted = useMemo(
    () => new Set(access.grants.map((g) => g.teamKey)),
    [access.grants],
  );
  const available = teams.filter(
    (t) => t.key !== access.owner?.key && !granted.has(t.key),
  );

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
    if (!addTeam) return;
    setError(null);
    startAdd(async () => {
      const res = await addProjectAccessAction(slug, projectKey, addTeam, addRole);
      if (res.error) return setError(res.error);
      setAddTeam("");
      setAddRole("read");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <ul className="flex flex-col divide-y divide-white/8 rounded-lg border border-white/8">
        {/* The owning team: implicit admin, not a removable grant. */}
        {access.owner ? (
          <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/5 text-zinc-400">
                <Users className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-100">{access.owner.name}</p>
                <p className="truncate text-xs text-zinc-500">Owner</p>
              </div>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-zinc-300">
              Admin
            </span>
          </li>
        ) : null}

        {access.grants.map((g) => (
          <li
            key={g.teamKey}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/5 text-zinc-400">
                <Users className="h-4 w-4" />
              </span>
              <p className="truncate text-sm text-zinc-100">{g.teamName}</p>
            </div>
            <div className="flex items-center gap-3">
              {canManage ? (
                <Select
                  ariaLabel={`${g.teamName} role`}
                  value={g.role}
                  disabled={busy === g.teamKey}
                  onValueChange={(v) =>
                    run(g.teamKey, () =>
                      setProjectAccessRoleAction(slug, projectKey, g.teamKey, v),
                    )
                  }
                  className="px-2 py-1 text-xs"
                  options={ROLE_OPTIONS}
                />
              ) : (
                <span className="text-xs capitalize text-zinc-400">{g.role}</span>
              )}
              {canManage ? (
                <button
                  type="button"
                  disabled={busy === g.teamKey}
                  onClick={() =>
                    run(g.teamKey, () =>
                      removeProjectAccessAction(slug, projectKey, g.teamKey),
                    )
                  }
                  className="text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </li>
        ))}

        {!access.owner && access.grants.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-zinc-500">
            No teams have access yet. The owning team is always an admin; assign one
            from the Catalog section above.
          </li>
        ) : null}
      </ul>

      {canManage && available.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/8 bg-white/2 p-3">
          <div className="flex min-w-52 flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-400">Add a team</span>
            <Select
              ariaLabel="Team to grant access"
              value={addTeam}
              onValueChange={setAddTeam}
              placeholder="Choose a team…"
              options={available.map((t) => ({ value: t.key, label: t.name }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-400">Role</span>
            <Select
              ariaLabel="Access role"
              value={addRole}
              onValueChange={setAddRole}
              options={ROLE_OPTIONS}
            />
          </div>
          <Button variant="secondary" onClick={add} disabled={adding || !addTeam}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}
