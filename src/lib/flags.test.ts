import { describe, expect, it } from "vitest";
import {
  coerceValue,
  evaluateFlag,
  normalizeFlagKey,
  validateDefinition,
  validateKeyAndName,
} from "./flags";

describe("feature flags", () => {
  it("normalizes and validates stable keys", () => {
    expect(normalizeFlagKey(" New Checkout ")).toBe("new-checkout");
    expect(
      validateKeyAndName({ key: "new-checkout", name: "New checkout" }).ok,
    ).toBe(true);
    expect(validateKeyAndName({ key: "9bad", name: "Bad" }).ok).toBe(false);
  });
  it("evaluates reusable segments and typed variants", () => {
    const result = evaluateFlag(
      {
        key: "checkout",
        type: "string",
        variants: [
          { key: "control", value: "old" },
          { key: "beta", value: "new" },
        ],
        defaultVariant: "control",
        rules: [
          {
            criteria: {
              operator: "all",
              items: [{ kind: "segment", segment: "beta-users" }],
            },
            variant: "beta",
          },
        ],
      },
      [
        {
          key: "beta-users",
          criteria: {
            operator: "all",
            items: [
              {
                kind: "attribute",
                attribute: "plan",
                operator: "equals",
                value: "beta",
              },
            ],
          },
        },
      ],
      { targetingKey: "user-1", plan: "beta" },
    );
    expect(result).toEqual({
      key: "checkout",
      value: "new",
      reason: "TARGETING_MATCH",
      variant: "beta",
    });
  });
  it("keeps percentage rollouts deterministic", () => {
    const flag = {
      key: "checkout",
      type: "boolean" as const,
      variants: [
        { key: "off", value: false },
        { key: "on", value: true },
      ],
      defaultVariant: "off",
      rules: [
        {
          criteria: { operator: "all" as const, items: [] },
          rollout: [
            { variant: "off", weight: 50 },
            { variant: "on", weight: 50 },
          ],
        },
      ],
    };
    expect(evaluateFlag(flag, [], { targetingKey: "stable-user" })).toEqual(
      evaluateFlag(flag, [], { targetingKey: "stable-user" }),
    );
  });
  it("evaluates ordered else-if rules and OR criteria", () => {
    const result = evaluateFlag(
      {
        key: "offer",
        type: "string",
        variants: [
          { key: "none", value: "none" },
          { key: "vip", value: "vip" },
        ],
        defaultVariant: "none",
        rules: [
          {
            criteria: {
              operator: "any",
              items: [
                {
                  kind: "attribute",
                  attribute: "country",
                  operator: "equals",
                  value: "US",
                },
                {
                  kind: "attribute",
                  attribute: "plan",
                  operator: "equals",
                  value: "enterprise",
                },
              ],
            },
            variant: "vip",
          },
        ],
      },
      [],
      { targetingKey: "user", country: "CA", plan: "enterprise" },
    );
    expect(result).toMatchObject({ value: "vip", reason: "TARGETING_MATCH" });
  });
  it("uses OFREP's STATIC reason for the final else", () => {
    expect(
      evaluateFlag(
        {
          key: "flag",
          type: "boolean",
          variants: [{ key: "off", value: false }],
          defaultVariant: "off",
          rules: [],
        },
        [],
        { targetingKey: "user" },
      ).reason,
    ).toBe("STATIC");
  });
  it("rejects malformed rollouts", () => {
    expect(
      validateDefinition(
        "boolean",
        [
          { key: "off", value: false },
          { key: "on", value: true },
        ],
        "off",
        [
          {
            criteria: { operator: "all", items: [] },
            rollout: [{ variant: "on", weight: 80 }],
          },
        ],
      ),
    ).toContain("100%");
  });
  it("coerces every supported flag type", () => {
    expect(coerceValue("boolean", true)).toBe(true);
    expect(coerceValue("string", "hello")).toBe("hello");
    expect(coerceValue("integer", 3)).toBe(3);
    expect(coerceValue("float", 3.5)).toBe(3.5);
    expect(coerceValue("object", { enabled: true })).toEqual({ enabled: true });
    expect(() => coerceValue("integer", 3.5)).toThrow();
  });
  it.each([
    ["boolean", false],
    ["string", "blue"],
    ["integer", 7],
    ["float", 2.5],
    ["object", { theme: "dark" }],
  ] as const)(
    "returns a typed %s value through the same evaluator",
    (type, value) => {
      expect(
        evaluateFlag(
          {
            key: `typed-${type}`,
            type,
            variants: [{ key: "default", value }],
            defaultVariant: "default",
            rules: [],
          },
          [],
          { targetingKey: "user" },
        ),
      ).toMatchObject({ value, variant: "default", reason: "STATIC" });
    },
  );
  it("compares explicitly typed date-time context", () => {
    expect(
      evaluateFlag(
        {
          key: "launch",
          type: "boolean",
          variants: [
            { key: "off", value: false },
            { key: "on", value: true },
          ],
          defaultVariant: "off",
          rules: [
            {
              criteria: {
                operator: "all",
                items: [
                  {
                    kind: "attribute",
                    attribute: "now",
                    operator: "greater_than",
                    valueType: "datetime",
                    value: "2026-01-01T00:00",
                  },
                ],
              },
              variant: "on",
            },
          ],
        },
        [],
        { targetingKey: "user", now: "2026-02-01T00:00:00Z" },
      ).value,
    ).toBe(true);
  });
});
