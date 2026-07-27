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
 */
export const authClient = createAuthClient({
  baseURL: APP_URL,
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
