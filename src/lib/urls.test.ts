import { describe, it, expect } from "vitest";
import { marketingHref, appHref, apiHref } from "./urls";

describe("cross-surface url helpers", () => {
  it("returns relative paths when no base url is configured", () => {
    expect(marketingHref("/terms")).toBe("/terms");
    expect(appHref("/acme")).toBe("/acme");
    expect(apiHref("/v1/healthz")).toBe("/v1/healthz");
  });

  it("normalizes a path that is missing its leading slash", () => {
    expect(marketingHref("terms")).toBe("/terms");
  });

  it("defaults to the root path", () => {
    expect(appHref()).toBe("/");
  });
});
