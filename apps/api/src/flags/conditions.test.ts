import { describe, expect, it } from "vitest";
import { matchConditions, resolvePath } from "./conditions.js";
import type { Predicate, SegmentConfig } from "./types.js";

const noSegments = new Map<string, SegmentConfig>();

function match(conditions: Predicate[], context: Record<string, unknown>) {
  return matchConditions(conditions, context, noSegments);
}

describe("resolvePath", () => {
  it("reads nested attributes by dotted path", () => {
    expect(resolvePath({ user: { plan: "pro" } }, "user.plan")).toBe("pro");
  });
  it("is undefined for missing paths", () => {
    expect(resolvePath({ user: {} }, "user.plan")).toBeUndefined();
    expect(resolvePath({}, "a.b.c")).toBeUndefined();
  });
});

describe("operators", () => {
  it("eq / neq with loose typing", () => {
    expect(match([{ attribute: "n", op: "eq", values: [42] }], { n: 42 })).toBe(true);
    expect(match([{ attribute: "n", op: "eq", values: ["42"] }], { n: 42 })).toBe(true);
    expect(match([{ attribute: "n", op: "neq", values: [1] }], { n: 42 })).toBe(true);
  });

  it("in / nin", () => {
    expect(
      match([{ attribute: "c", op: "in", values: ["us", "ca"] }], { c: "ca" }),
    ).toBe(true);
    expect(
      match([{ attribute: "c", op: "nin", values: ["us", "ca"] }], { c: "mx" }),
    ).toBe(true);
  });

  it("string ops", () => {
    expect(
      match([{ attribute: "e", op: "ends_with", values: ["@flagon.io"] }], {
        e: "robin@flagon.io",
      }),
    ).toBe(true);
    expect(
      match([{ attribute: "e", op: "contains", values: ["@"] }], { e: "a@b" }),
    ).toBe(true);
    expect(
      match([{ attribute: "e", op: "starts_with", values: ["ro"] }], {
        e: "robin",
      }),
    ).toBe(true);
  });

  it("numeric comparisons", () => {
    expect(match([{ attribute: "age", op: "gte", values: [18] }], { age: 21 })).toBe(true);
    expect(match([{ attribute: "age", op: "lt", values: [18] }], { age: 21 })).toBe(false);
    expect(match([{ attribute: "age", op: "gt", values: ["x"] }], { age: 21 })).toBe(false);
  });

  it("exists / not_exists", () => {
    expect(match([{ attribute: "x", op: "exists" }], { x: 0 })).toBe(true);
    expect(match([{ attribute: "x", op: "exists" }], {})).toBe(false);
    expect(match([{ attribute: "x", op: "not_exists" }], { x: null })).toBe(true);
  });

  it("regex, safely", () => {
    expect(match([{ attribute: "s", op: "regex", values: ["^a.*z$"] }], { s: "abcz" })).toBe(true);
    expect(match([{ attribute: "s", op: "regex", values: ["("] }], { s: "x" })).toBe(false);
  });

  it("missing attribute fails any comparison", () => {
    expect(match([{ attribute: "x", op: "eq", values: [1] }], {})).toBe(false);
  });

  it("time before / after against the server-injected $currentTime", () => {
    const now = Date.parse("2026-07-27T12:00:00Z");
    const ctx = { $currentTime: now };
    // now is after a past moment, before a future one.
    expect(
      match([{ attribute: "$currentTime", op: "after", values: ["2026-01-01T00:00:00Z"] }], ctx),
    ).toBe(true);
    expect(
      match([{ attribute: "$currentTime", op: "before", values: ["2026-12-31T00:00:00Z"] }], ctx),
    ).toBe(true);
    expect(
      match([{ attribute: "$currentTime", op: "after", values: ["2026-12-31T00:00:00Z"] }], ctx),
    ).toBe(false);
    // epoch-millis values and unparseable values.
    expect(match([{ attribute: "$currentTime", op: "after", values: [now - 1] }], ctx)).toBe(true);
    expect(match([{ attribute: "$currentTime", op: "after", values: ["nonsense"] }], ctx)).toBe(false);
  });

  it("semver comparisons ignore pre-release suffixes and pad segments", () => {
    expect(match([{ attribute: "v", op: "semver_ge", values: ["1.2.0"] }], { v: "1.10.0" })).toBe(true);
    expect(match([{ attribute: "v", op: "semver_lt", values: ["1.2.0"] }], { v: "1.1.9" })).toBe(true);
    expect(match([{ attribute: "v", op: "semver_eq", values: ["1.2"] }], { v: "1.2.0" })).toBe(true);
    expect(match([{ attribute: "v", op: "semver_gt", values: ["1.2.0"] }], { v: "v1.3.0-beta" })).toBe(true);
    expect(match([{ attribute: "v", op: "semver_ge", values: ["1.0.0"] }], { v: "not-a-version" })).toBe(false);
  });

  it("ANDs all conditions", () => {
    const conds: Predicate[] = [
      { attribute: "plan", op: "eq", values: ["pro"] },
      { attribute: "age", op: "gte", values: [18] },
    ];
    expect(match(conds, { plan: "pro", age: 20 })).toBe(true);
    expect(match(conds, { plan: "pro", age: 16 })).toBe(false);
  });
});

