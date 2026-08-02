import { createAuthClient } from "better-auth/react";
import {
  organizationClient,
  usernameClient,
} from "better-auth/client/plugins";
import { APP_URL } from "@/lib/urls";

/**
 * The browser-side auth client. Client components import from here (never from
 * `@/lib/auth`, which is server-only). Plugins must mirror the server config:
 * username + organization.
 *
 * BetterAuth is hosted by the console itself, so this points at the console's own
 * origin (APP_URL) — a same-origin call, so no cross-origin credentials dance is
 * needed. The session cookie rides along by default.
 */
export const authClient = createAuthClient({
  baseURL: APP_URL,
  fetchOptions: {
    // Never let a request hang forever (a stuck server would otherwise leave the
    // UI spinning). 15s is generous for auth; on timeout the call rejects/returns
    // an error the caller surfaces (toast + re-enabled button).
    timeout: 15_000,
  },
  plugins: [usernameClient(), organizationClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  organization,
  useActiveOrganization,
  useListOrganizations,
} = authClient;
