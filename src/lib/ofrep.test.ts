import { describe, expect, it } from "vitest";
import { configurationVersion, etagMatches, evaluationEtag, OFREP_MAX_BODY_BYTES, readOfrepJson, stableJson, validEvaluationContext } from "./ofrep.server";

describe("OFREP response caching", () => {
  const flag = { id: "flag", updatedAt: new Date("2026-01-01T00:00:00Z") };
  const segment = { id: "segment", updatedAt: new Date("2026-01-01T00:00:00Z") };

  it("makes configuration versions deterministic and sensitive to segments", () => {
    expect(configurationVersion([flag], [segment])).toBe(configurationVersion([flag], [segment]));
    expect(configurationVersion([flag], [segment])).not.toBe(configurationVersion([flag], [{ ...segment, updatedAt: new Date("2026-01-02T00:00:00Z") }]));
  });

  it("uses stable context ordering but separates different targeting contexts", () => {
    const version = configurationVersion([flag], [segment]);
    expect(stableJson({ plan: "pro", targetingKey: "a" })).toBe(stableJson({ targetingKey: "a", plan: "pro" }));
    expect(evaluationEtag(version, { plan: "pro", targetingKey: "a" })).toBe(evaluationEtag(version, { targetingKey: "a", plan: "pro" }));
    expect(evaluationEtag(version, { targetingKey: "a" })).not.toBe(evaluationEtag(version, { targetingKey: "b" }));
  });

  it("supports standard weak and comma-separated validators", () => {
    const quote = String.fromCharCode(34);
    const current = `${quote}current${quote}`;
    expect(etagMatches(`W/${current}`, current)).toBe(true);
    expect(etagMatches(`${quote}old${quote}, ${current}`, current)).toBe(true);
    expect(etagMatches(`${quote}old${quote}`, current)).toBe(false);
  });

  it("requires a useful targeting key", () => {
    expect(validEvaluationContext({ targetingKey: "user-1" })).toBe(true);
    expect(validEvaluationContext({ targetingKey: "" })).toBe(false);
    expect(validEvaluationContext([])).toBe(false);
  });

  it("parses bounded JSON bodies even without a content-length header", async () => {
    const valid = await readOfrepJson(new Request("https://example.test", { method: "POST", body: JSON.stringify({ context: { targetingKey: "a" } }) }));
    expect(valid.ok).toBe(true);
    const oversized = await readOfrepJson(new Request("https://example.test", { method: "POST", body: "x".repeat(OFREP_MAX_BODY_BYTES + 1) }));
    expect(oversized).toEqual({ ok: false, tooLarge: true });
  });
});
