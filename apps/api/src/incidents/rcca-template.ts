import { eq } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { rccaTemplates, type RccaField } from "../db/schema.js";

/**
 * The STANDARD RCCA template every org starts with (customizable afterward). A
 * classic root-cause writeup: cause, contributing factors, impact, resolution,
 * lessons. Orgs edit the fields + which severities require an RCCA.
 */
export const STANDARD_RCCA_FIELDS: RccaField[] = [
  { key: "root_cause", label: "Root cause", description: "What caused the incident.", required: true },
  { key: "contributing_factors", label: "Contributing factors", description: "What made it worse or harder to resolve.", required: false },
  { key: "impact", label: "Impact", description: "Who and what was affected, and for how long.", required: false },
  { key: "resolution", label: "Resolution", description: "How the incident was resolved.", required: false },
  { key: "lessons", label: "Lessons learned", description: "What we'll change to prevent a recurrence.", required: false },
];
export const DEFAULT_REQUIRED_SEVERITIES = ["sev1", "sev2"];

/** Get the org's RCCA template, creating it from the standard default on first use. */
export async function ensureRccaTemplate(tx: TenantTx, orgId: string) {
  const existing = await tx.select().from(rccaTemplates).where(eq(rccaTemplates.organizationId, orgId)).limit(1).then((r) => r[0]);
  if (existing) return existing;
  const [row] = await tx
    .insert(rccaTemplates)
    .values({ organizationId: orgId, requiredSeverities: DEFAULT_REQUIRED_SEVERITIES, fields: STANDARD_RCCA_FIELDS })
    .returning();
  return row;
}
