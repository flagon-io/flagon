import { describe, it, expect } from "vitest";
import { isValidUsername } from "./username";

describe("username rules", () => {
  it("accepts alphanumerics and single hyphen separators", () => {
    expect(isValidUsername("syntaqx")).toBe(true);
    expect(isValidUsername("Chase-Pierce")).toBe(true);
    expect(isValidUsername("a1")).toBe(true);
    expect(isValidUsername("0day")).toBe(true);
  });

  it("rejects leading, trailing, and consecutive hyphens", () => {
    expect(isValidUsername("-nope")).toBe(false);
    expect(isValidUsername("nope-")).toBe(false);
    expect(isValidUsername("no--pe")).toBe(false);
  });

  it("rejects other characters", () => {
    expect(isValidUsername("under_score")).toBe(false);
    expect(isValidUsername("dot.name")).toBe(false);
    expect(isValidUsername("sp ace")).toBe(false);
    expect(isValidUsername("")).toBe(false);
  });
});
