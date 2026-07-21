import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Stripe (checkout, billing portal) rejects relative return URLs, which is
 * exactly what appHref produces without a configured app origin. These
 * cover the branch that does NOT need a request context: when
 * NEXT_PUBLIC_APP_URL is set, the URL is already absolute.
 */
afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  vi.resetModules();
});

describe("absoluteAppUrl", () => {
  it("uses the configured app origin", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.flagon.io";
    const { absoluteAppUrl } = await import("./absolute-url");
    // No /app prefix in production: the app is the subdomain root.
    expect(await absoluteAppUrl("/acme/billing")).toBe(
      "https://app.flagon.io/acme/billing",
    );
    expect(await absoluteAppUrl("/acme")).toBe("https://app.flagon.io/acme");
  });

  it("always returns something absolute for Stripe", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.flagon.io";
    const { absoluteAppUrl } = await import("./absolute-url");
    expect(await absoluteAppUrl("/acme")).toMatch(/^https?:\/\//);
  });
});
