/**
 * Server-side feature configuration.
 *
 * Waitlist mode: when ON, public registration is replaced by an approval
 * waitlist (only the founder + approved emails may sign up). When OFF - the
 * default, ideal for local dev and self-host - registration is open to anyone.
 * Turn it on in production with WAITLIST_ENABLED=true.
 */

export function isWaitlistEnabled(): boolean {
  return process.env.WAITLIST_ENABLED === 'true';
}

/**
 * Multitenancy. ON (default): users create/join organizations and
 * onboarding asks new users to make one. OFF (MULTI_TENANCY=false) = single-org
 * mode: every user is auto-added to one shared organization and onboarding is
 * skipped. RLS is unchanged either way - there's simply one org.
 */
export function isMultiTenant(): boolean {
  return process.env.MULTI_TENANCY !== 'false';
}

/** Slug of the shared organization used in single-org mode. */
export const SINGLE_TENANT_ORG_SLUG = process.env.DEFAULT_ORG_SLUG ?? 'default';

/**
 * The "sudo" organization — Flagon's own org, used to dogfood the product and to
 * gate the internal admin console. Members of this org can switch between the
 * normal Flagon UI (managing their own flags) and the sudo console; everyone
 * else never sees that it exists.
 */
export const SUDO_ORG_SLUG = process.env.SUDO_ORG_SLUG ?? 'flagon';

/**
 * Which social login providers are configured (both id + secret present).
 * Drives both the BetterAuth config and the enabled/disabled state of the
 * "Continue with…" buttons, so a provider turns on the moment its env is set.
 */
export function socialProviderStatus() {
  const has = (a?: string, b?: string) => Boolean(a && b);
  return {
    google: has(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET),
    github: has(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET),
    apple: has(process.env.APPLE_CLIENT_ID, process.env.APPLE_CLIENT_SECRET),
  };
}

