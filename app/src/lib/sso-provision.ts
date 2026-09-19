// Bridges an SSO login to Flagon org membership. BetterAuth's SSO plugin verifies
// the OIDC/SAML assertion, then calls provisionUser; we hand the verified user +
// the provider's bound organization to the Go API (the single writer of domain
// data), which idempotently ensures the membership. Best-effort + time-boxed so a
// domain hiccup never blocks a valid sign-in (provisionUserOnEveryLogin re-syncs).
const API_URL = process.env.FLAGON_API_URL ?? "http://localhost:8080";
const INTERNAL_TOKEN = process.env.FLAGON_INTERNAL_TOKEN ?? "";

export async function provisionSSOMembership(params: {
  userId: string;
  email: string;
  organizationId?: string | null;
  role?: string;
}): Promise<void> {
  const { userId, email, organizationId, role } = params;
  // No org bound to the provider -> nothing to provision (a provider can exist
  // without an org, e.g. a personal IdP link). Missing token = misconfig; skip.
  if (!INTERNAL_TOKEN || !userId || !organizationId) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${API_URL}/internal/sso/provision-member`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${INTERNAL_TOKEN}`,
        "X-Flagon-User-Id": userId,
        "X-Flagon-User-Email": email,
      },
      body: JSON.stringify({ org_id: organizationId, role: role ?? "member" }),
      signal: controller.signal,
    });
    if (!res.ok) console.error("provisionSSOMembership: API returned", res.status);
  } catch (err) {
    console.error("provisionSSOMembership failed", err);
  } finally {
    clearTimeout(timeout);
  }
}
