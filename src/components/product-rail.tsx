import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Code2, Globe, Plug, Terminal } from "lucide-react";
import { cn } from "@/lib/cn";
import { SCENES } from "@/components/art/scenes";
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
 * The slant is a clip-path, so the content inside stays upright. Because a
 * clip also clips focus rings and borders, each card draws its outline with an
 * SVG polygon that follows the same shape.
 */

/** How far the top edge is shifted right, as a fraction of the card's width.
 * Keep in step with --slant on .product-rail in globals.css. */
const SLANT = 0.16;
const pct = `${SLANT * 100}%`;
const CLIP = `polygon(${pct} 0, 100% 0, ${100 - SLANT * 100}% 100%, 0 100%)`;

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

/** The card's outline, following the same slanted shape as its clip. */
function Outline({ className, dashed = false }: { className?: string; dashed?: boolean }) {
  const s = SLANT * 100;
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
  "group relative flex aspect-(--card-aspect) flex-col outline-none motion-safe:transition-transform motion-safe:duration-300";

function ProductTile({ product }: { product: Product }) {
  const { card } = product;
  const Scene = SCENES[card.scene];
  return (
    <Link
      href={productHref(product)}
      className={cn(tileBase, "motion-safe:hover:-translate-y-1.5 motion-safe:focus-visible:-translate-y-1.5")}
      style={{ clipPath: CLIP, background: card.background, color: card.ink } as CSSProperties}
    >
      <div className="relative flex flex-1 flex-col px-[18%] pb-8 pt-10">
        <div className="flex items-center gap-2.5">
          <card.Mark className="h-9 w-9" />
          <span className="text-3xl font-bold tracking-[-0.045em]">{product.name}</span>
        </div>
        <p className="mt-4 text-sm font-medium leading-snug opacity-90">
          {product.tagline}
        </p>

        {/* The product's drawing, in its own palette, wider than the text. */}
        <div
          className={cn(
            card.artClass,
            "-mx-[24%] my-auto motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.03]",
          )}
        >
          <Scene id={`rail-${product.id}`} />
        </div>

        <div className="flex flex-col gap-3">
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
        clipPath: CLIP,
        backgroundImage: "radial-gradient(var(--hairline) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      <div className="relative flex flex-1 flex-col items-start justify-end px-[18%] pb-8 pt-10">
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
      style={{ clipPath: CLIP }}
    >
      <div className="relative flex flex-1 flex-col items-start justify-end px-[18%] pb-8 pt-10">
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
