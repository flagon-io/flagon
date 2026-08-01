"use server";

import { revalidatePath } from "next/cache";
import {
  archiveFlag,
  createFlag,
  createRule,
  createSdkKey,
  createSegment,
  createVariant,
  deleteFlag,
  deleteRule,
  deleteSegment,
  deleteVariant,
  getFlag,
  replaceRules,
  revokeSdkKey,
  setFlagEnvironment,
  updateFlagMeta,
  updateSdkKey,
  updateSegment,
  updateVariant,
  type FlagEnvConfig,
  type FlagType,
  type Predicate,
  type Serve,
} from "@/lib/flags-api";

/**
 * After an environment mutation, fetch just the updated env config so the caller
 * can patch it into client state WITHOUT triggering a full-page revalidate (which
 * re-fetches the flag AND segments/members/entities/usage — five requests for a
 * one-field change). One targeted read instead. Returns undefined if the read
 * fails, in which case the client falls back to router.refresh().
 */
async function envAfter(
  slug: string,
  key: string,
  envKey: string,
): Promise<FlagEnvConfig | undefined> {
  const detail = await getFlag(slug, key);
  return detail?.environments.find((e) => e.key === envKey);
}

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
): Promise<{ env?: FlagEnvConfig; error?: string }> {
  const res = await setFlagEnvironment(slug, key, envKey, { defaultServe });
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags`);
  return { env: await envAfter(slug, key, envKey) };
}

/**
 * Set a multivariate flag's "state" in one environment from the segmented
 * control: either off (enabled:false, serves the off value) or a served variant
 * (enabled:true + that variant as the default serve), in a single atomic PATCH.
 */
export async function setFeatureStateAction(
  slug: string,
  key: string,
  envKey: string,
  body: { enabled: boolean; defaultServe?: Serve },
): Promise<{ env?: FlagEnvConfig; error?: string }> {
  const res = await setFlagEnvironment(slug, key, envKey, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags`);
  return { env: await envAfter(slug, key, envKey) };
}

/**
 * Switch an environment's evaluation MODE in one shot: a static value (Off / On /
 * a variant), Custom Rules, or Reuse-another-environment. These are the four
 * mutually-exclusive ways a flag can evaluate in an env. Switching to a static
 * value or to Reuse clears any targeting rules (they no longer apply); pass
 * `clearRules` for that. `reuseSourceEnvironmentKey` is a key to start reusing, or
 * null to stop.
 */
export async function setEnvModeAction(
  slug: string,
  key: string,
  envKey: string,
  patch: {
    enabled?: boolean;
    defaultServe?: Serve;
    reuseSourceEnvironmentKey?: string | null;
  },
  opts: { clearRules?: boolean } = {},
): Promise<{ env?: FlagEnvConfig; error?: string }> {
  if (opts.clearRules) {
    const cleared = await replaceRules(slug, key, envKey, []);
    if (cleared.error) return { error: cleared.error };
  }
  const res = await setFlagEnvironment(slug, key, envKey, patch);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags`);
  return { env: await envAfter(slug, key, envKey) };
}

export async function createVariantAction(
  slug: string,
  key: string,
  body: { value: unknown; label?: string | null },
): Promise<{ error?: string }> {
  const res = await createVariant(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/${key}`);
  return {};
}

export async function updateVariantAction(
  slug: string,
  key: string,
  variantKey: string,
  body: { value?: unknown; label?: string | null },
): Promise<{ error?: string }> {
  const res = await updateVariant(slug, key, variantKey, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags/${key}`);
  return {};
}

export async function deleteVariantAction(
  slug: string,
  key: string,
  variantKey: string,
): Promise<{ error?: string }> {
  const res = await deleteVariant(slug, key, variantKey);
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

export async function updateSdkKeyAction(
  slug: string,
  id: string,
  name: string,
): Promise<{ error?: string }> {
  const res = await updateSdkKey(slug, id, { name });
  if (res.error) return { error: res.error };
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
  rules: { conditions: Predicate[]; serve: Serve; description?: string | null }[],
): Promise<{ env?: FlagEnvConfig; error?: string }> {
  const res = await replaceRules(slug, key, envKey, rules);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/flags`);
  return { env: await envAfter(slug, key, envKey) };
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

