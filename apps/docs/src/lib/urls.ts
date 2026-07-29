// Cross-surface URLs and the values shown in code samples.
//
// Both default to their LOCAL dev value so a bare `next dev` documents the
// local stack; production sets the NEXT_PUBLIC_* vars to the deployed hosts.

/** The Flagon API host — the base for OFREP evaluation and /v1 management. */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

/** The Flagon console — where a customer signs in and mints SDK keys. */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

/** Deep link to a workspace's SDK Keys screen (org slug filled in by the app). */
export const SDK_KEYS_URL = `${APP_URL}`;
