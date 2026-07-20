import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import {
  apiError,
  apiForbiddenOrigin,
  apiJson,
  isTrustedOrigin,
} from "@/lib/api";

/**
 * The authenticated user.
 *
 *   GET   /api/v1/user                    -> profile
 *   PATCH /api/v1/user {name?, username?} -> update profile
 *
 * Documented in src/lib/openapi.ts; keep the two in sync.
 */
type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  username?: string | null;
  displayUsername?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function serializeUser(user: SessionUser) {
  return {
    id: user.id,
    username: user.displayUsername ?? user.username ?? null,
    name: user.name,
    email: user.email,
    email_verified: user.emailVerified,
    image: user.image ?? null,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in required.");
  return apiJson(serializeUser(session.user));
}

export async function PATCH(request: Request) {
  if (!isTrustedOrigin(request)) return apiForbiddenOrigin();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in required.");

  const body = await request.json().catch(() => null);
  const updates: { name?: string; username?: string } = {};
  if (typeof body?.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (typeof body?.username === "string" && body.username.trim()) {
    updates.username = body.username.trim();
  }
  if (Object.keys(updates).length === 0) {
    return apiError(
      400,
      "nothing_to_update",
      "Provide at least one of: name, username.",
    );
  }

  try {
    // Through BetterAuth so username validation, uniqueness, and the
    // user_emails sync hooks all apply, the same path the settings UI takes.
    await auth.api.updateUser({ body: updates, headers: request.headers });
  } catch (error) {
    if (error instanceof APIError) {
      return apiError(
        error.statusCode,
        error.body?.code?.toLowerCase() ?? "update_failed",
        error.body?.message ?? "Could not update the user.",
      );
    }
    throw error;
  }

  const fresh = await auth.api.getSession({ headers: request.headers });
  return apiJson(serializeUser((fresh ?? session).user));
}
