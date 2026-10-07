import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { MachineArt } from "@/components/book-art/parts";

/**
 * A book's cover, typeset rather than drawn in an image editor, so it stays
 * sharp at any size and prints into the PDF as vectors. Covers keep their own
 * palette in both themes, the way a physical book doesn't change color when
 * you turn the lights off.
 *
 * The drawing is the book's subject. For Eight Kilobytes that's a heap page:
 * the header, line pointers growing down from the top, tuples growing up from
 * the bottom, and the free space between them.
 */

type CoverBook = {
  title: string;
  subtitle: string;
  author: string;
  publisher: string;
  edition: string;
  /** Which drawing goes on the cover (`cover:` in the book's frontmatter). */
  cover: string;
};

export function BookCover({
  book,
  className,
  style,
  size = "md",
  print = false,
  kicker = "A free book",
}: {
  book: CoverBook;
  className?: string;
  style?: CSSProperties;
  /** "lg" scales the type up for the full-page PDF cover. */
  size?: "md" | "lg";
  /**
   * The front of a printed book: no drawn-on spine, corners, or shadow (the
   * real book has those), and it fills its box instead of keeping 2:3.
   */
  print?: boolean;
  /** Small line above the title; "A free book" on the web. */
  kicker?: string;
}) {
  // A book may name a drawing that doesn't exist; then the cover has none.
  const cover = COVER_ART[book.cover] as CoverArt | undefined;
  const Art = cover?.draw;
  return (
    // Decorative: wherever a cover appears, the title and subtitle are also
    // set as real text beside it, so assistive tech skips the duplicate.
    <div
      aria-hidden
      className={cn(
        "@container relative isolate flex flex-col overflow-hidden bg-[#0a1f1d] text-[#e9fbf7]",
        print
          ? "h-full w-full"
          : "aspect-[2/3] rounded-[3px] shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_18px_40px_-18px_rgba(0,0,0,0.55)]",
        className,
      )}
      style={style}
    >
      {/* Spine: a darker band and a crease, so it reads as a book, not a card.
          Opaque colors (the background is fixed), so the cover prints without
          transparency. */}
      {/* A full-bleed drawing sits behind the type and runs off the edges. */}
      {Art && cover?.bleed ? (
        <div className="absolute inset-x-0 top-[34%] bottom-[15%]">
          <Art className="h-full w-full" />
        </div>
      ) : null}

      {print ? null : (
        <>
          <span aria-hidden className="absolute inset-y-0 left-0 z-10 w-[4.5%] bg-[#07161a]" />
          <span aria-hidden className="absolute inset-y-0 left-[4.5%] z-10 w-px bg-[#223634]" />
        </>
      )}

      <div
        className={cn(
          "relative flex flex-1 flex-col pl-[12%] pr-[8%]",
          size === "lg" ? "pt-[11%] pb-[8%]" : "pt-[10%] pb-[7%]",
        )}
      >
        <p className="font-mono text-[3.6cqw] uppercase tracking-[0.22em] text-[#5eead4]">
          {kicker}
        </p>
        <p className="mt-[4%] font-heading text-[11.5cqw] font-extrabold leading-[0.95] tracking-[-0.02em] text-balance">
          {book.title}
        </p>
        <p className="mt-[4%] max-w-[85%] text-[4.6cqw] leading-snug text-[#a7d9d0] text-pretty">
          {book.subtitle}
        </p>

        {Art && !cover?.bleed ? <Art className="mt-auto w-full" /> : <div className="mt-auto" />}

        <div className="relative mt-[6%] flex items-end justify-between border-t border-[#2f413f] bg-[#0a1f1d] pt-[4%]">
          <span className="font-heading text-[4.4cqw] font-bold tracking-tight">
            {book.author}
          </span>
          <span className="font-mono text-[3cqw] uppercase tracking-[0.2em] text-[#4dc1af]">
            {book.publisher || book.edition}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The 8 KB heap page, drawn to scale-ish: 24-byte header, a run of 4-byte line
 * pointers, free space, then tuples stacked from the end of the page upward.
 */
function PageArt({ className }: { className?: string }) {
  const ink = "#e9fbf7";
  const line = "#5f7370"; // ink at 38% over the cover background, pre-blended
  const faint = "#293e3c"; // ink at 14%
  const accent = "#2dd4bf";
  const accentFill = "#103c37"; // accent at 16%

  // Tuples, bottom-up: [y, height, width as share of the page].
  const tuples: [number, number, number][] = [
    [196, 22, 1],
    [172, 22, 1],
    [152, 18, 1],
    [126, 24, 1],
  ];
  // Line pointer slots across the top, after the header. The fourth is the
  // one this drawing follows to its tuple.
  const slots = [0, 1, 2, 3, 4];

  return (
    <svg
      viewBox="0 0 240 228"
      className={className}
      fill="none"
    >
      <defs>
        <pattern id="bc-free" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          {/* An opaque tile: a transparent one prints as an image with a soft
              mask, and KDP wants covers free of transparency. */}
          <rect width="6" height="6" fill="#0a1f1d" />
          <line x1="0" y1="0" x2="0" y2="6" stroke={faint} strokeWidth="1.2" />
        </pattern>
      </defs>

      {/* the page */}
      <rect x="20" y="8" width="200" height="212" rx="1.5" stroke={ink} strokeWidth="1.4" />

      {/* header */}
      <rect x="20" y="8" width="200" height="16" fill="#1c312e" />
      <line x1="20" y1="24" x2="220" y2="24" stroke={line} />
      <text x="26" y="19.5" fill={ink} fontSize="7" fontFamily="var(--font-mono), monospace" letterSpacing="0.6">
        PAGE HEADER · 24 B
      </text>

      {/* line pointers */}
      {slots.map((i) => (
        <rect
          key={i}
          x={20 + i * 22}
          y="24"
          width="22"
          height="12"
          stroke={i === 3 ? accent : line}
          fill={i === 3 ? accentFill : "none"}
        />
      ))}
      <text x="134" y="33" fill={line} fontSize="6.5" fontFamily="var(--font-mono), monospace">
        → pd_lower
      </text>

      {/* free space */}
      <rect x="20.7" y="36.5" width="198.6" height="89" fill="url(#bc-free)" />
      <text x="34" y="96" fill={line} fontSize="7" fontFamily="var(--font-mono), monospace" letterSpacing="1.4">
        FREE SPACE
      </text>

      {/* tuples */}
      {tuples.map(([y, h, w], i) => (
        <rect
          key={y}
          x="20"
          y={y}
          width={200 * w}
          height={h}
          stroke={i === 3 ? accent : line}
          fill={i === 3 ? accentFill : "#132826"}
        />
      ))}
      {/* tuple header stripe on each tuple */}
      {tuples.map(([y, h]) => (
        <line key={`h${y}`} x1="58" y1={y} x2="58" y2={y + h} stroke={faint} />
      ))}
      <text x="26" y="141" fill={accent} fontSize="6.5" fontFamily="var(--font-mono), monospace">
        xmin xmax
      </text>
      <text x="64" y="141" fill={ink} fontSize="6.5" fontFamily="var(--font-mono), monospace">
        (42, &apos;acme&apos;, &apos;team&apos;, 2026-10-05)
      </text>
      <text x="214" y="123" textAnchor="end" fill={line} fontSize="6.5" fontFamily="var(--font-mono), monospace">
        pd_upper ←
      </text>

      {/* the pointer to its tuple */}
      <path
        d="M 97 36 C 97 70, 150 70, 150 104 L 150 126"
        stroke={accent}
        strokeWidth="1.3"
      />
      <path d="M 146.5 121 L 150 126.5 L 153.5 121" stroke={accent} strokeWidth="1.3" />

      {/* byte offsets */}
      <text x="14" y="12" textAnchor="end" fill={line} fontSize="6" fontFamily="var(--font-mono), monospace">0</text>
      <text x="14" y="220" textAnchor="end" fill={line} fontSize="6" fontFamily="var(--font-mono), monospace">8K</text>
    </svg>
  );
}

/**
 * The same page, lifted off a stack of them: the book's subject in depth, from
 * the isometric kit its part openers use, repainted in the cover's palette.
 * Every color is opaque, so the printed cover stays free of transparency.
 */
const COVER_PALETTE = {
  "--fig-paper": "#10302c",
  "--fig-shade": "#0b2321",
  "--fig-shade-2": "#07161a",
  "--fig-ink": "#a7d9d0",
  "--fig-line": "#4d6b67",
  "--fig-faint": "#223634",
  "--fig-accent": "#2dd4bf",
  "--fig-accent-fill": "#0f4a43",
} as CSSProperties;

function StackArt({ className }: { className?: string }) {
  return (
    <div className={className} style={COVER_PALETTE}>
      <MachineArt id="cover-stack" frameAspect={1.15} />
    </div>
  );
}

/**
 * The book's hook as a picture: a field of pages, almost all of them dim, and
 * the four a lookup actually reads (root, internal, leaf, heap) lifted out of
 * it and joined by one path. Drawn larger than the cover and cropped, so the
 * field runs off every edge. Opaque colors only, for the printed cover.
 */
function FieldArt({ className }: { className?: string }) {
  const S = 34; // tile size
  const G = 7; // gap between tiles
  const H = 4; // tile thickness
  const N = 17;
  const step = S + G;
  const cos = Math.cos(Math.PI / 6);
  const iso = (x: number, y: number, z: number) => [(x - y) * cos, (x + y) * 0.5 - z] as const;
  const poly = (ps: (readonly [number, number])[]) => ps.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
  const center = (N - 1) / 2;
  // The lookup: four pages near the middle, stepping down from root to heap.
  const lit: [number, number, number][] = [
    [center - 3, center - 1, 100],
    [center - 1, center, 70],
    [center + 1, center + 1, 42],
    [center + 3, center + 2, 16],
  ];
  const litKey = new Set(lit.map(([i, j]) => `${i},${j}`));
  const mid = (i: number, j: number, z: number, thick = H) => iso(i * step + S / 2, j * step + S / 2, z + thick);
  // Frame the drawing on the path, from the root's top to the heap's slot.
  const top = mid(lit[0][0], lit[0][1], lit[0][2]);
  const bottom = mid(lit[3][0], lit[3][1], 0);
  const fx = (top[0] + bottom[0]) / 2;
  const fy = (top[1] + bottom[1]) / 2;
  // Always fit the whole path, padded; the faded field fills whatever space
  // the cover's proportions leave around it.
  const h = bottom[1] - top[1] + 58;
  const w = h * 1.3;
  // Depth without transparency: the farther a tile is from the path, the more
  // its colors are mixed toward the cover's background, so the field fades out
  // before it reaches the crop.
  const BG = [0x0a, 0x1f, 0x1d];
  const mix = (hex: string, t: number) => {
    const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
    return `#${c.map((v, k) => Math.round(BG[k] + (v - BG[k]) * t).toString(16).padStart(2, "0")).join("")}`;
  };
  const fade = (i: number, j: number) => {
    const [x, y] = mid(i, j, 0);
    const d = Math.hypot((x - fx) * 0.8, (y - fy) * 1.25);
    return Math.max(0, Math.min(1, 1 - (d - 70) / 150));
  };
  const tile = (
    i: number,
    j: number,
    z: number,
    t: number,
    colors: [string, string, string, string],
    key: string,
    thick = H,
  ) => {
    const [top, left, right, edge] = colors.map((c) => mix(c, t));
    const x = i * step;
    const y = j * step;
    const T = [iso(x, y, z + thick), iso(x + S, y, z + thick), iso(x + S, y + S, z + thick), iso(x, y + S, z + thick)];
    const L = [iso(x, y + S, z), iso(x + S, y + S, z), iso(x + S, y + S, z + thick), iso(x, y + S, z + thick)];
    const R = [iso(x + S, y, z), iso(x + S, y + S, z), iso(x + S, y + S, z + thick), iso(x + S, y, z + thick)];
    return (
      <g key={key}>
        <polygon points={poly(L)} fill={left} stroke={edge} strokeWidth={0.6} />
        <polygon points={poly(R)} fill={right} stroke={edge} strokeWidth={0.6} />
        <polygon points={poly(T)} fill={top} stroke={edge} strokeWidth={0.6} />
      </g>
    );
  };
  const cells: [number, number][] = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (fade(i, j) > 0) cells.push([i, j]);
  cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  const [lx, ly] = mid(lit[3][0], lit[3][1], lit[3][2]);
  return (
    <svg
      viewBox={`${(fx - w / 2).toFixed(1)} ${(fy - h / 2 + 4).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      {cells.map(([i, j]) =>
        litKey.has(`${i},${j}`)
          ? tile(i, j, 0, 1, ["#0a1f1d", "#0a1f1d", "#0a1f1d", "#1f4a44"], `slot${i},${j}`)
          : tile(i, j, 0, fade(i, j), ["#123631", "#0c2624", "#081a1a", "#1d403b"], `${i},${j}`),
      )}
      {lit.map(([i, j, z]) => {
        const [bx, by] = mid(i, j, 0);
        const [tx, ty] = mid(i, j, z);
        return <line key={`drop${i}`} x1={bx} y1={by} x2={tx} y2={ty} stroke="#2a6b62" strokeWidth={0.8} strokeDasharray="2 3" />;
      })}
      {lit.map(([i, j, z]) => tile(i, j, z, 1, ["#2dd4bf", "#16897c", "#0f5f56", "#5eead4"], `lit${i},${j}`, 8))}
      <polyline
        points={poly(lit.map(([i, j, z]) => mid(i, j, z, 8)))}
        fill="none"
        stroke="#e9fbf7"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {lit.map(([i, j, z]) => {
        const [x, y] = mid(i, j, z, 8);
        return <circle key={`dot${i}`} cx={x} cy={y} r={2.6} fill="#e9fbf7" />;
      })}
      <text
        x={lx - 34}
        y={ly + 4}
        textAnchor="end"
        fill="#5eead4"
        fontSize={11}
        letterSpacing="1.4"
        fontFamily="var(--font-mono), monospace"
      >
        4 OF 35,173 PAGES
      </text>
    </svg>
  );
}

/**
 * Cover drawings by name; a book picks one with `cover:` in its frontmatter.
 * A `bleed` drawing fills the cover behind the type instead of sitting above
 * the author line.
 */
type CoverArt = { draw: (props: { className?: string }) => ReactNode; bleed?: boolean };

const COVER_ART: Record<string, CoverArt> = {
  page: { draw: PageArt },
  stack: { draw: StackArt },
  field: { draw: FieldArt, bleed: true },
};
