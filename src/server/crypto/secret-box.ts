/**
 * Symmetric secret box (AES-256-GCM) for values we must be able to read back —
 * currently SDK keys, so they can be revealed again in the dashboard (they're
 * meant to be embedded in apps). The key is derived from BETTER_AUTH_SECRET, so
 * it's stable per deployment. If that secret changes, old boxes can't be
 * decrypted (reveal fails) — but the SDK key still WORKS (eval looks it up by
 * hash), so just rotate the key to re-enable reveal.
 *
 * NOT for management credentials (PATs / org tokens) — those stay reveal-once.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function boxKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required to encrypt secrets');
  return createHash('sha256').update(`flagon:secret-box:v1:${secret}`).digest();
}

/** Encrypt → "iv.tag.ciphertext" (base64url). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', boxKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

/** Decrypt an "iv.tag.ciphertext" box back to plaintext. Throws if tampered. */
export function decryptSecret(blob: string): string {
  const [ivB, tagB, ctB] = blob.split('.');
  if (!ivB || !tagB || !ctB) throw new Error('malformed secret box');
  const decipher = createDecipheriv('aes-256-gcm', boxKey(), Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64url')), decipher.final()]).toString(
    'utf8',
  );
}
