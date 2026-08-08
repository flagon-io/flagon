import { describe, expect, it } from "vitest";
import { evaluateAssertions, type ResponseFacts } from "./assertions.js";

const facts = (over: Partial<ResponseFacts> = {}): ResponseFacts => ({
  status: 200,
  responseTimeMs: 120,
  bodyText: '{"ok":true,"data":{"id":42},"msg":"hello world"}',
  header: (n) => ({ "content-type": "application/json", "x-flag": "on" })[n.toLowerCase()] ?? null,
  ...over,
});

describe("assertion engine", () => {
  it("status comparisons", () => {
    expect(evaluateAssertions([{ source: "status", comparison: "less_than", target: "400" }], facts())[0]!.ok).toBe(true);
    expect(evaluateAssertions([{ source: "status", comparison: "equals", target: "200" }], facts())[0]!.ok).toBe(true);
    expect(evaluateAssertions([{ source: "status", comparison: "equals", target: "500" }], facts())[0]!.ok).toBe(false);
    expect(evaluateAssertions([{ source: "status", comparison: "greater_than", target: "299" }], facts({ status: 500 }))[0]!.ok).toBe(true);
  });

  it("response time", () => {
    expect(evaluateAssertions([{ source: "responseTime", comparison: "less_than", target: "500" }], facts())[0]!.ok).toBe(true);
    expect(evaluateAssertions([{ source: "responseTime", comparison: "less_than", target: "100" }], facts())[0]!.ok).toBe(false);
  });

  it("body contains / not contains", () => {
    expect(evaluateAssertions([{ source: "body", comparison: "contains", target: "hello" }], facts())[0]!.ok).toBe(true);
    expect(evaluateAssertions([{ source: "body", comparison: "not_contains", target: "goodbye" }], facts())[0]!.ok).toBe(true);
  });

  it("jsonBody dot path", () => {
    expect(evaluateAssertions([{ source: "jsonBody", property: "data.id", comparison: "equals", target: "42" }], facts())[0]!.ok).toBe(true);
    expect(evaluateAssertions([{ source: "jsonBody", property: "ok", comparison: "equals", target: "true" }], facts())[0]!.ok).toBe(true);
    expect(evaluateAssertions([{ source: "jsonBody", property: "missing", comparison: "is_empty" }], facts())[0]!.ok).toBe(true);
  });

  it("header", () => {
    expect(evaluateAssertions([{ source: "header", property: "content-type", comparison: "contains", target: "json" }], facts())[0]!.ok).toBe(true);
    expect(evaluateAssertions([{ source: "header", property: "x-missing", comparison: "not_empty" }], facts())[0]!.ok).toBe(false);
  });

  it("evaluates all rows and preserves order", () => {
    const results = evaluateAssertions(
      [
        { source: "status", comparison: "equals", target: "200" },
        { source: "body", comparison: "contains", target: "world" },
      ],
      facts(),
    );
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(results[0]!.actual).toBe("200");
  });
});
