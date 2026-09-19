import { describe, expect, it } from "vitest";
import { cn } from "../cn";
import { controlHeight } from "../control";

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
