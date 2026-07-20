/**
 * Username rules, shared by the BetterAuth username plugin
 * (server-side enforcement) and the sign-up form (inline hint + validation).
 */
export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 39;

export const USERNAME_HINT =
  "Username may only contain alphanumeric characters or single hyphens, and cannot begin or end with a hyphen.";

/**
 * Alphanumeric with single-hyphen separators: no leading/trailing hyphen, no
 * consecutive hyphens. Length is enforced separately by the plugin options.
 */
export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9]))*$/.test(username);
}
