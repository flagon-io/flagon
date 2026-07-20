/**
 * Postgres error classification. Drizzle wraps driver errors (the
 * PostgresError lands on .cause), and BetterAuth adapter calls can surface
 * them bare - check both shapes.
 */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
