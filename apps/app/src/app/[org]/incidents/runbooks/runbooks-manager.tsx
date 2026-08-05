"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookText, ListChecks, Pencil, Plus } from "lucide-react";
import { Button, Field, Input, Modal, ModalHeader, ModalBody, ModalFooter } from "@flagon/design";
import { SEVERITIES } from "@/lib/incidents";
import type { Runbook } from "@/lib/runbooks-api";
import { createRunbookAction } from "../actions";

const NO_MANAGE = "Only organization owners and admins can manage runbooks.";

function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

function severityLabel(value: string) {
  return SEVERITIES.find((s) => s.value === value)?.label ?? value.toUpperCase();
}

/**
 * Runbooks index: a read-only list of runbook cards. Each card summarizes a
 * playbook (name, key, trigger, step count, covered services) and links to its
 * dedicated editor page. Creating opens a small modal, then routes to the editor.
 */
export function RunbooksManager({
  slug,
  runbooks,
  canManage,
  initialCreate,
}: {
  slug: string;
  runbooks: Runbook[];
  canManage: boolean;
  initialCreate?: boolean;
}) {
  const [creating, setCreating] = useState((initialCreate ?? false) && canManage);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Runbooks</h1>
          <p className="mt-1 text-sm text-zinc-500">Playbooks that become an incident&apos;s checklist. Attach by service or severity.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setCreating(true)}
          disabled={!canManage}
          title={canManage ? undefined : NO_MANAGE}
        >
          <Plus className="size-4" /> New runbook
        </Button>
      </div>

      {runbooks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-14 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-zinc-300"><BookText className="size-5" /></span>
          <p className="text-base font-medium text-zinc-100">No runbooks</p>
          <p className="max-w-sm text-sm text-zinc-500">Write the steps once. When a matching incident is declared, they land on it as a checklist.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {runbooks.map((r) => (
            <RunbookCard key={r.key} slug={slug} runbook={r} canManage={canManage} />
          ))}
        </div>
      )}

      {creating ? <CreateModal slug={slug} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function RunbookCard({ slug, runbook, canManage }: { slug: string; runbook: Runbook; canManage: boolean }) {
  const href = `/${slug}/incidents/runbooks/${runbook.key}`;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-zinc-100">
            <BookText className="size-4 shrink-0 text-zinc-500" />
            <span className="truncate">{runbook.name}</span>
          </p>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{runbook.key}</p>
        </div>
        {canManage ? (
          <Link
            href={href}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10"
          >
            <Pencil className="size-3.5" /> Edit
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {runbook.triggerSeverity ? (
          <span className="inline-flex items-center rounded-full border border-teal-400/30 bg-teal-400/10 px-2.5 py-0.5 text-xs text-teal-200">
            Triggers at ≥ {severityLabel(runbook.triggerSeverity)}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-zinc-400">Manual</span>
        )}
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
          <ListChecks className="size-3.5" /> {runbook.stepCount} {runbook.stepCount === 1 ? "step" : "steps"}
        </span>
      </div>
    </div>
  );
}

function CreateModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    const finalName = name.trim();
    if (!finalName) return setError("Name the runbook.");
    const finalKey = key.trim() || slugify(finalName);
    start(async () => {
      const res = await createRunbookAction(slug, { name: finalName, key: finalKey });
      if (res.error) return setError(res.error);
      router.push(`/${slug}/incidents/runbooks/${res.key ?? finalKey}`);
    });
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader title="New runbook" description="Name it now. You will write the steps on the next screen." onClose={onClose} />
      <ModalBody>
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <Input
              value={name}
              autoFocus
              onChange={(e) => { setName(e.target.value); if (!keyEdited) setKey(slugify(e.target.value)); }}
              placeholder="Database outage"
            />
          </Field>
          <Field label="Key" hint="Stable identifier. Auto-fills from the name.">
            <Input
              value={key}
              onChange={(e) => { setKeyEdited(true); setKey(slugify(e.target.value)); }}
              placeholder="database-outage"
              className="font-mono"
            />
          </Field>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button variant="primary" onClick={create} disabled={pending || !name.trim()}>{pending ? "Creating…" : "Create runbook"}</Button>
      </ModalFooter>
    </Modal>
  );
}
