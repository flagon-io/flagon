import { SiGithub } from "@icons-pack/react-simple-icons";
import { brand } from "@/lib/brand";
import { marketingHref } from "@/lib/urls";

/**
 * The lower footer bar. Rendered once in the root layout so it sits at the
 * bottom of EVERY page (marketing, app, errors) regardless of page height, and
 * independently of the marketing footer columns that may sit above it. Legal
 * links use marketingHref so they resolve to www even from the app subdomain.
 */
export function SiteBottomBar() {
  const year = new Date().getFullYear();

  return (
    <div className="w-full border-t border-white/5">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-6 py-5 text-sm text-zinc-500 sm:flex-row">
        <p>
          © {year} {brand.name}, Inc.
        </p>
        <div className="flex items-center gap-5">
          <a
            href={marketingHref("/terms")}
            className="transition-colors hover:text-zinc-200"
          >
            Terms
          </a>
          <a
            href={marketingHref("/privacy")}
            className="transition-colors hover:text-zinc-200"
          >
            Privacy
          </a>
          <a
            href={brand.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${brand.name} on GitHub`}
            className="transition-colors hover:text-zinc-200"
          >
            <SiGithub className="h-5 w-5" />
          </a>
        </div>
      </div>
    </div>
  );
}
