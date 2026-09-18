// Mirrors a user's public profile from the app (BetterAuth, the writer) into the
// Go API, which is the canonical/public read surface (GET /users/{username}).
// Called from BetterAuth's user create/update hooks. Best-effort: a failure here
// must never break the auth flow, so it's wrapped and time-boxed - the next
// profile save re-syncs.
const API_URL = process.env.FLAGON_API_URL ?? "http://localhost:8080";
const INTERNAL_TOKEN = process.env.FLAGON_INTERNAL_TOKEN ?? "";

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
};

export async function mirrorUserProfile(user: MirrorUser): Promise<void> {
  if (!INTERNAL_TOKEN || !user?.id) return;

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
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${API_URL}/me/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${INTERNAL_TOKEN}`,
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
