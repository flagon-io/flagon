import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { corners, iso, pts, type P3 } from "@/components/art/iso";

/**
 * The drawing kit for the book's figures and part openers.
 *
 * Everything is flat color from the --fig-* variables (globals.css): the site
 * theme on screen, opaque grays in the print edition. Nothing here may use
 * opacity, masks, gradients or patterns, because the printed interior must be
 * free of transparency. Compose back to front; later shapes cover earlier ones.
 *
 * Units are SVG user units at roughly one per CSS pixel of a 640-wide figure.
 */

export type Tone = "paper" | "shade" | "shade-2" | "accent" | "ink" | "none";
export type Ink = "ink" | "line" | "faint" | "accent" | "paper" | "none";

const FILL: Record<Tone, string> = {
  paper: "var(--fig-paper)",
  shade: "var(--fig-shade)",
  "shade-2": "var(--fig-shade-2)",
  accent: "var(--fig-accent-fill)",
  ink: "var(--fig-ink)",
  none: "none",
};

const STROKE: Record<Ink, string> = {
  ink: "var(--fig-ink)",
  line: "var(--fig-line)",
  faint: "var(--fig-faint)",
  accent: "var(--fig-accent)",
  paper: "var(--fig-paper)",
  none: "none",
};

export const fill = (t: Tone) => FILL[t];

/** What every figure component takes: a page-unique id and the caption. */
export type FigureProps = { id: string; caption?: ReactNode };
export const stroke = (i: Ink) => STROKE[i];

/**
 * A figure: the drawing plus a caption that states what it shows. `id` must be
 * unique on the page (it scopes the arrowhead markers).
 */
