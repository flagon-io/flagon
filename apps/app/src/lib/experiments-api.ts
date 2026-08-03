import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/**
 * Server-side client for the Flagon API's experiments surface (experiments + the
 * reusable goal metrics they measure). Like flags-api, the console never writes
 * directly — it drives the same /v1 endpoints (API-first parity), forwarding the
 * caller's session cookie so identity + membership gate every call server-side.
 */

export type MetricType = "conversion" | "count" | "mean" | "sum";
export type MetricDirection = "increase" | "decrease";
export type MetricRole = "primary" | "secondary" | "guardrail";
export type Correction = "none" | "bonferroni" | "bh";
export type ExperimentStatus = "draft" | "running" | "stopped" | "archived";
export type ExperimentDecision = "ship" | "rollback" | "inconclusive";

export type ExperimentMetric = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: MetricType;
  eventName: string;
  valueField: string | null;
  direction: MetricDirection;
  createdAt: string;
  updatedAt: string;
};

export type Experiment = {
  id: string;
  key: string;
  name: string;
  hypothesis: string | null;
  flag: string | null;
  environment: string | null;
  status: ExperimentStatus;
  controlVariantKey: string | null;
  allocation: number;
  bucketBy: string | null;
  confidenceLevel: number;
  sequential: boolean;
  correction: Correction;
  cuped: boolean;
  primaryMetric: string | null;
  metrics: { key: string; name: string; role: MetricRole }[];
  decision: ExperimentDecision | null;
  startedAt: string | null;
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VariantAnalysis = {
  variantKey: string;
  isControl: boolean;
  units: number;
  estimate: number;
  ciLow: number;
  ciHigh: number;
  absoluteLift: number | null;
  relativeLift: number | null;
  relativeLiftCiLow: number | null;
  relativeLiftCiHigh: number | null;
  pValue: number | null;
  probabilityToBeatControl: number | null;
  significant: boolean;
  sequentialPValue: number | null;
  sequentialCiLow: number | null;
  sequentialCiHigh: number | null;
  sequentiallySignificant: boolean;
};

export type CupedInfo = { applied: boolean; theta: number; varianceReduction: number };

export type MetricAnalysis = {
  family: "conversion" | "continuous";
  direction: MetricDirection;
  confidence: number;
  variants: VariantAnalysis[];
  srm: { chiSquare: number; pValue: number; healthy: boolean } | null;
  cuped?: CupedInfo;
};

export type ExperimentPower = {
  mde: number;
  baseline: number;
  requiredPerArm: number;
  currentPerArm: number;
};

export type ExperimentResults = {
  experimentId: string;
  status: ExperimentStatus;
  controlVariantKey: string | null;
  totalUnits: number;
  retentionDays: number | null;
  analysisConfig: {
    confidenceLevel: number;
    sequential: boolean;
    correction: Correction;
    cuped: boolean;
  };
  power: ExperimentPower | null;
  metrics: {
    metricKey: string;
    metricName: string;
    metricType: MetricType;
    role: MetricRole;
    direction: MetricDirection;
    analysis: MetricAnalysis;
  }[];
};

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookie = (await headers()).get("cookie") ?? "";
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
}

async function unwrap<T>(res: Response): Promise<{ data?: T; error?: string }> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { error: (body?.message as string) ?? `Request failed (${res.status}).` };
  }
  return { data: body as T };
}

// --- Reads -------------------------------------------------------------------
export async function listExperiments(slug: string): Promise<Experiment[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiments`);
  if (!res.ok) return [];
  return (await res.json()) as Experiment[];
}

export async function getExperiment(slug: string, key: string): Promise<Experiment | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiments/${key}`);
  if (!res.ok) return null;
  return ((await res.json()) as { experiment: Experiment }).experiment;
}

export async function getExperimentResults(
  slug: string,
  key: string,
): Promise<ExperimentResults | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiments/${key}/results`);
  if (!res.ok) return null;
  return (await res.json()) as ExperimentResults;
}

export type ExperimentDiagnostics = {
  arms: { variant: string; units: number }[];
  totals: { exposures: number; events: number };
  recentExposures: { unit: string; variant: string; at: string }[];
  recentEvents: { unit: string; event: string; value: number; at: string }[];
};

export async function getExperimentDiagnostics(
  slug: string,
  key: string,
): Promise<ExperimentDiagnostics | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiments/${key}/diagnostics`);
  if (!res.ok) return null;
  return (await res.json()) as ExperimentDiagnostics;
}

