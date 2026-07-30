"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  SegmentedControl,
  Textarea,
} from "@flagon/design";
import { createFlagAction } from "./actions";
import { JsonEditor } from "./json-editor";
import type { FlagType } from "@/lib/flags-api";

const TYPES: { value: string; label: string }[] = [
  { value: "boolean", label: "Boolean" },
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "json", label: "JSON" },
];

/** A concrete example value per type, so the placeholder makes the intent clear. */
const VALUE_PLACEHOLDER: Record<FlagType, string> = {
  boolean: "",
  string: "e.g. blue",
  number: "e.g. 42",
  json: '{ "key": "value" }',
};

type VariantDraft = { value: string; label: string };

export function CreateFlagButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Create Flag
      </Button>
      {open ? <CreateFlagDialog slug={slug} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CreateFlagDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [flagSlug, setFlagSlug] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<FlagType>("boolean");
  const [variants, setVariants] = useState<VariantDraft[]>([{ value: "", label: "" }]);
  const [error, setError] = useState<string | null>(null);

  const multivariate = type !== "boolean";

  const setVariant = (i: number, patch: Partial<VariantDraft>) =>
    setVariants((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeVariant = (i: number) =>
    setVariants((prev) => prev.filter((_, j) => j !== i));
  const addVariant = () =>
    setVariants((prev) => [...prev, { value: "", label: "" }]);

  function coerce(raw: string): { value?: unknown; error?: string } {
    if (type === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { error: `"${raw}" is not a number.` };
      return { value: n };
    }
    if (type === "json") {
      try {
        return { value: JSON.parse(raw) };
      } catch {
        return { error: `"${raw}" is not valid JSON.` };
      }
    }
    return { value: raw };
  }

  function submit() {
    setError(null);
    let parsed: { value: unknown; label: string | null }[] | undefined;
    if (multivariate) {
      parsed = [];
      for (const v of variants) {
        if (v.value.trim() === "") return setError("Every variant needs a value.");
        const c = coerce(v.value);
        if (c.error) return setError(c.error);
        parsed.push({ value: c.value, label: v.label.trim() || null });
      }
    }
    start(async () => {
      const res = await createFlagAction(slug, {
        slug: flagSlug,
        type,
        description: description.trim() || null,
        variants: parsed,
      });
      if (res.error) return setError(res.error);
      router.push(`/${slug}/flags/${res.key}`);
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader
        title="Create Feature Flag"
        description="Enter the details of your new feature flag."
        onClose={onClose}
      />
      <ModalBody>
        <div className="flex flex-col gap-4">
          <Field label="Slug">
            <Input
              value={flagSlug}
              onChange={(e) => setFlagSlug(e.target.value)}
              placeholder="my-flag"
              autoFocus
              className="font-mono"
            />
          </Field>

          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this feature flag controls…"
              rows={2}
            />
          </Field>

          <Field label="Type">
            <SegmentedControl
              value={type}
              onValueChange={(v) => {
                setType(v as FlagType);
                // Values are type-specific; start fresh so a JSON draft doesn't
                // linger in a Number field (and vice versa).
                setVariants([{ value: "", label: "" }]);
              }}
              options={TYPES}
              ariaLabel="Flag value type"
            />
          </Field>

          {multivariate ? (
            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium text-zinc-400">Variants</span>

              {type === "json"
                ? variants.map((v, i) => (
                    <div key={i} className="rounded-lg border border-white/8 bg-white/2 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-300">
                          Variant {i + 1}
                        </span>
                        {variants.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeVariant(i)}
                            className="text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-600">
                        Label (optional)
                      </span>
                      <Input
                        value={v.label}
                        onChange={(e) => setVariant(i, { label: e.target.value })}
                        placeholder={`Variant ${i + 1}`}
                        aria-label={`Variant ${i + 1} label`}
                        className="mb-3 max-w-xs"
                      />
                      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-600">
                        Value
                      </span>
                      <JsonEditor
                        value={v.value}
                        onChange={(val) => setVariant(i, { value: val })}
                        placeholder={VALUE_PLACEHOLDER.json}
                        ariaLabel={`Variant ${i + 1} value`}
                      />
                    </div>
                  ))
                : variants.map((v, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                      <Input
                        value={v.value}
                        onChange={(e) => setVariant(i, { value: e.target.value })}
                        placeholder={VALUE_PLACEHOLDER[type]}
                        aria-label={`Variant ${i + 1} value`}
                        className="font-mono"
                      />
                      <Input
                        value={v.label}
                        onChange={(e) => setVariant(i, { label: e.target.value })}
                        placeholder="Label (optional)"
                        aria-label={`Variant ${i + 1} label`}
                      />
                      <button
                        type="button"
                        onClick={() => removeVariant(i)}
                        disabled={variants.length === 1}
                        className="grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-red-400 disabled:opacity-30 disabled:hover:text-zinc-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

              <button
                type="button"
                onClick={addVariant}
                className="inline-flex w-fit items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/10"
              >
                <Plus className="h-3.5 w-3.5" /> Add variant
              </button>
            </div>
          ) : null}
        </div>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending || flagSlug.trim() === ""}>
          {pending ? "Creating…" : "Create"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
