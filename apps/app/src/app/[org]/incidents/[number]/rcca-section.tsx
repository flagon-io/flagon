"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Settings2, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@flagon/design";
import type { ActionItem, RccaField } from "@/lib/incidents-api";
import { addActionItemAction, deleteActionItemAction, putRccaAction, updateActionItemAction } from "../actions";

type OrgMember = { userId: string; name: string };
const NONE = "__none__";
const STATUS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

/**
 * The RCCA on an incident: the org template's fields as an editable form, plus
 * tracked corrective actions (the "CA") with an owner and a status. Any member
 * can author it (postmortems are collaborative).
 */
export function RccaSection({
  slug,
  number,
  fields,
  values,
  actionItems,
  orgMembers,
  required,
}: {
  slug: string;
  number: number;
  fields: RccaField[];
  values: Record<string, string>;
  actionItems: ActionItem[];
  orgMembers: OrgMember[];
  required: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) v[f.key] = values[f.key] ?? "";
    return v;
  });
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState(NONE);
  const nameBy = new Map(orgMembers.map((m) => [m.userId, m.name]));

  function saveRcca() {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await putRccaAction(slug, number, vals);
      if (res.error) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  }
  function addItem() {
    if (!newTitle.trim()) return;
    setError(null);
    start(async () => {
      const res = await addActionItemAction(slug, number, { title: newTitle.trim(), assigneeUserId: newAssignee === NONE ? undefined : newAssignee });
      if (res.error) return setError(res.error);
      setNewTitle("");
      setNewAssignee(NONE);
      router.refresh();
    });
  }
  function updateItem(id: string, body: Record<string, unknown>) {
    setError(null);
    start(async () => {
      const r = await updateActionItemAction(slug, number, id, body);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }
  function removeItem(id: string) {
    start(async () => {
      await deleteActionItemAction(slug, number, id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-200"><ClipboardList className="size-4 text-zinc-500" /> RCCA</p>
        <div className="flex items-center gap-2.5">
          {required ? (
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-amber-300 uppercase">Required</span>
          ) : null}
          <Link href={`/${slug}/incidents/rcca-template`} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
            <Settings2 className="size-3.5" /> Template
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {fields.map((f) => (
          <Field key={f.key} label={f.required ? `${f.label} *` : f.label} hint={f.description}>
            <Textarea value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} rows={2} />
          </Field>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={saveRcca} disabled={pending}>{pending ? "Saving…" : "Save RCCA"}</Button>
        {saved ? <span className="text-xs text-teal-400">Saved.</span> : null}
      </div>

      <div className="mt-5 border-t border-white/8 pt-4">
        <p className="mb-2 text-xs font-medium text-zinc-500">Corrective actions</p>
        {actionItems.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {actionItems.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/8 bg-white/2 p-2">
                <span className={`min-w-0 flex-1 truncate text-sm ${it.status === "done" ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{it.title}</span>
                {it.assigneeUserId ? <span className="shrink-0 text-xs text-zinc-500">{nameBy.get(it.assigneeUserId) ?? "Assigned"}</span> : null}
                <Select ariaLabel="Status" value={it.status} onValueChange={(v) => updateItem(it.id, { status: v })} options={STATUS} fullWidth={false} />
                <button type="button" onClick={() => removeItem(it.id)} disabled={pending} className="shrink-0 text-zinc-500 hover:text-red-400" aria-label="Remove action"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Add a corrective action…" className="min-w-52 flex-1" />
          <Select fullWidth={false} ariaLabel="Assignee" value={newAssignee} onValueChange={setNewAssignee} options={[{ value: NONE, label: "Unassigned" }, ...orgMembers.map((m) => ({ value: m.userId, label: m.name }))]} />
          <Button variant="secondary" size="sm" onClick={addItem} disabled={pending || !newTitle.trim()}><Plus className="size-4" /> Add</Button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
