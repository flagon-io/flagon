import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { completeGithubConnection } from "@/lib/projects-api";

/**
 * The GitHub App's user-authorization Callback URL, served at
 * /integrations/github/callback. This is hop 2 of connecting: GitHub returns a
 * one-time `code` plus the signed `state` that binds (org, installation). The
 * API exchanges the code for a short-lived user token and confirms the caller
 * can actually access the installation before recording it — the guard that
 * stops one tenant from binding another's installation. On success we drop the
 * user back into that org's Integrations.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";

  const session = await getSession();
  if (!session) {
    const next = encodeURIComponent(url.pathname + url.search);
    return NextResponse.redirect(new URL(`/login?next=${next}`, url.origin));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?github_error=missing", url.origin));
  }

  const res = await completeGithubConnection(state, code);
  if (res.error || !res.data) {
    return NextResponse.redirect(new URL("/?github_error=1", url.origin));
  }
  return NextResponse.redirect(
    new URL(`/${res.data.orgSlug}/integrations?connected=1`, url.origin),
  );
}
