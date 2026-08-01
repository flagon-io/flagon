import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client.js";
import { leads } from "../../db/schema.js";
import { clientIp, validationError } from "../../lib/http.js";
import { rateLimit, tooManyRequests } from "../../lib/rate-limit.js";
import { registerRoute } from "../../openapi/registry.js";

export const contact = new Hono();

const contactRequest = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  name: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  message: z.string().trim().max(4000).optional(),
});

const contactResponse = z.object({
  accepted: z.boolean(),
});

registerRoute({
  method: "post",
  path: "/v1/contact",
  summary: "Contact sales",
  description:
    "Record an enterprise/sales inquiry (from the marketing site's contact form). Re-submitting from the same address updates the existing inquiry.",
  tags: ["Waitlist"],
  request: { body: contactRequest },
  responses: {
    200: { description: "The inquiry was recorded.", schema: contactResponse },
    422: { description: "The submitted data failed validation." },
    429: { description: "Too many submissions from this source; retry later." },
  },
});

contact.post("/", async (c) => {
  // Public, unauthenticated write: throttle by source before parsing so a flood
  // of junk bodies is turned away just the same. (Mirrors the waitlist route.)
  const ip = clientIp(c);
  const limit = await rateLimit({
    key: `contact:${ip}`,
    limit: 10,
    windowSeconds: 600,
  });
  if (!limit.ok) return tooManyRequests(c, limit);

  const body = await c.req.json().catch(() => null);
  const parsed = contactRequest.safeParse(body);
  if (!parsed.success) {
    return validationError(c, parsed.error);
  }

  const { email, name, company, message } = parsed.data;
  const row = {
    name: name ?? null,
    company: company ?? null,
    message: message ?? null,
    ip: ip === "unknown" ? null : ip,
  };

  // One row per (kind, email): a repeat inquiry refreshes the details and
  // re-opens it for triage rather than piling up duplicate rows.
  await db
    .insert(leads)
    .values({ kind: "sales", email, source: "enterprise-form", ...row })
    .onConflictDoUpdate({
      target: [leads.kind, leads.email],
      set: { ...row, status: "new" },
    });

  return c.json({ accepted: true });
});
