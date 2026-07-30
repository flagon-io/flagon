"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, ExternalLink, GitBranch, Lock, Plus, RefreshCw, Search } from "lucide-react";
import {
  Button,
  Field,
  IconGitHub,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  Skeleton,
} from "@flagon/design";
import { createProjectAction, listReposAction } from "./projects/actions";
import type { GithubInstallation, GithubRepo, Project } from "@/lib/projects-api";

function slugify(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function ProjectsView({
  slug,
  projects,
  installations,
  canCreate,
}: {
  slug: string;
  projects: Project[];
  installations: GithubInstallation[];
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Projects</h1>
        {canCreate ? (
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New Project
          </Button>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-16 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-white/5 text-zinc-400">
            <Boxes className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-200">No projects yet</p>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              A project connects a repository from a source provider. Everything else
              is built on top.
            </p>
          </div>
          {canCreate ? (
            <Button variant="secondary" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New Project
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {projects.map((p, i) => (
            <Link
              key={p.key}
              href={`/${slug}/projects/${p.key}`}
              className={`flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-white/3 ${
                i > 0 ? "border-t border-white/8" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/5 text-zinc-400">
                  <Boxes className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{p.name}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-zinc-500">
                    <IconGitHub className="h-3 w-3 shrink-0" />
                    {p.repoFullName ?? "no repository"}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-zinc-600">
                {relativeTime(p.createdAt)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {open ? (
        <NewProjectModal
          slug={slug}
          installations={installations}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** Deep link to where a connected account's repository access is managed. */
function manageAccessUrl(inst: GithubInstallation): string {
  return inst.accountType === "Organization"
    ? `https://github.com/organizations/${inst.accountLogin}/settings/installations/${inst.installationId}`
    : `https://github.com/settings/installations/${inst.installationId}`;
}

function NewProjectModal({
  slug,
  installations,
  onClose,
}: {
  slug: string;
  installations: GithubInstallation[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [installationId, setInstallationId] = useState(installations[0]?.id ?? "");
  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [reposLoading, loadRepos] = useTransition();
  const [filter, setFilter] = useState("");
  const [repoId, setRepoId] = useState("");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasProvider = installations.length > 0;
  const installation = installations.find((i) => i.id === installationId) ?? null;

  // Fetch a provider's repositories live so the list is always current. Not
  // called during render (that would start a transition mid-render); the resets
  // live inside the transition so this stays effect/handler-safe.
  const loadReposFor = useCallback(
    (id: string) => {
      if (!id) return;
      loadRepos(async () => {
        setError(null);
        const res = await listReposAction(slug, id);
        if (res.error) return setError(res.error);
        setRepos(res.repos ?? []);
      });
    },
    [slug],
  );

  useEffect(() => {
    loadReposFor(installationId);
  }, [installationId, loadReposFor]);

  function switchInstallation(id: string) {
    setRepoId("");
    setRepos(null);
    setFilter("");
    setInstallationId(id);
  }

  function pickRepo(repo: GithubRepo) {
    // Toggle: clicking the selected repo again clears it (a bare project).
    if (repoId === repo.id) return setRepoId("");
    setRepoId(repo.id);
    // Convenience only: seed an empty name/key from the repo. Never overwrite
    // what the user has already typed.
    if (!name.trim() && !keyEdited) {
      setName(repo.name);
      setKey(slugify(repo.name));
    }
  }

  function create() {
    setError(null);
    if (!name.trim()) return setError("Give the project a name.");
    start(async () => {
      const res = await createProjectAction(slug, {
        name: name.trim(),
        key: key.trim() || slugify(name),
        // Repository is optional — send it only when one is chosen.
        ...(repoId ? { githubInstallationId: installationId, repoId } : {}),
      });
      if (res.error) return setError(res.error);
      router.push(`/${slug}/projects/${res.key}`);
      router.refresh();
    });
  }

  const shown = (repos ?? []).filter((r) =>
    r.fullName.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader
        title="New Project"
        description="Name your project, then attach a repository — now or later."
        onClose={onClose}
      />
      <ModalBody className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-app"
              autoFocus
            />
          </Field>
          <Field label="Key" hint="Used in the URL.">
            <Input
              value={key}
              onChange={(e) => {
                setKeyEdited(true);
                setKey(slugify(e.target.value));
              }}
              placeholder="my-app"
              className="font-mono"
            />
          </Field>
        </div>

        <Field
          label="Repository"
          hint="Optional. Attach or switch this anytime from project settings."
        >
          {!hasProvider ? (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-white/12 bg-white/2 px-3 py-3 text-sm text-zinc-500">
              <span>No source provider connected yet.</span>
              <button
                type="button"
                onClick={() => router.push(`/${slug}/integrations`)}
                className="inline-flex items-center gap-1.5 text-zinc-300 hover:text-zinc-100"
              >
                <Plus className="h-3.5 w-3.5" /> Connect a provider in Integrations
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {installations.length > 1 ? (
                <Select
                  value={installationId}
                  onValueChange={switchInstallation}
                  options={installations.map((i) => ({ value: i.id, label: i.accountLogin }))}
                  ariaLabel="Source provider account"
                  className="w-full"
                />
              ) : null}

              <div className="rounded-lg border border-white/10">
                <div className="relative flex items-center border-b border-white/8">
                  <Search className="pointer-events-none absolute left-3 h-4 w-4 text-zinc-500" />
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search repositories…"
                    className="flex-1 border-0 bg-transparent pl-9"
                  />
                  <button
                    type="button"
                    onClick={() => loadReposFor(installationId)}
                    disabled={reposLoading}
                    title="Refresh repositories"
                    className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${reposLoading ? "animate-spin" : ""}`} />
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto p-1">
                  {reposLoading ? (
                    <div className="flex flex-col gap-1 p-1">
                      {[0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-9 w-full" />
                      ))}
                    </div>
                  ) : shown.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-zinc-500">
                      {repos && repos.length === 0
                        ? "No repositories accessible from this account yet."
                        : "No repositories match."}
                    </p>
                  ) : (
                    shown.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => pickRepo(r)}
                        className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                          repoId === r.id ? "bg-white/8 text-zinc-100" : "text-zinc-300 hover:bg-white/4"
                        }`}
                      >
                        <IconGitHub className="h-4 w-4 shrink-0 text-zinc-500" />
                        <span className="min-w-0 flex-1 truncate">{r.fullName}</span>
                        {r.private ? <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-600" /> : null}
                        <span className="hidden items-center gap-1 text-xs text-zinc-600 sm:flex">
                          <GitBranch className="h-3 w-3" /> {r.defaultBranch}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {installation ? (
                <a
                  href={manageAccessUrl(installation)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 self-start text-xs text-zinc-500 hover:text-zinc-300"
                >
                  <ExternalLink className="h-3 w-3" /> Missing a repository? Manage access on
                  GitHub, then refresh.
                </a>
              ) : null}
            </div>
          )}
        </Field>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={create} disabled={pending || !name.trim()}>
          {pending ? "Creating…" : "Create Project"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
