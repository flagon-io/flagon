"use server";

import { revalidatePath } from "next/cache";
import {
  archiveFlag,
  createEntity,
  createFlag,
  createRule,
  createSdkKey,
  createSegment,
  deleteEntity,
  deleteFlag,
  deleteRule,
  deleteSegment,
  replaceRules,
  revokeSdkKey,
  setFlagEnvironment,
  updateFlagMeta,
  updateSegment,
  type FlagType,
  type Predicate,
  type Serve,
} from "@/lib/flags-api";

/**
 * Server actions for the flags UI. Each is a thin wrapper over the API client
 * (which forwards the session cookie, so the API authorizes org + membership),
 * then revalidates the affected page. Authorization lives in the API — these do
 * not re-check it, they surface its errors.
 */

export async function createFlagAction(
  slug: string,
  input: {
    slug: string;
    type: FlagType;
    description?: string | null;
    variants?: { value: unknown; label?: string | null }[];
  },
): Promise<{ key?: string; error?: string }> {
  const res = await createFlag(slug, input);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags`);
  return { key: res.data?.flag.key };
}

export async function toggleFlagEnvAction(
  slug: string,
  key: string,
  envKey: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  const res = await setFlagEnvironment(slug, key, envKey, { enabled });
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/${key}`);
  return {};
}

export async function setDefaultVariantAction(
  slug: string,
  key: string,
  envKey: string,
  defaultVariantKey: string,
): Promise<{ error?: string }> {
  const res = await setFlagEnvironment(slug, key, envKey, { defaultVariantKey });
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/${key}`);
  return {};
}

export async function setDefaultServeAction(
  slug: string,
  key: string,
  envKey: string,
  defaultServe: Serve,
): Promise<{ error?: string }> {
  const res = await setFlagEnvironment(slug, key, envKey, { defaultServe });
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/${key}`);
  return {};
}

export async function setOffVariantAction(
  slug: string,
  key: string,
  envKey: string,
  offVariantKey: string,
): Promise<{ error?: string }> {
  const res = await setFlagEnvironment(slug, key, envKey, { offVariantKey });
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/${key}`);
  return {};
}

export async function archiveFlagAction(
  slug: string,
  key: string,
  action: "archive" | "restore",
): Promise<{ error?: string }> {
  const res = await archiveFlag(slug, key, action);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags`);
  revalidatePath(`/${slug}/flags/${key}`);
  return {};
}

export async function deleteFlagAction(
  slug: string,
  key: string,
): Promise<{ error?: string }> {
  const res = await deleteFlag(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags`);
  return {};
}

export async function updateFlagMetaAction(
  slug: string,
  key: string,
  body: {
    description?: string | null;
    maintainerUserId?: string | null;
    tags?: string[];
  },
): Promise<{ error?: string }> {
  const res = await updateFlagMeta(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/${key}`);
  revalidatePath(`/${slug}/flags`);
  return {};
}

export async function createSdkKeyAction(
  slug: string,
  name: string,
  environment: string,
): Promise<{ error?: string }> {
  const res = await createSdkKey(slug, { name, environment });
  if (res.error) return { error: res.error };
  // Client keys are retrievable, so no need to surface the plaintext here; the
  // refreshed keys list renders it with a copy button.
  revalidatePath(`/${slug}/flags/keys`);
  return {};
}

export async function revokeSdkKeyAction(
  slug: string,
  id: string,
): Promise<{ error?: string }> {
  const res = await revokeSdkKey(slug, id);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/keys`);
  return {};
}

export async function createRuleAction(
  slug: string,
  key: string,
  envKey: string,
  body: { conditions: Predicate[]; serve: Serve },
): Promise<{ error?: string }> {
  const res = await createRule(slug, key, envKey, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/${key}`);
  return {};
}

export async function deleteRuleAction(
  slug: string,
  key: string,
  envKey: string,
  ruleId: string,
): Promise<{ error?: string }> {
  const res = await deleteRule(slug, key, envKey, ruleId);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/${key}`);
  return {};
}

export async function saveRulesAction(
  slug: string,
  key: string,
  envKey: string,
  rules: { conditions: Predicate[]; serve: Serve }[],
): Promise<{ error?: string }> {
  const res = await replaceRules(slug, key, envKey, rules);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/${key}`);
  return {};
}

export async function createSegmentAction(
  slug: string,
  body: { key: string; name: string; description?: string | null; conditions: Predicate[] },
): Promise<{ error?: string }> {
  const res = await createSegment(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/segments`);
  return {};
}

export async function updateSegmentAction(
  slug: string,
  key: string,
  body: { name?: string; description?: string | null; conditions?: Predicate[] },
): Promise<{ error?: string }> {
  const res = await updateSegment(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/segments/${key}`);
  return {};
}

export async function deleteSegmentAction(
  slug: string,
  key: string,
): Promise<{ error?: string }> {
  const res = await deleteSegment(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/segments`);
  return {};
}

export async function createEntityAction(
  slug: string,
  body: { key: string; label: string; attributes: { key: string; dataType: string }[] },
): Promise<{ error?: string }> {
  const res = await createEntity(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/entities`);
  return {};
}

export async function deleteEntityAction(
  slug: string,
  key: string,
): Promise<{ error?: string }> {
  const res = await deleteEntity(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/entities`);
  return {};
}
