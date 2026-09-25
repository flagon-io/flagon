import { describe, expect, it } from "vitest";
import { cn } from "../cn";
import { controlHeight, focusRing, focusRingInset, focusWithinRing } from "../control";
import { overlayClasses } from "../overlay";

describe("cn", () => {
  it("joins truthy classes and drops falsy ones", () => {
    expect(cn("a", false && "b", null, undefined, "c")).toBe("a c");
  });

  it("de-duplicates conflicting Tailwind utilities (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm text-muted-foreground", "text-foreground")).toBe(
      "text-sm text-foreground",
    );
  });
});

describe("controlHeight", () => {
  it("maps each size to a token-backed height utility", () => {
    expect(controlHeight.sm).toContain("--control-sm");
    expect(controlHeight.md).toContain("--control-md");
    expect(controlHeight.lg).toContain("--control-lg");
  });
});

describe("focus treatment", () => {
  it("is one outline-based ring in the --ring color (never a box-shadow ring)", () => {
    for (const cls of [focusRing, focusRingInset]) {
      expect(cls).toContain("focus-visible:outline-2");
      expect(cls).toContain("focus-visible:outline-ring");
      // box-shadow belongs to the Brand's button elevation; a ring would fight it.
      expect(cls).not.toMatch(/\bring-\d/);
    }
    expect(focusRing).toContain("focus-visible:outline-offset-2");
    expect(focusRingInset).toContain("focus-visible:-outline-offset-2");
    expect(focusWithinRing).toContain("focus-within:outline-ring");
  });

  it("lets a caller re-tint the ring (tailwind-merge resolves the color)", () => {
    const merged = cn(focusRingInset, "focus-visible:outline-sidebar-ring");
    expect(merged).toContain("focus-visible:outline-sidebar-ring");
    expect(merged).not.toContain("focus-visible:outline-ring ");
  });
});

describe("overlayClasses", () => {
  it("paints the shared --overlay token, and caller layout merges on top", () => {
    expect(overlayClasses).toContain("bg-overlay");
    expect(overlayClasses).toContain("fixed inset-0");
    expect(cn(overlayClasses, "flex items-start")).toContain("flex items-start");
  });
});
