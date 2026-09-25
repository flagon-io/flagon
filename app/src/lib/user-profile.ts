// Mirrors a user's public profile from the app (BetterAuth, the writer) into the
// Go API, which is the canonical/public read surface (GET /users/{username}).
// Called from BetterAuth's user create/update hooks AND on session create, so the
// API knows a user from their first sign-in, not only after a profile edit.
// Best-effort: a failure here must never break the auth flow, so it's wrapped and
// time-boxed - the next login or profile save re-syncs.
//
// It also mirrors the account's AUTH STATE the API enforces org security policy
// from: whether 2FA is enabled (every user update, so enabling or disabling 2FA
// re-syncs at once) and which SSO providers the account has a linked identity
// with (on every sign-in, via mirrorUserById).
import { pool } from "@/lib/db";
import { internalToken } from "@/lib/internal-token";

const API_URL = process.env.FLAGON_API_URL ?? "http://localhost:8080";

type MirrorUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  username?: string | null;
  displayUsername?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  websiteUrl?: string | null;
  company?: string | null;
  location?: string | null;
  socialLinks?: string | null;
  publicEmail?: string | null;
  twoFactorEnabled?: boolean | null;
};

export async function mirrorUserProfile(user: MirrorUser, ssoProviderIds?: string[]): Promise<void> {
  if (!user?.id) return;

  let social: string[] = [];
  try {
    const parsed = JSON.parse(user.socialLinks || "[]");
    if (Array.isArray(parsed)) social = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    /* ignore malformed */
  }

  const body = {
    username: user.displayUsername || user.username || "",
    name: user.name ?? "",
    bio: user.bio ?? "",
    pronouns: user.pronouns ?? "",
    websiteUrl: user.websiteUrl ?? "",
    company: user.company ?? "",
    location: user.location ?? "",
    socialLinks: social,
    publicEmail: user.publicEmail ?? "",
    avatarUrl: user.image ?? "",
    // Only when known: a partial user object must not reset the API's copy.
    ...(typeof user.twoFactorEnabled === "boolean" ? { twoFactorEnabled: user.twoFactorEnabled } : {}),
    ...(ssoProviderIds ? { ssoProviderIds } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${API_URL}/me/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalToken()}`,
        "X-Flagon-User-Id": user.id,
        "X-Flagon-User-Email": user.email,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error("mirrorUserProfile: API returned", res.status);
    }
  } catch (err) {
    console.error("mirrorUserProfile failed", err);
  } finally {
    clearTimeout(timeout);
  }
}

// Loads a user by id from the app's auth DB and mirrors their profile to the API.
// Wired into the session-create hook so an existing account (one created before
// the API knew it, or after the API's DB was rebuilt) is re-synced on next login
// rather than staying invisible until its owner happens to save their profile.
// Best-effort and self-contained: any failure is logged and swallowed so it can
// never block sign-in.
export async function mirrorUserById(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const { rows } = await pool.query(
      `select id, email, name, image, username, "displayUsername",
              bio, pronouns, "websiteUrl", company, location,
              "socialLinks", "publicEmail", "twoFactorEnabled"
         from users where id = $1`,
      [userId],
    );
    const user = rows[0];
    if (!user) return;
    // Linked SSO identities: accounts whose provider is an SSO provider (the
    // auth layer's provider cache), not a password or social login.
    const sso = await pool.query(
      `select distinct a."providerId" as id
         from accounts a
        where a."userId" = $1
          and exists (select 1 from sso_providers s where s."providerId" = a."providerId")`,
      [userId],
    );
    await mirrorUserProfile(
      { ...user, twoFactorEnabled: Boolean(user.twoFactorEnabled) },
      sso.rows.map((r: { id: string }) => r.id),
    );
  } catch (err) {
    console.error("mirrorUserById failed", err);
  }
}
