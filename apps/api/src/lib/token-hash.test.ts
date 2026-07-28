import { describe, expect, it } from "vitest";
import { hashToken } from "./token-hash.js";

/**
 * These assertions are intentionally duplicated in
 * apps/app/src/lib/token-hash.test.ts with the SAME vector and SAME expected
 * digest. The console mints and stores the hash; the API hashes the presented
 * token and looks it up. If the two implementations ever drift, one of these two
 * tests goes red before a single real token silently fails to authenticate.
 */
const VECTOR = "flagon_pat_KNOWN_TEST_VECTOR";
const EXPECTED =
  "58e9ed90a665eab89021cc813c659785a7ce9932412fad2d2daaf34fa15d3040";

describe("hashToken (api)", () => {
  it("pins the sha256 hex digest of a known token", () => {
    expect(hashToken(VECTOR)).toBe(EXPECTED);
  });

  it("is deterministic", () => {
    expect(hashToken(VECTOR)).toBe(hashToken(VECTOR));
  });

  it("produces a 64-char lowercase hex string", () => {
    expect(hashToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is sensitive to the whole input", () => {
    expect(hashToken("flagon_pat_a")).not.toBe(hashToken("flagon_pat_b"));
  });
});
