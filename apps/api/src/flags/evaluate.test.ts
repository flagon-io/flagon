import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import type { FlagConfig, RuleConfig, SegmentConfig } from "./types.js";

const noSegments = new Map<string, SegmentConfig>();

function boolFlag(enabled: boolean, rules: RuleConfig[] = []): FlagConfig {
  return {
    id: "flag-checkout",
    key: "checkout",
    type: "boolean",
    variants: [
      { id: "1", key: "on", value: true },
      { id: "2", key: "off", value: false },
    ],
    enabled,
    defaultVariantKey: "on",
    defaultServe: null,
    offVariantKey: "off",
    rules,
  };
}

describe("evaluate — boolean", () => {
  it("serves off when disabled in the environment", () => {
    const r = evaluate(boolFlag(false), { targetingKey: "u1" }, noSegments);
    expect(r).toMatchObject({ value: false, variant: "off", reason: "DISABLED" });
  });

  it("serves the default (on) when enabled with no rules", () => {
    const r = evaluate(boolFlag(true), { targetingKey: "u1" }, noSegments);
    expect(r).toMatchObject({ value: true, variant: "on", reason: "STATIC" });
  });

  it("serves a matching targeting rule over the default", () => {
    const flag = boolFlag(true, [
      { priority: 0, conditions: [{ attribute: "plan", op: "eq", values: ["free"] }], serve: { variant: "off" } },
    ]);
    expect(evaluate(flag, { targetingKey: "u1", plan: "free" }, noSegments)).toMatchObject({
      value: false,
      variant: "off",
      reason: "TARGETING_MATCH",
    });
    expect(evaluate(flag, { targetingKey: "u1", plan: "pro" }, noSegments)).toMatchObject({
      value: true,
      variant: "on",
      reason: "DEFAULT",
    });
  });

  it("respects rule priority (lowest number wins)", () => {
    const flag = boolFlag(true, [
      { priority: 10, conditions: [], serve: { variant: "off" } },
      { priority: 1, conditions: [], serve: { variant: "on" } },
    ]);
    expect(evaluate(flag, { targetingKey: "u1" }, noSegments).variant).toBe("on");
  });
});

describe("evaluate — targeting via segment", () => {
  const segments = new Map<string, SegmentConfig>([
    ["beta", { key: "beta", conditions: [{ attribute: "email", op: "ends_with", values: ["@flagon.io"] }] }],
  ]);

  it("matches a rule that references a segment", () => {
    const flag = boolFlag(true, [
      { priority: 0, conditions: [{ segment: "beta" }], serve: { variant: "on" } },
    ]);
    // A rule serving "on" is the default anyway; flip default to off to prove the rule fired.
    flag.defaultVariantKey = "off";
    expect(evaluate(flag, { targetingKey: "u", email: "robin@flagon.io" }, segments).reason).toBe("TARGETING_MATCH");
    expect(evaluate(flag, { targetingKey: "u", email: "x@other.com" }, segments).reason).toBe("DEFAULT");
  });
});

describe("evaluate — rollout (SPLIT)", () => {
  const flag = boolFlag(true, [
    {
      priority: 0,
      conditions: [],
      serve: { rollout: [{ variant: "on", weight: 50 }, { variant: "off", weight: 50 }] },
    },
  ]);

  it("is sticky for a given identity", () => {
    const a = evaluate(flag, { targetingKey: "user-123" }, noSegments);
    const b = evaluate(flag, { targetingKey: "user-123" }, noSegments);
    expect(a.variant).toBe(b.variant);
    expect(a.reason).toBe("SPLIT");
  });

  it("splits ~50/50 across identities", () => {
    let on = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      if (evaluate(flag, { targetingKey: `user-${i}` }, noSegments).variant === "on") on++;
    }
    expect(on).toBeGreaterThan(n * 0.42);
    expect(on).toBeLessThan(n * 0.58);
  });

  it("honors weights (90/10)", () => {
    const skewed = boolFlag(true, [
      { priority: 0, conditions: [], serve: { rollout: [{ variant: "on", weight: 90 }, { variant: "off", weight: 10 }] } },
    ]);
    let on = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      if (evaluate(skewed, { targetingKey: `u-${i}` }, noSegments).variant === "on") on++;
    }
    expect(on / n).toBeGreaterThan(0.85);
    expect(on / n).toBeLessThan(0.95);
  });
});

