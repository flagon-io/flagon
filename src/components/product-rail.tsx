import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Code2, Globe, Plug, Terminal } from "lucide-react";
import { cn } from "@/lib/cn";
import { SCENES } from "@/components/art/scenes";
import { slantForAspect } from "@/lib/slant";
import {
  PRODUCTS,
  productHref,
  type Product,
  type ProductSurface,
} from "@/lib/products";

/**
 * Every product, side by side, as tall cards with slanted edges that scroll
 * sideways: each product shown in its own colors, the way a studio lines up
 * its games. Products we haven't announced yet hold their place as quiet
 * placeholders, and the last card is an invitation to come build one.
 *
 * The slant is a clip-path (.product-rail-clip), so the content inside stays
 * upright. Unlike the rest of the site's slanted shapes, the rail clips rather
 * than skews, because its cards overlap by exactly their slant to keep the
 * gaps between them even. The slant is the site's tilt over the card's aspect
 * (--slant in globals.css), so the cards lean at the same angle as everything
 * else. Because a clip also clips focus rings and borders, each card draws its
 * outline with an SVG polygon that follows the same shape.
 */

/** The share of a card's width its top is shifted right, on phones (3:5
 * cards) and from md up (5:7). Keep the aspects in step with globals.css. */
const SLANT_NARROW = slantForAspect(3 / 5);
const SLANT_WIDE = slantForAspect(5 / 7);

/** How far content keeps clear of the slanted edges, as a fraction of width. */
const CLEARANCE = 0.08;

/**
 * Side padding for a block spanning `top` to `bottom` (fractions of the card's
 * height), so it sits CLEARANCE clear of both slanted edges. A flat padding
 * would crowd content near the top-left and bottom-right corners, where the
 * edges lean in. Percentages resolve against the card's width, so the block's
 * parent must span the full card.
 */
function clearOfSlant(top: number, bottom: number): CSSProperties {
  return {
    paddingLeft: `calc((var(--slant) * ${1 - top} + ${CLEARANCE}) * 100%)`,
    paddingRight: `calc((var(--slant) * ${bottom} + ${CLEARANCE}) * 100%)`,
  };
}

/** The header near the top of a card, and the details along the bottom. The
 * header's padding is lopsided by the slant, so centering inside it centers
 * on the visible band rather than the card's bounding box. */
const HEAD = clearOfSlant(0.08, 0.25);
const FOOT = clearOfSlant(0.7, 0.95);

/** Unannounced products, held in place on the rail. */
const PLACEHOLDERS = [
  { key: "next", label: "Next up", note: "In the workshop. We'll show it when it's ready." },
  { key: "later", label: "After that", note: "Still a sketch on a whiteboard." },
];

/** Every card on the rail: the products, the placeholders, and the invitation. */
const COUNT = PRODUCTS.length + PLACEHOLDERS.length + 1;

const SURFACE: Record<ProductSurface, { label: string; icon: typeof Globe }> = {
  web: { label: "Web", icon: Globe },
  git: { label: "Git", icon: Terminal },
  mcp: { label: "MCP", icon: Plug },
  api: { label: "API", icon: Code2 },
};

export function ProductRail({ className }: { className?: string }) {
  return (
    <div
      role="region"
      aria-label="Our products"
      tabIndex={0}
      // Card width and overlap are worked out in CSS from the rail's own
      // width (.product-rail in globals.css), so the row fills on wide screens
      // and swipes on phones.
      style={{ "--n": COUNT } as CSSProperties}
      className={cn(
        "product-rail flex scroll-px-6 snap-x sm:scroll-px-8 snap-mandatory overflow-x-auto overscroll-x-contain px-6 pb-6 pt-2 outline-none [scrollbar-width:thin] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:px-8",
        className,
      )}
    >
      <ul className="flex">
        {PRODUCTS.map((p) => (
          <Slot key={p.id}>
            <ProductTile product={p} />
          </Slot>
        ))}
        {PLACEHOLDERS.map((p) => (
          <Slot key={p.key}>
            <PlaceholderTile label={p.label} note={p.note} />
          </Slot>
        ))}
        <Slot>
          <JoinTile />
        </Slot>
      </ul>
    </div>
  );
}

function Slot({ children }: { children: ReactNode }) {
  return (
    <li
      className="product-rail-slot shrink-0 snap-start"
    >
      {children}
    </li>
  );
}

