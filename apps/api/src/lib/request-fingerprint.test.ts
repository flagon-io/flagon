import { describe, expect, it } from "vitest";
import type { Context } from "hono";
import { callerFingerprint, isMutating } from "./request-fingerprint.js";
import { hashToken } from "./token-hash.js";

/** A minimal Context stub: these helpers only read request headers. */
function fakeContext(headers: Record<string, string>): Context {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    req: { header: (name: string) => lower[name.toLowerCase()] },
  } as unknown as Context;
}

describe("isMutating", () => {
  it("flags state-changing methods, case-insensitively", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "post", "Patch"]) {
      expect(isMutating(m)).toBe(true);
    }
  });

  it("lets safe methods through", () => {
    for (const m of ["GET", "HEAD", "OPTIONS", "get"]) {
      expect(isMutating(m)).toBe(false);
    }
  });
});

describe("callerFingerprint", () => {
  it("keys a bearer token by its digest, not the raw token", () => {
    const token = "flagon_oat_secretvalue";
    const fp = callerFingerprint(
      fakeContext({ Authorization: `Bearer ${token}` }),
    );
    expect(fp).toBe(`t:${hashToken(token).slice(0, 16)}`);
    expect(fp).not.toContain(token);
  });

  it("is stable for the same token and distinct across tokens", () => {
    const a = fakeContext({ Authorization: "Bearer token-a" });
    const b = fakeContext({ Authorization: "Bearer token-b" });
    expect(callerFingerprint(a)).toBe(callerFingerprint(a));
    expect(callerFingerprint(a)).not.toBe(callerFingerprint(b));
  });

  it("falls back to the client IP when there is no bearer token", () => {
    const fp = callerFingerprint(
      fakeContext({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
    );
    expect(fp).toBe("ip:203.0.113.7");
  });

  it("token and IP buckets never collide", () => {
    const tokenFp = callerFingerprint(
      fakeContext({ Authorization: "Bearer whatever" }),
    );
    const ipFp = callerFingerprint(fakeContext({ "x-real-ip": "198.51.100.4" }));
    expect(tokenFp.startsWith("t:")).toBe(true);
    expect(ipFp.startsWith("ip:")).toBe(true);
  });
});
