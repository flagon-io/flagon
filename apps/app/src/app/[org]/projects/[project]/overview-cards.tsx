"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BellRing,
  BookText,
  CircleDot,
  ExternalLink,
  FileText,
  GitBranch,
  Globe,
  Link2,
  Lock,
  MessagesSquare,
  Network,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@flagon/design";
import {
  FRAMEWORKS,
  KINDS,
  LIFECYCLES,
  LINK_TYPES,
  REPO_PROVIDERS,
  REPO_VISIBILITY,
  TIERS,
  labelFor,
} from "@/lib/catalog";
import { FrameworkBadge } from "@/components/framework-badge";
import type { Project, ProjectLink, ProjectRepo } from "@/lib/projects-api";
import { updateProjectAction } from "../actions";
import { Card, CardHead } from "./cards";

const NONE = "__none__";
type TeamOption = { key: string; name: string };

function withNone(options: { value: string; label: string }[], noneLabel = "None") {
  return [{ value: NONE, label: `— ${noneLabel} —` }, ...options];
}
function parseCsv(v: string, lower = false): string[] {
  return Array.from(
    new Set(
      v
        .split(",")
        .map((t) => (lower ? t.trim().toLowerCase() : t.trim()))
        .filter(Boolean),
    ),
  );
}

/** The Edit / Save+Cancel control in a card header. Hidden for non-managers. */
function EditActions({
  editing,
  canManage,
  pending,
  onEdit,
  onSave,
  onCancel,
}: {
  editing: boolean;
  canManage: boolean;
  pending: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (!canManage) return null;
  if (!editing) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
      >
        <Pencil className="size-3.5" /> Edit
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <button type="button" onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-200">
        Cancel
      </button>
      <Button variant="secondary" size="sm" onClick={onSave} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </span>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 py-2.5 last:border-0 sm:nth-last-2:border-0">
      <dt className="shrink-0 pt-0.5 text-sm text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-zinc-200">{children}</dd>
    </div>
  );
}
function FactValue({ text }: { text: string | null }) {
  return text ? <span>{text}</span> : <span className="text-zinc-600">Not set</span>;
}

