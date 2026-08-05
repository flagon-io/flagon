import { describe, expect, it } from "vitest";
import { ssoBlocks, twoFactorBlocks } from "./org-security-predicates";

/**
 * The lockout-safety invariant, made mechanical: whatever an org enforces, the
 * OWNER is never blocked, so a misconfigured IdP or a lost authenticator can
 * never lock an organization out of itself.
 */
describe("ssoBlocks", () => {
  it("does not block when SSO is not enforced", () => {
    expect(ssoBlocks({ ssoEnforced: false, role: "member", hasSession: false })).toBe(false);
  });

  it("blocks a non-owner member without an SSO session", () => {
    expect(ssoBlocks({ ssoEnforced: true, role: "member", hasSession: false })).toBe(true);
    expect(ssoBlocks({ ssoEnforced: true, role: "admin", hasSession: false })).toBe(true);
  });

  it("does not block a member who has an active SSO session", () => {
    expect(ssoBlocks({ ssoEnforced: true, role: "member", hasSession: true })).toBe(false);
  });

  it("NEVER blocks the owner, even enforced with no session", () => {
    expect(ssoBlocks({ ssoEnforced: true, role: "owner", hasSession: false })).toBe(false);
  });
});

describe("twoFactorBlocks", () => {
  it("does not block when 2FA is not required", () => {
    expect(twoFactorBlocks({ require2fa: false, role: "member", twoFactorEnabled: false })).toBe(false);
  });

  it("blocks a non-owner member without 2FA", () => {
    expect(twoFactorBlocks({ require2fa: true, role: "member", twoFactorEnabled: false })).toBe(true);
    expect(twoFactorBlocks({ require2fa: true, role: "viewer", twoFactorEnabled: false })).toBe(true);
  });

  it("does not block a member with 2FA enabled", () => {
    expect(twoFactorBlocks({ require2fa: true, role: "member", twoFactorEnabled: true })).toBe(false);
  });

  it("NEVER blocks the owner, even required with no 2FA", () => {
    expect(twoFactorBlocks({ require2fa: true, role: "owner", twoFactorEnabled: false })).toBe(false);
  });
});
