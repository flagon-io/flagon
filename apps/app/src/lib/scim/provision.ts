import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  members,
  organizations,
  scimGroups,
  scimUsers,
  ssoProviders,
  userEmails,
  users,
} from "@/db/schema";
import { uuidv7 } from "@/lib/uuid";
import type { ScimGroupView, ScimUserView } from "./resource";

/**
 * SCIM 2.0 provisioning against the Flagon identity model (GitHub-style).
 *
 * The invariant that matters: a person is always just a Flagon user with a
 * personal account. SCIM operates on an org-scoped resource (`scim_users`) that
 * points at that global user. Creating a user seeds `user_emails` (the multi-
 * email source of truth) exactly like BetterAuth's signup hook. DEACTIVATION /
 * DELETE remove the user's MEMBERSHIP of this org only — never the account — so
 * an IdP offboard here can't nuke someone's personal Flagon identity.
 */

// A loose view of the inbound SCIM User (we only read the fields we map).
export type ScimUserPayload = {
  userName?: string;
  externalId?: string;
  active?: boolean;
  displayName?: string;
  name?: { formatted?: string; givenName?: string; familyName?: string };
  emails?: { value?: string; primary?: boolean; type?: string }[];
};

/** SCIM 409 (uniqueness) — the resource already exists. */
export class ScimConflict extends Error {}
/** SCIM 400 (invalidValue) — the request is malformed or not allowed. */
export class ScimBadRequest extends Error {}
/** SCIM 403/mutability — the operation is refused (e.g. touching the owner). */
export class ScimForbidden extends Error {}

// Postgres unique-violation SQLSTATE. A check-then-insert can still race under
// concurrent IdP pushes; we translate the constraint hit to a SCIM 409 instead
// of leaking a 500 + raw constraint name.
const PG_UNIQUE_VIOLATION = "23505";
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

/** The user's role in this org, or null if not a member. */
async function memberRole(
  organizationId: string,
  userId: string,
): Promise<string | null> {
  const rows = await db
    .select({ role: members.role })
    .from(members)
    .where(
      and(
        eq(members.organizationId, organizationId),
        eq(members.userId, userId),
      ),
    )
    .limit(1);
  return rows[0]?.role ?? null;
}

/**
 * The email domains an org is allowed to provision, taken from its configured
 * SSO providers. SCIM provisioning is scoped to the org's own domain (the
 * GitHub/Okta model: you provision YOUR directory), which also prevents a token
 * from conscripting or probing arbitrary existing Flagon accounts by email.
 */
async function orgProvisioningDomains(
  organizationId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ domain: ssoProviders.domain })
    .from(ssoProviders)
    .where(eq(ssoProviders.organizationId, organizationId));
  return new Set(
    rows
      .map((r) => r.domain?.trim().toLowerCase())
      .filter((d): d is string => Boolean(d)),
  );
}

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

/** The email SCIM is addressing, lower-cased. Prefers a primary email, else userName. */
function emailFromPayload(payload: ScimUserPayload): string | null {
  const primary = payload.emails?.find((e) => e.primary)?.value;
  const any = payload.emails?.find((e) => e.value)?.value;
  const email = (primary ?? any ?? payload.userName ?? "").trim().toLowerCase();
  return email || null;
}

function nameFromPayload(payload: ScimUserPayload, fallback: string): string {
  if (payload.name?.formatted) return payload.name.formatted;
  const joined = [payload.name?.givenName, payload.name?.familyName]
    .filter(Boolean)
    .join(" ");
  return joined || payload.displayName || fallback;
}

/** Find an existing Flagon user id by any of their emails. */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const rows = await db
    .select({ userId: userEmails.userId })
    .from(userEmails)
    .where(eq(userEmails.email, email))
    .limit(1);
  return rows[0]?.userId ?? null;
}

/**
 * Create a passwordless Flagon user (they authenticate via the org's IdP), and
 * seed `user_emails` in the same transaction so the multi-email source of truth
 * is consistent from the first row — mirroring the databaseHooks.user.create
 * seed in lib/auth.ts. The address is marked verified because the IdP vouches
 * for it.
 */
async function createProvisionedUser(
  email: string,
  name: string,
): Promise<string> {
  const userId = uuidv7();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      name,
      email,
      emailVerified: true,
    });
    await tx.insert(userEmails).values({
      userId,
      email,
      verified: true,
      isPrimary: true,
    });
  });
  return userId;
}

/** The role a newly provisioned member gets: the org's SSO default role, never
 *  `owner` (an org has exactly one owner, transferred, never SCIM-assigned). */
