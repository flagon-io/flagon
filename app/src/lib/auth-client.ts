import { createAuthClient } from "better-auth/react";
import {
  usernameClient,
  emailOTPClient,
  twoFactorClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    // Types the extended profile fields so authClient.updateUser accepts them.
    // Declared explicitly (rather than inferring the server type) to avoid
    // pulling any server-only code into the client bundle. Keep in sync with the
    // user.additionalFields in lib/auth.ts.
    inferAdditionalFields({
      user: {
        bio: { type: "string", required: false },
        pronouns: { type: "string", required: false },
        websiteUrl: { type: "string", required: false },
        company: { type: "string", required: false },
        location: { type: "string", required: false },
        socialLinks: { type: "string", required: false },
        publicEmail: { type: "string", required: false },
      },
    }),
    usernameClient(),
    emailOTPClient(),
    twoFactorClient(),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
