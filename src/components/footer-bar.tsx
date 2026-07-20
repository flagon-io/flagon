import { SiGithub } from "@icons-pack/react-simple-icons";
import { brand } from "@/lib/brand";
import { FlagonMark } from "@/lib/logo";
import { marketingHref } from "@/lib/urls";

/**
 * The bottom-most footer bar. Always present on any page that renders it,
 * independent of the marketing columns footer, and always sits at the bottom of
 * the page regardless of content height. Full-width top border so it reads as a
 * distinct band. Reused across marketing and app surfaces.
 *
 * Legal links use marketingHref so they resolve to www in production even when
 * rendered inside the app (app.flagon.io).
 */
export function FooterBar({
  maxWidthClass = "max-w-7xl",
}: {
  maxWidthClass?: string;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-white/5">
      <div
        className={`mx-auto flex w-full ${maxWidthClass} flex-col items-center justify-between gap-4 px-6 py-5 text-sm text-zinc-500 sm:flex-row`}
      >
        <div className="flex items-center gap-2.5">
          <FlagonMark className="h-4 w-4" />
          <span>
            © {year} {brand.name}, Inc.
          </span>
          <span className="hidden text-zinc-600 sm:inline">
            · Source-available under the FSL.
          </span>
        </div>
        <nav className="flex items-center gap-5">
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
            <SiGithub className="h-4 w-4" />
          </a>
        </nav>
      </div>
    </footer>
  );
}
