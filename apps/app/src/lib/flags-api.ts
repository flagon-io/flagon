import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/**
 * Server-side client for the Flagon API's flags surface.
 *
 * The console never writes flag data directly — it drives the same /v1 endpoints
 * an SDK-less API consumer would (API-first parity: one implementation, no
 * UI-only writes). Requests forward the caller's session cookie, which the API
 * validates against the console's own /api/auth/get-session, so the user's
 * identity + membership gate every call server-side.
 */
export type FlagType = "boolean" | "string" | "number" | "json";

export type FlagSummary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: FlagType;
  permanent: boolean;
  tags: string[];
  maintainerUserId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** The value this flag currently serves in Production (list view only). */
  value?: unknown;
  /** Resolved names (list + detail). */
  createdByName?: string | null;
  maintainerName?: string | null;
  /** Compact evaluation usage (list view): checks/hr + a 14-day sparkline. */
  usage?: {
    total: number;
    checksPerHour: number;
    lastSeenAt: string | null;
    series: number[];
  } | null;
};

export type FlagRevision = {
  id: string;
  action: string;
  summary: string | null;
  /** Human-readable "from -> to" lines describing exactly what changed. */
  changes: string[];
  userName: string | null;
  createdAt: string;
};

export type Member = { userId: string; name: string; email: string; role: string };

export type FlagVariant = {
  id: string;
  key: string;
  value: unknown;
  label: string | null;
  sortOrder: number;
};

export type FlagEnvConfig = {
  key: string;
  name: string;
  enabled: boolean;
  defaultVariantKey: string | null;
  /** The default serve when enabled and no rule matches: a rollout when set,
   * else the single defaultVariantKey. */
  defaultServe: Serve | null;
  offVariantKey: string | null;
  /** The "Reuse" mode: an environment key whose config this env inherits, or null. */
  reuseSourceEnvironmentKey: string | null;
  rules: {
    id: string;
    priority: number;
    description: string | null;
    conditions: unknown;
    serve: unknown;
  }[];
};

export type FlagDetail = {
  flag: FlagSummary;
  variants: FlagVariant[];
  environments: FlagEnvConfig[];
  revisions?: FlagRevision[];
};

export type SdkKey = {
  id: string;
  name: string;
  environmentKey: string | null;
  masked: string;
  /** The full publishable key (retrievable). Null only for legacy keys. */
  token: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookie = (await headers()).get("cookie") ?? "";
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      cookie,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

/** Parse a JSON response, returning its `message` as an error when not ok. */
async function unwrap<T>(res: Response): Promise<{ data?: T; error?: string }> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { error: (body?.message as string) ?? `Request failed (${res.status}).` };
  }
  return { data: body as T };
}

// --- Reads (for server components) ------------------------------------------
export async function listFlags(
  slug: string,
  opts?: { archived?: boolean | "only" },
): Promise<FlagSummary[]> {
  const q =
    opts?.archived === "only" ? "?archived=only" : opts?.archived ? "?archived=true" : "";
  const res = await apiFetch(`/v1/orgs/${slug}/flags${q}`);
  if (!res.ok) return [];
  return (await res.json()) as FlagSummary[];
}

export async function getFlag(
  slug: string,
  key: string,
): Promise<FlagDetail | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/flags/${key}`);
  if (!res.ok) return null;
  return (await res.json()) as FlagDetail;
}

export type FlagUsageEnv = {
  key: string;
  name: string;
  total: number;
  lastSeenAt: string | null;
  variants: { key: string; count: number }[];
  series: { day: string; count: number }[];
};

export type FlagUsage = {
  total: number;
  lastSeenAt: string | null;
  environments: FlagUsageEnv[];
};

export async function getFlagUsage(
  slug: string,
  key: string,
): Promise<FlagUsage | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/flags/${key}/usage`);
  if (!res.ok) return null;
  return (await res.json()).usage as FlagUsage;
}

// --- Org-wide usage (the Usage page) ----------------------------------------
export type UsageGroupBy = "meter" | "flag" | "environment" | "reason";

export type UsagePoint = { start: string; usage: number; chargeCents: number };

export type UsageSeries = {
  key: string;
  label: string;
  /** The product this line rolls up under, for the invoice's per-product bands. */
  product: string;
  usage: number;
  chargeCents: number;
  /** Whether this line is charged for. Free lines render "Free" instead of a price. */
  billable: boolean;
  /** Whether Flagon records this meter yet (Events is not — its 0 is "not metered"). */
  tracked: boolean;
  unit: string;
  pricePerMillionCents: number;
  points: UsagePoint[];
};

