import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client.js";
import { leads } from "../../db/schema.js";
import { validationError } from "../../lib/http.js";
import { registerRoute } from "../../openapi/registry.js";

export const waitlist = new Hono();

const waitlistRequest = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

const waitlistResponse = z.object({
  accepted: z.boolean(),
});

registerRoute({
  method: "post",
  path: "/v1/waitlist",
  summary: "Join the waitlist",
  description:
    "Record an email address for early access. Submitting the same address again is a no-op success.",
  tags: ["Waitlist"],
  request: { body: waitlistRequest },
  responses: {
    200: { description: "The address is on the list.", schema: waitlistResponse },
    422: { description: "The submitted data failed validation." },
  },
});

waitlist.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = waitlistRequest.safeParse(body);

  if (!parsed.success) {
    return validationError(c, parsed.error);
  }

  // Best-effort client IP for abuse triage. Behind a proxy the real client is
  // the first entry of x-forwarded-for; fall back to x-real-ip.
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    null;

  // Re-submitting the same email is a no-op success: the unique (kind, email)
  // index turns a duplicate into "do nothing" rather than an error or a dupe
  // row, so the form can always report success without leaking who's already
  // on the list.
  await db
    .insert(leads)
    .values({
      kind: "waitlist",
      email: parsed.data.email,
      source: "waitlist-form",
      ip,
    })
    .onConflictDoNothing({ target: [leads.kind, leads.email] });

  return c.json({ accepted: true });
});
