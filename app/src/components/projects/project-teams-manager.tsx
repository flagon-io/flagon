"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, UsersRound } from "lucide-react";
import {
  Combobox,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flagon-io/ui";
import type { ProjectTeam } from "@/lib/api/types";
import {
  AccessAddDialog,
  AccessListLayout,
  CreateTeamHint,
  PrincipalCell,
  RowActions,
} from "./access/access-list-layout";
import { DEFAULT_ROLE, RoleCell, RoleSelect, roleHint, sortByRole } from "./access/roles";
import { sendMutation, useAccessList, useTeamOptions } from "./access/use-access-list";

export function ProjectTeamsManager({
  slug,
  project,
  canManage,
}: {
  slug: string;
  project: string;
  /** Whether the caller may manage team grants (project admin, from the API). */
  canManage: boolean;
}) {
  const base = `/api/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/teams`;
  const list = useAccessList<ProjectTeam>(base, "Couldn't load teams.");
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [teamSlug, setTeamSlug] = useState("");
  const [newRole, setNewRole] = useState<string>(DEFAULT_ROLE);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const rows = useMemo(() => sortByRole(list.items), [list.items]);

  // The picker excludes teams that already hold a role here.
  const grantedSlugs = useMemo(() => list.items.map((t) => t.slug), [list.items]);
  const loadTeams = useTeamOptions(slug, grantedSlugs);

  function openAdd() {
    setTeamSlug("");
    setNewRole(DEFAULT_ROLE);
    setAddError(null);
    setAddOpen(true);
  }

  async function submitAdd() {
    if (!teamSlug) return;
    setAdding(true);
    setAddError(null);
    const err = await sendMutation(
      base,
      { method: "POST", body: { team: teamSlug, role: newRole } },
      "Couldn't grant that team access.",
    );
    setAdding(false);
    if (err) {
      setAddError(err);
      return;
    }
    setAddOpen(false);
    await list.reload();
  }

  async function changeRole(team: string, role: string) {
    setError(null);
    setError(
      await sendMutation(
        `${base}/${encodeURIComponent(team)}/role`,
        { method: "PUT", body: { role } },
        "Couldn't change that role.",
      ),
    );
    await list.reload();
  }

  async function remove(team: string) {
    setError(null);
    setError(
      await sendMutation(
        `${base}/${encodeURIComponent(team)}`,
        { method: "DELETE" },
        "Couldn't revoke that team's access.",
      ),
    );
    await list.reload();
  }

  return (
    <AccessListLayout
      title="Teams"
      description={
        <>
          Grant a whole team a role on this project. Every member of the team gets at least that
          access here.
        </>
      }
      error={error}
      list={list}
      summary={{
        loading: "Loading teams...",
        count: (n) => `${n} ${n === 1 ? "team has" : "teams have"} access`,
      }}
      canManage={canManage}
      addLabel="Add team"
      addIcon={Plus}
      onAdd={openAdd}
      skeleton={{ avatar: "square", trailing: "select" }}
      errorTitle="Couldn't load teams"
      empty={{
        icon: UsersRound,
        title: "No teams have access",
        body: "Grant a team a role to give all of its members access to this project at once.",
      }}
      dialog={
        <AccessAddDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          title="Add team"
          description={<>Give one of the organization&rsquo;s teams a role on this project.</>}
          onSubmit={() => void submitAdd()}
          error={addError}
          submitting={adding}
          canSubmit={!!teamSlug}
          submitLabel="Add team"
        >
          <div className="space-y-2">
            <Label htmlFor="pt-team">Team</Label>
            <Combobox
              id="pt-team"
              value={teamSlug}
              onValueChange={setTeamSlug}
              loadOptions={loadTeams}
              placeholder="Select a team"
              searchPlaceholder="Search teams…"
              emptyText="No matching teams."
            />
            <CreateTeamHint slug={slug} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pt-role">Role</Label>
            <RoleSelect id="pt-role" value={newRole} onChange={setNewRole} />
            <p className="text-xs text-muted-foreground">{roleHint(newRole)}</p>
          </div>
        </AccessAddDialog>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team</TableHead>
            <TableHead className="w-40">Role</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => {
            const href = `/${slug}/teams/${encodeURIComponent(t.slug)}`;
            return (
              <TableRow key={t.team_id}>
                <TableCell>
                  <PrincipalCell kind="team" name={t.name} sub={`@${t.slug}`} href={href} />
                </TableCell>
                <TableCell>
                  <RoleCell
                    role={t.role}
                    editable={canManage}
                    onChange={(r) => void changeRole(t.slug, r)}
                  />
                </TableCell>
                <TableCell>
                  {canManage && (
                    <RowActions label={t.name}>
                      <DropdownMenuItem asChild>
                        <Link href={href}>Manage team</Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => void remove(t.slug)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Revoke access
                      </DropdownMenuItem>
                    </RowActions>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </AccessListLayout>
  );
}
