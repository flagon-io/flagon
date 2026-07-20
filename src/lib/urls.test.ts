import { describe, it, expect } from "vitest";
import { marketingHref, appHref, apiHref } from "./urls";

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
});
