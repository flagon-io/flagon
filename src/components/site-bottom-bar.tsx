import { SiGithub } from "@icons-pack/react-simple-icons";
import { brand } from "@/lib/brand";
import { FlagonMark } from "@/lib/logo";
import { marketingHref } from "@/lib/urls";

/**
 * The lower footer bar. Rendered once in the root layout so it sits at the
 * bottom of EVERY page (marketing, app, errors) regardless of page height, and
 * independently of the marketing footer columns that may sit above it. Legal
 * links use marketingHref so they resolve to www even from the app subdomain.
 *
 * Three zones: legal left, the mark and copyright CENTRED, social right.
 * `1fr auto 1fr` rather than `justify-between`, because with three flex items
 * the middle one only lands centre when the outer two happen to be the same
 * width - it drifts the moment a link is added to either side. Equal fractional
 * columns keep the mark on the page's centre line whatever flanks it.
 */
const social = [
  { label: `${brand.name} on GitHub`, href: brand.github, Icon: SiGithub },
];

export function SiteBottomBar() {
  const year = new Date().getFullYear();
  const linkClass = "transition-colors hover:text-zinc-200";

  return (
    <div className="w-full border-t border-white/5">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-4 px-6 py-5 text-sm text-zinc-500 sm:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center justify-center gap-5 sm:justify-start">
          <a href={marketingHref("/terms")} className={linkClass}>
            Terms
          </a>
          <a href={marketingHref("/privacy")} className={linkClass}>
            Privacy
          </a>
          <a href={marketingHref("/security")} className={linkClass}>
            Security
          </a>
        </div>

        <p className="flex items-center justify-center gap-2">
          <FlagonMark className="h-4 w-4 shrink-0" />
          <span>
            © {year} {brand.legalName}
          </span>
        </p>

        <div className="flex items-center justify-center gap-4 sm:justify-end">
          {social.map(({ label, href, Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className={linkClass}
            >
              <Icon className="h-5 w-5" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