export type OrgUsage = {
  range: { from: string; to: string };
  groupBy: UsageGroupBy;
  currency: "usd";
  /** The product these meters roll up under (the table's group header). */
  product: string;
  periods: string[];
  series: UsageSeries[];
  totals: { usage: number; billableUsage: number; chargeCents: number };
};

/**
 * The events-allowance picture for the CURRENT month (not the chart range): what
 * the plan includes, what's used, and whether the org is over. Drives the
 * allowance bar. `hardCap` is true for Hobby (over the cap, event ingest is refused)
 * and false for Pro/Enterprise (they meter/true-up), which the usage page uses to
 * choose "sending is paused" vs "upgrade to raise your limit" copy.
 */
export type Entitlement = {
  plan: string;
  overageMode: "cap" | "bill" | "contract";
  period: { from: string; to: string };
  includedEvents: number;
  usedEvents: number;
  remainingEvents: number | null;
  overageEvents: number;
  isOver: boolean;
  overageCents: number;
  hardCap: boolean;
  /** The plan's monthly usage credit in cents ($20 = 2000 for Pro; 0 otherwise). */
  creditCents: number;
  /** How much of the credit this period's usage has drawn down (capped at creditCents). */
  creditUsedCents: number;
};

export type OrgUsageResult = { usage: OrgUsage; entitlement: Entitlement };

/**
 * Org-wide evaluation usage for the usage page, priced through the API's meter
 * registry. `from`/`to` are YYYY-MM-DD (default the trailing 30 days server-side);
 * `groupBy` splits the series by environment (default) or flag.
 */
export async function getOrgUsage(
  slug: string,
  opts?: { from?: string; to?: string; groupBy?: UsageGroupBy },
): Promise<OrgUsageResult | null> {
  const q = new URLSearchParams();
  if (opts?.from) q.set("from", opts.from);
  if (opts?.to) q.set("to", opts.to);
  if (opts?.groupBy) q.set("groupBy", opts.groupBy);
  const qs = q.toString();
  const res = await apiFetch(`/v1/orgs/${slug}/usage${qs ? `?${qs}` : ""}`);
  if (!res.ok) return null;
  const body = (await res.json()) as OrgUsageResult;
  return { usage: body.usage, entitlement: body.entitlement };
}

export async function listSdkKeys(slug: string): Promise<SdkKey[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/client-keys`);
  if (!res.ok) return [];
  return (await res.json()) as SdkKey[];
}

export type Environment = { key: string; name: string };

/**
 * The fixed set of environments, mirroring Vercel (Production / Preview /
 * Development). These are static, so the UI renders their sections directly
 * rather than depending on an API round-trip to discover them.
 */
export const FLAG_ENVIRONMENTS: Environment[] = [
  { key: "production", name: "Production" },
  { key: "preview", name: "Preview" },
  { key: "development", name: "Development" },
];

// --- Writes (for server actions) --------------------------------------------
export async function createFlag(
  slug: string,
  body: {
    slug: string;
    type: FlagType;
    description?: string | null;
    variants?: { value: unknown; label?: string | null }[];
  },
) {
  return unwrap<{ flag: FlagSummary }>(
    await apiFetch(`/v1/orgs/${slug}/flags`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

export async function setFlagEnvironment(
  slug: string,
  key: string,
  envKey: string,
  body: {
    enabled?: boolean;
    defaultVariantKey?: string;
    offVariantKey?: string;
    defaultServe?: Serve;
    reuseSourceEnvironmentKey?: string | null;
  },
) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/flags/${key}/environments/${envKey}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

export async function createVariant(
  slug: string,
  key: string,
  body: { value: unknown; label?: string | null },
) {
  return unwrap<{ variant: FlagVariant }>(
    await apiFetch(`/v1/orgs/${slug}/flags/${key}/variants`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

export async function updateVariant(
  slug: string,
  key: string,
  variantKey: string,
  body: { value?: unknown; label?: string | null },
) {
  return unwrap<{ variant: FlagVariant }>(
    await apiFetch(`/v1/orgs/${slug}/flags/${key}/variants/${variantKey}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteVariant(slug: string, key: string, variantKey: string) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/flags/${key}/variants/${variantKey}`, {
      method: "DELETE",
    }),
  );
}

export async function archiveFlag(
  slug: string,
  key: string,
  action: "archive" | "restore",
) {
  return unwrap<{ flag: FlagSummary }>(
    await apiFetch(`/v1/orgs/${slug}/flags/${key}/${action}`, { method: "POST" }),
  );
}

export async function deleteFlag(slug: string, key: string) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/flags/${key}`, { method: "DELETE" }),
  );
}