/** The card's outline, following the same slanted shape as its clip. The
 * slant changes with the card's aspect at md, so there's one of each. */
function Outline({ className, dashed = false }: { className?: string; dashed?: boolean }) {
  return (
    <>
      <OutlineShape slant={SLANT_NARROW} dashed={dashed} className={cn("md:hidden", className)} />
      <OutlineShape slant={SLANT_WIDE} dashed={dashed} className={cn("hidden md:block", className)} />
    </>
  );
}

function OutlineShape({ slant, dashed, className }: { slant: number; dashed: boolean; className?: string }) {
  const s = slant * 100;
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    >
      {/* Stroke is centered on the edge and half of it is clipped away, so the
          visible line is half the stroke width. */}
      <polygon
        points={`${s},0 100,0 ${100 - s},100 0,100`}
        fill="none"
        stroke="currentColor"
        strokeWidth={dashed ? 2 : 3}
        strokeDasharray={dashed ? "6 5" : undefined}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const tileBase =
  "product-rail-clip group relative flex aspect-(--card-aspect) flex-col outline-none motion-safe:transition-transform motion-safe:duration-300";

function ProductTile({ product }: { product: Product }) {
  const { card } = product;
  const Scene = SCENES[card.scene];
  return (
    <Link
      href={productHref(product)}
      className={cn(tileBase, "motion-safe:hover:-translate-y-1.5 motion-safe:focus-visible:-translate-y-1.5")}
      style={{ background: card.background, color: card.ink } as CSSProperties}
    >
      <div className="relative flex flex-1 flex-col pb-8 pt-10">
        {/* Centered between the slanted edges at this height, not on the
            card's box, so the logo sits in the middle of what you see. */}
        <div className="flex flex-col items-center text-center" style={HEAD}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the product's own published file */}
          <img
            src={product.logo.dark}
            alt={product.name}
            className="h-9 w-auto"
            style={{ aspectRatio: product.logo.aspect }}
          />
          <p className="mt-4 text-sm font-medium leading-snug opacity-90">
            {product.tagline}
          </p>
        </div>

        {/* The product's drawing, in its own palette, wider than the text. */}
        <div
          className={cn(
            card.artClass,
            "mx-[3%] my-auto motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.03]",
          )}
        >
          <Scene id={`rail-${product.id}`} />
        </div>

        <div className="flex flex-col gap-3" style={FOOT}>
          <span
            className="self-start rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest"
            style={{ borderColor: card.accent, color: card.accent }}
          >
            {product.status}
          </span>
          <ul className="flex items-center gap-2.5" aria-label="Works with">
            {card.surfaces.map((s) => {
              const { label, icon: Icon } = SURFACE[s];
              return (
                <li key={s} title={label}>
                  <Icon className="h-4 w-4 opacity-80" strokeWidth={2} aria-hidden />
                  <span className="sr-only">{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <Outline className="text-white/10 transition-colors group-focus-visible:text-brand group-hover:text-white/25" />
    </Link>
  );
}

function PlaceholderTile({ label, note }: { label: string; note: string }) {
  return (
    <div
      className={cn(tileBase, "bg-panel text-subtle")}
      style={{
        backgroundImage: "radial-gradient(var(--hairline) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      <div className="relative flex flex-1 flex-col items-start justify-end pb-8 pt-10" style={FOOT}>
        <span className="font-mono text-6xl font-semibold leading-none text-mark" aria-hidden>
          ?
        </span>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-foreground">
          {label}
        </p>
        {/* Two lines reserved, so labels line up across placeholders. */}
        <p className="mt-2 min-h-[2lh] text-sm leading-snug">{note}</p>
      </div>
      <Outline dashed className="text-mark" />
    </div>
  );
}

function JoinTile() {
  return (
    <Link
      href="/careers"
      className={cn(tileBase, "text-foreground motion-safe:hover:-translate-y-1.5 motion-safe:focus-visible:-translate-y-1.5")}
    >
      <div className="relative flex flex-1 flex-col items-start justify-end pb-8 pt-10" style={FOOT}>
        <p className="text-balance text-xl font-semibold leading-snug tracking-tight group-hover:text-brand">
          Want to build the next one?
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
          Work with us
          <ArrowRight
            className="h-4 w-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
            strokeWidth={2}
            aria-hidden
          />
        </span>
      </div>
      <Outline dashed className="text-mark transition-colors group-hover:text-brand group-focus-visible:text-brand" />
    </Link>
  );
}
