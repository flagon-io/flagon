import type postgres from "postgres";

/** Tables whose organization isolation deliberately lives above Postgres RLS. */
export const AUTH_LAYER_EXEMPT = new Set([
  "members",
  "invitations",
  "access_tokens",
  "client_keys",
  "sso_providers",
  "org_sso_sessions",
  "scim_tokens",
  "scim_users",
  "scim_groups",
]);

type TenantTableRls = {
  relname: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: number;
};

/** Return tenant tables that are not protected by forced RLS and a policy. */
export async function findTenantRlsViolations(
  sql: ReturnType<typeof postgres>,
): Promise<string[]> {
  const rows = (await sql`
    SELECT c.relname,
           c.relrowsecurity      AS rls_enabled,
           c.relforcerowsecurity AS rls_forced,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attname = 'organization_id'
          AND NOT a.attisdropped
      )
    ORDER BY c.relname
  `) as unknown as TenantTableRls[];

  return rows
    .filter((row) => !AUTH_LAYER_EXEMPT.has(row.relname))
    .filter((row) => !(row.rls_enabled && row.rls_forced && row.policy_count > 0))
    .map((row) => row.relname);
}

