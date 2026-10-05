import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/cn";

/**
 * A small isometric drawing kit for the site's line art.
 *
 * Space is x (to the right and down), y (to the left and down) and z (up),
 * projected at the classic 30°. The faces you can see on a box are its top, its
 * left face (the one at the box's largest y) and its right face (largest x).
 *
 * Everything takes its color from CSS variables (--art-*, defined in
 * globals.css), so drawings follow the site's light and dark theme, and a
 * wrapper can repaint one in a product's own palette by overriding them.
 * Shapes are drawn in the order they appear, so compose back to front: what
 * comes later covers what came before, the way a painter would.
 */

export type P3 = readonly [number, number, number];

const COS = Math.cos(Math.PI / 6);
const r = (n: number) => Math.round(n * 100) / 100;

/** Project a point in space onto the page. */
export function iso([x, y, z]: P3): [number, number] {
  return [r((x - y) * COS), r((x + y) * 0.5 - z)];
}

/** An SVG points list for a polygon or polyline through these points. */
export function pts(ps: readonly P3[]): string {
  return ps.map((p) => iso(p).join(",")).join(" ");
}

type Tone = "top" | "left" | "right" | "none" | "accent" | "accent-2";

const FILL: Record<Tone, string> = {
  top: "var(--art-top)",
  left: "var(--art-left)",
  right: "var(--art-right)",
  none: "none",
  accent: "var(--art-accent-fill)",
  "accent-2": "var(--art-accent-2-fill)",
};

type Ink = "ink" | "line" | "faint" | "accent" | "accent-2";
const STROKE: Record<Ink, string> = {
  ink: "var(--art-ink)",
  line: "var(--art-line)",
  faint: "var(--art-faint)",
  accent: "var(--art-accent)",
  "accent-2": "var(--art-accent-2)",
};

/** A flat polygon through points in space. */
export function Face({
  ps,
  tone = "top",
  ink = "ink",
  dashed = false,
  hatch,
  width = 1,
}: {
  ps: readonly P3[];
  tone?: Tone;
  ink?: Ink | "none";
  dashed?: boolean;
  /** Overlay vertical hatching (for shaded sides), by pattern id. */
  hatch?: string;
  width?: number;
}) {
  const points = pts(ps);
  return (
    <>
      <polygon
        points={points}
        fill={FILL[tone]}
        stroke={ink === "none" ? "none" : STROKE[ink]}
        strokeWidth={width}
        strokeDasharray={dashed ? "3 3" : undefined}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {hatch ? <polygon points={points} fill={`url(#${hatch})`} stroke="none" /> : null}
    </>
  );
}

