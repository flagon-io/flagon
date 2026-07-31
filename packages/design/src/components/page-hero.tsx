import { CornerMark } from "./bleed-band";
import { HexField } from "./hex-field";

/**
 * The top of a marketing page.
 *
 * One hero so the rhythm (padding that ramps with the viewport, a headline
 * that scales, a rule that closes the section) lives in a single place instead
 * of being copied by hand and drifting page to page. A caller supplies only
 * what is actually different: the eyebrow, the title, the copy, the buttons.
 *
 * The horizontal ramp is the single biggest thing. The page grid draws its
 * vertical rules at the content column's edges (see GridBackdrop), so a flat
 * `px-6` leaves a headline crowding a hairline it is supposed to sit inside.
 * Ramping to `lg:px-20` puts real air between the type and the rule.
 *
 * Vertical padding is deliberately asymmetric: more above than below. A hero
 * is the start of a page, not a band in the middle of one.
 */
export function PageHero({
  eyebrow,
  title,
  lede,
  actions,
  footnote,
  size = "page",
  hex = "quiet",
  glow = true,
  rule = true,
  children,
}: {
  /** Small mono label above the headline. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  /** Buttons, usually. */
  actions?: React.ReactNode;
  /** Fine print under the actions, e.g. "no card required". */
  footnote?: React.ReactNode;
  /**
   * `lead` is the front door: the largest type and the deepest padding. `page`
   * is every other hero, one step down, so an interior page announces itself
   * without pretending to be the home page.
   */
  size?: "lead" | "page";
  /** `hero` animates. Interior pages take `quiet`, or `none` for their own art. */
  hex?: "hero" | "quiet" | "none";
  glow?: boolean;
  /**
   * The hero's closing rule. Turn it OFF when a BleedBand follows immediately:
   * that band draws its own top border, and two hairlines with nothing between
   * them render as one heavy 2px line.
   */
  rule?: boolean;
  /** Anything that belongs inside the hero's column, below the copy. */
  children?: React.ReactNode;
}) {
  const lead = size === "lead";
  return (
    <section
      className={`relative overflow-hidden ${rule ? "border-white/10 border-b" : ""}`}
    >
      {hex === "none" ? null : <HexField variant={hex} />}

      {glow ? (
        <div
          aria-hidden
          className="inset-x-0 top-0 h-150 pointer-events-none absolute"
          style={{
            background:
              "radial-gradient(50% 40% at 50% 0%, rgba(20,184,166,0.12) 0%, rgba(20,184,166,0.04) 50%, transparent 100%)",
          }}
        />
      ) : null}

      <div
        className={`max-w-7xl px-6 sm:px-12 lg:px-20 relative mx-auto w-full ${
          lead ? "pb-28 pt-28 sm:pt-32" : "pb-20 pt-20 sm:pt-28"
        }`}
      >
        {eyebrow ? (
          <p className="font-mono text-xs text-teal-400/80 tracking-[0.25em] uppercase">
            {eyebrow}
          </p>
        ) : null}

        <h1
          className={`max-w-3xl font-semibold tracking-tight text-zinc-100 leading-[1.05] ${
            eyebrow ? "mt-6" : ""
          } ${lead ? "text-5xl sm:text-6xl md:text-7xl" : "text-4xl sm:text-5xl md:text-6xl"}`}
        >
          {title}
        </h1>

        {lede ? (
          <p
            className={`max-w-xl text-zinc-400 ${
              lead ? "mt-8 text-lg leading-8" : "mt-6 text-base leading-7"
            }`}
          >
            {lede}
          </p>
        ) : null}

        {actions ? (
          <div
            className={`gap-3 flex flex-wrap items-center ${lead ? "mt-12" : "mt-10"}`}
          >
            {actions}
          </div>
        ) : null}

        {footnote ? (
          <p className="mt-5 font-mono text-xs text-zinc-500">{footnote}</p>
        ) : null}

        {children}
      </div>

      {/* Where the hero's closing rule crosses the grid's verticals, marked
          exactly as every BleedBand marks its own corners. */}
      {rule ? (
        <div
          aria-hidden
          className="inset-x-0 bottom-0 pointer-events-none absolute"
        >
          <div className="max-w-7xl relative mx-auto w-full">
            <CornerMark className="-bottom-px -left-px" />
            <CornerMark className="-right-px -bottom-px" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
