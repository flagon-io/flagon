import { describe, expect, it } from "vitest";
import {
  capabilityEnabled,
  capabilitySupported,
  defaultOptions,
  getProvider,
  listProviders,
  mergeOptions,
} from "./providers.js";

/**
 * The BYO provider registry. Infra-free: `normalize` is pure validation and
 * splitting, and does NOT hit the network (that's `test`). Locks the contract the
 * route and console depend on: which fields are secret, and how bad input is
 * rejected before anything is stored.
 */
describe("integration providers", () => {
  it("registers twilio with the sms and voice capabilities", () => {
    const twilio = getProvider("twilio");
    expect(twilio).toBeDefined();
    expect(twilio?.capabilities).toEqual(expect.arrayContaining(["sms", "voice"]));
    expect(typeof twilio?.sendSms).toBe("function");
    expect(typeof twilio?.sendVoice).toBe("function");
    expect(listProviders().some((p) => p.key === "twilio")).toBe(true);
  });

  it("marks exactly the auth token as secret", () => {
    const twilio = getProvider("twilio")!;
    const secretKeys = twilio.fields.filter((f) => f.secret).map((f) => f.key);
    expect(secretKeys).toEqual(["authToken"]);
  });

  it("splits normalized values into config and secrets", () => {
    const twilio = getProvider("twilio")!;
    const out = twilio.normalize({
      accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      authToken: "  a-token  ",
      from: "+15551234567",
    });
    expect(out.config).toEqual({
      accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      from: "+15551234567",
    });
    expect(out.secrets).toEqual({ authToken: "a-token" });
  });

  it("requires every required field", () => {
    const twilio = getProvider("twilio")!;
    expect(() => twilio.normalize({})).toThrow(/Account SID is required/);
    expect(() =>
      twilio.normalize({ accountSid: "AC1", from: "+1555" }),
    ).toThrow(/Auth token is required/);
  });

  it("rejects an Account SID that isn't a Twilio SID", () => {
    const twilio = getProvider("twilio")!;
    expect(() =>
      twilio.normalize({ accountSid: "nope", authToken: "t", from: "+1555" }),
    ).toThrow(/AC/);
  });

  it("returns undefined for an unknown provider", () => {
    expect(getProvider("does-not-exist")).toBeUndefined();
  });

  it("defaults SMS on and voice off, gating each capability behind its option", () => {
    const twilio = getProvider("twilio")!;
    expect(defaultOptions(twilio)).toEqual({ sms: true, voice: false });
    // No stored config => defaults apply.
    expect(capabilityEnabled(twilio, undefined, "sms")).toBe(true);
    expect(capabilityEnabled(twilio, undefined, "voice")).toBe(false);
    // Explicit opt-in flips voice on.
    expect(capabilityEnabled(twilio, { options: { voice: true } }, "voice")).toBe(true);
    // Explicit opt-out flips sms off.
    expect(capabilityEnabled(twilio, { options: { sms: false } }, "sms")).toBe(false);
  });

  it("gates a capability on what the sender was detected to support", () => {
    const twilio = getProvider("twilio")!;
    // Voice option on, but the sender only detected SMS => not enabled.
    const smsOnly = { options: { sms: true, voice: true }, detected: ["sms"] };
    expect(capabilitySupported(twilio, smsOnly, "voice")).toBe(false);
    expect(capabilityEnabled(twilio, smsOnly, "voice")).toBe(false);
    expect(capabilityEnabled(twilio, smsOnly, "sms")).toBe(true);
    // Sender supports both => voice follows the option.
    const both = { options: { sms: true, voice: true }, detected: ["sms", "voice"] };
    expect(capabilityEnabled(twilio, both, "voice")).toBe(true);
    // Unknown detection (legacy) => treated as supported.
    expect(capabilitySupported(twilio, { options: {} }, "voice")).toBe(true);
  });

  it("merges option updates and ignores unknown keys", () => {
    const twilio = getProvider("twilio")!;
    const merged = mergeOptions(
      twilio,
      { options: { sms: true, voice: false } },
      { voice: true, bogus: true },
    );
    expect(merged).toEqual({ sms: true, voice: true });
  });
});
