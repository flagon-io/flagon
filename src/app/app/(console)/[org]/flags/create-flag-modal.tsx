"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Field, Select, Textarea } from "@/components/form-controls";
import { Modal, ModalActions, ModalClose } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import type { FlagType } from "@/lib/flags";
import { NameKeyFields } from "@/components/name-key-fields";
import { VariantRows } from "./variant-rows";
const types: Array<{ value: FlagType; label: string }> = [{ value: "boolean", label: "Boolean" }, { value: "string", label: "String" }, { value: "integer", label: "Integer" }, { value: "float", label: "Float" }, { value: "object", label: "JSON" }];
export function CreateFlagModal({ action }: { action: (form: FormData) => void | Promise<void> }) {
  const [type, setType] = useState<FlagType>("boolean");
  return <Modal size="lg" title="Create feature flag" description="Enter the details for your new organization-wide flag." trigger={<Button className="gap-1.5"><Plus className="h-4 w-4" /> New flag</Button>}>
    <form action={action} className="grid gap-5"><NameKeyFields namePlaceholder="New checkout" keyPlaceholder="new-checkout" keyHint="Generated from the name. This stable key is used in your application." /><Field label="Description" hint="Help your team understand what this flag controls."><Textarea name="description" placeholder="Describe what this feature flag controls…" className="min-h-20" /></Field><Field label="Type" hint="The value type returned through OpenFeature."><input type="hidden" name="type" value={type} /><div className="grid grid-cols-5 rounded-lg border border-white/10 bg-black/20 p-1">{types.map((option) => <button key={option.value} type="button" onClick={() => setType(option.value)} className={`h-8 cursor-pointer rounded-md text-xs font-medium transition ${type === option.value ? "bg-white/10 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}>{option.label}</button>)}</div></Field>
      {/* Boolean is fully described by which way it points, so it keeps the
          one-line control. Every other type gets the full variant table:
          reaching for a string flag usually means you already have more than
          one string in mind. */}
      {type === "boolean" ? <Field label="Default outcome" hint="Served when no targeting rule matches."><Select name="default_value" defaultValue="false" options={[{ value: "false", label: "Off" }, { value: "true", label: "On" }]} /></Field> : <VariantRows key={type} type={type} />}
      <ModalActions><ModalClose /><SubmitButton pendingLabel="Creating…">Create flag</SubmitButton></ModalActions>
    </form>
  </Modal>;
}