/** A line or path through points in space. */
export function Line({
  ps,
  ink = "line",
  dashed = false,
  dots = false,
  width = 1,
}: {
  ps: readonly P3[];
  ink?: Ink;
  dashed?: boolean;
  /** Fine dotted, for construction lines. */
  dots?: boolean;
  width?: number;
}) {
  return (
    <polyline
      points={pts(ps)}
      fill="none"
      stroke={STROKE[ink]}
      strokeWidth={width}
      strokeDasharray={dots ? "1 3" : dashed ? "4 4" : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}

/** A small square marker on a point: the corner handles of a drawing. */
export function Node({ p, size = 4, ink = "ink" }: { p: P3; size?: number; ink?: Ink }) {
  const [x, y] = iso(p);
  return (
    <rect
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      fill="var(--art-node)"
      stroke={STROKE[ink]}
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
    />
  );
}

/** The eight corners of a box, named by the faces they sit on. */
export function corners([x, y, z]: P3, [w, d, h]: P3) {
  return {
    // bottom
    b00: [x, y, z] as P3,
    b10: [x + w, y, z] as P3,
    b11: [x + w, y + d, z] as P3,
    b01: [x, y + d, z] as P3,
    // top
    t00: [x, y, z + h] as P3,
    t10: [x + w, y, z + h] as P3,
    t11: [x + w, y + d, z + h] as P3,
    t01: [x, y + d, z + h] as P3,
  };
}

/**
 * A solid box: its left, right and top faces. `hatch` shades a side with
 * vertical lines; `nodes` marks the visible top corners.
 */
export function Box({
  at,
  size,
  ink = "ink",
  top = "top",
  hatch,
  hatchId,
  nodes = false,
  dashed = false,
}: {
  at: P3;
  size: P3;
  ink?: Ink;
  /** The top face's fill, e.g. "accent" to pick a box out. */
  top?: Tone;
  hatch?: "left" | "right";
  /** The hatch pattern id from the enclosing <Art>. */
  hatchId?: string;
  nodes?: boolean;
  dashed?: boolean;
}) {
  const c = corners(at, size);
  return (
    <g>
      <Face
        ps={[c.b01, c.b11, c.t11, c.t01]}
        tone={dashed ? "none" : "left"}
        ink={ink}
        dashed={dashed}
        hatch={hatch === "left" ? hatchId : undefined}
      />
      <Face
        ps={[c.b10, c.b11, c.t11, c.t10]}
        tone={dashed ? "none" : "right"}
        ink={ink}
        dashed={dashed}
        hatch={hatch === "right" ? hatchId : undefined}
      />
      <Face ps={[c.t00, c.t10, c.t11, c.t01]} tone={dashed ? "none" : top} ink={ink} dashed={dashed} />
      {nodes ? (
        <>
          <Node p={c.t00} ink={ink} />
          <Node p={c.t10} ink={ink} />
          <Node p={c.t11} ink={ink} />
          <Node p={c.t01} ink={ink} />
        </>
      ) : null}
    </g>
  );
}

/**
 * Lay flat 2D content onto a face. Inside, draw as if on paper: x to the right,
 * y down, one unit per unit of space. `origin` is where the paper's top-left
 * corner lands.
 *   top:   paper x runs along +x, paper y along +y
 *   left:  paper x runs along +x, paper y runs down (the face at a box's max y)
 *   right: paper x runs along -y, paper y runs down (the face at a box's max x)
 */
export function OnFace({
  face,
  origin,
  children,
}: {
  face: "top" | "left" | "right";
  origin: P3;
  children: ReactNode;
}) {
  const [tx, ty] = iso(origin);
  const m =
    face === "top"
      ? [COS, 0.5, -COS, 0.5]
      : face === "left"
        ? [COS, 0.5, 0, 1]
        : [COS, -0.5, 0, 1];
  return (
    <g transform={`matrix(${m.map(r).join(" ")} ${tx} ${ty})`}>{children}</g>
  );
}

/** Lines of "text" on a face: a heading bar and a few body lines. */
export function TextLines({
  x = 0,
  y = 0,
  width,
  lines = 4,
  gap = 7,
  heading = true,
}: {
  x?: number;
  y?: number;
  width: number;
  lines?: number;
  gap?: number;
  heading?: boolean;
}) {
  const rows: ReactNode[] = [];
  let cy = y;
  if (heading) {
    rows.push(
      <rect key="h" x={x} y={cy} width={width * 0.55} height={4} rx={1} fill="var(--art-ink)" />,
    );
    cy += gap + 4;
  }
  for (let i = 0; i < lines; i += 1) {
    // Ragged right edge, deterministic.
    const w = width * (i === lines - 1 ? 0.5 : 0.82 + ((i * 37) % 18) / 100);
    rows.push(
      <rect key={i} x={x} y={cy} width={Math.min(w, width)} height={1.6} rx={0.8} fill="var(--art-line)" />,
    );
    cy += gap;
  }
  return <g>{rows}</g>;
}

/**
 * The drawing's frame: an <svg> with the shared patterns (hatching, dot grid)
 * and a soft vignette for guide lines, so long construction lines fade out
 * toward the edges instead of stopping hard. `id` must be unique on the page.
 */
/**
 * A viewBox that frames these points with some padding, widened or heightened
 * (about its center) to a fixed aspect ratio, so every drawing sits centered
 * in a frame of the same shape. The frame is never narrower than `minWidth`,
 * so drawings share one scale and their lines and labels match in weight.
 */
export function frame(
  points: readonly P3[],
  aspect = 1.6,
  pad = 28,
  minWidth = 480,
): string {
  const xy = points.map(iso);
  let minX = Math.min(...xy.map((p) => p[0])) - pad;
  let maxX = Math.max(...xy.map((p) => p[0])) + pad;
  let minY = Math.min(...xy.map((p) => p[1])) - pad;
  let maxY = Math.max(...xy.map((p) => p[1])) + pad;
  if (maxX - minX < minWidth) {
    const grow = (minWidth - (maxX - minX)) / 2;
    minX -= grow;
    maxX += grow;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w / h < aspect) {
    const grow = (h * aspect - w) / 2;
    minX -= grow;
    maxX += grow;
  } else {
    const grow = (w / aspect - h) / 2;
    minY -= grow;
    maxY += grow;
  }
  return [minX, minY, maxX - minX, maxY - minY].map(r).join(" ");
}

export function Art({
  id,
  viewBox,
  label,
  className,
  guides,
  children,
  ...rest
}: {
  id: string;
  viewBox: string;
  /** Describe the drawing for screen readers; omit for pure decoration. */
  label?: string;
  className?: string;
  /** Construction lines, drawn first and faded toward the edges. */
  guides?: ReactNode;
  children: ReactNode;
} & Omit<SVGProps<SVGSVGElement>, "viewBox" | "children" | "id">) {
  const [vx, vy, vw, vh] = viewBox.split(/\s+/).map(Number);
  return (
    <svg
      viewBox={viewBox}
      className={cn("block h-auto w-full overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      <defs>
        <pattern id={`${id}-hatch`} width="3" height="3" patternUnits="userSpaceOnUse">
          <line x1="1" y1="0" x2="1" y2="3" stroke="var(--art-line)" strokeWidth="0.6" />
        </pattern>
        <pattern id={`${id}-dots`} width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="var(--art-faint)" />
        </pattern>
        <radialGradient id={`${id}-fade-g`} cx="50%" cy="50%" r="55%">
          <stop offset="0.45" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <mask id={`${id}-fade`} maskUnits="userSpaceOnUse" x={vx} y={vy} width={vw} height={vh}>
          <rect x={vx} y={vy} width={vw} height={vh} fill={`url(#${id}-fade-g)`} />
        </mask>
      </defs>
      {guides ? <g mask={`url(#${id}-fade)`}>{guides}</g> : null}
      {children}
    </svg>
  );
}

/** Ids for the patterns an <Art> defines, for passing to shapes. */
export function artIds(id: string) {
  return { hatch: `${id}-hatch`, dots: `${id}-dots` };
}
