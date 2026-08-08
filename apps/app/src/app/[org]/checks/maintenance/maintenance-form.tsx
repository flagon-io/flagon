"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, type SelectOption } from "@flagon/design";
import type { MaintenanceRepeat, MaintenanceWindow } from "@/lib/checks-api";
import {
  createMaintenanceWindowAction,
  deleteMaintenanceWindowAction,
  updateMaintenanceWindowAction,
} from "../actions";

/**
 * Create + edit a maintenance window: name, which checks it applies to (none selected = ALL
 * checks), a start/end, and an optional repeat (daily/weekly/monthly) with an end date.
 * `datetime-local` inputs are local time; converted to ISO on save. Action buttons are
 * right-aligned per house convention.
 */
const REPEATS: SelectOption[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

/** ISO string -> value for a <input type="datetime-local"> in the viewer's local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const toIso = (local: string): string | null => (local ? new Date(local).toISOString() : null);

export function MaintenanceForm({
  slug,
  mode,
  window: existing,
  checks,
}: {
  slug: string;
  mode: "create" | "edit";
  window?: MaintenanceWindow;
  checks: { key: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(existing?.name ?? "");
  const [checkKeys, setCheckKeys] = useState<string[]>(existing?.checkKeys ?? []);
  const [startsAt, setStartsAt] = useState(toLocalInput(existing?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(existing?.endsAt ?? null));
  const [repeat, setRepeat] = useState<MaintenanceRepeat>(existing?.repeat ?? "none");
  const [repeatEndsAt, setRepeatEndsAt] = useState(toLocalInput(existing?.repeatEndsAt ?? null));

  const editing = mode === "edit";
  const valid = name.trim() && startsAt && endsAt && new Date(endsAt) > new Date(startsAt);
  const disabled = pending || !valid;

  function save() {
    setError(null);
    const payload = {
      name: name.trim(),
      checkKeys,
      startsAt: toIso(startsAt)!,
      endsAt: toIso(endsAt)!,
      repeat,
      repeatEndsAt: repeat === "none" ? null : toIso(repeatEndsAt),
    };
    start(async () => {
      if (editing && existing) {
        const res = await updateMaintenanceWindowAction(slug, existing.id, payload);
        if (res.error) return setError(res.error);
        router.push(`/${slug}/checks/maintenance`);
        router.refresh();
        return;
      }
      const res = await createMaintenanceWindowAction(slug, payload);
      if (res.error) return setError(res.error);
      router.push(`/${slug}/checks/maintenance`);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
              {editing ? "Edit maintenance window" : "New maintenance window"}
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              The selected checks won&apos;t run or alert during this window.
            </p>
          </div>
          <Button variant="primary" onClick={save} disabled={disabled}>
            {editing ? "Save changes" : "Create window"}
          </Button>
        </div>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/2 p-5">
        <div className="grid gap-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nightly deploy" />
          </Field>
          <Field label="Applies to" hint="Leave everything unchecked to pause every check.">
            {checks.length === 0 ? (
              <p className="text-sm text-zinc-500">No checks yet.</p>
            ) : (
              <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto rounded-md border border-white/10 bg-white/2 p-3">
                <label className="flex items-center gap-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    className="size-4 accent-teal-500"
                    checked={checkKeys.length === 0}
                    onChange={() => setCheckKeys([])}
                  />
                  All checks
                </label>
                <div className="my-1 h-px bg-white/10" />
                {checks.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      className="size-4 accent-teal-500"
                      checked={checkKeys.includes(c.key)}
                      onChange={(e) =>
                        setCheckKeys((prev) =>
                          e.target.checked ? [...prev, c.key] : prev.filter((k) => k !== c.key),
                        )
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts">
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field label="Ends">
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </Field>
          </div>
          <Field label="Repeat">
            <Select value={repeat} onValueChange={(v) => setRepeat(v as MaintenanceRepeat)} options={REPEATS} />
          </Field>
          {repeat !== "none" ? (
            <Field label="Repeat until (optional)" hint="Leave empty to repeat indefinitely.">
              <Input type="datetime-local" value={repeatEndsAt} onChange={(e) => setRepeatEndsAt(e.target.value)} />
            </Field>
          ) : null}
        </div>
      </section>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex items-center justify-end gap-2 pb-8">
        {editing && existing ? (
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete the "${existing.name}" window?`)) return;
              start(async () => {
                const res = await deleteMaintenanceWindowAction(slug, existing.id);
                if (res.error) return setError(res.error);
                router.push(`/${slug}/checks/maintenance`);
                router.refresh();
              });
            }}
          >
            Delete window
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => router.push(`/${slug}/checks/maintenance`)} disabled={pending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={disabled}>
          {editing ? "Save changes" : "Create window"}
        </Button>
      </div>
    </div>
  );
}
