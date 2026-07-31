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
  Textarea,
} from "@flagon/design";
import { createTeamAction } from "./actions";
import type { Team } from "@/lib/teams-api";

function slugify(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function TeamsView({
  slug,
  teams,
  canCreate,
}: {
  slug: string;
  teams: Team[];
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Teams</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Groups of people that own projects in your catalog.
          </p>
        </div>
        {canCreate ? (
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New Team
          </Button>
        ) : null}
      </div>

      {teams.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-16 text-center">
          <span className="grid size-11 place-items-center rounded-lg bg-white/5 text-zinc-400">
            <Users className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-200">No teams yet</p>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              Create a team to group people and hand them ownership of projects.
            </p>
          </div>
          {canCreate ? (
            <Button variant="secondary" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> New Team
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {teams.map((t, i) => (
            <Link
              key={t.key}
              href={`/${slug}/teams/${t.key}`}
              className={`flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-white/3 ${
                i > 0 ? "border-t border-white/8" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-white/5 text-zinc-400">
                  <Users className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{t.name}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {t.description || `@${t.key}`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5" /> {t.memberCount}
                </span>
                <span className="flex items-center gap-1.5">
                  <Boxes className="size-3.5" /> {t.projectCount}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {open ? <NewTeamModal slug={slug} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function NewTeamModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onNameChange(v: string) {
    setName(v);
    if (!keyEdited) setKey(slugify(v));
  }

  function create() {
    setError(null);
    if (!name.trim()) return setError("Give the team a name.");
    start(async () => {
      const res = await createTeamAction(slug, {
        name: name.trim(),
        key: key.trim() || slugify(name),
        description: description.trim() || undefined,
      });
      if (res.error) return setError(res.error);
      router.push(`/${slug}/teams/${res.key}`);
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader title="New Team" description="Name your team and give it a key." onClose={onClose} />
      <ModalBody className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team name">
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Platform"
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
              placeholder="platform"
              className="font-mono"
            />
          </Field>
        </div>
        <Field label="Description" hint="Optional.">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this team owns."
            rows={2}
          />
        </Field>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={create} disabled={pending || !name.trim()}>
          {pending ? "Creating…" : "Create Team"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
