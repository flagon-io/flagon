"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Plus, Users } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@flagon/design";
import { createProjectAction } from "./projects/actions";
import type { Project } from "@/lib/projects-api";

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
  canCreate,
}: {
  slug: string;
  projects: Project[];
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Projects</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your catalog: the projects your org runs, who owns them, and what&apos;s
            built on top.
          </p>
        </div>
        {canCreate ? (
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New Project
          </Button>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-zinc-300">
            <Boxes className="h-6 w-6" />
          </span>
          <div>
            <p className="text-base font-medium text-zinc-100">
              {canCreate ? "Create your first project" : "No projects yet"}
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-500">
              A project is a system you run. Describe it, give it an owning team,
              and add a README, then build flags and more on top. This is the
              foundation your catalog grows from.
            </p>
          </div>
          {canCreate ? (
            <div className="flex flex-col items-center gap-2">
              <Button variant="primary" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> New Project
              </Button>
              <Link
                href={`/${slug}/teams`}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
              >
                <Users className="h-3.5 w-3.5" /> Or set up a team to own it first
              </Link>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              An owner or admin can create the first one.
            </p>
          )}
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
                  <p className="truncate font-mono text-xs text-zinc-500">{p.key}</p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-zinc-600">
                {relativeTime(p.createdAt)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {open ? <NewProjectModal slug={slug} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function NewProjectModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onNameChange(v: string) {
    setName(v);
    // Convenience only: seed the key from the name until the user edits it.
    if (!keyEdited) setKey(slugify(v));
  }

  function create() {
    setError(null);
    if (!name.trim()) return setError("Give the project a name.");
    start(async () => {
      const res = await createProjectAction(slug, {
        name: name.trim(),
        key: key.trim() || slugify(name),
      });
      if (res.error) return setError(res.error);
      router.push(`/${slug}/projects/${res.key}`);
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader
        title="New Project"
        description="Name your project and give it a key."
        onClose={onClose}
      />
      <ModalBody className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name">
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
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
