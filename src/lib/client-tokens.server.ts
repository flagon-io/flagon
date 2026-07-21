import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { clientTokens } from "@/db/schema";
import { withTenant } from "@/db/tenant";

export type ClientToken = typeof clientTokens.$inferSelect;
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const TOKEN_PATTERN = /^flagon_client_([0-9a-f-]{36})_[A-Za-z0-9_-]{32,}$/i;

export const listClientTokens = (orgId: string) =>
  withTenant(orgId, (tx) =>
    tx.select().from(clientTokens).orderBy(desc(clientTokens.createdAt)),
  );

export async function createClientToken(orgId: string, name: string) {
  name = name.trim();
  if (!name || name.length > 100)
    return {
      ok: false as const,
      error: "Provide a client token name up to 100 characters.",
    };
  const token = `flagon_client_${orgId}_${randomBytes(32).toString("base64url")}`;
  const [created] = await withTenant(orgId, (tx) =>
    tx
      .insert(clientTokens)
      .values({
        organizationId: orgId,
        name,
        secretHash: digest(token),
        token,
      })
      .returning(),
  );
  return { ok: true as const, token, clientToken: created };
}

export async function rotateClientToken(orgId: string, id: string) {
  const token = `flagon_client_${orgId}_${randomBytes(32).toString("base64url")}`;
  const [rotated] = await withTenant(orgId, (tx) =>
    tx
      .update(clientTokens)
      .set({ token, secretHash: digest(token) })
      .where(
        and(eq(clientTokens.organizationId, orgId), eq(clientTokens.id, id)),
      )
      .returning(),
  );
  return rotated
    ? { ok: true as const, token, clientToken: rotated }
    : { ok: false as const };
}

export async function authenticateClientToken(header: string | null) {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const orgId = match[1].toLowerCase();
  const [credential] = await withTenant(orgId, (tx) =>
    tx
      .select()
      .from(clientTokens)
      .where(
        and(
          eq(clientTokens.organizationId, orgId),
          eq(clientTokens.secretHash, digest(token)),
        ),
      )
      .limit(1),
  );
  return credential ?? null;
}

export async function revokeClientToken(orgId: string, id: string) {
  return (
    (
      await withTenant(orgId, (tx) =>
        tx
          .delete(clientTokens)
          .where(
            and(
              eq(clientTokens.organizationId, orgId),
              eq(clientTokens.id, id),
            ),
          )
          .returning({ id: clientTokens.id }),
      )
    ).length > 0
  );
}

export function serializeClientToken(token: ClientToken) {
  return {
    id: token.id,
    name: token.name,
    token: token.token,
    created_at: token.createdAt.toISOString(),
  };
}
