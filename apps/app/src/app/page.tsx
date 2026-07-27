import Link from "next/link";
import { redirect } from "next/navigation";
import { brand, FlagonMark, GridBackdrop } from "@flagon/design";
import { API_URL } from "@/lib/api";
import { WEB_URL } from "@/lib/urls";
import { getSession } from "@/lib/auth";

async function getApiStatus() {
  try {
    // Bound the wait: this is a best-effort status badge, so a slow or
    // unreachable API must degrade to "unreachable" rather than hang the whole
    // page's render.
    const res = await fetch(`${API_URL}/v1/healthz`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return "unreachable";
    const data = (await res.json()) as { status?: string };
    return data.status ?? "unknown";
  } catch {
    return "unreachable";
  }
}

export default async function Home() {
  // The console is for signed-in users. Until auth lands getSession() always
  // returns null, so every visitor is sent to sign in rather than shown this
  // placeholder. redirect() throws, so it stays outside any try/catch.
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const apiStatus = await getApiStatus();

  return (
    <>
      <GridBackdrop />
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
        <FlagonMark className="h-12 w-12" />

        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
            The {brand.name} console
          </h1>
          <p className="mx-auto max-w-sm text-base leading-7 text-zinc-400">
            Invite-only before launch. If you already have an account, sign in.
            Otherwise, join the waitlist and we&apos;ll be in touch.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-teal-400"
          >
            Sign in
          </Link>
          <a
            href={WEB_URL}
            className="rounded-md border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:text-zinc-100"
          >
            Back to {brand.domain}
          </a>
        </div>

        <p className="mt-4 font-mono text-xs text-zinc-500">
          API status:{" "}
          <span
            className={
              apiStatus === "ok" ? "text-teal-400" : "text-amber-400"
            }
          >
            {apiStatus}
          </span>
        </p>
      </main>
    </>
  );
}
