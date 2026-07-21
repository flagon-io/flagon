import { resolveUserAccess } from "@/lib/api-auth.server";
import { apiJson } from "@/lib/api";
import { listEmails, serializeEmail } from "@/lib/user-emails";

/**
 * GET /api/v1/user/emails -> list the authenticated user's email addresses.
 *
 * Read-only by design: email management (add, remove, switch
 * primary, verification) is an account-security surface and happens through
 * the app UI only. Documented in src/lib/openapi.ts.
 */
export async function GET(request: Request) {
  // Readable with a personal token. Email MANAGEMENT stays app-only by
  // design (see AGENTS.md), so there is nothing to write here.
  const access = await resolveUserAccess(request, null);
  if (!access.ok) return access.error;
  const session = { user: { id: access.userId } };

  const emails = await listEmails(session.user.id);
  return apiJson(emails.map(serializeEmail));
}
