/**
 * Guard a caller-supplied `redirect` value so it can only point back into this
 * site. We accept a single leading slash followed by anything that is not
 * another slash (so `/foo`, `/foo/bar`, `/foo?x=1` are fine) and reject
 * protocol-relative URLs (`//evil.com`), absolute URLs (`https://evil.com`),
 * and empty/garbage input by falling back to "/". This closes the open-redirect
 * hole where a crafted link could bounce a freshly signed-in user off-site.
 */
export function safeRedirect(value: string | null | undefined): string {
  return value && /^\/(?!\/)/.test(value) ? value : "/";
}
