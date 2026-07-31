"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  Textarea,
} from "@flagon/design";
import { LIFECYCLES, TIERS } from "@/lib/catalog";
import type { Project } from "@/lib/projects-api";
import { deleteProjectAction, updateProjectAction } from "../../actions";

const NONE = "__none__";

type TeamOption = { key: string; name: string };

/** Prepend a "None" sentinel to an optional single-select's options. */
function withNone(options: { value: string; label: string }[], noneLabel = "None") {
  return [{ value: NONE, label: `— ${noneLabel} —` }, ...options];
}

export function CatalogForm({
  slug,
  project,
  teams,
}: {
  slug: string;
  project: Project;
  teams: TeamOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [ownerTeam, setOwnerTeam] = useState(project.ownerTeam?.key ?? NONE);
  const [lifecycle, setLifecycle] = useState(project.lifecycle ?? NONE);
  const [tier, setTier] = useState(project.tier ?? NONE);
  const [tags, setTags] = useState(project.tags.join(", "));

  function save() {
    setError(null);
    setSaved(false);
    if (!name.trim()) return setError("Give the project a name.");
    const parsedTags = Array.from(
      new Set(
        tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    );
    start(async () => {
      const res = await updateProjectAction(slug, project.key, {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        ownerTeamKey: ownerTeam === NONE ? null : ownerTeam,
        lifecycle: lifecycle === NONE ? null : lifecycle,
        tier: tier === NONE ? null : tier,
        tags: parsedTags,
      });
      if (res.error) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Owning team" hint="The team responsible for this project.">
          <Select
            ariaLabel="Owning team"
            value={ownerTeam}
            onValueChange={setOwnerTeam}
            options={withNone(teams.map((t) => ({ value: t.key, label: t.name })), "No owner")}
          />
        </Field>
      </div>

      <Field label="Description" hint="What this project is.">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="A short summary of what this project does."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lifecycle">
          <Select
            ariaLabel="Lifecycle"
            value={lifecycle}
            onValueChange={setLifecycle}
            options={withNone(LIFECYCLES)}
          />
        </Field>
        <Field label="Tier">
          <Select
            ariaLabel="Tier"
            value={tier}
            onValueChange={setTier}
            options={withNone(TIERS)}
          />
        </Field>
      </div>

      <Field label="Tags" hint="Comma-separated.">
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="payments, go, pci"
        />
      </Field>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={pending || !name.trim()}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {saved ? <span className="text-sm text-teal-400">Saved.</span> : null}
      </div>
    </div>
  );
}

export function DeleteProject({ slug, projectKey }: { slug: string; projectKey: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    start(async () => {
      const res = await deleteProjectAction(slug, projectKey);
      if (res.error) return setError(res.error);
      router.push(`/${slug}`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          Permanently delete this project. This can&apos;t be undone.
        </p>
        <Button variant="danger" onClick={() => setConfirming(true)}>
          <Trash2 className="h-4 w-4" /> Delete project
        </Button>
      </div>
      {confirming ? (
        <Modal onClose={() => setConfirming(false)} size="sm">
          <ModalHeader title="Delete project?" onClose={() => setConfirming(false)} />
          <ModalBody>
            <p className="text-sm text-zinc-400">
              This deletes <span className="font-mono text-zinc-200">{projectKey}</span> and
              everything under it. This can&apos;t be undone.
            </p>
            {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} disabled={pending}>
              {pending ? "Deleting…" : "Delete project"}
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
}
