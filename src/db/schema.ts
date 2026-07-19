import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";

/**
 * Typed query layer. Mirrors drizzle/0000_init.sql. Row-level security,
 * FORCE RLS, policies, and grants are defined in the SQL migrations (they need
 * more control than the schema DSL exposes); this file is the query surface.
 */

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("projects_organization_id_key_unique").on(t.organizationId, t.key),
    index("projects_organization_id_idx").on(t.organizationId),
  ],
);

export const schema = { organizations, projects };