describe("AND / OR groups", () => {
  const pro: Predicate = { attribute: "plan", op: "eq", values: ["pro"] };
  const admin: Predicate = { attribute: "role", op: "eq", values: ["admin"] };

  it("any = OR", () => {
    expect(match([{ any: [pro, admin] }], { plan: "free", role: "admin" })).toBe(true);
    expect(match([{ any: [pro, admin] }], { plan: "pro", role: "user" })).toBe(true);
    expect(match([{ any: [pro, admin] }], { plan: "free", role: "user" })).toBe(false);
  });

  it("all = AND", () => {
    expect(match([{ all: [pro, admin] }], { plan: "pro", role: "admin" })).toBe(true);
    expect(match([{ all: [pro, admin] }], { plan: "pro", role: "user" })).toBe(false);
  });

  it("nests A AND (B OR C)", () => {
    const conds: Predicate[] = [
      pro,
      {
        any: [
          { attribute: "country", op: "eq", values: ["us"] },
          { attribute: "country", op: "eq", values: ["ca"] },
        ],
      },
    ];
    expect(match(conds, { plan: "pro", country: "ca" })).toBe(true);
    expect(match(conds, { plan: "pro", country: "mx" })).toBe(false);
    expect(match(conds, { plan: "free", country: "us" })).toBe(false);
  });

  it("nests deeply: (A OR (B AND C))", () => {
    const conds: Predicate[] = [
      {
        any: [
          admin,
          { all: [pro, { attribute: "seats", op: "gte", values: [5] }] },
        ],
      },
    ];
    expect(match(conds, { role: "admin" })).toBe(true);
    expect(match(conds, { role: "user", plan: "pro", seats: 10 })).toBe(true);
    expect(match(conds, { role: "user", plan: "pro", seats: 2 })).toBe(false);
    expect(match(conds, { role: "user", plan: "free", seats: 10 })).toBe(false);
  });
});

describe("segments", () => {
  const segments = new Map<string, SegmentConfig>([
    ["beta", { key: "beta", conditions: [{ attribute: "plan", op: "eq", values: ["pro"] }] }],
    ["loop-a", { key: "loop-a", conditions: [{ segment: "loop-b" }] }],
    ["loop-b", { key: "loop-b", conditions: [{ segment: "loop-a" }] }],
  ]);

  it("resolves a segment reference", () => {
    expect(matchConditions([{ segment: "beta" }], { plan: "pro" }, segments)).toBe(true);
    expect(matchConditions([{ segment: "beta" }], { plan: "free" }, segments)).toBe(false);
  });

  it("unknown segment does not match", () => {
    expect(matchConditions([{ segment: "nope" }], {}, segments)).toBe(false);
  });

  it("cyclic segments resolve to no-match instead of looping", () => {
    expect(matchConditions([{ segment: "loop-a" }], {}, segments)).toBe(false);
  });
});
