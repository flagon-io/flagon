import Link from "next/link";

/**
 * App root - `app.flagon.io/` (locally `/app`). In production each organization
 * lives at `app.flagon.io/<org>`; this is the org picker / entry point stub.
 */
export default function AppIndexPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
        Your organizations
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">
        Organizations live at their own path,{" "}
        <code className="text-zinc-300">app.flagon.io/&lt;org&gt;</code>.
        Organization creation and switching land here soon.
      </p>

      <div className="mt-8 rounded-lg border border-dashed border-white/10 p-6 text-sm text-zinc-500">
        No organizations yet. Explore the routing with a stub org:{" "}
        <Link href="/app/acme" className="text-teal-400 hover:text-teal-300">
          /app/acme
        </Link>
      </div>
    </div>
  );
}
