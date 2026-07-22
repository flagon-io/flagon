import { describe, it, expect } from "vitest";
import { subscriptionPlan } from "./plans";

/**
 * The plan an active subscription declares through metadata.flagon_plan.
 *
 * This is the seam that lets a contract subscription (created outside Checkout)
 * put an org on enterprise instead of being forced to Pro on every renewal by
 * the webhook. The defaulting has to be conservative: an active subscription is
 * money changing hands, so an absent or junk marker must resolve to a real paid
 * plan (pro), never to free and never to an attacker-supplied string.
 */
describe("subscriptionPlan", () => {
  it("honors an explicit enterprise marker", () => {
    expect(subscriptionPlan({ flagon_plan: "enterprise" })).toBe("enterprise");
  });

  it("defaults to pro when there is no marker (self-serve Checkout sub)", () => {
    expect(subscriptionPlan({})).toBe("pro");
    expect(subscriptionPlan(null)).toBe("pro");
    expect(subscriptionPlan(undefined)).toBe("pro");
  });

  it("treats an explicit pro marker as pro", () => {
    expect(subscriptionPlan({ flagon_plan: "pro" })).toBe("pro");
  });

  it("falls back to pro for an unrecognized marker, never trusting the string", () => {
    expect(subscriptionPlan({ flagon_plan: "platinum" })).toBe("pro");
    expect(subscriptionPlan({ flagon_plan: "" })).toBe("pro");
  });

  it("never subscribes an active sub onto the un-billable free tier", () => {
    // An active subscription is by definition at least Pro; a 'free' marker is
    // nonsensical and must not strand a paying org on the free plan.
    expect(subscriptionPlan({ flagon_plan: "free" })).toBe("pro");
  });

  it("ignores unrelated metadata keys", () => {
    expect(
      subscriptionPlan({
        flagon_plan: "enterprise",
        organization_id: "org_123",
      } as { flagon_plan?: string | null }),
    ).toBe("enterprise");
  });
});
