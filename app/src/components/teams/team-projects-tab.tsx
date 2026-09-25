"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderGit2, Plus, Trash2 } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  DropdownMenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flagon-io/ui";
import type { TeamProject } from "@/lib/api/types";
import { errorMessage, messageOf } from "@/lib/client-fetch";
import { ListError, ListSkeleton, TableShell } from "@/components/shared/list-states";
import { AddTeamProjectDialog } from "./add-team-project-dialog";
import {
  EmptyState,
  LoadMoreButton,
  PROJECT_ROLE_OPTIONS,
  RoleSelect,
  RowMenu,
  projectRoleRank,
} from "./team-shared";

export function TeamProjectsTab({
  slug,
  teamSlug,
  projects,
  loading,
  loadError,
  onRetry,
  next,
  onLoadMore,
  canManage,
  reload,
}: {
  slug: string;
  teamSlug: string;
  projects: TeamProject[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  next: string | null;
  onLoadMore: () => Promise<void>;
  canManage: boolean;
  reload: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped when the dialog opens so it remounts with fresh state (rather than
  // syncing props into state inside an effect).
  const [addNonce, setAddNonce] = useState(0);

  async function loadMore() {
    setLoadingMore(true);
    try {
      await onLoadMore();
    } catch (e) {
      setError(messageOf(e, "Couldn't load more projects."));
    } finally {
      setLoadingMore(false);
    }
  }

  const rows = useMemo(
    () =>
      [...projects].sort((a, b) => {
        const r = projectRoleRank(b.role) - projectRoleRank(a.role);
        return r !== 0 ? r : a.name.localeCompare(b.name);
      }),
    [projects],
  );

  function openAdd() {
    setAddNonce((n) => n + 1);
    setAddOpen(true);
  }

  // Grants live on the project side, so we drive them through the project's
  // team-grant routes (the API authorizes them as project admin).
  const grantBase = (projectSlug: string) =>
    `/api/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectSlug)}/teams`;

  async function changeRole(projectSlug: string, role: string) {
    setError(null);
    const res = await fetch(`${grantBase(projectSlug)}/${encodeURIComponent(teamSlug)}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) setError(await errorMessage(res, "Couldn't change the role."));
    await reload();
  }

  async function remove(projectSlug: string) {
    setError(null);
    const res = await fetch(`${grantBase(projectSlug)}/${encodeURIComponent(teamSlug)}`, {
      method: "DELETE",
    });
    if (!res.ok) setError(await errorMessage(res, "Couldn't remove the project."));
    await reload();
  }

  const addButton = (
    <Button size="sm" onClick={openAdd}>
      <Plus className="size-4" />
      Add project
    </Button>
  );

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading..."
            : loadError
              ? ""
              : `Access to ${projects.length} ${projects.length === 1 ? "project" : "projects"}`}
        </p>
        {canManage && addButton}
      </div>

      {loading ? (
        <ListSkeleton />
      ) : loadError ? (
        <ListError title="Couldn't load projects" message={loadError} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 className="size-5" />}
          title="No project access"
          body="Grant this team a role on a project. Every member of the team inherits that access."
          action={canManage ? addButton : null}
        />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="w-44">Role</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.project_id}>
                  <TableCell>
                    <Link
                      href={`/${slug}/projects/${encodeURIComponent(p.slug)}`}
                      className="text-sm font-medium text-foreground hover:underline"
                    >
                      {p.name}
                    </Link>
                    <p className="truncate font-mono text-xs text-muted-foreground">{p.slug}</p>
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      <RoleSelect
                        roles={PROJECT_ROLE_OPTIONS}
                        value={p.role}
                        onChange={(r) => changeRole(p.slug, r)}
                      />
                    ) : (
                      <Badge variant="outline" className="capitalize">
                        {p.role}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {canManage && (
                      <RowMenu label={`Actions for ${p.name}`}>
                        <DropdownMenuItem
                          onClick={() => remove(p.slug)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4" />
                          Remove access
                        </DropdownMenuItem>
                      </RowMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      )}

      {next && !loadError && <LoadMoreButton onClick={loadMore} loading={loadingMore} />}

      <AddTeamProjectDialog
        key={`add-project-${addNonce}`}
        open={addOpen}
        onOpenChange={setAddOpen}
        slug={slug}
        teamSlug={teamSlug}
        granted={projects.map((p) => p.slug)}
        onAdded={reload}
      />
    </div>
  );
}
