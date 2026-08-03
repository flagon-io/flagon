/**
 * Manual repository linking — parse a pasted repo URL into a provider + an
 * "owner/repo" name. Pure and dependency-free (like the eval/stats engines) so it
 * runs the same on the write path and in tests. A future Git integration will set
 * the same fields from real provider data instead of a pasted URL.
 *
 * Handles https URLs and scp-like SSH remotes (git@host:owner/repo.git). Anything
 * unrecognized still links (provider "other", name null) — we never reject a URL,
 * we just can't badge it.
 */
export type RepoProvider = "github" | "gitlab" | "bitbucket" | "other";
export type ParsedRepo = { provider: RepoProvider; name: string | null };

const HOSTS: Record<string, RepoProvider> = {
  "github.com": "github",
  "www.github.com": "github",
  "gitlab.com": "gitlab",
  "www.gitlab.com": "gitlab",
  "bitbucket.org": "bitbucket",
  "www.bitbucket.org": "bitbucket",
};

function providerForHost(host: string): RepoProvider {
  return HOSTS[host.toLowerCase()] ?? "other";
}

/** First two path segments as "owner/repo", trailing ".git" stripped, or null. */
function ownerRepo(pathname: string): string | null {
  const segs = pathname
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs.length < 2) return null;
  const owner = segs[0];
  const repo = segs[1].replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  return `${owner}/${repo}`;
}

export function parseRepo(input: string): ParsedRepo {
  const url = input.trim();
  if (!url) return { provider: "other", name: null };

  // scp-like SSH remote: git@github.com:owner/repo.git
  const ssh = /^[a-z0-9._-]+@([a-z0-9.-]+):(.+)$/i.exec(url);
  if (ssh) {
    return { provider: providerForHost(ssh[1]), name: ownerRepo("/" + ssh[2]) };
  }

  try {
    const u = new URL(url);
    return { provider: providerForHost(u.hostname), name: ownerRepo(u.pathname) };
  } catch {
    return { provider: "other", name: null };
  }
}