export async function listMetrics(slug: string): Promise<ExperimentMetric[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiment-metrics`);
  if (!res.ok) return [];
  return (await res.json()) as ExperimentMetric[];
}

export async function getMetric(slug: string, key: string): Promise<ExperimentMetric | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiment-metrics/${key}`);
  if (!res.ok) return null;
  return ((await res.json()) as { metric: ExperimentMetric }).metric;
}

// --- Writes (for server actions) --------------------------------------------
export type CreateExperimentBody = {
  key: string;
  name: string;
  hypothesis?: string | null;
  flag: string;
  environment: string;
  controlVariantKey?: string | null;
  allocation?: number;
  bucketBy?: string | null;
  confidenceLevel?: number;
  sequential?: boolean;
  correction?: Correction;
  cuped?: boolean;
  metrics?: { key: string; role: MetricRole }[];
};

export async function createExperiment(
  slug: string,
  body: CreateExperimentBody,
): Promise<{ data?: { experiment: Experiment }; error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function updateExperiment(
  slug: string,
  key: string,
  body: Partial<
    Pick<
      Experiment,
      "name" | "hypothesis" | "controlVariantKey" | "allocation" | "bucketBy" | "confidenceLevel" | "sequential" | "correction" | "cuped"
    >
  >,
): Promise<{ data?: { experiment: Experiment }; error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiments/${key}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function setExperimentMetrics(
  slug: string,
  key: string,
  metrics: { key: string; role: MetricRole }[],
): Promise<{ data?: { experiment: Experiment }; error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiments/${key}/metrics`, {
    method: "PUT",
    body: JSON.stringify({ metrics }),
  });
  return unwrap(res);
}

export async function experimentLifecycle(
  slug: string,
  key: string,
  action: "start" | "stop",
): Promise<{ data?: { experiment: Experiment }; error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiments/${key}/${action}`, { method: "POST" });
  return unwrap(res);
}

export async function decideExperiment(
  slug: string,
  key: string,
  decision: ExperimentDecision,
  stop = true,
): Promise<{ data?: { experiment: Experiment }; error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiments/${key}/decide`, {
    method: "POST",
    body: JSON.stringify({ decision, stop }),
  });
  return unwrap(res);
}

export async function deleteExperiment(
  slug: string,
  key: string,
): Promise<{ error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiments/${key}`, { method: "DELETE" });
  if (!res.ok) return unwrap(res);
  return {};
}

export type MetricBody = {
  key?: string;
  name?: string;
  description?: string | null;
  type?: MetricType;
  eventName?: string;
  valueField?: string | null;
  direction?: MetricDirection;
};

export async function createMetric(
  slug: string,
  body: MetricBody,
): Promise<{ data?: { metric: ExperimentMetric }; error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiment-metrics`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function updateMetric(
  slug: string,
  key: string,
  body: MetricBody,
): Promise<{ data?: { metric: ExperimentMetric }; error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiment-metrics/${key}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return unwrap(res);
}

export async function deleteMetric(slug: string, key: string): Promise<{ error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/experiment-metrics/${key}`, { method: "DELETE" });
  if (!res.ok) return unwrap(res);
  return {};
}

// --- Holdouts ----------------------------------------------------------------
export type Holdout = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  environment: string | null;
  percentage: number;
  status: "active" | "stopped";
  createdAt: string;
  updatedAt: string;
};

export async function listHoldouts(slug: string): Promise<Holdout[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/holdouts`);
  if (!res.ok) return [];
  return (await res.json()) as Holdout[];
}

export type HoldoutBody = {
  key?: string;
  name?: string;
  description?: string | null;
  environment?: string;
  percentage?: number;
  status?: "active" | "stopped";
};

export async function createHoldout(
  slug: string,
  body: HoldoutBody,
): Promise<{ data?: { holdout: Holdout }; error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/holdouts`, { method: "POST", body: JSON.stringify(body) });
  return unwrap(res);
}

export async function updateHoldout(
  slug: string,
  key: string,
  body: HoldoutBody,
): Promise<{ data?: { holdout: Holdout }; error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/holdouts/${key}`, { method: "PATCH", body: JSON.stringify(body) });
  return unwrap(res);
}

export async function deleteHoldout(slug: string, key: string): Promise<{ error?: string }> {
  const res = await apiFetch(`/v1/orgs/${slug}/holdouts/${key}`, { method: "DELETE" });
  if (!res.ok) return unwrap(res);
  return {};
}
