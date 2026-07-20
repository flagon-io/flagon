import { auth } from "@/lib/auth";
import { apiError, apiJson } from "@/lib/api";
import { listEmails, serializeEmail } from "@/lib/user-emails";

/**
 * GET /api/v1/user/emails -> list the authenticated user's email addresses.
 *
 * Read-only by design: email management (add, remove, switch
 * primary, verification) is an account-security surface and happens through
 * the app UI only. Documented in src/lib/openapi.ts.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in required.");

  const emails = await listEmails(session.user.id);
  return apiJson(emails.map(serializeEmail));
}
