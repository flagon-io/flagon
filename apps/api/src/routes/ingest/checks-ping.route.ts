import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { organizations } from "../../db/auth-tables.js";
import { withOrg } from "../../db/tenant.js";
import { checks } from "../../db/schema.js";

/**
 * Public heartbeat ingest — a tokenized dead-man endpoint a cron/job pings on a
 * schedule. Mounted at /ingest, OUTSIDE /v1 (no session/token management auth): the
 * per-check `ping_token` in the URL is the credential. The org slug scopes the tenant (a
 * public identifier) so we can enter withOrg() and RLS lets us find the one check. Accepts
 * GET and POST so any cron tool or `curl` works.
 */
export const ingest = new Hono();

ingest.on(["GET", "POST"], "/heartbeat/:org/:token", async (c) => {
  const slug = c.req.param("org");
  const token = c.req.param("token");
  if (!slug || !token) return c.json({ error: "not found" }, 404);
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.slug, slug), isNull(organizations.deletedAt)))
    .limit(1);
  if (!org) return c.json({ error: "not found" }, 404);
  const now = new Date();
  const ok = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .update(checks)
      .set({ lastPingAt: now, updatedAt: now })
      .where(and(eq(checks.pingToken, token), eq(checks.type, "heartbeat")))
      .returning({ id: checks.id });
    return Boolean(row);
  });
  if (!ok) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});
