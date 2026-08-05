"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, PieChart, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Textarea,
  toast,
  useConfirm,
} from "@flagon/design";
import { createSegmentAction, deleteSegmentAction } from "../actions";
import type { Predicate, Segment } from "@/lib/flags-api";

function summarize(conditions: Predicate[]): string {
  if (conditions.length === 0) return "No rules yet";
  const n = conditions.length;
  return `${n} condition${n > 1 ? "s" : ""}`;
}

export function SegmentsManager({
  slug,
  segments,
  canManage,
}: {
  slug: string;
  segments: Segment[];
  /** Only owners/admins may delete a segment (matches the API gate). */
  canManage: boolean;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = segments.filter(
    (s) =>
      q === "" ||
      s.name.toLowerCase().includes(q.toLowerCase()) ||
      s.key.toLowerCase().includes(q.toLowerCase()),
  );

  async function remove(segment: Segment) {
    const ok = await confirm({
      title: "Delete segment?",
      message: (
        <>
          Deleting <strong className="text-zinc-200">{segment.name}</strong> is
          permanent. Flag rules referencing it will no longer match.
        </>
      ),
      confirmLabel: "Delete segment",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteSegmentAction(slug, segment.key);
      if (res.error) {
        toast.error("Couldn't delete segment", res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter segments…"
          className="flex-1"
        />
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Create Segment
        </Button>
      </div>

      {segments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/2 px-6 py-20 text-center">
          <span className="grid size-11 place-items-center rounded-lg bg-white/5 text-zinc-400">
            <PieChart className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-zinc-200">No segments yet</p>
            <p className="mt-1 text-sm text-zinc-500">
              Group users once, then target them from any flag.
            </p>
          </div>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Create Segment
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {filtered.map((s, i) => (
            <div
              key={s.id}
              className={`group flex items-center justify-between gap-3 ${
                i > 0 ? "border-t border-white/8" : ""
              }`}
            >
              <Link
                href={`/${slug}/flags/segments/${s.key}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-white/3"
              >
                <PieChart className="size-4 shrink-0 text-zinc-500" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-100">{s.name}</span>
                    <span className="font-mono text-xs text-zinc-600">{s.key}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {summarize(s.conditions)}
                  </p>
                </div>
                <ChevronRight className="ml-auto size-4 shrink-0 text-zinc-600" />
              </Link>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => remove(s)}
                  disabled={pending}
                  title="Delete segment"
                  aria-label={`Delete ${s.name}`}
                  className="mr-2 grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <CreateSegmentModal slug={slug} onClose={() => setCreating(false)} />
      ) : null}
      {confirmDialog}
    </div>
  );
}

function CreateSegmentModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const res = await createSegmentAction(slug, {
        key: key.trim(),
        name: name.trim() || key.trim(),
        description: description.trim() || null,
        conditions: [],
      });
      if (res.error) return setError(res.error);
      // Land on the segment's detail page to define its rules — like Vercel.
      router.push(`/${slug}/flags/segments/${key.trim()}`);
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader
        title="Create Segment"
        description="Enter the details of your new segment."
        onClose={onClose}
      />
      <ModalBody className="flex flex-col gap-4">
        <Field label="Slug">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="my-segment"
            autoFocus
            className="font-mono"
          />
        </Field>
        <Field label="Label">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Segment" />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter a description"
            rows={2}
          />
        </Field>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending || key.trim() === ""}>
          {pending ? "Creating…" : "Create"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
