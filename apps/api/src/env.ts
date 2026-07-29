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
    // it). The burst limiter caps evaluations per SDK key per window, per
    // instance. Defaults suit a single pilot customer; raise for scale.
    EVAL_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(15_000),
    EVAL_RATE_LIMIT: z.coerce.number().int().positive().default(6_000),
    EVAL_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  })
  .refine((e) => Boolean(e.DATABASE_URL || e.APP_DATABASE_URL), {
    message:
      "A database connection string is required: set APP_DATABASE_URL (or DATABASE_URL for local dev).",
    path: ["APP_DATABASE_URL"],
  });

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
