import { z } from "zod";

/**
 * Boot-time environment validation.
 *
 * Imported at the top of the entrypoint so a misconfigured deploy fails
 * IMMEDIATELY, with one clear message listing everything that's wrong, instead
 * of limping up and throwing a confusing error on the first request (or, worse,
 * running degraded). Everything the API truly needs to serve traffic is checked
 * here; genuinely optional settings stay optional.
 */
const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().optional(),
    APP_URL: z.string().url().optional(),
    WEB_URL: z.string().url().optional(),
    // At least one of these must be present (checked below). APP_DATABASE_URL is
    // the restricted app role in production; DATABASE_URL covers local dev.
    DATABASE_URL: z.string().min(1).optional(),
    APP_DATABASE_URL: z.string().min(1).optional(),
    SENTRY_DSN: z.string().url().optional(),
    // OFREP eval hot path. The cache serves projected flag config for up to this
    // long before reloading (staleness bound; a flag change propagates within
    // it). The burst limiter caps evaluations per client key per window, per
    // instance. Defaults suit a single pilot customer; raise for scale.
    EVAL_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(15_000),
    EVAL_RATE_LIMIT: z.coerce.number().int().positive().default(6_000),
    // Hobby (free) plans get a tighter per-key eval-REQUEST ceiling. Proper OFREP
    // caching (bulk fetch + poll on an interval) stays far under it; naive per-check
    // polling that would run up Vercel invocations is throttled (429 — the SDK backs
    // off, the customer caches or upgrades). Logical checks stay free + unlimited —
    // this caps only the network requests behind them, the one thing with real cost.
    EVAL_RATE_LIMIT_HOBBY: z.coerce.number().int().positive().default(600),
    EVAL_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    // Tokens the durable eval limiter reserves per database round-trip. Larger
    // means fewer writes per high-QPS key but a larger bounded over-count; the
    // default is a small fraction of the per-window limit.
    EVAL_RATE_RESERVE_CHUNK: z.coerce.number().int().positive().default(25),
    // Exposures default-on: a remote (per-flag) evaluation with a targetingKey
    // auto-logs a billable exposure, deduped per (env, flag, unit, variant) within
    // this window so a hot page bills once per session, not per request.
    // EXPOSURE_AUTO_ENABLED is the global kill-switch. Both have safe defaults, so
    // there is nothing to set for the behavior to be on.
    //
    // Default 1h to MATCH Statsig's billing (their client SDK dedupes exposures for
    // the same user+flag on a 60m window). A shorter window bills more than Statsig
    // for the same traffic; a longer one bills less. 1h is parity.
    EXPOSURE_AUTO_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    EXPOSURE_DEDUP_TTL_MS: z.coerce.number().int().positive().default(3_600_000),
    // Management write path. Caps authenticated mutations on /v1/orgs/:org/*
    // per (org, caller) per window, so a valid token or session can't flood the
    // write path (each write is a withOrg transaction + revision + cache
    // invalidation). Generous for console use and reasonable automation; raise
    // for bulk-import workloads.
    MGMT_WRITE_RATE_LIMIT: z.coerce.number().int().positive().default(120),
    MGMT_WRITE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    // Billing (Stripe) is OPTIONAL: the API boots and serves without it. When
    // present the values are shape-checked so a paste error fails fast at boot
    // rather than as a confusing Stripe 401 mid-checkout. The Pro price is
    // resolved from a lookup key at runtime, so there is no price id to set.
    STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
    // Auth: BetterAuth is hosted by the CONSOLE, not here. The API still needs the
    // shared secret to VERIFY the signed session cookie the console issues (see
    // lib/auth-context.ts, getCookieCache); it must equal the console's value
    // byte-for-byte or every session cookie fails to verify. BETTER_AUTH_URL and
    // AUTH_COOKIE_DOMAIN are the console's concern now (it issues cookies); kept
    // optional here for parity but unused by the API.
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url().optional(),
    AUTH_COOKIE_DOMAIN: z.string().optional(),
    // Email (verification / reset / invites now send from the API).
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    // Bring-your-own integration secrets (e.g. a customer's Twilio auth token)
    // are encrypted at rest with AES-256-GCM keyed off this value. OPTIONAL: the
    // API boots without it; configuring a BYO integration's credentials returns
    // 503 until it's set. Any sufficiently-long, high-entropy string works (the
    // AES key is derived via scrypt). Rotating it makes stored credentials
    // undecryptable — customers re-enter them — which is the correct fail-closed
    // behavior for a secret store.
    INTEGRATIONS_SECRET_KEY: z.string().min(16).optional(),
    // Object storage (Cloudflare R2 / any S3-compatible store) is OPTIONAL: the
    // API boots and serves without it; upload endpoints return 503 until it's
    // configured. Provider-neutral by design, so the SAME vars point at ministack
    // locally (http://localhost:4566, path-style, dummy creds) and R2 in prod
    // (https://<account>.r2.cloudflarestorage.com, region "auto"). The public
    // bucket's objects are served from STORAGE_PUBLIC_BASE_URL (the ministack
    // path-style URL locally; cdn.flagon.io in prod). All-or-nothing: if any
    // storage var is set, the core set must be (checked below).
    STORAGE_ENDPOINT: z.string().url().optional(),
    STORAGE_REGION: z.string().optional(),
    STORAGE_ACCESS_KEY_ID: z.string().optional(),
    STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
    STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
    STORAGE_PUBLIC_BUCKET: z.string().optional(),
    STORAGE_PUBLIC_BASE_URL: z.string().url().optional(),
  })
  .refine((e) => Boolean(e.DATABASE_URL || e.APP_DATABASE_URL), {
    message:
      "A database connection string is required: set APP_DATABASE_URL (or DATABASE_URL for local dev).",
    path: ["APP_DATABASE_URL"],
  })
  .refine(
    (e) =>
      !(e.NODE_ENV === "production" && e.BETTER_AUTH_SECRET === "dev-secret-change-me"),
    {
      message:
        "BETTER_AUTH_SECRET is still the dev placeholder in production. Generate a real secret.",
      path: ["BETTER_AUTH_SECRET"],
    },
  )
  .refine(
    (e) => {
      // If storage is touched at all, the core set must be complete so we never
      // half-configure it (a signed URL to a bucket with no public base is a
      // silent 404 later). "Touched" = any storage var present.
      const anySet = Boolean(
        e.STORAGE_ENDPOINT ||
          e.STORAGE_ACCESS_KEY_ID ||
          e.STORAGE_SECRET_ACCESS_KEY ||
          e.STORAGE_PUBLIC_BUCKET ||
          e.STORAGE_PUBLIC_BASE_URL,
      );
      if (!anySet) return true;
      return Boolean(
        e.STORAGE_ENDPOINT &&
          e.STORAGE_ACCESS_KEY_ID &&
          e.STORAGE_SECRET_ACCESS_KEY &&
          e.STORAGE_PUBLIC_BUCKET &&
          e.STORAGE_PUBLIC_BASE_URL,
      );
    },
    {
      message:
        "Object storage is partially configured. Set STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY, STORAGE_PUBLIC_BUCKET, and STORAGE_PUBLIC_BASE_URL together (or none).",
      path: ["STORAGE_ENDPOINT"],
    },
  );

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid API environment:\n${issues}`);
  }
  return parsed.data;
}

/** Validated, typed environment. Importing this module performs the check. */
export const env = load();
