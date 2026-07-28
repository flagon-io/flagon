import { describe, expect, it } from "vitest";
import { hashToken } from "./token-hash";

/**
 * The console half of the token-hash lockstep test. This asserts the SAME
 * vector and digest as apps/api/src/lib/token-hash.test.ts on purpose: the two
 * modules must hash identically or every access token stops authenticating.
 */
const VECTOR = "flagon_pat_KNOWN_TEST_VECTOR";
const EXPECTED =
  "58e9ed90a665eab89021cc813c659785a7ce9932412fad2d2daaf34fa15d3040";

describe("hashToken (console)", () => {
  it("pins the sha256 hex digest of a known token", () => {
    expect(hashToken(VECTOR)).toBe(EXPECTED);
  });

  it("produces a 64-char lowercase hex string", () => {
    expect(hashToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
