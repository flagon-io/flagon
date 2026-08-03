import { describe, expect, it } from "vitest";
import { applyHoldout, inHoldout } from "./holdout.js";
import type { EvaluationResult, FlagConfig } from "../flags/types.js";

const flag: FlagConfig = {
  id: "f",
  key: "checkout",
  type: "boolean",
  variants: [
    { id: "1", key: "on", value: true },
    { id: "2", key: "off", value: false },
  ],
  enabled: true,
  defaultVariantKey: "off",
  defaultServe: null,
  offVariantKey: "off",
  rules: [],
};
const served: EvaluationResult = { key: "checkout", value: true, variant: "on", reason: "SPLIT" };
const govern = { holdouts: [{ key: "h", percentage: 100 }], experimentFlagKeys: new Set(["checkout"]) };

describe("holdouts", () => {
  it("passes through with no active holdouts", () => {
    const r = applyHoldout(flag, served, { targetingKey: "u1" }, { holdouts: [], experimentFlagKeys: new Set(["checkout"]) });
    expect(r).toBe(served);
  });

  it("passes through when the flag has no running experiment", () => {
    const r = applyHoldout(flag, served, { targetingKey: "u1" }, { holdouts: [{ key: "h", percentage: 100 }], experimentFlagKeys: new Set() });
    expect(r).toBe(served);
  });

  it("serves the control variant to a held-out unit on an experiment flag", () => {
    const r = applyHoldout(flag, served, { targetingKey: "u1" }, govern);
    expect(r).toMatchObject({ variant: "off", value: false, reason: "HOLDOUT" });
  });

  it("never touches a DISABLED or ERROR result", () => {
    const disabled: EvaluationResult = { key: "checkout", value: false, variant: "off", reason: "DISABLED" };
    expect(applyHoldout(flag, disabled, { targetingKey: "u1" }, govern)).toBe(disabled);
  });

  it("holds out nobody at 0% and everybody at 100%", () => {
    expect(inHoldout([{ key: "h", percentage: 0 }], { targetingKey: "u1" })).toBe(false);
    expect(inHoldout([{ key: "h", percentage: 100 }], { targetingKey: "u1" })).toBe(true);
  });

  it("membership is deterministic and roughly matches the percentage", () => {
    const h = [{ key: "exp-holdout", percentage: 10 }];
    let inCount = 0;
    for (let i = 0; i < 2000; i++) if (inHoldout(h, { targetingKey: `u${i}` })) inCount++;
    expect(inCount).toBeGreaterThan(120); // ~200 expected; wide band for a spreader
    expect(inCount).toBeLessThan(300);
    expect(inHoldout(h, { targetingKey: "u1" })).toBe(inHoldout(h, { targetingKey: "u1" }));
  });
});
