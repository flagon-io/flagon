import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../env.js";

/**
 * Symmetric encryption for integration secrets at rest (Slack incoming-webhook URLs,
 * generic webhook signing secrets, and later OAuth tokens). These are bearer-equivalent
 * — anyone holding a Slack webhook URL can post to the channel — so they must never sit
 * in the database in plaintext.
 *
 * AES-256-GCM (authenticated) with a 32-byte key from INTEGRATIONS_ENC_KEY (hex or
 * base64). The token format is `v1:<iv>:<ciphertext>:<tag>`, all base64. If no key is
 * configured, encryption is UNAVAILABLE and callers must degrade gracefully (creating a
 * secret-bearing channel returns a clear "configure INTEGRATIONS_ENC_KEY" error rather
 * than silently storing plaintext).
 */

const VERSION = "v1";

function loadKey(): Buffer | null {
  const raw = env.INTEGRATIONS_ENC_KEY;
  if (!raw) return null;
  // Accept a 64-char hex string or base64; both must decode to exactly 32 bytes.
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

/** Whether secret encryption is configured (a valid 32-byte key is present). */
export function encryptionAvailable(): boolean {
  return loadKey() !== null;
}

/** Encrypt a plaintext secret into a self-describing token. Throws if unconfigured. */
export function encryptSecret(plain: string): string {
  const key = loadKey();
  if (!key) throw new Error("INTEGRATIONS_ENC_KEY is not configured (or not a 32-byte key).");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), ct.toString("base64"), tag.toString("base64")].join(":");
}

/** Decrypt a token produced by encryptSecret. Throws if unconfigured or tampered. */
export function decryptSecret(token: string): string {
  const key = loadKey();
  if (!key) throw new Error("INTEGRATIONS_ENC_KEY is not configured (or not a 32-byte key).");
  const [version, ivb, ctb, tagb] = token.split(":");
  if (version !== VERSION || !ivb || !ctb || !tagb) throw new Error("Malformed secret token.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivb, "base64"));
  decipher.setAuthTag(Buffer.from(tagb, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctb, "base64")), decipher.final()]).toString("utf8");
}

/** Whether a stored string looks like one of our encrypted tokens. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}
