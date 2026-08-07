import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { env } from "../../env.js";

/**
 * Reversible secret storage for bring-your-own-provider integrations.
 *
 * Unlike access/client keys — which we HASH (one-way), because we only ever need
 * to compare an incoming token — a BYO credential (a Twilio auth token, say) must
 * be handed BACK to the third party to call it, so it has to be recoverable. We
 * therefore ENCRYPT it at rest with AES-256-GCM (authenticated: tampering fails
 * the tag), keyed off INTEGRATIONS_SECRET_KEY.
 *
 * The env value is any sufficiently-long string (a passphrase or a random key);
 * the 32-byte AES key is derived from it with scrypt against a fixed context
 * salt, so operators don't have to produce exactly 32 raw bytes. Rotating
 * INTEGRATIONS_SECRET_KEY makes existing ciphertext undecryptable (they'd need
 * re-entry), which is the correct, fail-closed behavior for a secret store.
 *
 * Wire format (single base64 token): "v1:" + base64(iv[12] || tag[16] || ct).
 */

const VERSION = "v1";
// A fixed, non-secret domain-separation salt. It only needs to be stable and
// unique to this use, not random — the secrecy lives entirely in the key.
const KDF_SALT = Buffer.from("flagon.integrations.secret-box.v1");

let cachedKey: Buffer | null = null;

/** Whether an encryption key is configured — BYO secret storage needs it. */
export function secretsEnabled(): boolean {
  return Boolean(env.INTEGRATIONS_SECRET_KEY);
}

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = env.INTEGRATIONS_SECRET_KEY;
  if (!secret) {
    // Callers must gate on secretsEnabled() first; reaching here is a bug.
    throw new Error(
      "INTEGRATIONS_SECRET_KEY is not set: bring-your-own integration secrets cannot be stored.",
    );
  }
  cachedKey = scryptSync(secret, KDF_SALT, 32);
  return cachedKey;
}

/** Encrypt a UTF-8 string to a self-describing base64 token. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
}

/** Decrypt a token produced by encryptSecret. Throws if the key/format is wrong. */
export function decryptSecret(token: string): string {
  const [version, payload] = token.split(":", 2);
  if (version !== VERSION || !payload) {
    throw new Error("Unrecognized secret token format.");
  }
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Encrypt an arbitrary JSON-serializable secret object. */
export function encryptSecretJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

/** Decrypt a JSON secret object encrypted with encryptSecretJson. */
export function decryptSecretJson<T = Record<string, string>>(token: string): T {
  return JSON.parse(decryptSecret(token)) as T;
}

/**
 * The last four characters of a secret, for a masked console hint (never the
 * secret itself). Short secrets collapse to "••••" so nothing meaningful leaks.
 */
export function lastFour(secret: string): string {
  return secret.length >= 8 ? secret.slice(-4) : "••••";
}

/** Constant-time equality for secret comparison, when needed. */
export function secretEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
