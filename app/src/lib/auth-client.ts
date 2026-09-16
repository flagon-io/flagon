import { createAuthClient } from "better-auth/react";
import { usernameClient, emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [usernameClient(), emailOTPClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
