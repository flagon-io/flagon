import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { members } from "@/db/schema";
import { authenticateAccessToken } from "./access-tokens.server";
import { authenticateClientToken } from "./client-tokens.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function authenticateOfrep(
  request: Request,
  allowClient: boolean,
) {
  const header = request.headers.get("authorization");
  const access = await authenticateAccessToken(header, "flags:evaluate");
  if (access) {
    if (access.subjectType === "organization") {
      return { orgId: access.subjectId, kind: "server" as const };
    }
    const orgId = request.headers.get("x-flagon-organization") ?? "";
    if (!UUID.test(orgId)) return null;
    const [membership] = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.organizationId, orgId),
          eq(members.userId, access.subjectId),
        ),
      )
      .limit(1);
    return membership ? { orgId, kind: "server" as const } : null;
  }
  if (!allowClient) return null;
  const client = await authenticateClientToken(header);
  if (!client) return null;
  return {
    orgId: client.organizationId,
    kind: "client" as const,
    origin: request.headers.get("origin"),
  };
}
