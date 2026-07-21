"use client";
import { useState } from "react";
import { Field, Input } from "@/components/form-controls";
import { SubmitButton } from "@/components/submit-button";
import type { CriteriaGroup } from "@/lib/flags";
import { CriteriaBuilder } from "../flags/criteria-builder";
export function SegmentEditor({ action, segment }: { action: (form: FormData) => void | Promise<void>; segment: { name: string; description: string | null; criteria: CriteriaGroup } }) {
  const [criteria, setCriteria] = useState(segment.criteria);
  return <form action={action} className="mt-8 grid gap-6"><input type="hidden" name="criteria" value={JSON.stringify(criteria)} /><div className="grid gap-4 md:grid-cols-2"><Field label="Name"><Input name="name" defaultValue={segment.name} /></Field><Field label="Description"><Input name="description" defaultValue={segment.description ?? ""} /></Field></div><section className="border border-white/10 bg-white/[0.02] p-4"><h2 className="mb-4 text-sm font-semibold text-zinc-200">Membership criteria</h2><CriteriaBuilder value={criteria} onChange={setCriteria} segments={[]} allowSegments={false} /></section><SubmitButton pendingLabel="Saving…" className="w-fit px-5">Save segment</SubmitButton></form>;
}