async function defaultRoleFor(organizationId: string): Promise<string> {
  const rows = await db
    .select({ role: organizations.ssoDefaultRole })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const role = rows[0]?.role ?? "member";
  return role === "owner" ? "member" : role;
}

/** Assemble a ScimUserView for a scim_users row in an org, or null. */
async function viewByScimId(
  organizationId: string,
  scimId: string,
): Promise<ScimUserView | null> {
  const rows = await db
    .select({
      scimId: scimUsers.id,
      externalId: scimUsers.externalId,
      active: scimUsers.active,
      createdAt: scimUsers.createdAt,
      updatedAt: scimUsers.updatedAt,
      email: users.email,
      name: users.name,
      username: users.username,
    })
    .from(scimUsers)
    .innerJoin(users, eq(scimUsers.userId, users.id))
    .where(
      and(eq(scimUsers.organizationId, organizationId), eq(scimUsers.id, scimId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** List provisioned members for an org, optionally filtered by userName (email). */
export async function listScimUsers(
  organizationId: string,
  filterEmail?: string,
): Promise<ScimUserView[]> {
  const where = filterEmail
    ? and(
        eq(scimUsers.organizationId, organizationId),
        eq(users.email, filterEmail.toLowerCase()),
      )
    : eq(scimUsers.organizationId, organizationId);
  return db
    .select({
      scimId: scimUsers.id,
      externalId: scimUsers.externalId,
      active: scimUsers.active,
      createdAt: scimUsers.createdAt,
      updatedAt: scimUsers.updatedAt,
      email: users.email,
      name: users.name,
      username: users.username,
    })
    .from(scimUsers)
    .innerJoin(users, eq(scimUsers.userId, users.id))
    .where(where);
}

export function getScimUser(organizationId: string, scimId: string) {
  return viewByScimId(organizationId, scimId);
}

/**
 * Provision (create) a member from a SCIM User. Find-or-create the Flagon user
 * by email, add them to the org, and record the org-scoped SCIM resource. If the
 * IdP resource (externalId) or the user is already provisioned for this org,
 * that is a SCIM 409 conflict.
 */
export async function provisionScimUser(
  organizationId: string,
  payload: ScimUserPayload,
): Promise<ScimUserView> {
  const email = emailFromPayload(payload);
  if (!email) {
    throw new ScimBadRequest("A userName or primary email is required.");
  }

  // Domain gate: an org provisions only its OWN directory. The allowed domains
  // come from its configured SSO providers (SCIM pairs with SSO, GitHub/Okta
  // style). This is what stops a token from conscripting or probing arbitrary
  // existing Flagon accounts by email across the tenant boundary.
  const domains = await orgProvisioningDomains(organizationId);
  if (domains.size === 0) {
    throw new ScimBadRequest(
      "Configure a single sign-on provider with a domain before provisioning users.",
    );
  }
  if (!domains.has(domainOf(email))) {
    throw new ScimBadRequest(
      "This user's email domain is not configured for this organization.",
    );
  }

  // Already provisioned in this org (by external id)? 409.
  if (payload.externalId) {
    const existing = await db
      .select({ id: scimUsers.id })
      .from(scimUsers)
      .where(
        and(
          eq(scimUsers.organizationId, organizationId),
          eq(scimUsers.externalId, payload.externalId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      throw new ScimConflict("A user with this externalId already exists.");
    }
  }

  let userId = await findUserIdByEmail(email);
  if (userId) {
    // NEVER let SCIM take over the org owner (offboarding them later would
    // orphan the org). The owner is managed by hand, not the directory.
    if ((await memberRole(organizationId, userId)) === "owner") {
      throw new ScimForbidden(
        "The organization owner cannot be managed via SCIM.",
      );
    }
  } else {
    try {
      userId = await createProvisionedUser(
        email,
        nameFromPayload(payload, email),
      );
    } catch (err) {
      // A concurrent create for the same email raced us to the unique index.
      if (isUniqueViolation(err)) {
        throw new ScimConflict("A user with this email already exists.");
      }
      throw err;
    }
  }

  const alreadyMember = await db
    .select({ id: scimUsers.id })
    .from(scimUsers)
    .where(
      and(
        eq(scimUsers.organizationId, organizationId),
        eq(scimUsers.userId, userId),
      ),
    )
    .limit(1);
  if (alreadyMember[0]) {
    throw new ScimConflict("This user is already provisioned in the organization.");
  }

  const role = await defaultRoleFor(organizationId);
  const scimId = uuidv7();
  try {
    await db.transaction(async (tx) => {
      // Membership (idempotent on the unique org+user key).
      await tx
        .insert(members)
        .values({ id: uuidv7(), organizationId, userId, role })
        .onConflictDoNothing();
      await tx.insert(scimUsers).values({
        id: scimId,
        organizationId,
        userId,
        externalId: payload.externalId ?? null,
        active: payload.active ?? true,
      });
    });
  } catch (err) {
    // Concurrent provision of the same user/externalId hit a unique index.
    if (isUniqueViolation(err)) {
      throw new ScimConflict("This user is already provisioned in the organization.");
    }
    throw err;
  }

  const view = await viewByScimId(organizationId, scimId);
  if (!view) throw new Error("Provisioned user could not be read back.");
  return view;
}

/**
 * Deactivate or delete a provisioned member. Removes the org MEMBERSHIP (the
 * personal account is untouched). `hard` deletes the SCIM resource row (DELETE);
 * otherwise it is kept with active=false (PATCH active:false) so a later
 * re-activation maps back to the same person.
 */
export async function deprovisionScimUser(
  organizationId: string,
  scimId: string,
  opts: { hard?: boolean } = {},
): Promise<boolean> {
  const row = (
    await db
      .select({ userId: scimUsers.userId })
      .from(scimUsers)
      .where(
        and(
          eq(scimUsers.organizationId, organizationId),
          eq(scimUsers.id, scimId),
        ),
      )
      .limit(1)
  )[0];
  if (!row) return false;

  // Refuse to strip the org owner's membership — that would leave the org with
  // no owner (un-transferable, un-manageable). SCIM manages everyone but them.
  if ((await memberRole(organizationId, row.userId)) === "owner") {
    throw new ScimForbidden(
      "The organization owner cannot be deprovisioned via SCIM.",
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(members)
      .where(
        and(
          eq(members.organizationId, organizationId),
          eq(members.userId, row.userId),
        ),
      );
    if (opts.hard) {
      await tx
        .delete(scimUsers)
        .where(
          and(
            eq(scimUsers.organizationId, organizationId),
            eq(scimUsers.id, scimId),
          ),
        );
    } else {
      await tx
        .update(scimUsers)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(scimUsers.organizationId, organizationId),
            eq(scimUsers.id, scimId),
          ),
        );
    }
  });
  return true;
}

/** Re-activate a soft-deactivated member: restore membership + active flag. */
async function reactivateScimUser(
  organizationId: string,
  scimId: string,
): Promise<void> {
  const row = (
    await db
      .select({ userId: scimUsers.userId })
      .from(scimUsers)
      .where(
        and(
          eq(scimUsers.organizationId, organizationId),
          eq(scimUsers.id, scimId),
        ),
      )
      .limit(1)
  )[0];
  if (!row) return;
  const role = await defaultRoleFor(organizationId);
  await db.transaction(async (tx) => {
    await tx
      .insert(members)
      .values({ id: uuidv7(), organizationId, userId: row.userId, role })
      .onConflictDoNothing();
    await tx
      .update(scimUsers)
      .set({ active: true, updatedAt: new Date() })
      .where(
        and(
          eq(scimUsers.organizationId, organizationId),
          eq(scimUsers.id, scimId),
        ),
      );
  });
}

type ScimPatchOp = { op?: string; path?: string; value?: unknown };

/**
 * Apply a SCIM PatchOp. We support the operations IdPs actually send: toggling
 * `active` (the deprovision/reprovision signal). Other attribute patches are
 * accepted as no-ops so the IdP does not error. Returns the updated view.
 */
export async function patchScimUser(
  organizationId: string,
  scimId: string,
  operations: ScimPatchOp[],
): Promise<ScimUserView | null> {
  for (const op of operations) {
    const active = readActiveFromOp(op);
    if (active === false) await deprovisionScimUser(organizationId, scimId);
    else if (active === true) await reactivateScimUser(organizationId, scimId);
  }
  return viewByScimId(organizationId, scimId);
}

/** Extract an `active` boolean from a PatchOp op, whether pathed or a value map. */
function readActiveFromOp(op: ScimPatchOp): boolean | null {
  const normalize = (v: unknown): boolean | null =>
    typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : null;
  if (typeof op.path === "string" && op.path.toLowerCase() === "active") {
    return normalize(op.value);
  }
  if (op.value && typeof op.value === "object") {
    const record = op.value as Record<string, unknown>;
    if ("active" in record) return normalize(record.active);
  }
  return null;
}

/**
 * Replace (PUT) a SCIM User. The only field with side effects in our model is
 * `active`; everything else is descriptive and echoed back.
 */
export async function replaceScimUser(
  organizationId: string,
  scimId: string,
  payload: ScimUserPayload,
): Promise<ScimUserView | null> {
  if (payload.active === false) await deprovisionScimUser(organizationId, scimId);
  else if (payload.active === true)
    await reactivateScimUser(organizationId, scimId);
  return viewByScimId(organizationId, scimId);
}

// --- Groups (role mapping) ---------------------------------------------------

async function groupView(
  organizationId: string,
  scimId: string,
): Promise<ScimGroupView | null> {
  const g = (
    await db
      .select({
        scimId: scimGroups.id,
        externalId: scimGroups.externalId,
        displayName: scimGroups.displayName,
        role: scimGroups.role,
      })
      .from(scimGroups)
      .where(
        and(
          eq(scimGroups.organizationId, organizationId),
          eq(scimGroups.id, scimId),
        ),
      )
      .limit(1)
  )[0];
  if (!g) return null;
  return { ...g, members: [] };
}

export async function listScimGroups(
  organizationId: string,
): Promise<ScimGroupView[]> {
  const rows = await db
    .select({
      scimId: scimGroups.id,
      externalId: scimGroups.externalId,
      displayName: scimGroups.displayName,
      role: scimGroups.role,
    })
    .from(scimGroups)
    .where(eq(scimGroups.organizationId, organizationId));
  return rows.map((g) => ({ ...g, members: [] }));
}

export function getScimGroup(organizationId: string, scimId: string) {
  return groupView(organizationId, scimId);
}

/**
 * Create a role-mapping group. A group's `displayName` may encode the role
 * ("flagon-admins" -> admin); otherwise it defaults to member. Never maps to
 * owner (transferred, not assigned).
 */
export async function createScimGroup(
  organizationId: string,
  payload: { displayName?: string; externalId?: string },
): Promise<ScimGroupView> {
  const displayName = payload.displayName?.trim() || "group";
  const role = /admin/i.test(displayName) ? "admin" : "member";
  const scimId = uuidv7();
  await db.insert(scimGroups).values({
    id: scimId,
    organizationId,
    externalId: payload.externalId ?? null,
    displayName,
    role,
  });
  const view = await groupView(organizationId, scimId);
  if (!view) throw new Error("Created group could not be read back.");
  return view;
}

/**
 * Patch a group: apply member add/remove operations to set each member's org
 * role to the group's mapped role. `value` entries carry SCIM user resource ids
 * (scim_users.id).
 */
export async function patchScimGroup(
  organizationId: string,
  scimId: string,
  operations: ScimPatchOp[],
): Promise<ScimGroupView | null> {
  const group = await groupView(organizationId, scimId);
  if (!group) return null;

  for (const op of operations) {
    if (!op.path || op.path.toLowerCase() !== "members") continue;
    const entries = Array.isArray(op.value) ? op.value : [];
    for (const entry of entries) {
      const resourceId = (entry as { value?: string }).value;
      if (!resourceId) continue;
      const scimRow = (
        await db
          .select({ userId: scimUsers.userId })
          .from(scimUsers)
          .where(
            and(
              eq(scimUsers.organizationId, organizationId),
              eq(scimUsers.id, resourceId),
            ),
          )
          .limit(1)
      )[0];
      if (!scimRow) continue;
      // Never let a group membership change the org owner's role (would demote
      // the owner and orphan the org).
      if ((await memberRole(organizationId, scimRow.userId)) === "owner") continue;
      if ((op.op ?? "").toLowerCase() === "remove") {
        // Removed from the role group -> fall back to the org's default role.
        const fallback = await defaultRoleFor(organizationId);
        await db
          .update(members)
          .set({ role: fallback })
          .where(
            and(
              eq(members.organizationId, organizationId),
              eq(members.userId, scimRow.userId),
            ),
          );
      } else {
        await db
          .update(members)
          .set({ role: group.role })
          .where(
            and(
              eq(members.organizationId, organizationId),
              eq(members.userId, scimRow.userId),
            ),
          );
      }
    }
  }
  return group;
}

export async function deleteScimGroup(
  organizationId: string,
  scimId: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: scimGroups.id })
    .from(scimGroups)
    .where(
      and(
        eq(scimGroups.organizationId, organizationId),
        eq(scimGroups.id, scimId),
      ),
    )
    .limit(1);
  if (!existing[0]) return false;
  await db
    .delete(scimGroups)
    .where(
      and(
        eq(scimGroups.organizationId, organizationId),
        eq(scimGroups.id, scimId),
      ),
    );
  return true;
}

/** Whether an org has any provisioned SCIM users (for the settings summary). */
export async function hasProvisionedUsers(
  organizationId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: scimUsers.id })
    .from(scimUsers)
    .where(
      and(
        eq(scimUsers.organizationId, organizationId),
        isNotNull(scimUsers.userId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
