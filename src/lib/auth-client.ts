import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

/**
 * Client-side auth. baseURL defaults to the current origin's /api/auth.
 * The username plugin adds username sign-in/sign-up helpers.
 */
export const authClient = createAuthClient({
  plugins: [usernameClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
