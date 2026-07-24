import { describe, expect, it } from "vitest";
import { buildArtifact, parseArtifact } from "./config-artifact";
import type { FlagConfig } from "./flag-config-cache.server";
import {
  emptyCriteria,
  evaluateFlag,
  type EvaluableFlag,
  type EvaluationContext,
  type SegmentDefinition,
} from "./flags";

/**
 * Existing flags must evaluate IDENTICALLY whether their config is read from the
 * database or from the R2 artifact - otherwise a rollout would silently change
 * served values. This proves the serialize -> store -> parse round-trip is
 * lossless for everything evaluation actually reads (types, variants, targeting
 * rules, rollouts, segment criteria), across representative flags and contexts.
 */

let seq = 0;
function flagRow(row: {
  key: string;
  type: string;
  variants: Array<{ key: string; value: unknown }>;
  defaultVariant: string;
  rules?: unknown[];
}) {
  seq += 1;
  return {
    id: `00000000-0000-0000-0000-0000000000${String(seq).padStart(2, "0")}`,
    organizationId: "org",
    key: row.key,
    name: row.key,
    description: null,
    type: row.type,
    variants: row.variants,
    defaultVariant: row.defaultVariant,
    rules: row.rules ?? [],
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-06-15T12:34:56.000Z"),
  };
}

const config: FlagConfig = {
  segments: [
    {
      id: "seg-1",
      organizationId: "org",
      key: "beta-users",
      name: "Beta users",
      description: null,
      criteria: {
        operator: "all",
        items: [
          {
            kind: "attribute",
            attribute: "betaOptIn",
            operator: "equals",
            value: true,
            valueType: "boolean",
          },
        ],
      },
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-06-15T12:34:56.000Z"),
    },
  ] as unknown as FlagConfig["segments"],
  flags: [
    // Boolean gated on a segment reference (TARGETING_MATCH).
    flagRow({
      key: "new-checkout",
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
            items: [{ kind: "segment", segment: "beta-users" }],
          },
          variant: "on",
        },
      ],
    }),
    // Multivariate string with attribute rules incl. a list `in` operator.
    flagRow({
      key: "banner",
      type: "string",
      variants: [
        { key: "control", value: "control" },
        { key: "modern", value: "modern" },
        { key: "bold", value: "bold" },
      ],
      defaultVariant: "control",
      rules: [
        {
          criteria: {
            operator: "all",
            items: [
              {
                kind: "attribute",
                attribute: "plan",
                operator: "equals",
                value: "pro",
                valueType: "string",
              },
            ],
          },
          variant: "bold",
        },
        {
          criteria: {
            operator: "all",
            items: [
              {
                kind: "attribute",
                attribute: "country",
                operator: "in",
                value: ["US", "CA"],
                valueType: "list",
              },
            ],
          },
          variant: "modern",
        },
      ],
    }),
    // Percentage rollout (SPLIT), deterministic by targetingKey.
    flagRow({
      key: "rollout",
      type: "string",
      variants: [
        { key: "a", value: "a" },
        { key: "b", value: "b" },
      ],
      defaultVariant: "a",
      rules: [
        {
          criteria: emptyCriteria(),
          rollout: [
            { variant: "a", weight: 50 },
            { variant: "b", weight: 50 },
          ],
        },
      ],
    }),
    // No rules -> STATIC default.
    flagRow({
      key: "always-on",
      type: "boolean",
      variants: [
        { key: "off", value: false },
        { key: "on", value: true },
      ],
      defaultVariant: "on",
    }),
  ] as unknown as FlagConfig["flags"],
};

const contexts: EvaluationContext[] = [
  { targetingKey: "u1", betaOptIn: true },
  { targetingKey: "u2", betaOptIn: false, plan: "pro" },
  { targetingKey: "u3", country: "US" },
  { targetingKey: "u4" },
  { targetingKey: "u5", plan: "free", country: "FR" },
  { targetingKey: "u6", betaOptIn: true, plan: "pro", country: "CA" },
];

const toEvaluable = (f: FlagConfig["flags"][number]): EvaluableFlag => ({
  key: f.key,
  type: f.type as EvaluableFlag["type"],
  variants: f.variants as EvaluableFlag["variants"],
  defaultVariant: f.defaultVariant,
  rules: f.rules as EvaluableFlag["rules"],
});

function evaluateAll(c: FlagConfig, ctx: EvaluationContext) {
  const segments: SegmentDefinition[] = c.segments.map((s) => ({
    key: s.key,
    criteria: s.criteria as SegmentDefinition["criteria"],
  }));
  return c.flags.map((f) => evaluateFlag(toEvaluable(f), segments, ctx));
}

describe("evaluation parity: database vs R2 artifact", () => {
  it("produces identical results from the parsed artifact and the source config", () => {
    const parsed = parseArtifact(buildArtifact("org", config).body).config;
    for (const ctx of contexts) {
      expect(evaluateAll(parsed, ctx)).toEqual(evaluateAll(config, ctx));
    }
  });

  it("actually exercises TARGETING_MATCH, SPLIT, and STATIC", () => {
    const reasons = new Set(
      contexts.flatMap((ctx) => evaluateAll(config, ctx).map((r) => r.reason)),
    );
    expect(reasons).toEqual(
      new Set(["TARGETING_MATCH", "SPLIT", "STATIC"]),
    );
  });
});
