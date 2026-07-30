import { createAppAuth } from "@octokit/auth-app";
import { signToken, verifyToken } from "./token.js";

/**
 * The API's GitHub App client — the control plane owns the integration; the
 * console only renders screens and calls here. Projects connect a GitHub repo
 * through an App *installation*; we never store a token, only the installation
 * id + account metadata, and mint short-lived installation tokens on demand from
 * the App private key.
 *
 * OPTIONAL configuration, same discipline as Stripe: the API boots and serves
 * without any GITHUB_APP_* env; `isGithubConfigured()` lets callers degrade, and
 * the lazy auth factory throws a clear error only when actually used.
 */
const GH_API = "https://api.github.com";
const GH_API_VERSION = "2022-11-28";

/** True when the App is configured enough to mint tokens (id + private key). */
export function isGithubConfigured(): boolean {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
}

/** Accept a PEM directly, an escaped `\n` PEM, or a base64-encoded PEM (so the
 *  key survives single-line env transport). */
function privateKey(): string {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY ?? "";
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    if (decoded.includes("BEGIN")) return decoded;
  } catch {
    /* fall through */
  }
  return raw.replace(/\\n/g, "\n");
}

let cachedAuth: ReturnType<typeof createAppAuth> | null = null;
function appAuth() {
  if (cachedAuth) return cachedAuth;
  const appId = process.env.GITHUB_APP_ID;
  if (!appId || !process.env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error(
      "GitHub App is not configured: set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.",
    );
  }
  // createAppAuth caches installation tokens internally (deduped, ~1h TTL).
  cachedAuth = createAppAuth({ appId, privateKey: privateKey() });
  return cachedAuth;
}

async function appJwt(): Promise<string> {
  const { token } = await appAuth()({ type: "app" });
  return token;
}

/** A fresh (cached) installation token for GitHub REST calls. */
export async function installationToken(installationId: string): Promise<string> {
  const { token } = await appAuth()({
    type: "installation",
    installationId: Number(installationId),
  });
  return token;
}

async function ghFetch(path: string, token: string): Promise<Response> {
  return fetch(`${GH_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GH_API_VERSION,
      "User-Agent": "flagon",
    },
  });
}

export type GithubInstallationInfo = {
  installationId: string;
  accountLogin: string;
  accountType: string;
  accountAvatarUrl: string | null;
};

/** Fetch an installation's account metadata (signed with the App JWT). */
export async function getInstallation(
  installationId: string,
): Promise<GithubInstallationInfo> {
  const res = await ghFetch(`/app/installations/${installationId}`, await appJwt());
  if (!res.ok) {
    throw new Error(`GitHub installation ${installationId} lookup failed (${res.status}).`);
  }
  const data = (await res.json()) as {
    id: number;
    account?: { login?: string; type?: string; avatar_url?: string } | null;
  };
  const account = data.account ?? {};
  return {
    installationId: String(data.id),
    accountLogin: account.login ?? "unknown",
    accountType: account.type ?? "User",
    accountAvatarUrl: account.avatar_url ?? null,
  };
}

export type GithubRepo = {
  id: string;
  fullName: string;
  name: string;
  private: boolean;
  defaultBranch: string;
};

/** All repositories the installation can access (paginated, capped). */
export async function listInstallationRepos(
  installationId: string,
): Promise<GithubRepo[]> {
  const token = await installationToken(installationId);
  const repos: GithubRepo[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await ghFetch(
      `/installation/repositories?per_page=100&page=${page}`,
      token,
    );
    if (!res.ok) throw new Error(`Listing repositories failed (${res.status}).`);
    const data = (await res.json()) as {
      repositories: Array<{
        id: number;
        full_name: string;
        name: string;
        private: boolean;
        default_branch: string;
      }>;
    };
    for (const r of data.repositories) {
      repos.push({
        id: String(r.id),
        fullName: r.full_name,
        name: r.name,
        private: r.private,
        defaultBranch: r.default_branch,
      });
    }
    if (data.repositories.length < 100) break;
  }
  return repos;
}

// --- Install "state" -------------------------------------------------------
// A short-lived signed token binding GitHub's post-install redirect back to the
// org that started the flow. Signed with the shared auth secret so the console's
// fixed /integrations/github/setup route can round-trip it opaquely; API verifies.
const STATE_TTL_MS = 15 * 60 * 1000;

export function signInstallState(orgSlug: string): string {
  return signToken({ kind: "gh-install", orgSlug }, STATE_TTL_MS);
}

export function verifyInstallState(state: string): { orgSlug: string } | null {
  const data = verifyToken<{ kind?: string; orgSlug?: string }>(state);
  if (!data || data.kind !== "gh-install" || !data.orgSlug) return null;
  return { orgSlug: data.orgSlug };
}

/** The GitHub App installation URL that carries our signed state through. */
export function installUrl(state: string): string {
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) throw new Error("GITHUB_APP_SLUG is not set.");
  return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`;
}

// --- User authorization (proof of installation ownership) ------------------
// Installing the app is not proof the person controls it: installation ids are
// enumerable and app-JWT metadata resolves for ANY installation. So after the
// install hop we drive our own OAuth authorize hop (we control redirect_uri +
// state, unlike the auto-chain GitHub offers), exchange the returned code for a
// short-lived USER token, and require the target installation to be one that
// token can actually access. The token is used only for that check and dropped.

/** True when the OAuth half is configured (client id + secret). */
export function isGithubOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_CLIENT_ID && process.env.GITHUB_APP_CLIENT_SECRET,
  );
}

