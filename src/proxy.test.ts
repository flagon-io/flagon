import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

/**
 * Host-based routing. The production shape that matters: on app.flagon.io
 * the app is served at the subdomain ROOT (app.flagon.io/<org>/teams), and a
 * leaked /app prefix is redirected away rather than silently served - so a
 * stale link can never mint app.flagon.io/app/<org> URLs.
 */
function request(url: string) {
  const host = new URL(url).host;
  return new NextRequest(url, { headers: { host } });
}

describe("proxy host routing", () => {
  it("rewrites app subdomain paths under /app", () => {
    const res = proxy(request("https://app.flagon.io/acme/teams"));
    expect(res.headers.get("x-middleware-rewrite")).toContain(
      "/app/acme/teams",
    );
    expect(res.status).not.toBe(308);
  });

  it("serves the app root", () => {
    const res = proxy(request("https://app.flagon.io/"));
    expect(res.headers.get("x-middleware-rewrite")).toMatch(/\/app$/);
  });

  it("redirects a leaked /app prefix to the canonical URL", () => {
    const res = proxy(request("https://app.flagon.io/app/acme/teams"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://app.flagon.io/acme/teams",
    );
  });

  it("redirects a bare /app to the app root", () => {
    const res = proxy(request("https://app.flagon.io/app"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://app.flagon.io/");
  });

  it("leaves the shared /api surface alone on the app subdomain", () => {
    const res = proxy(request("https://app.flagon.io/api/auth/session"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.status).not.toBe(308);
  });

  it("rewrites the api subdomain under /api", () => {
    const res = proxy(request("https://api.flagon.io/v1/user"));
    expect(res.headers.get("x-middleware-rewrite")).toContain("/api/v1/user");
  });

  it("passes marketing and localhost through untouched", () => {
    for (const url of [
      "https://flagon.io/pricing",
      "https://www.flagon.io/docs",
      "http://localhost:3000/app/acme/teams",
    ]) {
      const res = proxy(request(url));
      expect(res.headers.get("x-middleware-rewrite"), url).toBeNull();
      expect(res.status, url).not.toBe(308);
    }
  });
});

/**
 * Stamped request path. Gated server components read x-app-pathname to remember
 * where an anonymous visitor was headed. The value must be the BROWSER path in
 * both environments, so the header has to be set BEFORE the /app rewrite - and
 * on the app subdomain, where the browser path carries no /app at all. (A
 * separate middleware scoped to /app would miss the subdomain case entirely.)
 */
function stampedPath(res: { headers: Headers }) {
  return res.headers.get("x-middleware-request-x-app-pathname");
}

describe("proxy stamps the requested path for gated pages", () => {
  it("stamps the /app-prefixed path locally", () => {
    const res = proxy(request("http://localhost:3000/app/settings/tokens"));
    expect(stampedPath(res)).toBe("/app/settings/tokens");
  });

  it("stamps the bare browser path on the app subdomain (pre-rewrite)", () => {
    const res = proxy(request("https://app.flagon.io/settings/tokens"));
    // Not /app/settings/tokens: the value must match what the browser shows so
    // the post-login `next` round-trips correctly in production.
    expect(stampedPath(res)).toBe("/settings/tokens");
  });

  it("stamps the query string alongside the path", () => {
    const res = proxy(request("https://app.flagon.io/acme/flags?tab=on"));
    expect(stampedPath(res)).toBe("/acme/flags");
    expect(res.headers.get("x-middleware-request-x-app-search")).toBe(
      "?tab=on",
    );
  });
});
