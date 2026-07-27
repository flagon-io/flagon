import { brand, FlagonMark, IconGitHub } from "@flagon/design";

/**
 * The one footer bar. Mark and copyright centred, source link on the right.
 * Kept to what is true today: there are no Terms or Privacy pages yet, so it
 * does not pretend to link to them.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-10 w-full border-t border-white/5">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-4 px-6 py-6 text-sm text-zinc-500 sm:grid-cols-[1fr_auto_1fr]">
        <div className="hidden sm:block" />
        <p className="flex items-center justify-center gap-2">
          <FlagonMark className="h-4 w-4 shrink-0" />
          <span>
            © {year} {brand.legalName}
          </span>
        </p>
        <div className="flex items-center justify-center gap-4 sm:justify-end">
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
