import { isReserved } from "@/lib/reserved";

/**
 * Username rules in ONE place — the shape regex used to live in three (both
 * forms and the BetterAuth validator), which is how they drift.
 *
 * The messages are the point. A username can fail for several unrelated
 * reasons, and lumping them into one string ("that username is not allowed")
 * leaves someone editing a perfectly well-formed name trying to guess which
 * character offended. `validateUsername` names the rule that actually broke, so
 * "api" reads as reserved rather than as malformed.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 39;

/** GitHub-style: letters, digits, single hyphens, no leading/trailing hyphen. */
export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,37}[a-z0-9])?$/i;

/** The shape rule, stated positively. Rendered as help text under the field. */
export const USERNAME_RULE =
  "Username may only contain letters, numbers, or single hyphens, and cannot begin or end with a hyphen.";

/**
 * The specific reason this username is unacceptable, or null when it is fine.
 * Callers render the string as-is.
 */
export function validateUsername(value: string): string | null {
  if (value.length < USERNAME_MIN) {
    return `Username must be at least ${USERNAME_MIN} characters.`;
  }
  if (value.length > USERNAME_MAX) {
    return `Username must be at most ${USERNAME_MAX} characters.`;
  }
  if (!USERNAME_RE.test(value)) return USERNAME_RULE;
  if (isReserved(value)) {
    return "That username is reserved. Choose a different one.";
  }
  return null;
}

/**
 * Shape + reserved as a single predicate, for BetterAuth's `usernameValidator`,
 * which takes a boolean and so cannot carry a reason. The forms above it
 * produce the message; this is the server-side backstop.
 */
export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(value) && !isReserved(value);
}
