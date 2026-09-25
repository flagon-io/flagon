"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flagon-io/ui";
import type { ProjectMember } from "@/lib/api/types";
import {
  AccessAddDialog,
  AccessListLayout,
  PrincipalCell,
  RowActions,
} from "./access/access-list-layout";
import { DEFAULT_ROLE, RoleCell, RoleSelect, roleHint, sortByRole } from "./access/roles";
import { sendMutation, useAccessList } from "./access/use-access-list";

export function ProjectAccessManager({
  slug,
  project,
  currentUserId,
  canManage,
}: {
  slug: string;
  project: string;
  currentUserId: string;
  /** Whether the caller may manage collaborators (project admin, from the API). */
  canManage: boolean;
}) {
  const base = `/api/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/members`;
  const list = useAccessList<ProjectMember>(base, "Couldn't load collaborators.");
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [login, setLogin] = useState("");
  const [newRole, setNewRole] = useState<string>(DEFAULT_ROLE);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const rows = useMemo(() => sortByRole(list.items), [list.items]);

  function openAdd() {
    setLogin("");
    setNewRole(DEFAULT_ROLE);
    setAddError(null);
    setAddOpen(true);
  }

  async function submitAdd() {
    const value = login.trim();
    if (!value) return;
    setAdding(true);
    setAddError(null);
    const err = await sendMutation(
      base,
      { method: "POST", body: { login: value, role: newRole } },
      "Couldn't add that collaborator.",
    );
    setAdding(false);
    if (err) {
      setAddError(err);
      return;
    }
    setAddOpen(false);
    await list.reload();
  }

  async function changeRole(userId: string, role: string) {
    setError(null);
    setError(
      await sendMutation(
        `${base}/${encodeURIComponent(userId)}/role`,
        { method: "PUT", body: { role } },
        "Couldn't change that role.",
      ),
    );
    await list.reload();
  }

  async function remove(userId: string) {
    setError(null);
    setError(
      await sendMutation(
        `${base}/${encodeURIComponent(userId)}`,
        { method: "DELETE" },
        "Couldn't remove that collaborator.",
      ),
    );
    await list.reload();
  }

  return (
    <AccessListLayout
      title="Access"
      description={
        <>
          Give an organization member more (or less) reach on this project than their org role
          grants. A collaborator&rsquo;s effective role is the higher of their org role and their grant
          here, so a grant only ever raises access.
        </>
      }
      notice={
        <>
          Organization <strong className="font-medium text-foreground">owners and admins</strong>{" "}
          are admins on every project, and{" "}
          <strong className="font-medium text-foreground">members</strong> have write access by
          default. Those people won&rsquo;t appear below unless you grant them a different role here.
        </>
      }
      spacing="space-y-5"
      error={error}
      list={list}
      summary={{
        loading: "Loading collaborators...",
        count: (n) => `${n} explicit ${n === 1 ? "collaborator" : "collaborators"}`,
      }}
      canManage={canManage}
      addLabel="Add collaborator"
      addIcon={Plus}
      onAdd={openAdd}
      skeleton={{ avatar: "circle", trailing: "select" }}
      errorTitle="Couldn't load collaborators"
      empty={{
        icon: UserPlus,
        title: "No extra collaborators",
        body: (
          <>
            Everyone gets their organization-level access to this project. Add a collaborator to
            raise a specific member&rsquo;s role here.
          </>
        ),
      }}
      dialog={
        <AccessAddDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          title="Add collaborator"
          description={
            <>
              Grant an existing organization member a role on this project. The person must
              already belong to the organization.
            </>
          }
          onSubmit={() => void submitAdd()}
          error={addError}
          submitting={adding}
          canSubmit={!!login.trim()}
          submitLabel="Add collaborator"
        >
          <div className="space-y-2">
            <Label htmlFor="collab-login">Email or username</Label>
            <Input
              id="collab-login"
              autoFocus
              placeholder="person@example.com"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="collab-role">Role</Label>
            <RoleSelect id="collab-role" value={newRole} onChange={setNewRole} />
            <p className="text-xs text-muted-foreground">{roleHint(newRole)}</p>
          </div>
        </AccessAddDialog>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Collaborator</TableHead>
            <TableHead className="w-40">Role</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => {
            const isSelf = m.user_id === currentUserId;
            const display = m.name || m.username || m.email;
            const editable = canManage && !isSelf;
            return (
              <TableRow key={m.user_id}>
                <TableCell>
                  <PrincipalCell
                    kind="user"
                    name={display}
                    sub={m.email}
                    avatarUrl={m.avatar_url}
                    suffix={
                      isSelf && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <RoleCell
                    role={m.role}
                    editable={editable}
                    onChange={(r) => void changeRole(m.user_id, r)}
                  />
                </TableCell>
                <TableCell>
                  {editable && (
                    <RowActions label={display}>
                      <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(m.email)}>
                        Copy email address
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => void remove(m.user_id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Remove collaborator
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
