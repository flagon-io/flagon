import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { db } from "../db/client";

/**
 * BetterAuth server instance. GitHub-style credentials: username + email +
 * password. Auth tables (user/session/account/verification) are GLOBAL, not
 * org-scoped, so they carry no RLS. Multiple emails per user is a future
 * addition (BetterAuth has no built-in support yet).
 *
 * Users sign in at app.flagon.io (same-origin: /api/auth passes through the
 * proxy on the app subdomain). The session cookie is shared across *.flagon.io
 * so www and api see it too.
 */
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const crossSubDomain = new URL(baseURL).hostname.includes(".");

const trustedOrigins = [
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.NEXT_PUBLIC_MARKETING_URL,
  process.env.NEXT_PUBLIC_API_URL,
].filter((v): v is string => Boolean(v));

export const auth = betterAuth({
  baseURL,
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [username()],
  trustedOrigins,
  advanced: {
    crossSubDomainCookies: { enabled: crossSubDomain },
  },
});
