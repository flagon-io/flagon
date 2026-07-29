"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Users } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
} from "@flagon/design";
import { createEntityAction, deleteEntityAction } from "../actions";
import type { Entity } from "@/lib/flags-api";

const DATA_TYPES = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
];

export function EntitiesManager({
  slug,
  entities,
  canManage,
}: {
  slug: string;
  entities: Entity[];
  /** Only owners/admins may delete an entity (matches the API gate). */
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);

  function remove(key: string) {
    start(async () => {
      const res = await deleteEntityAction(slug, key);
      if (!res.error) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Add Entity
        </Button>
      </div>

      {entities.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/2 px-6 py-20 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-white/5 text-zinc-400">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-200">No entities yet</p>
            <p className="mt-1 text-sm text-zinc-500">
              Describe the subjects you target (user, team) and their attributes.
            </p>
          </div>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Add Entity
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {entities.map((e) => (
            <div key={e.id} className="overflow-hidden rounded-xl border border-white/10">
              <div className="flex items-center justify-between gap-3 border-b border-white/8 bg-white/2 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-100">{e.label}</span>
                  <span className="font-mono text-xs text-zinc-600">{e.key}</span>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => remove(e.key)}
                    disabled={pending}
                    title="Delete entity"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {e.attributes.length === 0 ? (
                <p className="px-4 py-3 text-sm text-zinc-500">No attributes.</p>
              ) : (
                <div className="divide-y divide-white/6">
                  {e.attributes.map((a) => (
                    <div key={a.key} className="flex items-center justify-between px-4 py-2.5">
                      <span className="font-mono text-sm text-zinc-200">{a.key}</span>
                      <span className="rounded border border-white/10 px-1.5 py-0.5 text-xs capitalize text-zinc-500">
                        {a.dataType}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <CreateEntityModal
          slug={slug}
          onClose={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

type AttrDraft = { key: string; dataType: string };

function CreateEntityModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [attributes, setAttributes] = useState<AttrDraft[]>([
    { key: "", dataType: "string" },
  ]);
  const [error, setError] = useState<string | null>(null);

  const setAttr = (i: number, patch: Partial<AttrDraft>) =>
    setAttributes((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  function submit() {
    setError(null);
    const attrs = attributes
      .filter((a) => a.key.trim())
      .map((a) => ({ key: a.key.trim(), dataType: a.dataType }));
    start(async () => {
      const res = await createEntityAction(slug, {
        key: key.trim(),
        label: label.trim() || key.trim(),
        attributes: attrs,
      });
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader
        title="Add Entity"
        description="A subject flags evaluate for, plus the attributes you target on."
        onClose={onClose}
      />
      <ModalBody className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Key">
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="user"
              autoFocus
              className="font-mono"
            />
          </Field>
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="User" />
          </Field>
        </div>

        <div>
          <span className="text-xs font-medium text-zinc-400">Attributes</span>
          <div className="mt-1.5 flex flex-col gap-2">
            {attributes.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={a.key}
                  onChange={(e) => setAttr(i, { key: e.target.value })}
                  placeholder="attribute key (e.g. plan)"
                  aria-label="Attribute key"
                  className="flex-1 font-mono"
                />
                <Select
                  value={a.dataType}
                  onValueChange={(v) => setAttr(i, { dataType: v })}
                  options={DATA_TYPES}
                  ariaLabel="Data type"
                  className="w-32"
                />
                <button
                  type="button"
                  onClick={() => setAttributes((prev) => prev.filter((_, j) => j !== i))}
                  disabled={attributes.length === 1}
                  className="grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-red-400 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAttributes((prev) => [...prev, { key: "", dataType: "string" }])}
            className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10"
          >
            <Plus className="h-3.5 w-3.5" /> Add attribute
          </button>
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending || key.trim() === ""}>
          {pending ? "Creating…" : "Add Entity"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