// --- Overview (identity + facts), inline-editable ---------------------------
export function EditableOverview({
  slug,
  project,
  teams,
  canManage,
}: {
  slug: string;
  project: Project;
  teams: TeamOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState(project.description ?? "");
  const [ownerTeam, setOwnerTeam] = useState(project.ownerTeam?.key ?? NONE);
  const [kind, setKind] = useState(project.kind ?? NONE);
  const [framework, setFramework] = useState(project.framework ?? NONE);
  const [lifecycle, setLifecycle] = useState(project.lifecycle ?? NONE);
  const [tier, setTier] = useState(project.tier ?? NONE);
  const [domains, setDomains] = useState(project.domains.join(", "));
  const [tags, setTags] = useState(project.tags.join(", "));

  function cancel() {
    setDescription(project.description ?? "");
    setOwnerTeam(project.ownerTeam?.key ?? NONE);
    setKind(project.kind ?? NONE);
    setFramework(project.framework ?? NONE);
    setLifecycle(project.lifecycle ?? NONE);
    setTier(project.tier ?? NONE);
    setDomains(project.domains.join(", "));
    setTags(project.tags.join(", "));
    setError(null);
    setEditing(false);
  }
  function save() {
    setError(null);
    start(async () => {
      const res = await updateProjectAction(slug, project.key, {
        description: description.trim() ? description.trim() : null,
        ownerTeamKey: ownerTeam === NONE ? null : ownerTeam,
        kind: kind === NONE ? null : kind,
        framework: framework === NONE ? null : framework,
        lifecycle: lifecycle === NONE ? null : lifecycle,
        tier: tier === NONE ? null : tier,
        domains: parseCsv(domains, true),
        tags: parseCsv(tags),
      });
      if (res.error) return setError(res.error);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHead
        title="Overview"
        action={
          <EditActions
            editing={editing}
            canManage={canManage}
            pending={pending}
            onEdit={() => setEditing(true)}
            onSave={save}
            onCancel={cancel}
          />
        }
      />
      {editing ? (
        <div className="flex flex-col gap-4 p-4">
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="A short summary of what this project does."
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Owning team">
              <Select ariaLabel="Owning team" value={ownerTeam} onValueChange={setOwnerTeam} className="w-full" options={withNone(teams.map((t) => ({ value: t.key, label: t.name })), "No owner")} />
            </Field>
            <Field label="Kind">
              <Select ariaLabel="Kind" value={kind} onValueChange={setKind} className="w-full" options={withNone(KINDS, "No kind")} />
            </Field>
            <Field label="Stack">
              <Select ariaLabel="Stack" value={framework} onValueChange={setFramework} className="w-full" options={withNone(FRAMEWORKS.map((f) => ({ value: f.value, label: f.label })), "No stack")} />
            </Field>
            <Field label="Lifecycle">
              <Select ariaLabel="Lifecycle" value={lifecycle} onValueChange={setLifecycle} className="w-full" options={withNone(LIFECYCLES)} />
            </Field>
            <Field label="Tier">
              <Select ariaLabel="Tier" value={tier} onValueChange={setTier} className="w-full" options={withNone(TIERS)} />
            </Field>
            <Field label="Domains" hint="Comma-separated.">
              <Input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="payments, growth" />
            </Field>
          </div>
          <Field label="Tags" hint="Comma-separated.">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="go, pci" />
          </Field>
        </div>
      ) : (
        <>
          {project.description ? (
            <p className="border-b border-white/8 px-4 py-3 text-sm text-zinc-400">{project.description}</p>
          ) : null}
          <dl className="grid gap-x-10 px-4 py-1 sm:grid-cols-2">
            <Fact label="Owner">
              {project.ownerTeam ? (
                <Link href={`/${slug}/teams/${project.ownerTeam.key}`} className="inline-flex items-center gap-1.5 text-zinc-200 hover:text-zinc-100">
                  <Users className="size-3.5 text-zinc-500" /> {project.ownerTeam.name}
                </Link>
              ) : (
                <span className="text-zinc-600">No owner</span>
              )}
            </Fact>
            <Fact label="Kind">
              <FactValue text={labelFor(KINDS, project.kind)} />
            </Fact>
            <Fact label="Stack">
              <FrameworkBadge framework={project.framework} />
            </Fact>
            <Fact label="Lifecycle">
              <FactValue text={labelFor(LIFECYCLES, project.lifecycle)} />
            </Fact>
            <Fact label="Tier">
              <FactValue text={labelFor(TIERS, project.tier)} />
            </Fact>
            <Fact label="Domains">
              {project.domains.length > 0 ? (
                <span className="flex flex-wrap justify-end gap-1">
                  {project.domains.map((d) => (
                    <span key={d} className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-300">
                      {d}
                    </span>
                  ))}
                </span>
              ) : (
                <FactValue text={null} />
              )}
            </Fact>
          </dl>
          {project.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-white/8 px-4 py-3">
              {project.tags.map((t) => (
                <span key={t} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-400">
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

// --- Repository, inline-editable --------------------------------------------
export function EditableRepository({
  slug,
  projectKey,
  repo,
  canManage,
}: {
  slug: string;
  projectKey: string;
  repo: ProjectRepo | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState(repo?.url ?? "");
  const [branch, setBranch] = useState(repo?.defaultBranch ?? "");
  const [visibility, setVisibility] = useState(repo?.visibility ?? NONE);

  function cancel() {
    setUrl(repo?.url ?? "");
    setBranch(repo?.defaultBranch ?? "");
    setVisibility(repo?.visibility ?? NONE);
    setError(null);
    setEditing(false);
  }
  function save() {
    setError(null);
    const trimmed = url.trim();
    start(async () => {
      const res = await updateProjectAction(slug, projectKey, {
        repoUrl: trimmed ? trimmed : null,
        repoDefaultBranch: branch.trim() ? branch.trim() : null,
        repoVisibility: visibility === NONE ? null : visibility,
      });
      if (res.error) return setError(res.error);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHead
        title="Repository"
        action={
          <EditActions editing={editing} canManage={canManage} pending={pending} onEdit={() => setEditing(true)} onSave={save} onCancel={cancel} />
        }
      />
      <div className="px-4 py-3.5">
        {editing ? (
          <div className="flex flex-col gap-3">
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <Field label="Repository URL">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/acme/web-app" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Default branch">
                <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
              </Field>
              <Field label="Visibility">
                <Select ariaLabel="Repository visibility" value={visibility} onValueChange={setVisibility} className="w-full" options={withNone(REPO_VISIBILITY, "Unset")} />
              </Field>
            </div>
          </div>
        ) : repo ? (
          <div className="flex flex-col gap-2.5">
            <a href={repo.url} target="_blank" rel="noreferrer" className="group inline-flex w-fit max-w-full items-center gap-2 text-sm text-zinc-200 hover:text-zinc-100">
              <GitBranch className="size-4 shrink-0 text-zinc-400" />
              <span className="truncate font-medium">{repo.name ?? repo.url}</span>
              <ExternalLink className="size-3.5 shrink-0 text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
              <span>{labelFor(REPO_PROVIDERS, repo.provider)}</span>
              {repo.defaultBranch ? (
                <span className="inline-flex items-center gap-1">
                  <GitBranch className="size-3.5" /> {repo.defaultBranch}
                </span>
              ) : null}
              {repo.visibility ? (
                <span className="inline-flex items-center gap-1">
                  {repo.visibility === "private" ? <Lock className="size-3.5" /> : <Globe className="size-3.5" />}
                  {labelFor(REPO_VISIBILITY, repo.visibility)}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No repository linked.</p>
        )}
      </div>
    </Card>
  );
}

// --- Links, inline-editable -------------------------------------------------
const LINK_ICONS: Record<string, typeof Link2> = {
  runbook: BookText,
  dashboard: Network,
  oncall: BellRing,
  docs: FileText,
  chat: MessagesSquare,
  issues: CircleDot,
  other: Link2,
};

export function EditableLinks({
  slug,
  projectKey,
  links: initial,
  canManage,
}: {
  slug: string;
  projectKey: string;
  links: ProjectLink[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<ProjectLink[]>(initial);

  function setLink(i: number, patch: Partial<ProjectLink>) {
    setLinks((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function cancel() {
    setLinks(initial);
    setError(null);
    setEditing(false);
  }
  function save() {
    setError(null);
    const clean = links
      .map((l) => ({ type: l.type, label: l.label?.trim() ? l.label.trim() : null, url: l.url.trim() }))
      .filter((l) => l.url);
    start(async () => {
      const res = await updateProjectAction(slug, projectKey, { links: clean });
      if (res.error) return setError(res.error);
      setLinks(clean);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHead
        title="Links"
        action={
          <EditActions editing={editing} canManage={canManage} pending={pending} onEdit={() => setEditing(true)} onSave={save} onCancel={cancel} />
        }
      />
      <div className="px-4 py-3.5">
        {editing ? (
          <div className="flex flex-col gap-2.5">
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            {links.map((l, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-white/8 bg-white/2 p-2.5">
                <div className="flex items-center gap-2">
                  <Select
                    ariaLabel="Link type"
                    value={l.type}
                    onValueChange={(v) => setLink(i, { type: v })}
                    options={LINK_TYPES}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setLinks((ls) => ls.filter((_, idx) => idx !== i))}
                    aria-label="Remove link"
                    className="grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-red-400"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <Input value={l.label ?? ""} onChange={(e) => setLink(i, { label: e.target.value })} placeholder="Label (optional)" />
                <Input value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} placeholder="https://…" />
              </div>
            ))}
            <div>
              <Button variant="secondary" size="sm" onClick={() => setLinks((ls) => [...ls, { type: "runbook", label: null, url: "" }])}>
                <Plus className="size-4" /> Add link
              </Button>
            </div>
          </div>
        ) : initial.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {initial.map((l, i) => {
              const Icon = LINK_ICONS[l.type] ?? Link2;
              return (
                <li key={`${l.url}-${i}`}>
                  <a href={l.url} target="_blank" rel="noreferrer" className="group flex items-center gap-2 text-sm text-zinc-300 hover:text-zinc-100">
                    <Icon className="size-4 shrink-0 text-zinc-500" />
                    <span className="truncate">{l.label ?? labelFor(LINK_TYPES, l.type)}</span>
                    <ExternalLink className="size-3 shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No links yet.</p>
        )}
      </div>
    </Card>
  );
}
