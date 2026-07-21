// Privileged organization provisioning (the "sudo" path from drizzle/0000):
// creates an organization as the DB OWNER, bypassing the self-serve
// reserved-slug and plan rules. This is how the platform operator claims
// brand/reserved slugs (e.g. "flagon") that ordinary sign-ups must never
// squat.
//
//   node scripts/org-claim.mjs <slug> <name> <owner-email> [plan]
//   node scripts/org-claim.mjs flagon "Flagon" you@flagon.io
//
// Runs against whatever DATABASE_URL_OWNER (or the Neon-injected vars) point
// at - local by default, production if you export the prod owner URL first.
// The named user becomes the organization's owner.
import { config } from "dotenv";
import postgres from "postgres";
import { resolveOwnerUrl } from "./db-urls.mjs";

config({ path: [".env.local", ".env"] });

const [slug, name, email, plan = "free"] = process.argv.slice(2);

if (!slug || !name || !email) {
  console.error(
    "Usage: node scripts/org-claim.mjs <slug> <name> <owner-email> [plan]",
  );
  process.exit(1);
}
if (
  !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ||
  slug.length < 2 ||
  slug.length > 39
) {
  console.error(
    "Slug must be 2-39 chars: lowercase alphanumeric with single hyphens, no leading/trailing hyphen.",
  );
  process.exit(1);
}
if (!["free", "pro", "enterprise"].includes(plan)) {
  console.error("Plan must be one of: free, pro, enterprise.");
  process.exit(1);
}

// App routes are static siblings of the /app/<org> segment: an org with one
// of these slugs would be UNREACHABLE. Refuse even in sudo mode.
const ROUTE_SHADOWED = new Set([
  "signin",
  "signup",
  "forgot-password",
  "reset-password",
  "settings",
  "new",
  "invitations",
  "api",
]);
if (ROUTE_SHADOWED.has(slug)) {
  console.error(
    `"${slug}" shadows an app route and would be unreachable. Pick another.`,
  );
  process.exit(1);
}

const url = resolveOwnerUrl();
if (!url) {
  console.error("No owner database URL configured.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  const [user] = await sql`
    SELECT id, name FROM users WHERE lower(email) = ${email.toLowerCase()}
  `;
  if (!user) {
    console.error(`No account with the email ${email}. Sign up first.`);
    process.exit(1);
  }

  const [existing] =
    await sql`SELECT id FROM organizations WHERE slug = ${slug}`;
  if (existing) {
    console.error(`An organization with the slug "${slug}" already exists.`);
    process.exit(1);
  }

  const [org] = await sql.begin(async (tx) => {
    const [created] = await tx`
      INSERT INTO organizations (slug, name, plan)
      VALUES (${slug}, ${name}, ${plan})
      RETURNING id, slug, name, plan
    `;
    await tx`
      INSERT INTO members (id, organization_id, user_id, role)
      VALUES (uuid_generate_v7(), ${created.id}, ${user.id}, 'owner')
    `;
    return [created];
  });

  console.log(
    `Claimed organization "${org.name}" (/${org.slug}, plan: ${org.plan}) with ${user.name} <${email}> as owner.`,
  );
} finally {
  await sql.end();
}
