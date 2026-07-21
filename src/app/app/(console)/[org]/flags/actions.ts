"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createFlag, deleteFlag, updateFlag } from "@/lib/flags.server";
import {
  coerceValue,
  defaultVariants,
  FLAG_TYPES,
  type FlagType,
  type TargetingRule,
  type Variant,
} from "@/lib/flags";
import { resolveOrg } from "../resolve-org";
import { appPath } from "@/lib/urls";

const refresh = (slug: string) => revalidatePath("/app/" + slug + "/flags");

export async function createFlagAction(orgSlug: string, form: FormData) {
  const org = await resolveOrg(orgSlug);
  if (!org) return;
  const requested = String(form.get("type") ?? "boolean");
  const type: FlagType = FLAG_TYPES.includes(requested as FlagType)
    ? (requested as FlagType)
    : "boolean";
  const raw = String(form.get("default_value") ?? "");
  let variants: Variant[];
  let defaultVariant: string;
  try {
    if (type === "boolean") {
      variants = defaultVariants(type);
      defaultVariant = raw === "true" ? "on" : "off";
    } else {
      // Non-boolean flags submit the full variant table (variant-rows.tsx).
      // Values arrive RAW and are coerced here, so the string "12" becomes an
      // integer for an integer flag and stays a string for a string flag,
      // through the same coercion the definition editor and the API use.
      const drafts = JSON.parse(String(form.get("variants") ?? "[]")) as Array<{
        key?: unknown;
        raw?: unknown;
        label?: unknown;
      }>;
      variants = drafts
        .filter((draft) => String(draft?.key ?? "").trim())
        .map((draft) => {
          const key = String(draft.key).trim();
          const value = String(draft.raw ?? "");
          const label = String(draft.label ?? "").trim();
          return {
            key,
            ...(label ? { label } : {}),
            value:
              type === "object"
                ? JSON.parse(value || "{}")
                : coerceValue(
                    type,
                    type === "integer" || type === "float"
                      ? Number(value || 0)
                      : value,
                  ),
          };
        });
      if (!variants.length) return;
      defaultVariant = String(form.get("default_variant") ?? "");
      // A fallback naming a variant that was renamed or removed after it was
      // selected would leave the flag unresolvable, so it is repaired here
      // rather than rejected: the first variant is the honest default.
      if (!variants.some((variant) => variant.key === defaultVariant))
        defaultVariant = variants[0].key;
    }
  } catch {
    return;
  }
  const result = await createFlag(org.id, {
    // No name: the form asks only for the key, because that is the string the
    // SDK is given and the one thing that cannot change later. createFlag
    // names the flag after its key, so the API and the console agree on what
    // a flag minimally needs. Renaming it later is a free, human-facing edit.
    key: String(form.get("key") ?? ""),
    description: String(form.get("description") ?? ""),
    type,
    variants,
    defaultVariant,
  });
  if (!result.ok) return;
  refresh(orgSlug);
  redirect(appPath(`/${orgSlug}/flags/${result.flag.key}`));
}

export async function setDefaultVariantAction(
  orgSlug: string,
  key: string,
  variant: string,
) {
  const org = await resolveOrg(orgSlug);
  if (!org) return;
  await updateFlag(org.id, key, { defaultVariant: variant });
  refresh(orgSlug);
}

export async function saveFlagDefinitionAction(
  orgSlug: string,
  key: string,
  form: FormData,
) {
  const org = await resolveOrg(orgSlug);
  if (!org) return;
  try {
    const variants = JSON.parse(
      String(form.get("variants") ?? "[]"),
    ) as Variant[];
    const rules = JSON.parse(
      String(form.get("rules") ?? "[]"),
    ) as TargetingRule[];
    await updateFlag(org.id, key, {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      variants,
      defaultVariant: String(form.get("default_variant") ?? ""),
      rules,
    });
  } catch {
    return;
  }
  refresh(orgSlug);
  revalidatePath("/app/" + orgSlug + "/flags/" + key);
}

export async function deleteFlagAction(
  orgSlug: string,
  key: string,
  form: FormData,
) {
  if (String(form.get("confirmation") ?? "") !== key) return;
  const org = await resolveOrg(orgSlug);
  if (!org) return;
  const deleted = await deleteFlag(org.id, key);
  refresh(orgSlug);
  if (deleted) redirect(appPath(`/${orgSlug}/flags`));
}
