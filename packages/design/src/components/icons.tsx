import type { SVGProps } from "react";

/**
 * A small, hand-kept icon set.
 *
 * Deliberately not a dependency on an icon library: the marketing surface
 * needs a handful of marks, and they share the logo's register (a 24-unit
 * grid, 1.75 stroke, round joins, `currentColor`) more faithfully as a few
 * tuned paths than as imports from a 1,500-glyph pack. Add one when a page
 * genuinely needs it, in this style, rather than reaching for a new package.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

/** Standards / interoperability: two pieces that fit either way round. */
export function IconStandards(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 4H5a1 1 0 0 0-1 1v4a2 2 0 0 1 0 4v4a1 1 0 0 0 1 1h4a2 2 0 0 1 4 0h4a1 1 0 0 0 1-1v-4a2 2 0 0 1 0-4V5a1 1 0 0 0-1-1h-4a2 2 0 0 1-4 0Z" />
    </Icon>
  );
}

/** Usage, not seats: a meter needle low on the dial. */
export function IconUsage(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 17a9 9 0 0 1 17 0" />
      <path d="M12 17l4.5-4" />
      <path d="M3.5 17H6" />
      <path d="M18 17h2.5" />
    </Icon>
  );
}

/** Self-hostable: your own box. */
export function IconSelfHost(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </Icon>
  );
}

/** Trailing arrow for links and CTAs. */
export function IconArrowRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </Icon>
  );
}

/** GitHub, for the header and footer. Filled, so it reads at 20px. */
export function IconGitHub(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}
