// Keeps the auth layer's SSO provider table in step with the Go API.
//
// The API is the source of truth and the single writer for an org's OIDC/SAML
// providers (managed from the settings UI, the REST API, the agent, or MCP). The
// auth layer's SSO plugin still runs the protocol flow, and it reads providers
// from its own `sso_providers` table, so that table is now a CACHE rebuilt from
// the API's app-only internal read:
//
//   * every SSO sign-in / callback / SAML endpoint re-syncs the provider it is
//     about to use first (see the before-hook in lib/auth.ts), so a change made
//     anywhere takes effect on the next sign-in and a deleted provider stops
//     working;
//   * admin changes through the UI re-sync the org right away.
//
// Cache rows that predate API ownership (registered straight into the auth DB)
// are ADOPTED: pushed to the API's idempotent import, which takes a provider it has
// never seen, keeps one it already has, and refuses one that was deleted on
// purpose, so a stale row can never resurrect a removed provider. Rows not bound
// to a Flagon org are not org SSO and are dropped.
//
// Server-only, and free of Next imports so scripts/sso-backfill.ts can reuse it.
import { pool } from "./db";
import { internalToken } from "./internal-token";

const API_URL = process.env.FLAGON_API_URL ?? "http://localhost:8080";
const TIMEOUT_MS = 5000;

/** A failed sync. Callers on the sign-in path fail closed on it. */
export class SSOSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSOSyncError";
  }
}

/** The API's full provider configuration (internal: carries the secrets). */
export interface ProviderConfig {
  id: string;
  org_id: string;
  user_id: string;
  provider_id: string;
  type: "oidc" | "saml";
  domain: string;
  issuer: string;
  oidc?: {
    client_id: string;
    discovery_endpoint?: string;
    scopes?: string[] | null;
    pkce: boolean;
  };
  saml?: {
    entry_point: string;
    cert: string;
    audience?: string;
    want_assertions_signed: boolean;
    authn_requests_signed: boolean;
  };
  secrets: { client_secret?: string; private_key?: string };
}

export type SyncFilter = { providerId?: string; domain?: string; orgId?: string };

/** A row of the auth layer's provider table (BetterAuth's camelCase columns). */
interface CacheRow {
  id: string;
  providerId: string;
  issuer: string;
  domain: string;
  organizationId: string | null;
  userId: string;
  oidcConfig: string | null;
  samlConfig: string | null;
}

async function callApi(path: string, init: RequestInit = {}): Promise<Response> {
  let token: string;
  try {
    token = internalToken();
  } catch {
    throw new SSOSyncError("FLAGON_INTERNAL_TOKEN is not configured");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    throw new SSOSyncError(`the Flagon API is unreachable (${(e as Error).message})`);
  } finally {
    clearTimeout(timer);
  }
}

/** The authoritative, live providers matching the filter. */
export async function fetchProviderConfigs(filter: SyncFilter): Promise<ProviderConfig[]> {
  const qs = new URLSearchParams();
  if (filter.providerId) qs.set("provider_id", filter.providerId);
  if (filter.domain) qs.set("domain", filter.domain);
  if (filter.orgId) qs.set("org_id", filter.orgId);
  const res = await callApi(`/internal/sso/providers?${qs}`);
  if (!res.ok) throw new SSOSyncError(`provider read failed (${res.status})`);
  const body = (await res.json()) as { providers: ProviderConfig[] | null };
  return body.providers ?? [];
}

// --- cache row mapping ---------------------------------------------------------

