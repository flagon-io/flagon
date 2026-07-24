import { describe, it, expect } from "vitest";
import { subscriptionPlan } from "./plans";

/**
 * The plan an active subscription resolves to.
 *
 * There is exactly one billable plan (Pro), so any active subscription resolves
 * to `pro` regardless of what its metadata declares. An active subscription is
 * money changing hands, so it must never resolve to the un-billable free tier or
 * to an attacker-supplied string.
 */
describe("subscriptionPlan", () => {
  it("resolves any active subscription to pro", () => {
    expect(subscriptionPlan({})).toBe("pro");
    expect(subscriptionPlan(null)).toBe("pro");
    expect(subscriptionPlan(undefined)).toBe("pro");
    expect(subscriptionPlan({ flagon_plan: "pro" })).toBe("pro");
  });

  it("never trusts the marker string, and never strands a sub on free", () => {
    expect(subscriptionPlan({ flagon_plan: "platinum" })).toBe("pro");
    expect(subscriptionPlan({ flagon_plan: "" })).toBe("pro");
    expect(subscriptionPlan({ flagon_plan: "free" })).toBe("pro");
  });

  it("ignores unrelated metadata keys", () => {
    expect(
      subscriptionPlan({
        flagon_plan: "pro",
        organization_id: "org_123",
      } as { flagon_plan?: string | null }),
    ).toBe("pro");
  });
});
