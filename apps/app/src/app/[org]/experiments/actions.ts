"use server";

import { revalidatePath } from "next/cache";
import { getFlag } from "@/lib/flags-api";
import {
  createExperiment,
  updateExperiment,
  setExperimentMetrics,
  experimentLifecycle,
  decideExperiment,
  deleteExperiment,
  createMetric,
  updateMetric,
  deleteMetric,
  createHoldout,
  updateHoldout,
  deleteHoldout,
  type CreateExperimentBody,
  type ExperimentDecision,
  type HoldoutBody,
  type MetricBody,
  type MetricRole,
} from "@/lib/experiments-api";

/**
 * Server actions for the experiments surface. Thin wrappers over the /v1 client:
 * authorization lives in the API (these just forward the session cookie and
 * surface errors), and each revalidates the affected console path.
 */

/** The variants of a flag, for populating the control-arm picker after a flag is chosen. */
export async function getFlagVariantsAction(
  slug: string,
  flagKey: string,
): Promise<{ key: string; label: string | null }[]> {
  const detail = await getFlag(slug, flagKey);
  if (!detail) return [];
  return detail.variants.map((v) => ({ key: v.key, label: v.label }));
}

export async function createExperimentAction(
  slug: string,
  body: CreateExperimentBody,
): Promise<{ key?: string; error?: string }> {
  const res = await createExperiment(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/experiments`);
  return { key: res.data?.experiment.key };
}

export async function updateExperimentAction(
  slug: string,
  key: string,
  body: Parameters<typeof updateExperiment>[2],
): Promise<{ error?: string }> {
  const res = await updateExperiment(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/experiments/${key}`);
  return {};
}

export async function setExperimentMetricsAction(
  slug: string,
  key: string,
  metrics: { key: string; role: MetricRole }[],
): Promise<{ error?: string }> {
  const res = await setExperimentMetrics(slug, key, metrics);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/experiments/${key}`);
  return {};
}

export async function experimentLifecycleAction(
  slug: string,
  key: string,
  action: "start" | "stop",
): Promise<{ error?: string }> {
  const res = await experimentLifecycle(slug, key, action);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/experiments/${key}`);
  revalidatePath(`/${slug}/experiments`);
  return {};
}

export async function decideExperimentAction(
  slug: string,
  key: string,
  decision: ExperimentDecision,
): Promise<{ error?: string }> {
  const res = await decideExperiment(slug, key, decision);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/experiments/${key}`);
  // A decision can stop a running experiment, so the list's status is stale too.
  revalidatePath(`/${slug}/experiments`);
  return {};
}

export async function deleteExperimentAction(
  slug: string,
  key: string,
): Promise<{ error?: string }> {
  const res = await deleteExperiment(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/experiments`);
  return {};
}

// --- Metrics -----------------------------------------------------------------
export async function createMetricAction(
  slug: string,
  body: MetricBody,
): Promise<{ key?: string; error?: string }> {
  const res = await createMetric(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/experiments/metrics`);
  return { key: res.data?.metric.key };
}

export async function updateMetricAction(
  slug: string,
  key: string,
  body: MetricBody,
): Promise<{ error?: string }> {
  const res = await updateMetric(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/experiments/metrics`);
  return {};
}

export async function deleteMetricAction(
  slug: string,
  key: string,
): Promise<{ error?: string }> {
  const res = await deleteMetric(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/experiments/metrics`);
  return {};
}

// --- Holdouts ----------------------------------------------------------------
export async function createHoldoutAction(
  slug: string,
  body: HoldoutBody,
): Promise<{ key?: string; error?: string }> {
  const res = await createHoldout(slug, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/experiments/holdouts`);
  return { key: res.data?.holdout.key };
}

export async function updateHoldoutAction(
  slug: string,
  key: string,
  body: HoldoutBody,
): Promise<{ error?: string }> {
  const res = await updateHoldout(slug, key, body);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/experiments/holdouts`);
  return {};
}

export async function deleteHoldoutAction(slug: string, key: string): Promise<{ error?: string }> {
  const res = await deleteHoldout(slug, key);
  if (res.error) return { error: res.error };
  revalidatePath(`/${slug}/experiments/holdouts`);
  return {};
}
