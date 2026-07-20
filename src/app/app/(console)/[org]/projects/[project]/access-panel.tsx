"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserRound, Users, X } from "lucide-react";
import {
  PROJECT_ROLES,
  PROJECT_ROLE_DESCRIPTIONS,
  type ProjectRole,
} from "@/lib/project-access";
import { Notice, buttonClass, hintClass } from "@/components/form-ui";
import { Label, Select } from "@/ui";
import { addGrantAction, removeGrantAction } from "./actions";

export type PanelGrant = {
  id: string;
  role: ProjectRole;
  subject:
    | { type: "user"; id: string; username: string | null; name: string }
    | { type: "team"; id: string; name: string };
};

export type SubjectOption = { id: string; label: string };

/**
 * Access management for a project: grants to members and teams with a role
 * each. Admin-only mutations (enforced server-side too); non-admins see the
 * read-only list.
 */
export function AccessPanel({
  orgSlug,
  projectSlug,
  grants,
  memberOptions,
  teamOptions,
  canManage,
}: {
  orgSlug: string;
  projectSlug: string;
  grants: PanelGrant[];
  memberOptions: SubjectOption[];
  teamOptions: SubjectOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [subjectType, setSubjectType] = useState<"user" | "team">("user");
  const [subjectId, setSubjectId] = useState("");
  const [role, setRole] = useState<ProjectRole>("write");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const options = subjectType === "user" ? memberOptions : teamOptions;

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!subjectId) {
      setError(subjectType === "user" ? "Choose a member." : "Choose a team.");
      return;
    }
    setPending(true);
    const result = await addGrantAction(orgSlug, projectSlug, {
      subjectType,
      subjectId,
      role,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSubjectId("");
    router.refresh();
  }

  async function changeRole(subject: PanelGrant["subject"], nextRole: string) {
    setError(null);
    const result = await addGrantAction(orgSlug, projectSlug, {
      subjectType: subject.type,
      subjectId: subject.id,
      role: nextRole,
    });
    if (!result.ok) setError(result.message);
    router.refresh();
  }

  async function remove(grantId: string) {
    setError(null);
    const result = await removeGrantAction(orgSlug, projectSlug, grantId);
    if (!result.ok) setError(result.message);
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
          <div className="w-36">
            <Label htmlFor="grant-subject-type">Grant to</Label>
            <div className="mt-1">
              <Select
                id="grant-subject-type"
                value={subjectType}
                onValueChange={(value) => {
                  setSubjectType(value as "user" | "team");
                  setSubjectId("");
                }}
                options={[
                  { value: "user", label: "Member" },
                  { value: "team", label: "Team" },
                ]}
              />
            </div>
          </div>
          <div className="min-w-44 flex-1">
            <Label htmlFor="grant-subject">
              {subjectType === "user" ? "Member" : "Team"}
            </Label>
            <div className="mt-1">
              <Select
                id="grant-subject"
                value={subjectId}
                onValueChange={setSubjectId}
                placeholder={
                  subjectType === "user" ? "Choose a member" : "Choose a team"
                }
                options={options.map((option) => ({
                  value: option.id,
                  label: option.label,
                }))}
              />
            </div>
          </div>
          <div className="w-32">
            <Label htmlFor="grant-role">Role</Label>
            <div className="mt-1">
              <Select
                id="grant-role"
                value={role}
                onValueChange={(value) => setRole(value as ProjectRole)}
                options={PROJECT_ROLES.map((r) => ({ value: r, label: r }))}
              />
            </div>
          </div>
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending ? "Granting..." : "Grant access"}
          </button>
        </form>
      ) : null}

      {grants.length ? (
        <ul className="mt-4 divide-y divide-white/5 border border-white/10">
          {grants.map((grant) => (
            <li key={grant.id} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 bg-white/3 text-zinc-500"
              >
                {grant.subject.type === "user" ? (
                  <UserRound className="h-4 w-4" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-100">
                  {grant.subject.name}
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {grant.subject.type === "user"
                    ? (grant.subject.username ?? "member")
                    : "team"}
                </div>
              </div>
              {canManage ? (
                <>
                  <div className="w-28">
                    <Select
                      value={grant.role}
                      onValueChange={(value) =>
                        changeRole(grant.subject, value)
                      }
                      options={PROJECT_ROLES.map((r) => ({
                        value: r,
                        label: r,
                      }))}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(grant.id)}
                    aria-label={`Remove access for ${grant.subject.name}`}
                    className="rounded-md p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-red-400"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </>
              ) : (
                <span className="text-xs uppercase tracking-wider text-zinc-500">
                  {grant.role}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={`${hintClass} mt-4`}>
          No explicit grants yet. Every organization member can see this
          project; owners and admins have full control.
        </p>
      )}

      <div className="mt-4 space-y-1 text-xs leading-5 text-zinc-600">
        {PROJECT_ROLES.map((r) => (
          <p key={r}>
            <span className="font-medium uppercase tracking-wider text-zinc-500">
              {r}
            </span>{" "}
            {PROJECT_ROLE_DESCRIPTIONS[r]}
          </p>
        ))}
      </div>
    </div>
  );
}
