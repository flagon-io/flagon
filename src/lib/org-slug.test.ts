import { describe, it, expect } from "vitest";
import { suggestOrgSlug, validateOrgSlug } from "./org-slug";

describe("organization slug rules", () => {
  it("accepts well-formed slugs", () => {
    expect(validateOrgSlug("acme")).toEqual({ ok: true });
    expect(validateOrgSlug("acme-corp")).toEqual({ ok: true });
    expect(validateOrgSlug("ACME")).toEqual({ ok: true }); // normalized lower
  });

  it("rejects malformed slugs", () => {
    expect(validateOrgSlug("a").ok).toBe(false);
    expect(validateOrgSlug("-acme").ok).toBe(false);
    expect(validateOrgSlug("ac--me").ok).toBe(false);
    expect(validateOrgSlug("ac me").ok).toBe(false);
    expect(validateOrgSlug("a".repeat(40)).ok).toBe(false);
  });

  it("blocks only app-route segments (an org there would be unreachable)", () => {
    for (const slug of [
      "signin",
      "signup",
      "forgot-password",
      "reset-password",
      "settings",
      "new",
      "invitations",
      "api",
    ]) {
      expect(validateOrgSlug(slug).ok, slug).toBe(false);
    }
  });

  it("everything else is first-come, including brand and platform words", () => {
    for (const slug of ["flagon", "docs", "admin", "support", "billing"]) {
      expect(validateOrgSlug(slug).ok, slug).toBe(true);
    }
  });

  it("suggests clean slugs from names", () => {
    expect(suggestOrgSlug("Acme Corp")).toBe("acme-corp");
    expect(suggestOrgSlug("  Émile & Sons!  ")).toBe("mile-sons");
    expect(suggestOrgSlug("Flagon.io")).toBe("flagon-io");
  });
});
