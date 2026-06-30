/**
 * Deterministic bucketing for fractional rollouts.
 *
 * The algorithm is intentionally simple and fully specified so the future Go
 * data plane can reproduce identical buckets bit-for-bit:
 *
 *   1. key = `${flagKey}:${subject}`
 *   2. h   = FNV-1a (32-bit) over the UTF-8 bytes of `key`
 *   3. bucket = h % 10000   -> an integer in [0, 9999] (basis points / 100)
 *
 * A subject always lands in the same bucket for a given flag, so rollouts are
 * sticky without storing any per-user state.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32-bit hash of a string's UTF-8 bytes, returned as an unsigned int. */
export function fnv1a32(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  const bytes = utf8Bytes(input);
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]!;
    // Multiply by the FNV prime in 32-bit space (Math.imul keeps it 32-bit).
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Coerce to unsigned 32-bit.
  return hash >>> 0;
}

/** Bucket a subject for a flag into the half-open range [0, 10000). */
export function bucket(flagKey: string, subject: string): number {
  return fnv1a32(`${flagKey}:${subject}`) % 10000;
}

/** Minimal, dependency-free UTF-8 encoder (TextEncoder may be absent in some runtimes). */
function utf8Bytes(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // Surrogate pair.
      const hi = code;
      const lo = str.charCodeAt(++i);
      code = 0x10000 + ((hi & 0x3ff) << 10) + (lo & 0x3ff);
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return out;
}
