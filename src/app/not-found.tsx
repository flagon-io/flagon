import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FlagonMark } from "@/lib/logo";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-24 text-center text-zinc-100">
        <FlagonMark className="h-10 w-10" />
        <p className="mt-8 text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
          404
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="mt-3 max-w-md text-zinc-400">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-teal-500 px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-teal-400"
        >
          <ArrowLeft className="h-4 w-4" />
          Back home
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
