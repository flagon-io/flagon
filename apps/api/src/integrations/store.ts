import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { withOrg } from "../db/tenant.js";
import { orgIntegrations } from "../db/schema.js";
import {
  decryptSecretJson,
  encryptSecretJson,
  lastFour,
} from "../lib/crypto/secret-box.js";
import {
  capabilityEnabled,
  defaultOptions,
  getProvider,
  mergeOptions,
  type IntegrationCapability,
  type IntegrationProvider,
  type NormalizedConfig,
} from "./providers.js";

/**
 * Persistence for BYO integrations. Everything secret is encrypted here on the
 * way in (encryptSecretJson) and only ever decrypted for actual use
 * (loadCredentials / findCapable) — the console-facing serializer NEVER touches
 * the ciphertext, so a secret cannot leak through the API by mistake.
 *
 * org_integrations is an RLS tenant table, so every query runs inside
 * withOrg(orgId): a forgotten org filter fails closed to zero rows.
 */

type Row = typeof orgIntegrations.$inferSelect;

/** The safe, console-facing view of a configured integration. No secrets. */
export type IntegrationView = {
  provider: string;
  status: string;
  connected: boolean;
  config: Record<string, unknown>;
  hints: Record<string, string>;
  lastError: string | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function serializeIntegration(row: Row): IntegrationView {
  return {
    provider: row.provider,
    status: row.status,
    connected: Boolean(row.secretCiphertext) && row.status !== "disabled",
    config: row.config,
    hints: row.hints,
    lastError: row.lastError,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Masked last-4 hints for each secret field, for console display. */
function hintsFor(provider: IntegrationProvider, secrets: Record<string, string>) {
  const hints: Record<string, string> = {};
  for (const f of provider.fields) {
    if (f.secret && secrets[f.key]) hints[f.key] = lastFour(secrets[f.key]);
  }
  return hints;
}

/** All configured integrations for an org (secret-free views). */
export async function listIntegrations(orgId: string): Promise<IntegrationView[]> {
  const rows = await withOrg(orgId, (tx) =>
    tx.select().from(orgIntegrations).where(eq(orgIntegrations.organizationId, orgId)),
  );
  return rows.map(serializeIntegration);
}

/** One org's configured integration for a provider, or null. */
export async function getIntegration(
  orgId: string,
  provider: string,
): Promise<IntegrationView | null> {
  const [row] = await withOrg(orgId, (tx) =>
    tx
      .select()
      .from(orgIntegrations)
      .where(
        and(
          eq(orgIntegrations.organizationId, orgId),
          eq(orgIntegrations.provider, provider),
        ),
      )
      .limit(1),
  );
  return row ? serializeIntegration(row) : null;
}

/**
 * Create or replace an org's credentials for a provider. Secrets are encrypted;
 * `config` + masked `hints` are stored in the clear for display. `status` and
 * the test diagnostics reflect the connection test the caller just ran.
 */
export async function saveIntegration(opts: {
  orgId: string;
  provider: IntegrationProvider;
  values: NormalizedConfig;
  actorUserId: string | null;
  test: { ok: boolean; message?: string };
}): Promise<IntegrationView> {
  const { orgId, provider, values, actorUserId, test } = opts;
  const secretCiphertext = encryptSecretJson(values.secrets);
  const hints = hintsFor(provider, values.secrets);
  const now = new Date();
  const status = test.ok ? "connected" : "error";
  const lastError = test.ok ? null : (test.message ?? "Connection test failed.");

  const row = await withOrg(orgId, async (tx) => {
    // Behavior options are the org's choice, not part of credentials: preserve
    // them across a credentials update, and seed defaults on first connect.
    const [existing] = await tx
      .select({ config: orgIntegrations.config })
      .from(orgIntegrations)
      .where(
        and(
          eq(orgIntegrations.organizationId, orgId),
          eq(orgIntegrations.provider, provider.key),
        ),
      )
      .limit(1);
    const options = existing
      ? mergeOptions(provider, existing.config, {})
      : defaultOptions(provider);
    const config = { ...values.config, options };

    const [saved] = await tx
      .insert(orgIntegrations)
      .values({
        organizationId: orgId,
        provider: provider.key,
        status,
        config,
        hints,
        secretCiphertext,
        lastError,
        lastTestedAt: now,
        createdByUserId: actorUserId,
      })
      .onConflictDoUpdate({
        target: [orgIntegrations.organizationId, orgIntegrations.provider],
        set: { status, config, hints, secretCiphertext, lastError, lastTestedAt: now, updatedAt: now },
      })
      .returning();
    return saved;
  });
  return serializeIntegration(row);
}

/**
 * Update an integration's behavior options (how Flagon uses it), leaving the
 * credentials untouched. Unknown option keys are ignored. Returns the refreshed
 * view, or null if the integration isn't configured.
 */
export async function updateOptions(
  orgId: string,
  provider: IntegrationProvider,
  updates: Record<string, boolean>,
): Promise<IntegrationView | null> {
  const now = new Date();
  const row = await withOrg(orgId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(orgIntegrations)
      .where(
        and(
          eq(orgIntegrations.organizationId, orgId),
          eq(orgIntegrations.provider, provider.key),
        ),
      )
      .limit(1);
    if (!existing) return null;
    const options = mergeOptions(provider, existing.config, updates);
    const config = { ...existing.config, options };
    const [saved] = await tx
      .update(orgIntegrations)
      .set({ config, updatedAt: now })
      .where(eq(orgIntegrations.id, existing.id))
      .returning();
    return saved;
  });
  return row ? serializeIntegration(row) : null;
}

/** Record the outcome of a connection test against an already-saved integration. */
export async function recordTest(
  orgId: string,
  provider: string,
  test: { ok: boolean; message?: string },
): Promise<IntegrationView | null> {
  const now = new Date();
  const [row] = await withOrg(orgId, (tx) =>
    tx
      .update(orgIntegrations)
      .set({
        status: test.ok ? "connected" : "error",
        lastError: test.ok ? null : (test.message ?? "Connection test failed."),
        lastTestedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(orgIntegrations.organizationId, orgId),
          eq(orgIntegrations.provider, provider),
        ),
      )
      .returning(),
  );
  return row ? serializeIntegration(row) : null;
}

/** Remove an org's integration for a provider. Returns whether a row was deleted. */
export async function deleteIntegration(
  orgId: string,
  provider: string,
): Promise<boolean> {
  const rows = await withOrg(orgId, (tx) =>
    tx
      .delete(orgIntegrations)
      .where(
        and(
          eq(orgIntegrations.organizationId, orgId),
          eq(orgIntegrations.provider, provider),
        ),
      )
      .returning({ id: orgIntegrations.id }),
  );
  return rows.length > 0;
}

/** Decrypted credentials for internal use (delivery). null if not configured. */
export async function loadCredentials(
  orgId: string,
  provider: string,
): Promise<NormalizedConfig | null> {
  const [row] = await withOrg(orgId, (tx) =>
    tx
      .select()
      .from(orgIntegrations)
      .where(
        and(
          eq(orgIntegrations.organizationId, orgId),
          eq(orgIntegrations.provider, provider),
        ),
      )
      .limit(1),
  );
  if (!row?.secretCiphertext || row.status === "disabled") return null;
  return {
    config: row.config as Record<string, string>,
    secrets: decryptSecretJson(row.secretCiphertext),
  };
}

/**
 * The first connected provider for this org that offers a capability (e.g.
 * "sms"), with decrypted credentials ready to use. Used by delivery paths like
 * incident paging to answer "does this org have a way to send an SMS?".
 */
export async function findCapable(
  orgId: string,
  capability: IntegrationCapability,
): Promise<{ provider: IntegrationProvider; values: NormalizedConfig } | null> {
  const rows = await withOrg(orgId, (tx) =>
    tx.select().from(orgIntegrations).where(eq(orgIntegrations.organizationId, orgId)),
  );
  for (const row of rows) {
    if (!row.secretCiphertext || row.status !== "connected") continue;
    const provider = getProvider(row.provider);
    // Honor the org's on/off choice, not just what the provider CAN do.
    if (!provider || !capabilityEnabled(provider, row.config, capability)) continue;
    return {
      provider,
      values: {
        config: row.config as Record<string, string>,
        secrets: decryptSecretJson(row.secretCiphertext),
      },
    };
  }
  return null;
}
