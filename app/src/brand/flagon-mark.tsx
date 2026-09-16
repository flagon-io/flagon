/**
 * The Flagon mark - a flagon that's actually full.
 *
 * One vessel, three inks, static or in motion:
 *   • full  - teal brew gradient + foam head + glass sheen (screen, the hero)
 *   • flat  - solid teal brew, matte, no gradient/sheen (print, spot-colour)
 *   • mono  - a single ink (currentColor) in tonal fills (tiny / inline)
 *
 * Ported from flagon-io/website (the source of truth for this asset). `full`
 * and `flat` need brew/sheen CSS tokens that app/ doesn't define (marketing
 * decoration only) - stick to `mono` here, which only needs `currentColor`.
 *
 * Colours come from CSS variables (--brew-*, --foam-line, --sheen) so the mark
 * is theme-aware. The outline is `currentColor`: leave it to inherit the ink
 * foreground for maximum contrast against the brew, or set a `text-*` colour on
 * the parent to recolour the border.
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
  /** Etch the platform's hex lattice faintly across the glass. */
  etch?: boolean;
  /** Pour + wave + bubbles instead of a held, still fill. */
  animated?: boolean;
  title?: string;
};

// 64×64 grid, shared with every size and the /brand page.
const BODY = "M17.5 21 L36.5 21 L38.6 47 Q39 50 36 50 L18 50 Q15 50 15.4 47 Z";
// The brew clips to this inset of the body, so a thin glass wall always shows
// between the liquid and the outline - the liquid reads as held *inside* the
// glass, not painted over it. Matters most for the flat (teal-on-teal) cut.
const BODY_INNER =
  "M19.5 23 L34.5 23 L36.5 46 Q36.7 48 34.3 48 L19.7 48 Q17.3 48 17.5 46 Z";
const LID = "M17 21 Q16.3 16.3 20 15.6 L33 15.6 Q37.2 16.2 37 21 Z";
// Squared stein handle (straight runs, softened corners). Drawn BEFORE the
// body outline so the outline caps both joins cleanly.
const HANDLE = "M37 27 L45.5 27 L48.5 30 L48.5 36.5 L45.5 39.5 L38 39.5";

// Surface at y≈27, a gentle undulation (low amplitude so it never pinches into
// a cusp). Static uses one frozen wave; animated uses two wide waves (30u
// wavelength) that loop seamlessly under a −30u shift.
const WAVE_STILL =
  "M13 27 q3.75 -0.7 7.5 0 t7.5 0 t7.5 0 t7.5 0 t7.5 0 L51 52 L13 52 Z";
const WAVE_BACK =
  "M-38 27 q7.5 -0.9 15 0 t15 0 t15 0 t15 0 t15 0 t15 0 t15 0 t15 0 t15 0 L97 60 L-38 60 Z";
const WAVE_FRONT =
  "M-38 27.4 q7.5 0.9 15 0 t15 0 t15 0 t15 0 t15 0 t15 0 t15 0 t15 0 t15 0 L97 60 L-38 60 Z";

const BUBBLES = [
  { cx: 24, r: 0.9, dur: "5.2s", delay: "0.2s" },
  { cx: 29, r: 0.7, dur: "6.6s", delay: "1.7s" },
  { cx: 32, r: 1.0, dur: "4.6s", delay: "3s" },
];

function hexTile(cx: number, cy: number, r = 3.1) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(
      `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`,
    );
  }
  return pts.join(" ");
}

export function FlagonMark({
  className,
  size,
  variant = "mono",
  lid = true,
  lever = true,
  etch = false,
  animated = false,
  title = "Flagon",
}: FlagonMarkProps) {
  const mono = variant === "mono";
  const flat = variant === "flat";

  const brewFill = mono
    ? "currentColor"
    : flat
      ? "var(--brew-flat)"
      : "url(#flagon-brew)";
  const brewOpacity = mono ? 0.22 : 1;

  const brew = animated ? (
    <g className="pour-rise">
      <g className="pour-bob">
        <path
          className="pour-wave-back"
          d={WAVE_BACK}
          fill={brewFill}
          fillOpacity={brewOpacity}
        />
        <path
          className="pour-wave-front"
          d={WAVE_FRONT}
          fill={mono ? "currentColor" : "var(--brew-top)"}
          fillOpacity={mono ? 0.12 : 0.3}
        />
        {BUBBLES.map((b, i) => (
          <circle
            key={i}
            className="pour-bubble"
            cx={b.cx}
            cy={46}
            r={b.r}
            fill={mono ? "currentColor" : "var(--foam)"}
            fillOpacity={mono ? 0.4 : 0.7}
            style={{ animationDuration: b.dur, animationDelay: b.delay }}
          />
        ))}
      </g>
    </g>
  ) : (
    <path d={WAVE_STILL} fill={brewFill} fillOpacity={brewOpacity} />
  );

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
        {/* brew fills the lower part; the glass above the surface stays clear */}
        {brew}
        {etch && (
          <g
            stroke="currentColor"
            strokeOpacity={0.14}
            strokeWidth={0.7}
            fill="none"
          >
            <polygon points={hexTile(21, 33)} />
            <polygon points={hexTile(30, 33)} />
            <polygon points={hexTile(25.5, 40)} />
            <polygon points={hexTile(21, 47)} />
            <polygon points={hexTile(30, 47)} />
          </g>
        )}
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

      {/* handle first, so the body outline caps its joins */}
      <path
        d={HANDLE}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={BODY}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.1}
        strokeLinejoin="round"
      />
      {lid && (
        <path
          d={LID}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinejoin="round"
        />
      )}
      {lid && lever && (
        <>
          <path
            d="M35.6 18 L39.3 16.2"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <circle cx={40.2} cy={15.9} r={1.5} fill="currentColor" />
        </>
      )}
    </svg>
  );
}