export async function updateFlagMeta(
  slug: string,
  key: string,
  body: {
    name?: string;
    description?: string | null;
    maintainerUserId?: string | null;
    tags?: string[];
    permanent?: boolean;
  },
) {
  return unwrap<{ flag: FlagSummary }>(
    await apiFetch(`/v1/orgs/${slug}/flags/${key}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

export async function listMembers(slug: string): Promise<Member[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/members`);
  if (!res.ok) return [];
  return (await res.json()) as Member[];
}

export async function createSdkKey(
  slug: string,
  body: { name: string; environment: string },
) {
  return unwrap<{ key: SdkKey }>(
    await apiFetch(`/v1/orgs/${slug}/client-keys`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

export async function updateSdkKey(slug: string, id: string, body: { name: string }) {
  return unwrap<{ key: SdkKey }>(
    await apiFetch(`/v1/orgs/${slug}/client-keys/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

export async function revokeSdkKey(slug: string, id: string) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/client-keys/${id}/revoke`, { method: "POST" }),
  );
}

// --- Billing (Stripe lives in the API; the console just calls it) -----------
/**
 * The org's live subscription summary. `discount` is what makes a comp
 * unmistakable: a comped org carries a 100%-off coupon here, which the billing
 * page reads to say "on Pro at no charge". null summary = no Stripe subscription.
 */
export type BillingSummary = {
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  discount: {
    name: string | null;
    percentOff: number | null;
    amountOffCents: number | null;
    endsAt: string | null;
  } | null;
};

/** The org's Stripe subscription summary (status + any active discount), or null. */
export async function getBillingSummary(
  slug: string,
): Promise<BillingSummary | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/billing/summary`);
  if (!res.ok) return null;
  const body = (await res.json()) as { summary: BillingSummary | null };
  return body.summary;
}

/** Start Pro checkout (or portal, if already subscribed). Returns a Stripe URL. */
export async function startBillingCheckout(slug: string) {
  return unwrap<{ url: string }>(
    await apiFetch(`/v1/orgs/${slug}/billing/checkout`, { method: "POST" }),
  );
}

/** Open the Stripe billing portal. Returns a Stripe URL. */
export async function openBillingPortal(slug: string) {
  return unwrap<{ url: string }>(
    await apiFetch(`/v1/orgs/${slug}/billing/portal`, { method: "POST" }),
  );
}

// --- Identity writes (the API owns these; the console calls them) -----------
export type ApiToken = {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

type OrgSettings = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  projectCreationPolicy: string;
  logo: string | null;
};

/** Set (or clear, with null) the org's logo URL. Owner/admin. */
export async function updateOrgLogo(slug: string, logo: string | null) {
  return unwrap<{ org: OrgSettings }>(
    await apiFetch(`/v1/orgs/${slug}`, {
      method: "PATCH",
      body: JSON.stringify({ logo }),
    }),
  );
}

/** Rename an organization (name + slug). Owner/admin. */
export async function renameOrg(slug: string, body: { name: string; slug: string }) {
  return unwrap<{ org: OrgSettings }>(
    await apiFetch(`/v1/orgs/${slug}`, { method: "PATCH", body: JSON.stringify(body) }),
  );
}

/** Set who may create projects in the org ('managers' | 'members'). Owner/admin. */
export async function setProjectCreationPolicy(
  slug: string,
  policy: "managers" | "members",
) {
  return unwrap<{ org: OrgSettings }>(
    await apiFetch(`/v1/orgs/${slug}`, {
      method: "PATCH",
      body: JSON.stringify({ projectCreationPolicy: policy }),
    }),
  );
}

export async function listOrgApiTokens(slug: string): Promise<ApiToken[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/tokens`);
  if (!res.ok) return [];
  return (await res.json()) as ApiToken[];
}
export async function createOrgApiToken(slug: string, body: { name: string; expiresAt?: string }) {
  return unwrap<{ token: ApiToken & { token: string } }>(
    await apiFetch(`/v1/orgs/${slug}/tokens`, { method: "POST", body: JSON.stringify(body) }),
  );
}
export async function revokeOrgApiToken(slug: string, id: string) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/tokens/${id}/revoke`, { method: "POST" }),
  );
}

export async function listPersonalApiTokens(): Promise<ApiToken[]> {
  const res = await apiFetch(`/v1/me/tokens`);
  if (!res.ok) return [];
  return (await res.json()) as ApiToken[];
}
export async function createPersonalApiToken(body: { name: string; expiresAt?: string }) {
  return unwrap<{ token: ApiToken & { token: string } }>(
    await apiFetch(`/v1/me/tokens`, { method: "POST", body: JSON.stringify(body) }),
  );
}
export async function revokePersonalApiToken(id: string) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/me/tokens/${id}/revoke`, { method: "POST" }),
  );
}

