import postgres from "postgres";
import { findTenantRlsViolations } from "../src/db/tenancy-audit.js";

function isProductionDeploy(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

async function main() {
  const url = process.env.APP_DATABASE_URL;
  if (!url) {
    if (!isProductionDeploy()) {
      console.warn("[verify-rls] APP_DATABASE_URL is unset; skipping (non-production).");
      return;
    }
    throw new Error(
      "APP_DATABASE_URL is required in production; refusing to deploy without the restricted RLS role.",
    );
  }

  // Verify through the exact runtime connection, never an owner fallback.
  const sql = postgres(url, { max: 1 });
  try {
    const [role] = await sql<
      { role_name: string; is_superuser: boolean; bypasses_rls: boolean }[]
    >`
      SELECT current_user AS role_name,
             r.rolsuper AS is_superuser,
             r.rolbypassrls AS bypasses_rls
      FROM pg_roles r
      WHERE r.rolname = current_user
    `;

    if (!role) throw new Error("Could not resolve the APP_DATABASE_URL database role.");
    if (role.is_superuser || role.bypasses_rls) {
      throw new Error(
        `APP_DATABASE_URL connects as unsafe role ${role.role_name} ` +
          `(superuser=${role.is_superuser}, bypassrls=${role.bypasses_rls}).`,
      );
    }

    const [ownership] = await sql<{ owned_tenant_tables: number }[]>`
      SELECT count(*)::int AS owned_tenant_tables
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
        AND EXISTS (
          SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid
            AND a.attname = 'organization_id'
            AND NOT a.attisdropped
        )
    `;
    if (!ownership || ownership.owned_tenant_tables > 0) {
      throw new Error(
        `APP_DATABASE_URL role ${role.role_name} owns ${ownership?.owned_tenant_tables ?? "unknown"} tenant tables; use the dedicated non-owner app role.`,
      );
    }

    const violations = await findTenantRlsViolations(sql);
    if (violations.length > 0) {
      throw new Error(
        `Tenant tables missing forced RLS and a policy: ${violations.join(", ")}.`,
      );
    }

    console.log(`[verify-rls] verified restricted role ${role.role_name} and tenant RLS`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("[verify-rls] failed:", error);
  process.exit(1);
});
