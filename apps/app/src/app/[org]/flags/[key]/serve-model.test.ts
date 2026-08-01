import { describe, expect, it } from "vitest";
import type { FlagVariant } from "@/lib/flags-api";
import {
  buildServe,
  defaultProgressive,
  hasServeErrors,
  parseServe,
  validateServe,
} from "./serve-model";

/**
 * The serve round-trip is the correctness-critical part of the rule editor: what
 * the UI stores must survive parse -> edit -> build unchanged, and a single
 * variant must never silently become a 100/0 rollout. No DB, pure functions.
 */
const bool = [
  { key: "on", value: true },
  { key: "off", value: false },
] as unknown as FlagVariant[];

const trio = [
  { key: "a", value: "a" },
  { key: "b", value: "b" },
  { key: "c", value: "c" },
] as unknown as FlagVariant[];

function serveOf(r: ReturnType<typeof buildServe>) {
  if ("error" in r) throw new Error(`unexpected error: ${r.error}`);
  return r.serve;
}

describe("serve-model", () => {
  it("round-trips a single-variant serve, staying a clean { variant }", () => {
    const draft = parseServe({ variant: "on" }, bool);
    expect(draft.weights).toEqual({ on: 100, off: 0 });
    expect(serveOf(buildServe(draft, bool))).toEqual({ variant: "on" });
  });

  it("round-trips a rollout with its weights and bucketBy", () => {
    const serve = {
      rollout: [
        { variant: "on", weight: 60 },
        { variant: "off", weight: 40 },
      ],
      bucketBy: "userId",
    };
    const draft = parseServe(serve, bool);
    expect(draft.weights).toEqual({ on: 60, off: 40 });
    expect(draft.bucketBy).toBe("userId");
    expect(serveOf(buildServe(draft, bool))).toEqual(serve);
  });

  it("collapses a 100/0 split to a single variant (never a rollout)", () => {
    expect(serveOf(buildServe({ weights: { on: 100, off: 0 }, bucketBy: "" }, bool))).toEqual({
      variant: "on",
    });
  });

  it("drops a bucketBy of targetingKey (the implicit default)", () => {
    expect(
      serveOf(buildServe({ weights: { on: 50, off: 50 }, bucketBy: "targetingKey" }, bool)),
    ).toEqual({
      rollout: [
        { variant: "on", weight: 50 },
        { variant: "off", weight: 50 },
      ],
    });
  });

  it("errors when the split does not total 100", () => {
    expect("error" in buildServe({ weights: { on: 50, off: 40 }, bucketBy: "" }, bool)).toBe(true);
  });

  it("errors when nothing is served", () => {
    expect("error" in buildServe({ weights: { on: 0, off: 0 }, bucketBy: "" }, bool)).toBe(true);
  });

  it("round-trips a three-way multivariate rollout", () => {
    const serve = {
      rollout: [
        { variant: "a", weight: 20 },
        { variant: "b", weight: 30 },
        { variant: "c", weight: 50 },
      ],
    };
    const draft = parseServe(serve, trio);
    expect(draft.weights).toEqual({ a: 20, b: 30, c: 50 });
    expect(serveOf(buildServe(draft, trio))).toEqual(serve);
  });

  it("keeps only positive-weight variants in a rollout", () => {
    expect(serveOf(buildServe({ weights: { a: 70, b: 0, c: 30 }, bucketBy: "" }, trio))).toEqual({
      rollout: [
        { variant: "a", weight: 70 },
        { variant: "c", weight: 30 },
      ],
    });
  });

  it("round-trips a split's fallback (un-bucketable) with its bucketBy", () => {
    const serve = {
      rollout: [
        { variant: "on", weight: 50 },
        { variant: "off", weight: 50 },
      ],
      bucketBy: "accountId",
      fallback: "off",
    };
    const draft = parseServe(serve, bool);
    expect(draft.fallback).toBe("off");
    expect(serveOf(buildServe(draft, bool))).toEqual(serve);
  });

  it("ignores a fallback that is not a real variant", () => {
    expect(
      serveOf(buildServe({ weights: { on: 50, off: 50 }, bucketBy: "acct", fallback: "ghost" }, bool)),
    ).toEqual({
      rollout: [
        { variant: "on", weight: 50 },
        { variant: "off", weight: 50 },
      ],
      bucketBy: "acct",
    });
  });
});

