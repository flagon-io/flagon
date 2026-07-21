import { headers } from "next/headers";
import { appHref } from "./urls";

/**
 * Absolute URL for an app path.
 *
 * External services (Stripe's checkout and billing portal) demand absolute
 * URLs to return the browser to. NEXT_PUBLIC_APP_URL supplies the origin in
 * production; without it (local dev, single-domain self-host) the origin
 * comes from the incoming request, so links always point back at the host
 * the user is actually on.
 */
export async function absoluteAppUrl(path: string): Promise<string> {
  const href = appHref(path);
  if (/^https?:\/\//.test(href)) return href;

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (/^(localhost|127\.0\.0\.1)/.test(host) ? "http" : "https");
  return `${protocol}://${host}${href}`;
}
