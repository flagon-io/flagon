/**
 * The hero backdrop: a hexagonal lattice with activity travelling through it.
 *
 * Anchored to the RIGHT and faded out toward the left, so it fills the empty
 * half of the hero and never sits behind the headline. A texture that crosses
 * the type makes the type worse; there is no amount of subtlety that fixes
 * being in the wrong place.
 *
 * Built from individually addressable cells rather than an SVG `<pattern>`,
 * which is the whole point: a pattern can only be moved as one sheet, and
 * sliding the entire field is the cheap effect that reads as a screensaver.
 * With real cells, the lattice holds still and the LIGHT moves through it,
 * like nodes waking up across a mesh.
 *
 * Everything is deterministic (a small integer hash, no randomness), so the
 * server and the client render identical markup and nothing flashes on
 * hydration.
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
const COLS = 17;
const ROWS = 19;
const COL_STEP = R * 1.5;
const ROW_STEP = R * Math.sqrt(3);

type Cell = {
  key: string;
  points: string;
  /** Distance from the lattice's right edge, which drives the wave order. */
  wave: number;
  seed: number;
};

const cells: Cell[] = [];
for (let col = 0; col < COLS; col += 1) {
  for (let row = 0; row < ROWS; row += 1) {
    const cx = col * COL_STEP;
    const cy = row * ROW_STEP + (col % 2 ? ROW_STEP / 2 : 0);
    cells.push({
      key: `${col}-${row}`,
      points: hexPoints(cx, cy, R - 1.5),
      // Diagonal ordering: the pulse crosses the lattice rather than sweeping
      // a straight column, which looks mechanical.
      wave: (COLS - col) * 0.55 + row * 0.22,
      seed: hash(col, row),
    });
  }
}

const WIDTH = (COLS - 1) * COL_STEP + R * 2;
const HEIGHT = (ROWS - 1) * ROW_STEP + R * 2;

export function HexField({
  /**
   * `hero` is the full treatment. `quiet` is the same lattice, dimmer and
   * still: enough to carry the motif onto the interior pages without every
   * one of them competing for attention. A theme that shouts on every page
   * is not a theme, it is a distraction repeated.
   *
   * "Dimmer" still has to mean VISIBLE, though. Tuned against the home hero
   * side by side rather than in isolation, because the failure mode of a
   * deliberately quiet treatment is that it reads as absent and the interior
   * pages just look plainer than the front door.
   */
  variant = "hero",
}: {
  variant?: "hero" | "quiet";
} = {}) {
  const quiet = variant === "quiet";
  return (
    <div
      aria-hidden
      // Visible on every size. On a phone the lattice sits in the top-right
      // corner, above and beside the headline rather than behind it, because
      // narrow columns leave no empty half to fill. The motion stops below
      // `lg` (see globals.css): 300-odd animated nodes is the wrong thing to
      // ask of a phone, and a still lattice is most of the charm anyway.
      className={`pointer-events-none absolute right-0 top-0 h-[46%] w-[78%] overflow-hidden sm:h-[55%] sm:w-[62%] lg:inset-y-0 lg:h-auto ${
        quiet
          ? "opacity-45 lg:w-[54%] lg:opacity-65"
          : "opacity-60 lg:w-[62%] lg:opacity-100"
      }`}
      // Fades to nothing well before the headline's column. The mask lives on
      // this element because it is the only box in the tree that is exactly
      // the region the lattice should occupy.
      style={{
        // Fades down-and-left, so on narrow screens it thins out before it
        // reaches the copy underneath instead of stopping at a hard edge.
        maskImage:
          "radial-gradient(140% 120% at 100% 0%, #000 0%, rgba(0,0,0,0.8) 35%, rgba(0,0,0,0.3) 62%, transparent 88%)",
        WebkitMaskImage:
          "radial-gradient(140% 120% at 100% 0%, #000 0%, rgba(0,0,0,0.8) 35%, rgba(0,0,0,0.3) 62%, transparent 88%)",
      }}
    >
      <svg
        viewBox={`${-R} ${-R} ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMaxYMid slice"
        className="absolute inset-0 h-full w-full"
        role="presentation"
      >
        <defs>
          {/* The travelling glow. A gradient that sweeps is cheaper and
              smoother than animating each cell's colour. */}
          <linearGradient id="hex-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(45 212 191)" stopOpacity="0" />
            <stop offset="50%" stopColor="rgb(45 212 191)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="rgb(45 212 191)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {cells.map((cell) => {
          // A minority of cells are "nodes": brighter, and they breathe.
          const isNode = cell.seed > 0.88;
          const delay = -(cell.wave % 7).toFixed(2);
          return (
            <polygon
              key={cell.key}
              points={cell.points}
              fill={isNode ? "rgb(45 212 191)" : "none"}
              fillOpacity={isNode ? 0.06 : 0}
              stroke="rgb(45 212 191)"
              strokeOpacity={isNode ? 0.28 : 0.12}
              strokeWidth={isNode ? 1.1 : 0.8}
              // Interior pages get the lattice without the pulse: the motif
              // is the shape, not the motion.
              className={quiet ? undefined : isNode ? "hex-node" : "hex-cell"}
              style={quiet ? undefined : { animationDelay: `${delay}s` }}
            />
          );
        })}
      </svg>
    </div>
  );
}
