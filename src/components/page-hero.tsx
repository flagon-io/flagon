import { CrossMark } from "@/components/bleed-band";
import { HexField } from "@/components/hex-field";

/**
 * The top of a marketing page.
 *
 * This exists because the heroes drifted. The home and Enterprise pages had
 * been tuned - padding that ramps with the viewport, a headline that scales, a
 * rule to close the section - and Products and Pricing had not, so they opened
 * with `px-6 py-20` and looked cheap next to them. Copying the good version by
 * hand is how they diverged in the first place; the rhythm belongs in one
 * place, and the pages supply only what is actually different between them.
 *
 * The horizontal ramp is the single biggest thing. The page grid draws its
 * vertical rules at the content column's edges (see GridBackdrop), so a flat
 * `px-6` leaves a headline 24px off a hairline and it reads as crowding a
 * border it is supposed to sit inside. Ramping to `lg:px-20` puts real air
 * between the type and the rule, which is what makes the tuned heroes feel
 * deliberate and the untuned ones feel like a draft.
 *
 * Vertical padding is deliberately asymmetric: more above than below. A hero
 * is the start of a page, not a band in the middle of one, and equal padding
 * makes it sit rather than open.
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
   * `lead` is the front door: the largest type and the deepest padding, for
   * the one page whose only job is the first impression. `page` is every
   * other hero - the same shape, one step down, so an interior page announces
   * itself without pretending to be the home page.
   */
  size?: "lead" | "page";
  /** `hero` animates. Interior pages take `quiet`, or `none` where a page has its own art. */
  hex?: "hero" | "quiet" | "none";
  glow?: boolean;
  /**
   * The hero's closing rule. Turn it OFF when a BleedBand follows
   * immediately: that band draws its own top border, and two hairlines with
   * nothing between them render as one heavy 2px line.
   */
  rule?: boolean;
  /** Anything that belongs inside the hero's column, below the copy. */
  children?: React.ReactNode;
}) {
  const lead = size === "lead";
  return (
    // The closing rule matters more than it looks. Without it the hex field
    // and the glow trail off into the next section and the page never
    // establishes a first band; with it, the hero is a part of a built page
    // like every other band on the site.
    <section
      className={`relative overflow-hidden ${rule ? "border-b border-white/10" : ""}`}
    >
      {hex === "none" ? null : <HexField variant={hex} />}

      {glow ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-150"
          style={{
            background:
              "radial-gradient(50% 40% at 50% 0%, rgba(20,184,166,0.12) 0%, rgba(20,184,166,0.04) 50%, transparent 100%)",
          }}
        />
      ) : null}

      <div
        className={`relative mx-auto w-full max-w-7xl px-6 sm:px-12 lg:px-20 ${
          lead ? "pb-28 pt-28 sm:pt-32" : "pb-20 pt-20 sm:pt-28"
        }`}
      >
        {eyebrow ? (
          // Monospace and letterspaced, nothing else. A leading rule here
          // reads as an em-dash before the label, which is punctuation this
          // product's copy does not use.
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-teal-400/80">
            {eyebrow}
          </p>
        ) : null}

        <h1
          className={`max-w-3xl font-semibold leading-[1.05] tracking-tight text-zinc-100 ${
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
            className={`flex flex-wrap items-center gap-3 ${lead ? "mt-12" : "mt-10"}`}
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
          className="pointer-events-none absolute inset-x-0 bottom-0"
        >
          <div className="relative mx-auto w-full max-w-7xl">
            <CrossMark className="-bottom-px -left-px" />
            <CrossMark className="-bottom-px -right-px" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
