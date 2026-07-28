import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signToken, verifyToken } from "./token";

/**
 * signToken/verifyToken back our own stateless signed links (secondary-email
 * verification). These are security-critical: a forgery or a missed-expiry bug
 * here means an attacker verifies an email they do not control. The suite pins
 * the properties that matter — tamper detection, expiry, and secret binding.
 */
const SECRET = "test-secret-do-not-use-in-prod";

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.BETTER_AUTH_SECRET;
});

describe("signToken / verifyToken", () => {
  it("round-trips the payload", () => {
    const token = signToken({ email: "robin@flagon.io" }, 60_000);
    const data = verifyToken<{ email: string }>(token);
    expect(data?.email).toBe("robin@flagon.io");
  });

  it("rejects a tampered payload", () => {
    const token = signToken({ email: "robin@flagon.io" }, 60_000);
    const [, sig] = token.split(".");
    const forged = `${Buffer.from(
      JSON.stringify({ email: "attacker@evil.test", exp: Date.now() + 60_000 }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")}.${sig}`;
    expect(verifyToken(forged)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signToken({ email: "robin@flagon.io" }, 60_000);
    const [payload] = token.split(".");
    expect(verifyToken(`${payload}.deadbeef`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signToken({ email: "robin@flagon.io" }, -1_000);
    expect(verifyToken(token)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyToken("not-a-token")).toBeNull();
    expect(verifyToken("")).toBeNull();
    expect(verifyToken("only.")).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signToken({ email: "robin@flagon.io" }, 60_000);
    process.env.BETTER_AUTH_SECRET = "a-completely-different-secret";
    expect(verifyToken(token)).toBeNull();
  });
});
