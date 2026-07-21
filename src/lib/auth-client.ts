import { createAuthClient } from "better-auth/react";
import { organizationClient, usernameClient } from "better-auth/client/plugins";

/**
 * Client-side auth. baseURL defaults to the current origin's /api/auth.
 * The username plugin adds username sign-in/sign-up helpers; the organization
 * plugin adds org create/list/switch.
 */
export const authClient = createAuthClient({
  plugins: [usernameClient(), organizationClient({ teams: { enabled: true } })],
});

export const { signIn, signUp, signOut, useSession } = authClient;