function discoveryURL(issuer: string, explicit?: string): string {
  return explicit || `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;
}

/**
 * The cache row for an API provider. Deterministic (fixed key order, no clock),
 * because the plugin fingerprints the stored config at sign-in and checks it
 * again at the callback: re-syncing an unchanged provider must not change a byte.
 * OIDC endpoints are left to the plugin's runtime discovery.
 */
export function toCacheRow(c: ProviderConfig): CacheRow {
  let oidcConfig: string | null = null;
  let samlConfig: string | null = null;
  if (c.type === "oidc" && c.oidc) {
    oidcConfig = JSON.stringify({
      issuer: c.issuer,
      clientId: c.oidc.client_id,
      clientSecret: c.secrets.client_secret ?? "",
      pkce: c.oidc.pkce,
      discoveryEndpoint: discoveryURL(c.issuer, c.oidc.discovery_endpoint),
      ...(c.oidc.scopes?.length ? { scopes: c.oidc.scopes } : {}),
      overrideUserInfo: false,
    });
  }
  if (c.type === "saml" && c.saml) {
    samlConfig = JSON.stringify({
      issuer: c.issuer,
      entryPoint: c.saml.entry_point,
      cert: c.saml.cert,
      ...(c.saml.audience ? { audience: c.saml.audience } : {}),
      wantAssertionsSigned: c.saml.want_assertions_signed,
      authnRequestsSigned: c.saml.authn_requests_signed,
      ...(c.secrets.private_key ? { privateKey: c.secrets.private_key } : {}),
    });
  }
  return {
    id: c.id,
    providerId: c.provider_id,
    issuer: c.issuer,
    domain: c.domain,
    organizationId: c.org_id,
    userId: c.user_id,
    oidcConfig,
    samlConfig,
  };
}

const COLS = `id, "providerId", issuer, domain, "organizationId", "userId", "oidcConfig", "samlConfig"`;

function sameRow(a: CacheRow, b: CacheRow): boolean {
  return (
    a.id === b.id &&
    a.issuer === b.issuer &&
    a.domain === b.domain &&
    a.organizationId === b.organizationId &&
    a.userId === b.userId &&
    a.oidcConfig === b.oidcConfig &&
    a.samlConfig === b.samlConfig
  );
}

/** Write a provider into the cache, skipping the write when nothing changed. */
async function upsertCacheRow(row: CacheRow): Promise<void> {
  const { rows } = await pool.query<CacheRow>(
    `SELECT ${COLS} FROM sso_providers WHERE "providerId" = $1`,
    [row.providerId],
  );
  const current = rows[0];
  if (current && sameRow(current, row)) return;
  const values = [row.id, row.providerId, row.issuer, row.domain, row.organizationId, row.userId, row.oidcConfig, row.samlConfig];
  if (current) {
    // Re-keying a legacy row to the API's id is fine: SSO accounts reference the
    // providerId, not the row id.
    await pool.query(
      `UPDATE sso_providers SET id = $1, issuer = $3, domain = $4, "organizationId" = $5,
              "userId" = $6, "oidcConfig" = $7, "samlConfig" = $8
        WHERE "providerId" = $2`,
      values,
    );
    return;
  }
  try {
    await pool.query(`INSERT INTO sso_providers (${COLS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, values);
  } catch (e) {
    // A concurrent sign-in inserted it first; converge by updating instead.
    if ((e as { code?: string }).code !== "23505") throw e;
    await upsertCacheRow(row);
  }
}

async function deleteCacheRow(providerId: string): Promise<void> {
  await pool.query(`DELETE FROM sso_providers WHERE "providerId" = $1`, [providerId]);
}

/** Email-domain routing, matching the plugin: equal to, or a subdomain of, one of the provider's domains. */
function domainMatches(search: string, list: string): boolean {
  const s = search.trim().toLowerCase();
  if (!s) return false;
  return list
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .some((d) => s === d || s.endsWith(`.${d}`));
}

async function cacheRowsFor(filter: SyncFilter): Promise<CacheRow[]> {
  if (filter.providerId) {
    const { rows } = await pool.query<CacheRow>(`SELECT ${COLS} FROM sso_providers WHERE "providerId" = $1`, [
      filter.providerId,
    ]);
    return rows;
  }
  if (filter.orgId) {
    const { rows } = await pool.query<CacheRow>(
      `SELECT ${COLS} FROM sso_providers WHERE "organizationId" = $1`,
      [filter.orgId],
    );
    return rows;
  }
  if (filter.domain) {
    const { rows } = await pool.query<CacheRow>(`SELECT ${COLS} FROM sso_providers`);
    return rows.filter((r) => domainMatches(filter.domain!, r.domain ?? ""));
  }
  return [];
}

// --- adoption (one-time backfill of pre-API providers) -------------------------

