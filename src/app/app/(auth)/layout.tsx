import Link from "next/link";
import { FlagonMark } from "@/lib/logo";
import { marketingHref } from "@/lib/urls";

/**
 * Centered, chrome-free layout for the sign-in / sign-up / password flows,
 * with the logo on top, a narrow column of cards, quiet footer links.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 pb-16 pt-14 sm:pt-20">
      <Link href={marketingHref("/")} aria-label="Flagon home">
        <FlagonMark className="h-11 w-11" />
      </Link>

      <div className="mt-6 w-full max-w-[340px]">{children}</div>

      <footer className="mt-10 flex items-center gap-4 text-xs text-zinc-600">
        <Link
          href={marketingHref("/terms")}
          className="transition hover:text-zinc-400"
        >
          Terms
        </Link>
        <Link
          href={marketingHref("/privacy")}
          className="transition hover:text-zinc-400"
        >
          Privacy
        </Link>
        <Link
          href={marketingHref("/security")}
          className="transition hover:text-zinc-400"
        >
          Security
        </Link>
      </footer>
    </div>
  );
}
