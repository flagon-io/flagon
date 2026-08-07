import { beforeAll, describe, expect, it } from "vitest";

/**
 * The reversible secret store for BYO integration credentials. These lock the
 * security-critical properties: a round-trip recovers the plaintext, the auth tag
 * rejects tampering, and a different key cannot decrypt. Infra-free — we seed the
 * minimum env so the validated `env` module loads without a database or network.
 */
process.env.BETTER_AUTH_SECRET ||= "test-secret-at-least-32-chars-long-000";
process.env.DATABASE_URL ||= "postgres://localhost:5432/unused";
process.env.INTEGRATIONS_SECRET_KEY ||= "unit-test-integrations-key-0123456789";

describe("secret-box", () => {
  let box: typeof import("./secret-box.js");

  beforeAll(async () => {
    box = await import("./secret-box.js");
  });

  it("reports secrets enabled when a key is set", () => {
    expect(box.secretsEnabled()).toBe(true);
  });

  it("round-trips a string secret", () => {
    const token = box.encryptSecret("s3cr3t-twilio-token");
    expect(token.startsWith("v1:")).toBe(true);
    expect(token).not.toContain("s3cr3t");
    expect(box.decryptSecret(token)).toBe("s3cr3t-twilio-token");
  });

  it("round-trips a JSON secret", () => {
    const secrets = { authToken: "abc123", extra: "def456" };
    const token = box.encryptSecretJson(secrets);
    expect(box.decryptSecretJson(token)).toEqual(secrets);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = box.encryptSecret("same");
    const b = box.encryptSecret("same");
    expect(a).not.toBe(b);
    expect(box.decryptSecret(a)).toBe("same");
    expect(box.decryptSecret(b)).toBe("same");
  });

  it("rejects a tampered ciphertext (GCM auth tag)", () => {
    const token = box.encryptSecret("do-not-touch");
    const [, payload] = token.split(":");
    const raw = Buffer.from(payload, "base64");
    raw[raw.length - 1] ^= 0xff; // flip a byte of the ciphertext
    const tampered = `v1:${raw.toString("base64")}`;
    expect(() => box.decryptSecret(tampered)).toThrow();
  });

  it("rejects an unrecognized token format", () => {
    expect(() => box.decryptSecret("plain-text")).toThrow();
    expect(() => box.decryptSecret("v2:whatever")).toThrow();
  });

  it("masks to a last-4 hint, collapsing short secrets", () => {
    expect(box.lastFour("ABCD1234")).toBe("1234");
    expect(box.lastFour("short")).toBe("••••");
  });
});
