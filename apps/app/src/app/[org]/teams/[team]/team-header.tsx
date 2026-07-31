"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Users } from "lucide-react";
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
import { deleteTeamAction, updateTeamAction } from "../actions";

type TeamShape = { key: string; name: string; description: string | null };

export function TeamHeader({
  slug,
  team,
  canEdit,
  canDelete,
}: {
  slug: string;
  team: TeamShape;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-300">
          <Users className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-100">
            {team.name}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {team.description || <span className="font-mono">@{team.key}</span>}
          </p>
        </div>
      </div>
      {canEdit ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          {canDelete ? <DeleteTeamButton slug={slug} teamKey={team.key} /> : null}
        </div>
      ) : null}

      {editing ? (
        <EditTeamModal slug={slug} team={team} onClose={() => setEditing(false)} />
      ) : null}
    </div>
  );
}

function EditTeamModal({
  slug,
  team,
  onClose,
}: {
  slug: string;
  team: TeamShape;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    if (!name.trim()) return setError("Give the team a name.");
    start(async () => {
      const res = await updateTeamAction(slug, team.key, {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
      });
      if (res.error) return setError(res.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader title="Edit team" onClose={onClose} />
      <ModalBody className="flex flex-col gap-4">
        <Field label="Team name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Description" hint="Optional.">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </Field>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={pending || !name.trim()}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function DeleteTeamButton({ slug, teamKey }: { slug: string; teamKey: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    start(async () => {
      const res = await deleteTeamAction(slug, teamKey);
      if (res.error) return setError(res.error);
      router.push(`/${slug}/teams`);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 className="size-3.5" /> Delete
      </Button>
    );
  }
  return (
    <Modal onClose={() => setConfirming(false)} size="sm">
      <ModalHeader title="Delete team?" onClose={() => setConfirming(false)} />
      <ModalBody>
        <p className="text-sm text-zinc-400">
          This removes the team and its membership. Projects it owns become
          unowned. This can&apos;t be undone.
        </p>
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button variant="danger" onClick={remove} disabled={pending}>
          {pending ? "Deleting…" : "Delete team"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