/** This environment's fixed OAuth callback (must match a registered Callback URL). */
function oauthCallbackUrl(): string {
  const base = process.env.APP_URL ?? "http://localhost:3001";
  return `${base}/integrations/github/callback`;
}

const CONNECT_TTL_MS = 15 * 60 * 1000;

/** A signed token binding a pending connection to (org, installation), carried
 *  through the authorize hop so the callback can trust both without a path slug. */
export function signConnectState(orgSlug: string, installationId: string): string {
  return signToken({ kind: "gh-connect", orgSlug, installationId }, CONNECT_TTL_MS);
}

export function verifyConnectState(
  state: string,
): { orgSlug: string; installationId: string } | null {
  const data = verifyToken<{ kind?: string; orgSlug?: string; installationId?: string }>(state);
  if (!data || data.kind !== "gh-connect" || !data.orgSlug || !data.installationId) {
    return null;
  }
  return { orgSlug: data.orgSlug, installationId: data.installationId };
}

/** The GitHub user-authorization URL that returns a `code` to our callback. */
export function authorizeUrl(state: string): string {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  if (!clientId) throw new Error("GITHUB_APP_CLIENT_ID is not set.");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthCallbackUrl(),
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/** Exchange a one-time authorization code for a short-lived user access token. */
export async function exchangeUserCode(code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "flagon",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_APP_CLIENT_ID,
      client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
      code,
      redirect_uri: oauthCallbackUrl(),
    }),
  });
  if (!res.ok) throw new Error(`GitHub token exchange failed (${res.status}).`);
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(`GitHub token exchange returned no token (${data.error ?? "unknown"}).`);
  }
  return data.access_token;
}

/** The installation ids a user access token can access (our app only, paginated). */
export async function listUserInstallationIds(userToken: string): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${GH_API}/user/installations?per_page=100&page=${page}`, {
      headers: {
        Authorization: `Bearer ${userToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GH_API_VERSION,
        "User-Agent": "flagon",
      },
    });
    if (!res.ok) throw new Error(`Listing user installations failed (${res.status}).`);
    const data = (await res.json()) as { installations: Array<{ id: number }> };
    for (const i of data.installations) ids.push(String(i.id));
    if (data.installations.length < 100) break;
  }
  return ids;
}
