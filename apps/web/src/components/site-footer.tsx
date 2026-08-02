import Link from "next/link";
import { brand, FlagonMark, IconDiscord, IconGitHub } from "@flagon/design";
import { DISCORD_URL } from "@/lib/urls";

/**
 * The one footer bar: policy links, copyright, and the source link.
 */
const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/security", label: "Security" },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-10 w-full border-t border-white/5">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-4 p-6 text-sm text-zinc-500 sm:relative sm:flex-row sm:justify-between">
        {/* Absolutely centered on desktop so the copyright is dead-center of the
            footer regardless of how wide the left/right groups are; in flow and
            stacked on mobile. */}
        <p className="order-2 flex items-center justify-center gap-2 sm:absolute sm:left-1/2 sm:-translate-x-1/2">
          <FlagonMark className="size-4 shrink-0" />
          <span>
            © {year} {brand.legalName}
          </span>
        </p>
        <nav className="order-1 flex items-center justify-center gap-5">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-zinc-200"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="order-3 flex items-center justify-center gap-4">
          <Link href="/docs" className="transition-colors hover:text-zinc-200">
            Docs
          </Link>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`${brand.name} community on Discord`}
            className="transition-colors hover:text-zinc-200"
          >
            <IconDiscord className="size-5" />
          </a>
          <a
            href={brand.repo}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`${brand.name} on GitHub`}
            className="transition-colors hover:text-zinc-200"
          >
            <IconGitHub className="size-5" />
          </a>
        </div>
      </div>
    </footer>
  );
}