describe("serve-model — validation", () => {
  it("passes a valid single variant and a valid split", () => {
    expect(hasServeErrors(validateServe({ weights: { on: 100, off: 0 }, bucketBy: "" }, bool))).toBe(
      false,
    );
    expect(hasServeErrors(validateServe({ weights: { on: 60, off: 40 }, bucketBy: "" }, bool))).toBe(
      false,
    );
  });

  it("flags a split that does not total 100", () => {
    const e = validateServe({ weights: { on: 60, off: 30 }, bucketBy: "" }, bool);
    expect(e.split?.total).toMatch(/currently 90%/);
    expect(hasServeErrors(e)).toBe(true);
  });

  it("flags an out-of-range step percent and a zero duration", () => {
    const e = validateServe(
      {
        weights: {},
        bucketBy: "",
        progressive: {
          variant: "on",
          fallback: "off",
          bucketBy: "",
          start: 0,
          steps: [
            { percent: 255, value: 6, unit: "hours" },
            { percent: 10, value: 0, unit: "hours" },
          ],
        },
      },
      bool,
    );
    expect(e.progressive?.steps?.[0]?.percent).toMatch(/between 0% and 100%/);
    expect(e.progressive?.steps?.[1]?.duration).toMatch(/at least 1/);
  });

  it("flags a progressive rolling from and to the same variant", () => {
    const e = validateServe(
      {
        weights: {},
        bucketBy: "",
        progressive: {
          variant: "on",
          fallback: "on",
          bucketBy: "",
          start: 0,
          steps: [{ percent: 50, value: 6, unit: "hours" }],
        },
      },
      bool,
    );
    expect(e.progressive?.form).toMatch(/different variants/);
  });
});

describe("serve-model — defaultProgressive", () => {
  it("seeds Vercel's four-step 5/10/25/60 schedule", () => {
    const p = defaultProgressive(bool, 1000);
    expect(p.variant).toBe("off");
    expect(p.fallback).toBe("on");
    expect(p.steps.map((s) => s.percent)).toEqual([5, 10, 25, 60]);
    expect(p.steps.every((s) => s.value === 6 && s.unit === "hours")).toBe(true);
  });
});

describe("serve-model — progressive rollout", () => {
  it("round-trips a progressive rollout (steps <-> ms)", () => {
    const serve = {
      progressive: {
        variant: "on",
        fallback: "off",
        bucketBy: "userId",
        start: 1000,
        steps: [
          { percent: 10, durationMs: 6 * 3_600_000 },
          { percent: 50, durationMs: 6 * 3_600_000 },
        ],
      },
    };
    const draft = parseServe(serve, bool);
    expect(draft.progressive).toMatchObject({
      variant: "on",
      fallback: "off",
      bucketBy: "userId",
      start: 1000,
    });
    expect(draft.progressive!.steps).toEqual([
      { percent: 10, value: 6, unit: "hours" },
      { percent: 50, value: 6, unit: "hours" },
    ]);
    expect(serveOf(buildServe(draft, bool))).toEqual(serve);
  });

  it("drops a targetingKey bucketBy and errors on an empty schedule", () => {
    const built = buildServe(
      {
        weights: {},
        bucketBy: "",
        progressive: {
          variant: "on",
          fallback: "off",
          bucketBy: "targetingKey",
          start: 5,
          steps: [{ percent: 100, value: 1, unit: "days" }],
        },
      },
      bool,
    );
    if ("error" in built) throw new Error(built.error);
    expect(built.serve).toEqual({
      progressive: {
        variant: "on",
        fallback: "off",
        start: 5,
        steps: [{ percent: 100, durationMs: 86_400_000 }],
      },
    });
    expect(
      "error" in
        buildServe(
          { weights: {}, bucketBy: "", progressive: { variant: "on", fallback: "off", bucketBy: "", start: 0, steps: [] } },
          bool,
        ),
    ).toBe(true);
  });
});
