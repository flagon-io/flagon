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