export function Figure({
  id,
  viewBox,
  label,
  caption,
  wide = false,
  className,
  children,
}: {
  id: string;
  viewBox: string;
  /** What the drawing shows, for screen readers. */
  label: string;
  caption?: ReactNode;
  /** Let the drawing run a little wider than the text column on screen. */
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure className={cn("book-figure not-prose", wide && "book-figure-wide", className)}>
      <svg viewBox={viewBox} role="img" aria-label={label} className="block h-auto w-full">
        <Markers id={id} />
        {children}
      </svg>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/** Arrowheads in each ink, as markers scoped to one figure. */
function Markers({ id }: { id: string }) {
  const inks: Ink[] = ["ink", "line", "accent"];
  return (
    <defs>
      {inks.map((ink) => (
        <marker
          key={ink}
          id={`${id}-arrow-${ink}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path d="M0,0.8 L10,5 L0,9.2 Z" fill={STROKE[ink]} />
        </marker>
      ))}
    </defs>
  );
}

export function Rect({
  x,
  y,
  w,
  h,
  tone = "paper",
  ink = "ink",
  width = 1,
  dashed = false,
  r = 0,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: Tone;
  ink?: Ink;
  width?: number;
  dashed?: boolean;
  r?: number;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={r}
      fill={FILL[tone]}
      stroke={STROKE[ink]}
      strokeWidth={ink === "none" ? 0 : width}
      strokeDasharray={dashed ? "4 3" : undefined}
    />
  );
}

/** A straight or bent line through points; `arrow` puts a head on the end. */
export function Path({
  d,
  ink = "line",
  width = 1,
  dashed = false,
  dots = false,
  arrow,
  start,
  fig,
}: {
  d: string;
  ink?: Ink;
  width?: number;
  dashed?: boolean;
  dots?: boolean;
  /** Arrowhead at the end. */
  arrow?: boolean;
  /** Arrowhead at the start too. */
  start?: boolean;
  /** The figure id, needed for arrowheads. */
  fig?: string;
}) {
  const head = ink === "faint" || ink === "paper" || ink === "none" ? "line" : ink;
  return (
    <path
      d={d}
      fill="none"
      stroke={STROKE[ink]}
      strokeWidth={width}
      strokeDasharray={dots ? "1.5 3" : dashed ? "5 4" : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      markerEnd={arrow && fig ? `url(#${fig}-arrow-${head})` : undefined}
      markerStart={start && fig ? `url(#${fig}-arrow-${head})` : undefined}
    />
  );
}

/** A label. `mono` for names from the system, plain for annotations. */
export function Text({
  x,
  y,
  children,
  size = 11,
  anchor = "start",
  ink = "ink",
  mono = false,
  caps = false,
  weight = 400,
}: {
  x: number;
  y: number;
  children: ReactNode;
  size?: number;
  anchor?: "start" | "middle" | "end";
  ink?: Ink;
  mono?: boolean;
  /** Small caps label: uppercase, tracked. */
  caps?: boolean;
  weight?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={caps ? size * 0.82 : size}
      textAnchor={anchor}
      fill={STROKE[ink]}
      fontWeight={weight}
      fontFamily={mono || caps ? "var(--font-mono), ui-monospace, monospace" : "var(--font-sans), sans-serif"}
      letterSpacing={caps ? "0.14em" : undefined}
      style={caps ? { textTransform: "uppercase" } : undefined}
    >
      {children}
    </text>
  );
}

/** A bracket along an edge with a label: "this span is X". */
export function Span({
  x1,
  x2,
  y,
  label,
  below = false,
  ink = "line",
}: {
  x1: number;
  x2: number;
  y: number;
  label: ReactNode;
  below?: boolean;
  ink?: Ink;
}) {
  const t = below ? 5 : -5;
  return (
    <g>
      <path
        d={`M${x1},${y - t} L${x1},${y} L${x2},${y} L${x2},${y - t}`}
        fill="none"
        stroke={STROKE[ink]}
        strokeWidth={1}
      />
      <Text x={(x1 + x2) / 2} y={below ? y + 14 : y - 7} anchor="middle" size={10} ink={ink === "accent" ? "accent" : "line"} caps>
        {label}
      </Text>
    </g>
  );
}

/* Isometric pieces, for the part openers and the odd figure that wants depth. */

export function IsoFace({
  ps,
  tone = "paper",
  ink = "ink",
  width = 1,
  dashed = false,
}: {
  ps: readonly P3[];
  tone?: Tone;
  ink?: Ink;
  width?: number;
  dashed?: boolean;
}) {
  return (
    <polygon
      points={pts(ps)}
      fill={FILL[tone]}
      stroke={STROKE[ink]}
      strokeWidth={ink === "none" ? 0 : width}
      strokeDasharray={dashed ? "4 3" : undefined}
      strokeLinejoin="round"
    />
  );
}

export function IsoLine({
  ps,
  ink = "line",
  width = 1,
  dashed = false,
  arrow,
  fig,
}: {
  ps: readonly P3[];
  ink?: Ink;
  width?: number;
  dashed?: boolean;
  arrow?: boolean;
  fig?: string;
}) {
  const head = ink === "faint" || ink === "paper" || ink === "none" ? "line" : ink;
  return (
    <polyline
      points={pts(ps)}
      fill="none"
      stroke={STROKE[ink]}
      strokeWidth={width}
      strokeDasharray={dashed ? "5 4" : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      markerEnd={arrow && fig ? `url(#${fig}-arrow-${head})` : undefined}
    />
  );
}

/**
 * A solid box: left, right and top faces. Tones default to the lit top and
 * two shaded sides; pass `top="accent"` to pick one out.
 */
export function IsoBox({
  at,
  size,
  top = "paper",
  left = "shade",
  right = "shade-2",
  ink = "ink",
  width = 1,
  dashed = false,
}: {
  at: P3;
  size: P3;
  top?: Tone;
  left?: Tone;
  right?: Tone;
  ink?: Ink;
  width?: number;
  dashed?: boolean;
}) {
  const c = corners(at, size);
  return (
    <g>
      <IsoFace ps={[c.b01, c.b11, c.t11, c.t01]} tone={dashed ? "none" : left} ink={ink} width={width} dashed={dashed} />
      <IsoFace ps={[c.b10, c.b11, c.t11, c.t10]} tone={dashed ? "none" : right} ink={ink} width={width} dashed={dashed} />
      <IsoFace ps={[c.t00, c.t10, c.t11, c.t01]} tone={dashed ? "none" : top} ink={ink} width={width} dashed={dashed} />
    </g>
  );
}

/** Place flat content on a box's top face, drawn as if on paper (x right, y down). */
export function OnTop({ origin, children }: { origin: P3; children: ReactNode }) {
  const [tx, ty] = iso(origin);
  const c = Math.cos(Math.PI / 6);
  return <g transform={`matrix(${c} 0.5 ${-c} 0.5 ${tx} ${ty})`}>{children}</g>;
}

/** Place flat content on a box's left face (the one at its largest y). */
export function OnLeft({ origin, children }: { origin: P3; children: ReactNode }) {
  const [tx, ty] = iso(origin);
  const c = Math.cos(Math.PI / 6);
  return <g transform={`matrix(${c} 0.5 0 1 ${tx} ${ty})`}>{children}</g>;
}

export { iso, pts, corners, type P3 };
