import type { SVGProps } from "react";

/**
 * The icon set.
 *
 * We use lucide (`lucide-react`) as the icon library: consistent register,
 * broad coverage, tree-shaken to just what we import. The semantic aliases below
 * keep call sites meaning-first (IconUsage, IconSelfHost) and let us swap the
 * underlying glyph in one place. Pass `className` for size/color as usual, e.g.
 * `<IconUsage className="h-5 w-5 text-teal-400" />`.
 *
 * The one exception is the GitHub mark: lucide removed brand icons, and a real,
 * filled logo reads better than an outline substitute, so it stays hand-drawn.
 */
export {
  // Standards / interoperability: composable pieces, not lock-in.
  Blocks as IconStandards,
  // Usage, not seats: a usage meter.
  Gauge as IconUsage,
  // Self-hostable: your own box.
  Server as IconSelfHost,
  // Trailing arrow for links and CTAs.
  ArrowRight as IconArrowRight,
} from "lucide-react";

/** GitHub, for the header and footer. Filled, so it reads at 20px. */
export function IconGitHub(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}
