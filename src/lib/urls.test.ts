import { describe, it, expect, vi } from "vitest";
import { marketingHref, appHref, apiHref, appPath } from "./urls";

describe("cross-surface url helpers", () => {
  it("falls back to path-based routing when no base url is configured", () => {
    expect(marketingHref("/terms")).toBe("/terms");
    expect(appHref("/acme")).toBe("/app/acme");
    expect(apiHref("/v1/healthz")).toBe("/api/v1/healthz");
  });

  it("normalizes a path that is missing its leading slash", () => {
    expect(marketingHref("terms")).toBe("/terms");
    expect(appHref("signin")).toBe("/app/signin");
  });

  it("defaults to the surface root without a trailing slash", () => {
    expect(marketingHref()).toBe("/");
    expect(appHref()).toBe("/app");
    expect(apiHref()).toBe("/api");
  });

  describe("appPath (in-app navigation)", () => {
    // Without NEXT_PUBLIC_APP_URL the app is path-mounted at /app.
    it("prefixes /app when the app has no dedicated origin", () => {
      expect(appPath("/acme/teams")).toBe("/app/acme/teams");
      expect(appPath("acme")).toBe("/app/acme");
      expect(appPath("/")).toBe("/app");
      expect(appPath("")).toBe("/app");
    });
  });
});

/**
 * With NEXT_PUBLIC_APP_URL set, the app is served at a subdomain ROOT, so
 * in-app links must carry NO prefix (app.flagon.io/acme/teams). This is the
 * production shape; a stale /app prefix there is a bug (the proxy 308s it
 * away as a backstop).
 */
describe("appPath on a dedicated app origin", () => {
  it("emits prefix-free paths", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.flagon.io";
    const urls = await import("./urls");
    expect(urls.appPath("/acme/teams")).toBe("/acme/teams");
    expect(urls.appPath("acme")).toBe("/acme");
    expect(urls.appPath("/")).toBe("/");
    // Cross-surface links stay absolute.
    expect(urls.appHref("/acme")).toBe("https://app.flagon.io/acme");
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.resetModules();
  });
});
