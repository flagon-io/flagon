import Link from "next/link";
import { headers } from "next/headers";
import { Button, FlagonMark } from "@flagon-io/ui";
import { auth } from "@/lib/auth";

/**
 * The global 404. Deliberately generic: it says the same thing whether the page
 * never existed, was removed, or belongs to an organization the viewer can't see,
 * so it never reveals whether a given org (or anything else) is real. It adapts
 * only its call to action to whether the viewer is signed in - never leaking more.
 */
export default async function NotFound() {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);
  const authed = Boolean(session);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-6 text-center">
      <FlagonMark className="h-7 w-auto text-foreground" />

      <div className="space-y-3">
        <p className="text-sm font-semibold text-brand-bright">404</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          This page can&rsquo;t be found
        </h1>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          The page you&rsquo;re looking for doesn&rsquo;t exist, or you don&rsquo;t have access to
          it.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href={authed ? "/" : "/login"}>{authed ? "Back to your dashboard" : "Sign in"}</Link>
        </Button>
        <Button asChild variant="outline">
          <a href="https://www.flagon.io">Go to flagon.io</a>
        </Button>
      </div>
    </main>
  );
}
