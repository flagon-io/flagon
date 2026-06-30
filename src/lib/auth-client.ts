'use client';

/**
 * Browser auth client. Exposes sign-in/up, session, organization, and username
 * helpers to client components. Server code should use `auth` from
 * @/server/auth instead.
 */

import { createAuthClient } from 'better-auth/react';
import { organizationClient, usernameClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [organizationClient(), usernameClient()],
});

export const { signIn, signUp, signOut, useSession, organization } = authClient;