describe("evaluate — default rollout (SPLIT with no rule)", () => {
  function defaultRolloutFlag(): FlagConfig {
    const flag = boolFlag(true);
    flag.defaultServe = {
      rollout: [
        { variant: "on", weight: 25 },
        { variant: "off", weight: 75 },
      ],
    };
    return flag;
  }

  it("splits everyone by default with reason SPLIT (no rules)", () => {
    const r = evaluate(defaultRolloutFlag(), { targetingKey: "user-123" }, noSegments);
    expect(r.reason).toBe("SPLIT");
    expect(["on", "off"]).toContain(r.variant);
  });

  it("honors default rollout weights (~25/75)", () => {
    const flag = defaultRolloutFlag();
    let on = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      if (evaluate(flag, { targetingKey: `u-${i}` }, noSegments).variant === "on") on++;
    }
    expect(on / n).toBeGreaterThan(0.19);
    expect(on / n).toBeLessThan(0.31);
  });

  it("falls back to the default variant when the default rollout is degenerate", () => {
    const flag = boolFlag(true);
    flag.defaultServe = { rollout: [{ variant: "on", weight: 0 }, { variant: "off", weight: 0 }] };
    const r = evaluate(flag, { targetingKey: "u" }, noSegments);
    expect(r).toMatchObject({ variant: "on", reason: "STATIC" });
  });
});

describe("evaluate — rollout bucketBy", () => {
  it("buckets on a custom attribute so users in the same account stick together", () => {
    const flag = boolFlag(true, [
      {
        priority: 0,
        conditions: [],
        serve: {
          rollout: [{ variant: "on", weight: 50 }, { variant: "off", weight: 50 }],
          bucketBy: "accountId",
        },
      },
    ]);
    // Same accountId → same variant regardless of targetingKey.
    const a = evaluate(flag, { targetingKey: "user-1", accountId: "acct-9" }, noSegments);
    const b = evaluate(flag, { targetingKey: "user-2", accountId: "acct-9" }, noSegments);
    expect(a.variant).toBe(b.variant);
    expect(a.reason).toBe("SPLIT");
  });
});

describe("evaluate — multivariate", () => {
  const color: FlagConfig = {
    id: "flag-color",
    key: "test-color",
    type: "string",
    variants: [
      { id: "1", key: "red", value: "red" },
      { id: "2", key: "green", value: "green" },
      { id: "3", key: "blue", value: "blue" },
    ],
    enabled: true,
    defaultVariantKey: "red",
    defaultServe: null,
    offVariantKey: "red",
    rules: [
      { priority: 0, conditions: [{ attribute: "team", op: "eq", values: ["design"] }], serve: { variant: "blue" } },
    ],
  };

  it("serves a string variant value", () => {
    expect(evaluate(color, { targetingKey: "u", team: "design" }, noSegments)).toMatchObject({
      value: "blue",
      variant: "blue",
      reason: "TARGETING_MATCH",
    });
    expect(evaluate(color, { targetingKey: "u", team: "eng" }, noSegments).value).toBe("red");
  });
});

describe("evaluate — error handling", () => {
  it("returns ERROR when the served variant does not exist", () => {
    const broken = boolFlag(true);
    broken.defaultVariantKey = "ghost";
    const r = evaluate(broken, { targetingKey: "u" }, noSegments);
    expect(r).toMatchObject({ value: null, reason: "ERROR", errorCode: "GENERAL" });
  });
});
