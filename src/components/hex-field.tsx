/**
 * Hexagonal lattice backdrop.
 *
 * Built from individually addressable cells rather than an SVG <pattern>: the
 * lattice holds still and the LIGHT moves through it, like nodes waking up
 * across a mesh. A minority of cells are brighter "nodes" that breathe.
 *
 * Everything is deterministic (a small integer hash, no randomness) so the
 * server and client render identical markup and nothing flashes on hydration.
 * Motion stops below lg and under prefers-reduced-motion (see globals.css).
 */

/** Flat-top hexagon, centred on the origin, circumradius r. */
function hexPoints(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i);
    points.push(
      `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return points.join(" ");
}

/** Deterministic pseudo-random in [0,1) from two integers. */
function hash(a: number, b: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

const R = 26;
const COLS = 20;
const ROWS = 12;
const COL_STEP = R * 1.5;
const ROW_STEP = R * Math.sqrt(3);

type Cell = { key: string; points: string; wave: number; seed: number };

const cells: Cell[] = [];
for (let col = 0; col < COLS; col += 1) {
  for (let row = 0; row < ROWS; row += 1) {
    const cx = col * COL_STEP;
    const cy = row * ROW_STEP + (col % 2 ? ROW_STEP / 2 : 0);
    cells.push({
      key: `${col}-${row}`,
      points: hexPoints(cx, cy, R - 1.5),
      wave: (COLS - col) * 0.55 + row * 0.22,
      seed: hash(col, row),
    });
  }
}

const WIDTH = (COLS - 1) * COL_STEP + R * 2;
const HEIGHT = (ROWS - 1) * ROW_STEP + R * 2;

const MASK =
  "radial-gradient(95% 80% at 50% 34%, #000 0%, rgba(0,0,0,0.32) 46%, transparent 72%)";

/**
 * By default the lattice fills its container, so it scales with it. Pass
 * `height` (px) to pin it to the top at a fixed size instead, for sections
 * whose height changes while you’re on the page (a form that grows), so
 * the cells hold still rather than rescaling under you.
 */
export function HexField({ height }: { height?: number } = {}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className={height ? "absolute inset-x-0 top-0 opacity-80" : "absolute inset-0 opacity-80"}
        style={{ maskImage: MASK, WebkitMaskImage: MASK, height }}
      >
        <svg
          viewBox={`${-R} ${-R} ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 size-full text-brand"
          role="presentation"
        >
          {cells.map((cell) => {
            const isNode = cell.seed > 0.9;
            const delay = -(cell.wave % 7).toFixed(2);
            return (
              <polygon
                key={cell.key}
                points={cell.points}
                fill={isNode ? "currentColor" : "none"}
                fillOpacity={isNode ? 0.08 : 0}
                stroke="currentColor"
                strokeOpacity={isNode ? 0.45 : 0.2}
                strokeWidth={isNode ? 1.2 : 0.9}
                className={isNode ? "hex-node" : "hex-cell"}
                style={{ animationDelay: `${delay}s` }}
              />
            );
          })}
        </svg>
      </div>

      {/* seat the content at the bottom edge */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-background to-transparent" />
    </div>
  );
}
