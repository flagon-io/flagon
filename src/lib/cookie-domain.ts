/**
 * Session cookie scope.
 *
 * The platform spans subdomains (www / app / api . flagon.io) and one
 * sign-in must be visible on all of them. BetterAuth's cross-subdomain
 * option defaults the cookie domain to the FULL baseURL hostname (despite
 * documenting "root domain"), which would pin the session to app.flagon.io
 * and leave the marketing site looking signed out. So we set the domain
 * ourselves: the apex, with a leading dot, shared by every subdomain.
 *
 * Only when the deployment actually runs on that apex. Localhost and
 * preview hosts (*.vercel.app) are single-origin: a cookie scoped to a
 * domain you're not serving from is silently dropped by the browser, so
 * those return null and cross-subdomain cookies stay off.
 */
export function sessionCookieDomain(
  baseURL: string,
  rootDomain: string,
): string | null {
  let hostname: string;
  try {
    hostname = new URL(baseURL).hostname;
  } catch {
    return null;
  }
  if (!rootDomain || !rootDomain.includes(".")) return null;
  if (hostname === rootDomain || hostname.endsWith(`.${rootDomain}`)) {
    return `.${rootDomain}`;
  }
  return null;
}
