import { describe, expect, it } from "vitest";
import { planVariants } from "./seed.js";

describe("planVariants", () => {
  it("boolean flags get on/off, defaulting on", () => {
    const plan = planVariants("boolean", []);
    expect(plan.variants).toEqual([
      { key: "on", value: true, label: "On", sortOrder: 0 },
      { key: "off", value: false, label: "Off", sortOrder: 1 },
    ]);
    expect(plan.defaultKey).toBe("on");
    expect(plan.offKey).toBe("off");
  });

  it("multivariate flags key variants variant-1..N in order", () => {
    const plan = planVariants("string", [
      { value: "red", label: "Red" },
      { value: "green" },
      { value: "blue", label: null },
    ]);
    expect(plan.variants.map((v) => v.key)).toEqual(["variant-1", "variant-2", "variant-3"]);
    expect(plan.variants.map((v) => v.value)).toEqual(["red", "green", "blue"]);
    expect(plan.variants[1].label).toBeNull();
    expect(plan.defaultKey).toBe("variant-1");
    expect(plan.offKey).toBe("variant-1");
  });

  it("carries number and json values through", () => {
    const nums = planVariants("number", [{ value: 0 }, { value: 1 }]);
    expect(nums.variants.map((v) => v.value)).toEqual([0, 1]);
    const json = planVariants("json", [{ value: { a: 1 } }]);
    expect(json.variants[0].value).toEqual({ a: 1 });
  });
});
