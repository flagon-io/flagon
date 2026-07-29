import { createAuthClient } from "better-auth/react";
import {
  organizationClient,
  usernameClient,
} from "better-auth/client/plugins";
import { API_URL } from "@/lib/urls";

/**
 * The browser-side auth client. Client components import from here (never from
 * `@/lib/auth`, which is server-only). Plugins must mirror the server config:
 * username + organization.
 *
 * BetterAuth is hosted by the API now, so this points at API_URL (the browser
 * calls api.flagon.io / :3002 directly). `credentials: "include"` is required so
 * the session cookie is sent and stored on these cross-origin requests; the API's
 * credentialed CORS trusts this origin.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: {
    credentials: "include",
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
