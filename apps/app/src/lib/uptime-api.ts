import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/** Server-side client for weighted uptime + objective attainment. */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookie = (await headers()).get("cookie") ?? "";
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
}

export type ProjectUptime = {
  projectKey: string;
  name: string;
  uptimePct: number;
  weightedDowntimeSeconds: number;
  incidentCount: number;
};
export type ObjectiveAttainment = {
  key: string;
  name: string;
  label: string;
  scopeType: string;
  scopeProjectKey: string | null;
  targetPct: number;
  windowDays: number;
  measuredUptimePct: number;
  attained: boolean;
  errorBudgetPct: number;
  errorBudgetConsumedPct: number;
  errorBudgetRemainingPct: number;
  errorBudgetBurnedRatio: number;
};
export type UptimeReport = {
  windowStart: string;
  windowEnd: string;
  windowSeconds: number;
  totalServices: number;
  perProject: ProjectUptime[];
  totals: { uptimePct: number; weightedDowntimeSeconds: number; incidentCount: number };
  objectives: ObjectiveAttainment[];
};

export async function getUptime(
  slug: string,
  opts?: { window?: number; project?: string },
): Promise<UptimeReport | null> {
  const q = new URLSearchParams();
  if (opts?.window) q.set("window", String(opts.window));
  if (opts?.project) q.set("project", opts.project);
  const qs = q.toString();
  const res = await apiFetch(`/v1/orgs/${slug}/incidents/uptime${qs ? `?${qs}` : ""}`);
  if (!res.ok) return null;
  return (await res.json()) as UptimeReport;
}
