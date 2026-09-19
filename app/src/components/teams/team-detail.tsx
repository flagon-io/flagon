"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, Trash2, UserPlus, FolderGit2 } from "lucide-react";
import {
  Alert,
  Combobox,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
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
import { PageBreadcrumb } from "@/components/shell/page-breadcrumb";

type Team = {
  id: string;
  name: string;
  slug: string;
  description: string;
  member_count: number;
  created_at: string;
};

type TeamMember = {
  user_id: string;
  name: string | null;
  email: string;
  username: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
};

type TeamProject = {
  project_id: string;
  name: string;
  slug: string;
  role: string;
  created_at: string;
};

// A team's own membership roles, highest privilege first.
const TEAM_ROLES: { value: string; label: string; hint: string }[] = [
  { value: "maintainer", label: "Maintainer", hint: "Manage the team's members and edit the team." },
  { value: "member", label: "Member", hint: "Belong to the team and its project grants." },
];

// Repository-style roles a team can hold on a project, highest privilege first.
const PROJECT_ROLES: { value: string; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full control, including managing access." },
  { value: "maintain", label: "Maintain", hint: "Write, plus manage project settings." },
  { value: "write", label: "Write", hint: "Edit the project's metadata and README." },
  { value: "triage", label: "Triage", hint: "Read, plus manage the project's work items." },
  { value: "read", label: "Read", hint: "View the project." },
];
const PROJECT_ROLE_RANK: Record<string, number> = { read: 1, triage: 2, write: 3, maintain: 4, admin: 5 };

export function TeamDetail({
  slug,
  teamSlug,
  initialTeam,
  orgRole,
  currentUserId,
}: {
  slug: string;
  teamSlug: string;
  initialTeam: Team;
  orgRole: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const orgAdmin = orgRole === "owner" || orgRole === "admin";

  const [team, setTeam] = useState<Team>(initialTeam);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersNext, setMembersNext] = useState<string | null>(null);
  const [projects, setProjects] = useState<TeamProject[]>([]);
  const [projectsNext, setProjectsNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const base = `/api/orgs/${encodeURIComponent(slug)}/teams/${encodeURIComponent(teamSlug)}`;

  const loadMembers = useCallback(async () => {
    const res = await fetch(`${base}/members`);
    if (res.ok) {
      const data = (await res.json()) as { items: TeamMember[]; next: string | null };
      setMembers(data.items ?? []);
      setMembersNext(data.next ?? null);
    }
  }, [base]);

  const loadMoreMembers = useCallback(async () => {
    if (!membersNext) return;
    const res = await fetch(`${base}/members?cursor=${encodeURIComponent(membersNext)}`);
    if (res.ok) {
      const data = (await res.json()) as { items: TeamMember[]; next: string | null };
      setMembers((prev) => [...prev, ...(data.items ?? [])]);
      setMembersNext(data.next ?? null);
    }
  }, [base, membersNext]);

  const loadProjects = useCallback(async () => {
    const res = await fetch(`${base}/projects`);
    if (res.ok) {
      const data = (await res.json()) as { items: TeamProject[]; next: string | null };
      setProjects(data.items ?? []);
      setProjectsNext(data.next ?? null);
    }
  }, [base]);

  const loadMoreProjects = useCallback(async () => {
    if (!projectsNext) return;
    const res = await fetch(`${base}/projects?cursor=${encodeURIComponent(projectsNext)}`);
    if (res.ok) {
      const data = (await res.json()) as { items: TeamProject[]; next: string | null };
      setProjects((prev) => [...prev, ...(data.items ?? [])]);
      setProjectsNext(data.next ?? null);
    }
  }, [base, projectsNext]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await Promise.all([loadMembers(), loadProjects()]);
      setLoading(false);
    })();
  }, [loadMembers, loadProjects]);

  // You can manage the team if you're an org owner/admin or a maintainer of it -
  // the API enforces the same rule. Disbanding is reserved for org owners/admins.
  const myRole = members.find((m) => m.user_id === currentUserId)?.role;
  const canManage = orgAdmin || myRole === "maintainer";
  const canDelete = orgAdmin;

  return (
    <div className="space-y-6">
      <PageBreadcrumb label={team.name} />
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{team.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {team.description || <span className="font-mono text-xs">@{team.slug}</span>}
        </p>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members" className="gap-1.5">
            Members
            {!loading && <Badge variant="secondary">{members.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-1.5">
            Projects
            {!loading && <Badge variant="secondary">{projects.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-6">
          <MembersTab
            base={base}
            members={members}
            loading={loading}
            next={membersNext}
            onLoadMore={loadMoreMembers}
            canManage={canManage}
            currentUserId={currentUserId}
            reload={loadMembers}
          />
        </TabsContent>

        <TabsContent value="projects" className="mt-6">
          <ProjectsTab
            slug={slug}
            teamSlug={teamSlug}
            projects={projects}
            loading={loading}
            next={projectsNext}
            onLoadMore={loadMoreProjects}
            canManage={canManage}
            reload={loadProjects}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <SettingsTab
            base={base}
            team={team}
            canManage={canManage}
            canDelete={canDelete}
            onRenamed={(next) => {
              if (next.slug !== teamSlug) router.push(`/${slug}/teams/${next.slug}`);
              else setTeam(next);
            }}
            onDeleted={() => router.push(`/${slug}/teams`)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Members tab -----------------------------------------------------------------

function MembersTab({
  base,
  members,
  loading,
  next,
  onLoadMore,
  canManage,
  currentUserId,
  reload,
}: {
  base: string;
  members: TeamMember[];
  loading: boolean;
  next: string | null;
  onLoadMore: () => Promise<void>;
  canManage: boolean;
  currentUserId: string;
  reload: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadMore() {
    setLoadingMore(true);
    try {
      await onLoadMore();
    } finally {
      setLoadingMore(false);
    }
  }

  const rows = useMemo(
    () =>
      [...members].sort((a, b) => {
        if (a.role !== b.role) return a.role === "maintainer" ? -1 : 1;
        return (a.name || a.email).localeCompare(b.name || b.email);
      }),
    [members],
  );

  async function changeRole(userId: string, role: string) {
    setError(null);
    const res = await fetch(`${base}/members/${encodeURIComponent(userId)}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't change that role.");
    await reload();
  }

  async function remove(userId: string) {
    setError(null);
    const res = await fetch(`${base}/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't remove that member.");
    await reload();
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading..." : `${members.length} ${members.length === 1 ? "member" : "members"}`}
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Add member
          </Button>
        )}
      </div>

      {loading ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="size-5" />}
          title="No members yet"
          body="Add organization members to this team, then grant the team a role on a project."
          action={canManage ? <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="size-4" />Add member</Button> : null}
        />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead className="w-44">Role</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => {
                const isSelf = m.user_id === currentUserId;
                const display = m.name || m.username || m.email;
                return (
                  <TableRow key={m.user_id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9 ring-1 ring-hairline">
                          {m.avatar_url && <AvatarImage src={m.avatar_url} alt="" />}
                          <AvatarFallback className="text-xs font-medium">{initials(m)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {display}
                            {isSelf && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <RoleSelect
                          roles={TEAM_ROLES}
                          value={m.role}
                          onChange={(r) => changeRole(m.user_id, r)}
                        />
                      ) : (
                        <Badge variant={m.role === "maintainer" ? "brand" : "outline"} className="capitalize">
                          {m.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <RowMenu label={`Actions for ${display}`}>
                          <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(m.email)}>
                            Copy email address
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => remove(m.user_id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-4" />
                            Remove from team
                          </DropdownMenuItem>
                        </RowMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableShell>
      )}

      {next && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        base={base}
        onAdded={reload}
      />
    </div>
  );
}

// Projects tab ----------------------------------------------------------------

function ProjectsTab({
  slug,
  teamSlug,
  projects,
  loading,
  next,
  onLoadMore,
  canManage,
  reload,
}: {
  slug: string;
  teamSlug: string;
  projects: TeamProject[];
  loading: boolean;
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
    } finally {
      setLoadingMore(false);
    }
  }

  const rows = useMemo(
    () =>
      [...projects].sort((a, b) => {
        const r = (PROJECT_ROLE_RANK[b.role] ?? 0) - (PROJECT_ROLE_RANK[a.role] ?? 0);
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
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't change the role.");
    await reload();
  }

  async function remove(projectSlug: string) {
    setError(null);
    const res = await fetch(`${grantBase(projectSlug)}/${encodeURIComponent(teamSlug)}`, {
      method: "DELETE",
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't remove the project.");
    await reload();
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading..."
            : `Access to ${projects.length} ${projects.length === 1 ? "project" : "projects"}`}
        </p>
        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="size-4" />
            Add project
          </Button>
        )}
      </div>

      {loading ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 className="size-5" />}
          title="No project access"
          body="Grant this team a role on a project. Every member of the team inherits that access."
          action={canManage ? <Button size="sm" onClick={openAdd}><Plus className="size-4" />Add project</Button> : null}
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
                        roles={PROJECT_ROLES}
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

      {next && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}

      <AddProjectDialog
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

// Settings tab ----------------------------------------------------------------

function SettingsTab({
  base,
  team,
  canManage,
  canDelete,
  onRenamed,
  onDeleted,
}: {
  base: string;
  team: Team;
  canManage: boolean;
  canDelete: boolean;
  onRenamed: (team: Team) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [slug, setSlug] = useState(team.slug);
  const [description, setDescription] = useState(team.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const dirty = name.trim() !== team.name || slug.trim() !== team.slug || description.trim() !== team.description;

  if (!canManage) {
    return (
      <Alert>You need to be a maintainer of this team or an organization admin to change its settings.</Alert>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), slug: slug.trim(), description: description.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save the team.");
      return;
    }
    onRenamed(await res.json());
  }

  return (
    <div className="max-w-2xl space-y-8">
      <form onSubmit={save} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ts-name">Team name</Label>
          <Input id="ts-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ts-slug">Slug</Label>
          <Input id="ts-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <p className="text-xs text-muted-foreground">Changing the slug changes the team&rsquo;s URL.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ts-desc">Description</Label>
          <Input
            id="ts-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One line about what this team does"
          />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <div>
          <Button type="submit" disabled={saving || !dirty || !name.trim() || !slug.trim()}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>

      {canDelete && (
        <Card className="border-destructive/30 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Delete this team</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Removes the team and its project access. Members keep their own access.
              </p>
            </div>
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete team
            </Button>
          </div>
        </Card>
      )}

      <DeleteTeamDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        base={base}
        team={team}
        onDeleted={onDeleted}
      />
    </div>
  );
}

// Dialogs ---------------------------------------------------------------------

function AddMemberDialog({
  open,
  onOpenChange,
  base,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  base: string;
  onAdded: () => Promise<void>;
}) {
  const [login, setLogin] = useState("");
  const [role, setRole] = useState("member");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = login.trim();
    if (!value) return;
    setAdding(true);
    setError(null);
    const res = await fetch(`${base}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: value, role }),
    });
    setAdding(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't add that member.");
      return;
    }
    setLogin("");
    setRole("member");
    onOpenChange(false);
    await onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription className="mt-1.5">
              Add an existing organization member to this team.
            </DialogDescription>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tm-login">Email or username</Label>
            <Input
              id="tm-login"
              autoFocus
              placeholder="person@example.com"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tm-role">Role</Label>
            <RoleSelect id="tm-role" roles={TEAM_ROLES} value={role} onChange={setRole} />
            <p className="text-xs text-muted-foreground">{TEAM_ROLES.find((r) => r.value === role)?.hint}</p>
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={adding || !login.trim()}>
              {adding ? "Adding..." : "Add member"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type OrgProject = { id: string; name: string; slug: string };

function AddProjectDialog({
  open,
  onOpenChange,
  slug,
  teamSlug,
  granted,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  teamSlug: string;
  granted: string[];
  onAdded: () => Promise<void>;
}) {
  const [project, setProject] = useState("");
  const [role, setRole] = useState("write");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server-side search over the org's projects, excluding ones the team already
  // has, so the picker works no matter how many projects the org has.
  const grantedSet = useMemo(() => new Set(granted), [granted]);
  const loadProjects = useCallback(
    async (query: string) => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/projects?${params.toString()}`);
      const data = res.ok ? await res.json() : { items: [] };
      return (data.items as OrgProject[])
        .filter((p) => !grantedSet.has(p.slug))
        .map((p) => ({ value: p.slug, label: p.name }));
    },
    [slug, grantedSet],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setAdding(true);
    setError(null);
    const res = await fetch(
      `/api/orgs/${encodeURIComponent(slug)}/projects/${encodeURIComponent(project)}/teams`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team: teamSlug, role }),
      },
    );
    setAdding(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't grant access to that project.");
      return;
    }
    onOpenChange(false);
    await onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <DialogTitle>Add project</DialogTitle>
            <DialogDescription className="mt-1.5">
              Grant this team a role on a project. You need admin access on the project you pick.
            </DialogDescription>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tp-project">Project</Label>
            <Combobox
              id="tp-project"
              value={project}
              onValueChange={setProject}
              loadOptions={loadProjects}
              placeholder="Select a project"
              searchPlaceholder="Search projects…"
              emptyText="No matching projects."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tp-role">Role</Label>
            <RoleSelect id="tp-role" roles={PROJECT_ROLES} value={role} onChange={setRole} />
            <p className="text-xs text-muted-foreground">{PROJECT_ROLES.find((r) => r.value === role)?.hint}</p>
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={adding || !project}>
              {adding ? "Adding..." : "Add project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTeamDialog({
  open,
  onOpenChange,
  base,
  team,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  base: string;
  team: Team;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setDeleting(true);
    setError(null);
    const res = await fetch(base, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't delete the team.");
      return;
    }
    onDeleted();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-6">
        <DialogTitle>Delete {team.name}?</DialogTitle>
        <DialogDescription className="mt-1.5">
          This removes the team and its project access. Members keep their own org and project
          access. This can&rsquo;t be undone.
        </DialogDescription>
        {error && (
          <Alert variant="destructive" className="mt-4">
            {error}
          </Alert>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete team"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Shared bits -----------------------------------------------------------------

function RoleSelect({
  id,
  roles,
  value,
  onChange,
}: {
  id?: string;
  roles: { value: string; label: string }[];
  value: string;
  onChange: (role: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} size={id ? "md" : "sm"} className="w-full capitalize">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-panel hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-panel"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-hairline">{children}</div>;
}

function ListSkeleton() {
  return (
    <TableShell>
      <div className="divide-y divide-hairline">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        ))}
      </div>
    </TableShell>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-1">{action}</div>}
    </Card>
  );
}

function initials(m: TeamMember): string {
  const base = (m.name || m.username || m.email || "").trim();
  const parts = base.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase() || "?";
}
