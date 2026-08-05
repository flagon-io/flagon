/**
 * Pure security-posture predicates: DB-free and safe to import anywhere (no
 * `server-only`, no db), mirroring the split in `roles.ts`. The one invariant
 * both encode: the OWNER is never gated, so an org can never lock itself out.
 */

/** Does an SSO-enforced org block this member right now? Owner is exempt. */
export function ssoBlocks(input: {
  ssoEnforced: boolean;
  role: string;
  hasSession: boolean;
}): boolean {
  if (!input.ssoEnforced) return false;
  if (input.role === "owner") return false;
  return !input.hasSession;
}

/** Does a require-2fa org block this member right now? Owner is exempt. */
export function twoFactorBlocks(input: {
  require2fa: boolean;
  role: string;
  twoFactorEnabled: boolean;
}): boolean {
  if (!input.require2fa) return false;
  if (input.role === "owner") return false;
  return !input.twoFactorEnabled;
}
