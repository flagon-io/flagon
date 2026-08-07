"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch, toast } from "@flagon/design";
import type { IntegrationCatalogEntry } from "@/lib/integrations-api";
import { updateIntegrationOptionsAction } from "./actions";

/**
 * The behavior toggles for a connected integration — how Flagon uses it, kept
 * separate from the credentials. Each switch is a capability the org turns on or
 * off (e.g. Twilio: SMS pages, voice calls). Saves on toggle, optimistic with
 * rollback, exactly like the org security switches.
 */
export function IntegrationOptions({
  slug,
  entry,
  canManage,
}: {
  slug: string;
  entry: IntegrationCatalogEntry;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const stored = (entry.integration?.config?.options ?? {}) as Record<string, boolean>;
  const [values, setValues] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    for (const o of entry.options) {
      seed[o.key] = typeof stored[o.key] === "boolean" ? stored[o.key] : o.default;
    }
    return seed;
  });

  function toggle(key: string, next: boolean) {
    if (!canManage) return;
    const previous = values[key];
    setValues((v) => ({ ...v, [key]: next }));
    start(async () => {
      const res = await updateIntegrationOptionsAction(slug, entry.key, { [key]: next });
      if (res.error) {
        setValues((v) => ({ ...v, [key]: previous }));
        toast.error("Couldn't update", res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col divide-y divide-white/8">
      {entry.options.map((o) => (
        <div key={o.key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="text-sm text-zinc-100">{o.label}</p>
            {o.help ? <p className="mt-0.5 text-xs text-zinc-500">{o.help}</p> : null}
          </div>
          <Switch
            checked={values[o.key] ?? o.default}
            onCheckedChange={(next) => toggle(o.key, next)}
            disabled={!canManage || pending}
            ariaLabel={o.label}
          />
        </div>
      ))}
    </div>
  );
}