function parseJSON(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export type AdoptOutcome = "imported" | "exists" | "deleted" | "no_org" | "unbound";

/**
 * Push one cache row to the API's idempotent import. Returns the API's outcome
 * and, when the provider is live there, its authoritative configuration.
 */
export async function adoptCacheRow(
  row: CacheRow,
): Promise<{ outcome: AdoptOutcome; provider: ProviderConfig | null }> {
  if (!row.organizationId) return { outcome: "unbound", provider: null };
  const oidc = parseJSON(row.oidcConfig);
  const saml = parseJSON(row.samlConfig);
  const type = saml && !oidc ? "saml" : "oidc";
  const body = {
    org_id: row.organizationId,
    user_id: row.userId,
    provider_id: row.providerId,
    type,
    domain: row.domain ?? "",
    issuer: row.issuer,
    ...(type === "oidc" && oidc
      ? {
          oidc: {
            client_id: str(oidc.clientId),
            client_secret: str(oidc.clientSecret),
            discovery_endpoint: str(oidc.discoveryEndpoint) || undefined,
            scopes: Array.isArray(oidc.scopes) ? oidc.scopes.filter((s) => typeof s === "string") : undefined,
            pkce: typeof oidc.pkce === "boolean" ? oidc.pkce : undefined,
          },
        }
      : {}),
    ...(type === "saml" && saml
      ? {
          saml: {
            entry_point: str(saml.entryPoint),
            cert: str(saml.cert),
            audience: str(saml.audience) || undefined,
            want_assertions_signed: saml.wantAssertionsSigned === true,
            authn_requests_signed: saml.authnRequestsSigned === true,
            private_key: str(saml.privateKey) || undefined,
          },
        }
      : {}),
  };
  const res = await callApi("/internal/sso/providers/import", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new SSOSyncError(`import of ${row.providerId} failed (${res.status})`);
  const out = (await res.json()) as { outcome: AdoptOutcome; provider?: ProviderConfig | null };
  return { outcome: out.outcome, provider: out.provider ?? null };
}

// --- reconcile ----------------------------------------------------------------

/**
 * Reconcile the cache with the API for the providers a filter covers, and return
 * the authoritative live list. Every API provider is written through; every
 * cached row the API did not return is adopted (a pre-API provider) or removed
 * (deleted, its org gone, or never an org provider). Throws SSOSyncError when the
 * API can't answer, so the sign-in path can fail closed.
 */
export async function syncSSOProviders(filter: SyncFilter): Promise<ProviderConfig[]> {
  if (!filter.providerId && !filter.domain && !filter.orgId) return [];
  const live = await fetchProviderConfigs(filter);
  for (const p of live) await upsertCacheRow(toCacheRow(p));

  const liveIds = new Set(live.map((p) => p.provider_id));
  for (const row of await cacheRowsFor(filter)) {
    if (liveIds.has(row.providerId)) continue;
    // If the API can't settle a row, this throws: the row is kept (it may be the
    // only copy of a pre-API provider) and the caller fails closed until it can.
    const adopted = await adoptCacheRow(row);
    if (adopted.provider) {
      await upsertCacheRow(toCacheRow(adopted.provider));
      if (!liveIds.has(adopted.provider.provider_id) && matchesFilter(adopted.provider, filter)) {
        live.push(adopted.provider);
        liveIds.add(adopted.provider.provider_id);
      }
    } else {
      // Deleted on purpose, org deleted (the API keeps the config for a restore),
      // org gone, or never an org provider: it must not be used.
      await deleteCacheRow(row.providerId);
    }
  }
  return live;
}

function matchesFilter(p: ProviderConfig, f: SyncFilter): boolean {
  if (f.providerId && p.provider_id !== f.providerId) return false;
  if (f.orgId && p.org_id !== f.orgId) return false;
  if (f.domain && !domainMatches(f.domain, p.domain)) return false;
  return true;
}

/**
 * One-time backfill: adopt every provider in the auth DB into the API, then
 * rewrite each cache row from the API's answer. Idempotent; safe to re-run.
 */
export async function backfillSSOProviders(): Promise<Record<AdoptOutcome | "failed", number>> {
  const tally: Record<AdoptOutcome | "failed", number> = {
    imported: 0,
    exists: 0,
    deleted: 0,
    no_org: 0,
    unbound: 0,
    failed: 0,
  };
  const { rows } = await pool.query<CacheRow>(`SELECT ${COLS} FROM sso_providers ORDER BY "providerId"`);
  for (const row of rows) {
    try {
      const { outcome, provider } = await adoptCacheRow(row);
      tally[outcome]++;
      if (provider) await upsertCacheRow(toCacheRow(provider));
      else console.log(`[sso-backfill] ${row.providerId}: ${outcome}; left in place (the next sign-in removes it)`);
    } catch (e) {
      tally.failed++;
      console.error(`[sso-backfill] ${row.providerId}: failed`, e);
    }
  }
  return tally;
}
