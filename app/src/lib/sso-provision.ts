// Bridges an SSO login to Flagon org membership. BetterAuth's SSO plugin verifies
// the OIDC/SAML assertion, then calls provisionUser; we hand the verified user +
// the provider's bound organization to the Go API (the single writer of domain
// data), which idempotently ensures the membership. Best-effort + time-boxed so a
// domain hiccup never blocks a valid sign-in (provisionUserOnEveryLogin re-syncs).
import { internalToken } from "@/lib/internal-token";

const API_URL = process.env.FLAGON_API_URL ?? "http://localhost:8080";

export async function provisionSSOMembership(params: {
  userId: string;
  email: string;
  organizationId?: string | null;
  /** The SSO provider just signed in through (recorded as a linked identity). */
  providerId?: string | null;
  role?: string;
}): Promise<void> {
  const { userId, email, organizationId, providerId, role } = params;
  // No org bound to the provider -> nothing to provision (a provider can exist
  // without an org, e.g. a personal IdP link).
  if (!userId || !organizationId) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${API_URL}/internal/sso/provision-member`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalToken()}`,
        "X-Flagon-User-Id": userId,
        "X-Flagon-User-Email": email,
      },
      body: JSON.stringify({
        org_id: organizationId,
        role: role ?? "member",
        ...(providerId ? { provider_id: providerId } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) console.error("provisionSSOMembership: API returned", res.status);
  } catch (err) {
    console.error("provisionSSOMembership failed", err);
  } finally {
    clearTimeout(timeout);
  }
}
