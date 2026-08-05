import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";
import type { Settlement } from "./org-lifecycle-shared";

/**
 * Organization lifecycle client: the settlement-gated SOFT delete. All the money
 * logic (cancel the subscription, invoice accrued usage, collect open invoices)
 * lives in the API; these just relay, cookie-forwarded, and carry the settlement
 * snapshot back so the Danger Zone can say exactly what's owed.
 *
 * NOTE: the `Settlement` type + `ORG_RETENTION_DAYS` live in the client-safe
 * ./org-lifecycle-shared so client components can import them without dragging
 * this server-only module (next/headers) into the browser bundle.
 */
export type { Settlement } from "./org-lifecycle-shared";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookie = (await headers()).get("cookie") ?? "";
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
}

/** The read-only settlement snapshot for the Danger Zone preview (null on error). */
export async function getOrgSettlement(slug: string): Promise<Settlement | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/lifecycle/settlement`);
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { settlement?: Settlement } | null;
  return body?.settlement ?? null;
}

export type DeleteOrgResult = {
  deleted: boolean;
  /** The settlement after the attempt — present on both success and a 402 block. */
  settlement: Settlement | null;
  error?: string;
};

/**
 * Settle + SOFT-delete the org. Returns deleted:true on success; on a 402 the
 * error explains what's still owed and `settlement` carries the remaining balance.
 */
export async function deleteOrg(slug: string): Promise<DeleteOrgResult> {
  const res = await apiFetch(`/v1/orgs/${slug}/lifecycle/delete`, { method: "POST" });
  const body = (await res.json().catch(() => null)) as
    | { deleted?: boolean; settlement?: Settlement; errorDetails?: string; message?: string }
    | null;
  if (res.ok) return { deleted: true, settlement: body?.settlement ?? null };
  return {
    deleted: false,
    settlement: body?.settlement ?? null,
    error: body?.errorDetails ?? body?.message ?? `Could not delete the organization (${res.status}).`,
  };
}

// --- FUTURE WORK (not built yet) — retention, hard-delete purge, churn view ---
//
// SOFT delete only sets organizations.deleted_at. Two follow-ups are deliberately
// NOT implemented and are notated here as the anchor for that work:
//
// 1. HARD-DELETE / PURGE CRON. After ORG_RETENTION_DAYS a cron should permanently
//    erase soft-deleted orgs. It MUST first cascade the API-side tenant data
//    (flags, experiments, usage_events, exposures, etc.) which lives in the
//    separate apps/api pipeline with NO foreign key to the auth `organizations`
//    row — otherwise erasing the org here orphans that data. Wire it to a
//    CRON_SECRET-gated Vercel cron (e.g. /api/cron/purge-orgs) + a manual script.
//    Until it exists, soft-deleted rows persist forever (harmless, just accumulate).
//
// 2. CHURN / CANCELLED-CUSTOMER VISIBILITY. Because soft-deleted orgs are RETAINED,
//    "who cancelled" is queryable today: organizations WHERE deleted_at IS NOT NULL
//    (with deleted_by_user_id, subscription_status='canceled', and Stripe's own
//    invoice history for the financials). A first-class operator view over this
//    belongs in the separate sudo app (owner-role gated), not this console.
//
// ORG_RETENTION_DAYS lives in ./org-lifecycle-shared (client-safe).
