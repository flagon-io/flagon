"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Select } from "@flagon/design";
import { MemberAvatar } from "@/components/member-avatar";
import { MemberPicker } from "@/components/member-picker";
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
const NO_MANAGE = "Only organization owners and admins and this team's maintainers can manage members.";
// Small teams stay clean; the filter appears only once a roster is long enough
// that scanning it by eye gets tedious.
const FILTER_THRESHOLD = 6;

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
  const [filter, setFilter] = useState("");
  const [, startAdd] = useTransition();

  function run(id: string, fn: () => Promise<{ error?: string }>) {
    setBusy(id);
    setError(null);
    fn().then((res) => {
      setBusy(null);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function add(userId: string) {
    setError(null);
    setBusy(userId);
    startAdd(async () => {
      const res = await addTeamMemberAction(slug, teamKey, userId, "member");
      setBusy(null);
      if (res.error) return setError(res.error);
      router.refresh();
    });
  }

  const q = filter.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.username ? `@${m.username}`.toLowerCase().includes(q) : false),
    );
  }, [members, q]);

  const showFilter = members.length > FILTER_THRESHOLD;

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <MemberPicker
          options={available}
          onPick={add}
          disabled={!canManage || available.length === 0}
          disabledReason={
            !canManage
              ? NO_MANAGE
              : "Everyone in the organization is already on this team."
          }
        />
        {showFilter ? (
          <div className="flex min-w-52 flex-1 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 transition-colors focus-within:border-teal-500/50 focus-within:ring-2 focus-within:ring-teal-500/20">
            <Search className="size-3.5 shrink-0 text-zinc-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a member…"
              className="h-10 w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            />
          </div>
        ) : null}
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-zinc-500">No members yet.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-zinc-500">No members match “{filter}”.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-white/8 rounded-lg border border-white/8">
          {shown.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <MemberAvatar name={m.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-100">{m.name}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {m.username ? `@${m.username} · ` : ""}
                    {m.email}
                  </p>
                </div>
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
                    fullWidth={false}
                    className="px-2 py-1 text-xs"
                    options={TEAM_ROLES}
                  />
                ) : (
                  <span className="text-xs text-zinc-400 capitalize">{m.role}</span>
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
