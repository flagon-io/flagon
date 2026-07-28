import Link from "next/link";
import { brand, FlagonMark, IconGitHub } from "@flagon/design";

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
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-4 px-6 py-6 text-sm text-zinc-500 sm:grid-cols-[1fr_auto_1fr]">
        <p className="order-2 flex items-center justify-center gap-2">
          <FlagonMark className="h-4 w-4 shrink-0" />
          <span>
            © {year} {brand.legalName}
          </span>
        </p>
        <nav className="order-1 flex items-center justify-center gap-5 sm:justify-start">
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
        <div className="order-3 flex items-center justify-center gap-4 sm:justify-end">
          <a
            href={brand.repo}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`${brand.name} on GitHub`}
            className="transition-colors hover:text-zinc-200"
          >
            <IconGitHub className="h-5 w-5" />
          </a>
        </div>
      </div>
    </footer>
  );
}
