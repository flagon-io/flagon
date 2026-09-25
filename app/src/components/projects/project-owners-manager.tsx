"use client";

import { useMemo, useState } from "react";
import { Crown, Trash2, UserPlus } from "lucide-react";
import {
  Badge,
  Combobox,
  DropdownMenuItem,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@flagon-io/ui";
import type { OwnerType, ProjectOwner } from "@/lib/api/types";
import {
  AccessAddDialog,
  AccessListLayout,
  CreateTeamHint,
  PrincipalCell,
  RowActions,
} from "./access/access-list-layout";
import { sendMutation, useAccessList, useTeamOptions } from "./access/use-access-list";

export function ProjectOwnersManager({
  slug,
  project,
  canManage,
}: {
  slug: string;
  project: string;
  /** Whether the caller may manage owners (the owner tier, from the API). */
  canManage: boolean;
}) {
  const base = `/api/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/owners`;
  const list = useAccessList<ProjectOwner>(base, "Couldn't load owners.");
  const owners = list.items;
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState<OwnerType>("user");
  const [login, setLogin] = useState("");
  const [teamSlug, setTeamSlug] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // The team picker excludes teams that already own the project.
  const ownedTeamSlugs = useMemo(
    () => owners.filter((o) => o.owner_type === "team").map((o) => o.team_slug),
    [owners],
  );
  const loadTeams = useTeamOptions(slug, ownedTeamSlugs);

  function openAdd() {
    setTab("user");
    setLogin("");
    setTeamSlug("");
    setAddError(null);
    setAddOpen(true);
  }

  async function submitAdd() {
    const value = tab === "user" ? login.trim() : teamSlug;
    if (!value) return;
    setAdding(true);
    setAddError(null);
    const err = await sendMutation(
      base,
      { method: "POST", body: { type: tab, login: value } },
      "Couldn't add that owner.",
    );
    setAdding(false);
    if (err) {
      setAddError(err);
      return;
    }
    setAddOpen(false);
    await list.reload();
  }

  async function remove(owner: ProjectOwner) {
    setError(null);
    setError(
      await sendMutation(
        `${base}/${encodeURIComponent(owner.owner_type)}/${encodeURIComponent(owner.principal_id)}`,
        { method: "DELETE" },
        "Couldn't remove that owner.",
      ),
    );
    await list.reload();
  }

  const canSubmit = tab === "user" ? !!login.trim() : !!teamSlug;

  return (
    <AccessListLayout
      title="Owners"
      description={
        <>
          Owners are the top tier of access: they can delete or transfer the project and manage its
          owners. An owner can be a person or a whole team.
        </>
      }
      notice={
        <>
          Organization <strong className="font-medium text-foreground">owners and admins</strong>{" "}
          can always manage this project, so they don&rsquo;t need to be listed here. Add an owner to
          give someone outside that group full control.
        </>
      }
      error={error}
      list={list}
      summary={{
        loading: "Loading owners...",
        count: (n) => `${n} explicit ${n === 1 ? "owner" : "owners"}`,
      }}
      canManage={canManage}
      addLabel="Add owner"
      addIcon={UserPlus}
      onAdd={openAdd}
      skeleton={{ avatar: "circle", trailing: "badge" }}
      errorTitle="Couldn't load owners"
      empty={{
        icon: Crown,
        title: "No explicit owners",
        body: (
          <>
            Organization owners and admins already have full control. Add an owner to grant that
            same control to another person or a team.
          </>
        ),
      }}
      dialog={
        <AccessAddDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          title="Add owner"
          description={
            <>
              Give a person or a team full control of this project. They must already belong to the
              organization.
            </>
          }
          onSubmit={() => void submitAdd()}
          error={addError}
          submitting={adding}
          canSubmit={canSubmit}
          submitLabel="Add owner"
        >
          <Tabs value={tab} onValueChange={(v) => setTab(v as OwnerType)}>
            <TabsList className="w-full">
              <TabsTrigger value="user" className="flex-1">
                Person
              </TabsTrigger>
              <TabsTrigger value="team" className="flex-1">
                Team
              </TabsTrigger>
            </TabsList>

            <TabsContent value="user" className="mt-4 space-y-2">
              <Label htmlFor="po-login">Email or username</Label>
              <Input
                id="po-login"
                autoFocus
                placeholder="person@example.com"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">An existing organization member.</p>
            </TabsContent>

            <TabsContent value="team" className="mt-4 space-y-2">
              <Label htmlFor="po-team">Team</Label>
              <Combobox
                id="po-team"
                value={teamSlug}
                onValueChange={setTeamSlug}
                loadOptions={loadTeams}
                placeholder="Select a team"
                searchPlaceholder="Search teams…"
                emptyText="No matching teams."
              />
              <CreateTeamHint slug={slug} />
            </TabsContent>
          </Tabs>
        </AccessAddDialog>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Owner</TableHead>
            <TableHead className="w-20">Type</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {owners.map((o) => {
            const isTeam = o.owner_type === "team";
            const display = isTeam
              ? o.name || o.team_slug || "Team"
              : o.name || o.username || o.email || "User";
            return (
              <TableRow key={`${o.owner_type}:${o.principal_id}`}>
                <TableCell>
                  <PrincipalCell
                    kind={o.owner_type}
                    name={display}
                    sub={isTeam ? `@${o.team_slug}` : o.email}
                    avatarUrl={o.avatar_url}
                    href={
                      isTeam && o.team_slug
                        ? `/${slug}/teams/${encodeURIComponent(o.team_slug)}`
                        : undefined
                    }
                  />
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{isTeam ? "Team" : "User"}</Badge>
                </TableCell>
                <TableCell>
                  {canManage && (
                    <RowActions label={display}>
                      <DropdownMenuItem
                        onClick={() => void remove(o)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Remove owner
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
