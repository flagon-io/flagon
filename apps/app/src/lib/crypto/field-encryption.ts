import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

/**
 * Transparent field encryption for secrets we must store but never want sitting
 * in the database (or a DB dump / query log) as plaintext — specifically an SSO
 * provider's OIDC client secret and SAML config. AES-256-GCM (authenticated), so
 * tampering is detected on decrypt.
 *
 * The key is DERIVED from BETTER_AUTH_SECRET via HKDF with a fixed info label, so
 * there is no new env var to manage and the key is distinct from every other use
 * of the app secret. Rotating BETTER_AUTH_SECRET would invalidate stored
 * ciphertexts (as it already invalidates sessions); re-register providers after.
 *
 * Format: `enc:v1:` + base64(iv[12] ‖ authTag[16] ‖ ciphertext). `decryptField`
 * returns any value WITHOUT that prefix unchanged, so a column can be encrypted
 * in place with no backfill (legacy plaintext keeps working, new writes encrypt).
 * No "server-only" here: this module is imported by db/schema.ts, which drizzle-
 * kit also loads at generate time; it reads no env at import (only inside calls).
 */

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set.");
  return Buffer.from(
    hkdfSync("sha256", secret, "", "flagon-sso-field-v1", 32),
  );
}

/** Encrypt a UTF-8 string to the `enc:v1:` envelope. */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypt an `enc:v1:` envelope; returns non-enveloped values unchanged. */
export function decryptField(value: string): string {
  if (!value.startsWith(PREFIX)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** True when a stored value is already in the encrypted envelope. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}
