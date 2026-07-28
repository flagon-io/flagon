import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Leads: the marketing surface's capture table.
 *
 * One table for every "leave us your details" form, distinguished by `kind`
 * ('waitlist' today; 'enterprise'/contact-sales later). Deliberately a plain
 * global table, NOT a tenant resource: it is written before anyone has an
 * account, by the public marketing site, and read by internal tooling as the
 * owner. So it carries no RLS. `status` is the internal workflow column.
 *
 * `name`/`company` are nullable because the waitlist only collects an email;
 * the contact-sales form will fill them in when that kind lands.
 *
 * When the first TENANT-scoped tables arrive, they must instead enable RLS and
 * grant the app role explicitly (see db/README or the owner/app role split in
 * migrate.ts) — this table is the exception, not the template.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull().default("waitlist"),
    email: text("email").notNull(),
    name: text("name"),
    company: text("company"),
    message: text("message"),
    /** Where the submission came from, e.g. "waitlist-form". */
    source: text("source"),
    /** Best-effort client IP, for abuse triage. */
    ip: text("ip"),
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One row per email per kind: re-submitting the waitlist is idempotent
    // rather than piling up duplicate rows. Emails are lower-cased at the edge
    // (see the route's zod schema) so this is a true case-insensitive unique.
    uniqueIndex("leads_kind_email_key").on(t.kind, t.email),
    index("leads_status_idx").on(t.status),
    index("leads_created_at_idx").on(t.createdAt),
    index("leads_ip_created_at_idx").on(t.ip, t.createdAt),
  ],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;

/**
 * Rate-limit counters: a fixed-window request limiter keyed by an opaque string
 * (e.g. `waitlist:<ip>`, `auth-fail:<ip>`). One row per key; each check is a
 * single atomic upsert that resets the window when it has elapsed and otherwise
 * increments the count (see lib/rate-limit.ts).
 *
 * Like `leads`, this is a global OPERATIONAL table, not tenant data, so it
 * carries no RLS; the migration grants the app role the read/write it needs.
 * `window_start` marks the START of the current window.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type RateLimitRow = typeof rateLimits.$inferSelect;

/** Everything the migrator and query layer should know about. */
export const schema = { leads, rateLimits };

// Re-exported so callers can build raw fragments without importing drizzle-orm
// directly; keeps the db surface in one place.
export { sql };
