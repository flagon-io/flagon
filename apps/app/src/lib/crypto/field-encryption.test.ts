import { describe, expect, it, beforeAll } from "vitest";

// The key derives from BETTER_AUTH_SECRET; set a stable one for the test.
beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??=
    "field-encryption-test-secret-at-least-32-chars-long";
});

const load = async () => import("./field-encryption");

describe("field encryption (AES-256-GCM)", () => {
  it("round-trips a value", async () => {
    const { encryptField, decryptField } = await load();
    const secret = JSON.stringify({ clientSecret: "sk_super_secret_value" });
    const enc = encryptField(secret);
    expect(decryptField(enc)).toBe(secret);
  });

  it("stores ciphertext, not plaintext, under an enc:v1: envelope", async () => {
    const { encryptField, isEncrypted } = await load();
    const enc = encryptField("hunter2");
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(enc).not.toContain("hunter2");
    expect(isEncrypted(enc)).toBe(true);
  });

  it("uses a fresh IV each time (same input -> different ciphertext)", async () => {
    const { encryptField } = await load();
    expect(encryptField("same")).not.toBe(encryptField("same"));
  });

  it("passes through legacy (non-enveloped) plaintext unchanged", async () => {
    const { decryptField, isEncrypted } = await load();
    expect(decryptField("plain-legacy-value")).toBe("plain-legacy-value");
    expect(isEncrypted("plain-legacy-value")).toBe(false);
  });

  it("detects tampering (auth tag failure throws)", async () => {
    const { encryptField, decryptField } = await load();
    const enc = encryptField("integrity-matters");
    // Flip a character in the base64 body.
    const body = enc.slice("enc:v1:".length);
    const flipped =
      "enc:v1:" + (body[0] === "A" ? "B" : "A") + body.slice(1);
    expect(() => decryptField(flipped)).toThrow();
  });
});
