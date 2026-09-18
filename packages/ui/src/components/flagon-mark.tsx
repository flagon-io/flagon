/**
 * The Flagon mark - a flagon that's actually full. Ported from the marketing
 * site so the app + component library share one source of truth.
 *
 * Variants: `full` (teal brew gradient + sheen), `flat` (solid teal), `mono`
 * (single ink via currentColor). Brew colors come from CSS variables (--brew-*,
 * --foam, --sheen); the OUTLINE is `currentColor`, so it inherits the ink
 * foreground - set a `text-*` color on the parent to recolor it (that's how it
 * follows the app theme instead of the OS color scheme).
 */

export type FlagonVariant = "full" | "flat" | "mono";

type FlagonMarkProps = {
  className?: string;
  size?: number;
  variant?: FlagonVariant;
  /** The hinged lid on top of the rim. */
  lid?: boolean;
  /** The thumb-lever at the lid hinge (needs `lid`). */
  lever?: boolean;
  title?: string;
};

const BODY = "M17.5 21 L36.5 21 L38.6 47 Q39 50 36 50 L18 50 Q15 50 15.4 47 Z";
const BODY_INNER =
  "M19.5 23 L34.5 23 L36.5 46 Q36.7 48 34.3 48 L19.7 48 Q17.3 48 17.5 46 Z";
const LID = "M17 21 Q16.3 16.3 20 15.6 L33 15.6 Q37.2 16.2 37 21 Z";
const HANDLE = "M37 27 L45.5 27 L48.5 30 L48.5 36.5 L45.5 39.5 L38 39.5";
const WAVE_STILL = "M13 27 q3.75 -0.7 7.5 0 t7.5 0 t7.5 0 t7.5 0 t7.5 0 L51 52 L13 52 Z";

export function FlagonMark({
  className,
  size,
  variant = "full",
  lid = true,
  lever = true,
  title = "Flagon",
}: FlagonMarkProps) {
  const mono = variant === "mono";
  const flat = variant === "flat";

  const brewFill = mono ? "currentColor" : flat ? "var(--brew-flat)" : "url(#flagon-brew)";
  const brewOpacity = mono ? 0.22 : 1;

  return (
    <svg
      viewBox="11.3 12.3 41 41"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <clipPath id="flagon-body">
          <path d={BODY_INNER} />
        </clipPath>
        <linearGradient id="flagon-brew" x1="0" y1="0.3" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brew-top)" />
          <stop offset="1" stopColor="var(--brew-bot)" />
        </linearGradient>
      </defs>

      <g clipPath="url(#flagon-body)">
        <path d={WAVE_STILL} fill={brewFill} fillOpacity={brewOpacity} />
        {variant === "full" && (
          <path
            d="M19.7 30 q-1.1 6 -0.4 12"
            stroke="var(--sheen)"
            strokeWidth={1.5}
            strokeLinecap="round"
            fill="none"
          />
        )}
      </g>

      <path
        d={HANDLE}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={BODY} fill="none" stroke="currentColor" strokeWidth={3.1} strokeLinejoin="round" />
      {lid && (
        <path d={LID} fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" />
      )}
      {lid && lever && (
        <>
          <path d="M36.7 17.1 L39.4 16.1" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round" />
          <circle cx={40.3} cy={15.8} r={1.4} fill="currentColor" />
        </>
      )}
    </svg>
  );
}
