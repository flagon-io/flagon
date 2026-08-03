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
} from "@flagon/design";
import { SettingsFooter } from "@/components/settings/section";
import type { Project } from "@/lib/projects-api";
import { deleteProjectAction, updateProjectAction } from "../../actions";

/**
 * General project settings: the identity that isn't edited inline on the overview
 * (the catalog metadata lives there now). Rename the project; the slug is fixed.
 */
export function GeneralForm({ slug, project }: { slug: string; project: Project }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState(project.name);

  const dirty = name.trim() !== project.name;

  function save() {
    setError(null);
    setSaved(false);
    if (!name.trim()) return setError("Give the project a name.");
    start(async () => {
      const res = await updateProjectAction(slug, project.key, { name: name.trim() });
      if (res.error) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Field label="Project name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field label="Slug" hint="The project's URL identifier. Fixed after creation.">
        <Input value={project.key} readOnly disabled className="font-mono" />
      </Field>

      <SettingsFooter>
        {error ? <p className="mr-auto text-sm text-red-400">{error}</p> : null}
        {saved ? <span className="text-sm text-teal-400">Saved.</span> : null}
        <Button variant="primary" onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </SettingsFooter>
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
          <Trash2 className="size-4" /> Delete project
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