export type ApiEmail = { email: string; verified: boolean; isPrimary: boolean; createdAt: string };
export async function listEmailsApi(): Promise<ApiEmail[]> {
  const res = await apiFetch(`/v1/me/emails`);
  if (!res.ok) return [];
  return (await res.json()) as ApiEmail[];
}
export async function addEmailApi(email: string) {
  return unwrap<{ ok: true; message: string }>(
    await apiFetch(`/v1/me/emails`, { method: "POST", body: JSON.stringify({ email }) }),
  );
}
export async function resendEmailApi(email: string) {
  return unwrap<{ ok: true; message: string }>(
    await apiFetch(`/v1/me/emails/resend`, { method: "POST", body: JSON.stringify({ email }) }),
  );
}
export async function setPrimaryEmailApi(email: string) {
  return unwrap<{ ok: true; message: string }>(
    await apiFetch(`/v1/me/emails/primary`, { method: "POST", body: JSON.stringify({ email }) }),
  );
}
export async function removeEmailApi(email: string) {
  return unwrap<{ ok: true; message: string }>(
    await apiFetch(`/v1/me/emails?email=${encodeURIComponent(email)}`, { method: "DELETE" }),
  );
}

// --- Targeting rules + segments ---------------------------------------------
export type Predicate =
  | { attribute: string; op: string; values?: unknown[] }
  | { segment: string }
  | { all: Predicate[] }
  | { any: Predicate[] };

/** A progressive (scheduled) rollout — ramps `variant` to 100% over `steps`. */
export type ProgressiveServe = {
  variant: string;
  fallback: string;
  bucketBy?: string;
  start: number;
  steps: { percent: number; durationMs: number }[];
};

export type Serve =
  | { variant: string }
  | { rollout: { variant: string; weight: number }[]; bucketBy?: string; fallback?: string }
  | { progressive: ProgressiveServe };

export type Segment = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  conditions: Predicate[];
  createdAt: string;
  updatedAt: string;
};

export async function listSegments(slug: string): Promise<Segment[]> {
  const res = await apiFetch(`/v1/orgs/${slug}/segments`);
  if (!res.ok) return [];
  return (await res.json()) as Segment[];
}

export async function createSegment(
  slug: string,
  body: { key: string; name: string; description?: string | null; conditions: Predicate[] },
) {
  return unwrap<{ segment: Segment }>(
    await apiFetch(`/v1/orgs/${slug}/segments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

export async function getSegment(slug: string, key: string): Promise<Segment | null> {
  const res = await apiFetch(`/v1/orgs/${slug}/segments/${key}`);
  if (!res.ok) return null;
  return (await res.json()).segment as Segment;
}

export async function updateSegment(
  slug: string,
  key: string,
  body: { name?: string; description?: string | null; conditions?: Predicate[] },
) {
  return unwrap<{ segment: Segment }>(
    await apiFetch(`/v1/orgs/${slug}/segments/${key}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteSegment(slug: string, key: string) {
  return unwrap<{ ok: true }>(
    await apiFetch(`/v1/orgs/${slug}/segments/${key}`, { method: "DELETE" }),
  );
}

export async function createRule(
  slug: string,
  key: string,
  envKey: string,
  body: { conditions: Predicate[]; serve: Serve; description?: string | null },
) {
  return unwrap<{ rule: unknown }>(
    await apiFetch(`/v1/orgs/${slug}/flags/${key}/environments/${envKey}/rules`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

export async function replaceRules(
  slug: string,
  key: string,
  envKey: string,
  rules: { conditions: Predicate[]; serve: Serve; description?: string | null }[],
) {
  return unwrap<{ rules: unknown[] }>(
    await apiFetch(`/v1/orgs/${slug}/flags/${key}/environments/${envKey}/rules`, {
      method: "PUT",
      body: JSON.stringify({ rules }),
    }),
  );
}

export async function deleteRule(
  slug: string,
  key: string,
  envKey: string,
  ruleId: string,
) {
  return unwrap<{ ok: true }>(
    await apiFetch(
      `/v1/orgs/${slug}/flags/${key}/environments/${envKey}/rules/${ruleId}`,
      { method: "DELETE" },
    ),
  );
}
