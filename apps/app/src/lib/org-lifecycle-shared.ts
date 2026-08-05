/**
 * Client-safe org-lifecycle constants + types. Kept SEPARATE from org-lifecycle.ts
 * (which imports next/headers for its server-side API relay) so client components
 * like the Danger Zone can use these without pulling a server-only module into the
 * browser bundle.
 */

/**
 * How long a soft-deleted org is retained before the future purge cron erases it.
 * 90 days, matching GitHub: the org (and its URL/slug) stays reserved and
 * recoverable for the window, then is permanently removed.
 */
export const ORG_RETENTION_DAYS = 90;

/** What the org still owes before it can be deleted (mirrors the API settlement). */
export type Settlement = {
  hasActiveSubscription: boolean;
  openInvoiceCount: number;
  owedCents: number;
  clear: boolean;
  blocked: boolean;
};
