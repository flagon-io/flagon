import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { PROJECTS_ENABLED } from "@/lib/features";
import { startGithubConnection } from "@/lib/projects-api";

/**
 * The GitHub App's fixed post-install redirect target (Setup URL), served at
 * /integrations/github/setup. This is hop 1 of connecting: GitHub hands us the
 * new `installation_id` plus the signed `state` that names the org. Installing
 * is not proof the caller controls the installation, so instead of recording it
 * we start the user-authorization hop — the API returns the GitHub authorize URL
 * and we bounce the browser to it. The callback route completes the connection.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!PROJECTS_ENABLED) return NextResponse.redirect(new URL("/", url.origin));
  const installationId = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state") ?? "";

  const session = await getSession();
  if (!session) {
    const next = encodeURIComponent(url.pathname + url.search);
    return NextResponse.redirect(new URL(`/login?next=${next}`, url.origin));
  }

  if (!installationId || !state) {
    return NextResponse.redirect(new URL("/?github_error=missing", url.origin));
  }

  const res = await startGithubConnection(state, installationId);
  if (res.error || !res.data) {
    return NextResponse.redirect(new URL("/?github_error=1", url.origin));
  }
  // Absolute GitHub authorize URL — send the browser there to prove ownership.
  return NextResponse.redirect(res.data.url);
}
