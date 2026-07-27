import "server-only";

/**
 * Which social sign-in providers are configured, decided from the presence of
 * their credentials in the environment. Social login is not wired into the
 * BetterAuth config yet (email + password first), so today these are all false
 * and the buttons render disabled. When a provider's client id/secret are set
 * (and it is added to `socialProviders` in lib/auth.ts), its button lights up.
 */
export type OAuthProviders = { google: boolean; github: boolean };

export function configuredOAuthProviders(): OAuthProviders {
  return {
    google: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    ),
    github: Boolean(
      process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
    ),
  };
}
