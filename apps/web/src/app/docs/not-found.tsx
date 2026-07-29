import Link from "next/link";

/**
 * 404 for the docs. It renders inside the DocsShell (sidebar + top bar) from the
 * root layout, so a mistyped docs URL still feels like the docs, not a dead end.
 */
export default function NotFound() {
  return (
    <div className="py-12">
      <p className="bg-linear-to-br from-teal-300 to-teal-600 bg-clip-text text-5xl font-bold tracking-tight text-transparent">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
        That page doesn&apos;t exist. Try the navigation, or start from the
        introduction.
      </p>
      <Link
        href="/docs"
        className="mt-6 inline-block rounded-md bg-teal-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
      >
        Back to docs home
      </Link>
    </div>
  );
}
