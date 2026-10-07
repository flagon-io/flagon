import type { ComponentType, ReactNode } from "react";
import { frame } from "@/components/art/iso";
import { iso, IsoBox, IsoLine, OnTop, type P3 } from "./kit";

/**
 * One drawing per part of the book, for the part's opener page in print and
 * the top of its first chapter on screen. Isometric, flat-shaded, one accent:
 * the same vocabulary as the cover and the site's line art.
 */

type PartArtProps = {
  id: string;
  className?: string;
  /** Frame the drawing tighter than a part page does, e.g. on a book cover. */
  frameAspect?: number;
};

function Canvas({
  id,
  points,
  label,
  className,
  frameAspect,
  children,
}: {
  id: string;
  points: P3[];
  label: string;
  className?: string;
  frameAspect?: number;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox={frameAspect ? frame(points, frameAspect, 8, 0) : frame(points, 1.7, 24, 420)}
      role="img"
      aria-label={label}
      className={["book-part-art block h-auto w-full", className].filter(Boolean).join(" ")}
    >
      <defs>
        {(["ink", "line", "accent"] as const).map((ink) => (
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
            <path d="M0,0.8 L10,5 L0,9.2 Z" fill={`var(--fig-${ink === "accent" ? "accent" : ink})`} />
          </marker>
        ))}
      </defs>
      {children}
    </svg>
  );
}

/** A page drawn on a top face: header, a line pointer per tuple, one pointer lit. */
function PageFace({ w, d }: { w: number; d: number }) {
  const slot = w / 7;
  return (
    <g>
      <rect x={0} y={0} width={w} height={d * 0.13} fill="var(--fig-shade-2)" stroke="var(--fig-ink)" strokeWidth={0.8} />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={i * slot}
          y={d * 0.13}
          width={slot}
          height={d * 0.13}
          fill={i === 0 ? "var(--fig-accent-fill)" : "var(--fig-shade)"}
          stroke={i === 0 ? "var(--fig-accent)" : "var(--fig-ink)"}
          strokeWidth={0.8}
        />
      ))}
      {[
        [w * 0.74, w * 0.26],
        [w * 0.52, w * 0.22],
        [w * 0.32, w * 0.2],
      ].map(([x, tw], i) => (
        <rect
          key={i}
          x={x}
          y={d * 0.8}
          width={tw}
          height={d * 0.16}
          fill={i === 0 ? "var(--fig-accent-fill)" : "var(--fig-shade)"}
          stroke={i === 0 ? "var(--fig-accent)" : "var(--fig-ink)"}
          strokeWidth={0.8}
        />
      ))}
      <path
        d={`M${slot / 2},${d * 0.26} C${slot / 2},${d * 0.6} ${w * 0.87},${d * 0.55} ${w * 0.87},${d * 0.8}`}
        fill="none"
        stroke="var(--fig-accent)"
        strokeWidth={1.2}
      />
    </g>
  );
}

/** Part I, The machine: a stack of 8 KB pages, the top one lifted and opened. */
export function MachineArt({ id, className, frameAspect }: PartArtProps) {
  const W = 150;
  const D = 110;
  const T = 5;
  const stack = Array.from({ length: 9 }, (_, i) => i);
  const lifted: P3 = [0, 0, stack.length * (T + 3) + 34];
  return (
    <Canvas
      id={id}
      className={className}
      frameAspect={frameAspect}
      label="A stack of pages; the top page is lifted to show its header, line pointers, and tuples."
      points={[[0, 0, 0], [W, D, 0], [0, 0, lifted[2] + T], [W, 0, 0], [0, D, 0]]}
    >
      {stack.map((i) => (
        <IsoBox key={i} at={[0, 0, i * (T + 3)]} size={[W, D, T]} width={0.9} />
      ))}
      <IsoLine ps={[[W / 2, D / 2, stack.length * (T + 3)], [W / 2, D / 2, lifted[2]]]} ink="line" dashed />
      <IsoBox at={lifted} size={[W, D, T]} top="paper" />
      <OnTop origin={[0, 0, lifted[2] + T]}>
        <PageFace w={W} d={D} />
      </OnTop>
    </Canvas>
  );
}

/** Part II, Designing for it: a table with its key column lit, referenced by a second. */
export function DesignArt({ id, className }: PartArtProps) {
  const W = 190;
  const D = 120;
  const T = 10;
  const cols = [0.16, 0.34, 0.52, 0.7, 1];
  const rows = 7;
  const small: P3 = [W + 60, -10, 0];
  return (
    <Canvas
      id={id}
      className={className}
      label="A table drawn as a grid of rows and columns, its key column picked out, with a second table referencing it."
      points={[[0, 0, 0], [W, D, 0], [0, 0, T], [small[0] + 90, small[1] + 70, 0], [small[0] + 90, small[1], T], [W, -40, 0], [0, D + 20, 0]]}
    >
      <IsoBox at={[0, 0, 0]} size={[W, D, T]} />
      <OnTop origin={[0, 0, T]}>
        <rect x={0} y={0} width={W * cols[0]} height={D} fill="var(--fig-accent-fill)" stroke="var(--fig-accent)" strokeWidth={1} />
        <rect x={0} y={0} width={W} height={D / (rows + 1)} fill="var(--fig-shade-2)" stroke="var(--fig-ink)" strokeWidth={0.8} />
        {cols.slice(0, -1).map((c) => (
          <line key={c} x1={W * c} y1={0} x2={W * c} y2={D} stroke="var(--fig-ink)" strokeWidth={0.7} />
        ))}
        {Array.from({ length: rows }, (_, i) => (
          <line
            key={i}
            x1={0}
            y1={(D / (rows + 1)) * (i + 1)}
            x2={W}
            y2={(D / (rows + 1)) * (i + 1)}
            stroke="var(--fig-line)"
            strokeWidth={0.6}
          />
        ))}
      </OnTop>
      <IsoBox at={small} size={[90, 70, T]} />
      <OnTop origin={[small[0], small[1], small[2] + T]}>
        <rect x={0} y={0} width={90} height={70 / 5} fill="var(--fig-shade-2)" stroke="var(--fig-ink)" strokeWidth={0.8} />
        <rect x={90 * 0.55} y={0} width={90 * 0.45} height={70} fill="var(--fig-accent-fill)" stroke="var(--fig-accent)" strokeWidth={1} />
        {[1, 2, 3, 4].map((i) => (
          <line key={i} x1={0} y1={14 * i} x2={90} y2={14 * i} stroke="var(--fig-line)" strokeWidth={0.6} />
        ))}
      </OnTop>
      <IsoLine
        ps={[[small[0] + 70, small[1] + 40, T], [small[0] + 70, small[1] + 40, T + 30], [W * 0.08, D * 0.45, T + 30], [W * 0.08, D * 0.45, T]]}
        ink="accent"
        width={1.3}
        arrow
        fig={id}
      />
    </Canvas>
  );
}

/** Part III, Finding rows fast: a B-tree, root to leaves, one lookup path lit. */
export function FindArt({ id, className }: PartArtProps) {
  // Spread along x = -y, which runs straight across the page in this projection.
  const at = (a: number, z: number): P3 => [a, -a, z];
  const S: P3 = [40, 40, 6];
  const levels = [
    { z: 190, as: [0] },
    { z: 100, as: [-120, 0, 120] },
    { z: 10, as: [-170, -102, -34, 34, 102, 170] },
  ];
  const lit = [0, 1, 3]; // root, middle internal page, fourth leaf
  const heap = at(30, -90);
  const top = (a: number, z: number): P3 => [a + S[0] / 2, -a + S[1] / 2, z + S[2]];
  const bottom = (a: number, z: number): P3 => [a + S[0] / 2, -a + S[1] / 2, z];
  const pts: P3[] = [];
  levels.forEach((l) => l.as.forEach((a) => pts.push(at(a, l.z), [a + S[0], -a + S[1], l.z + S[2]])));
  pts.push(heap, [heap[0] + 120, heap[1] + 60, heap[2]]);
  const edge = (a1: number, z1: number, a2: number, z2: number, on: boolean, key: string) => (
    <IsoLine key={key} ps={[bottom(a1, z1), top(a2, z2)]} ink={on ? "accent" : "line"} width={on ? 1.4 : 0.9} />
  );
  return (
    <Canvas
      id={id}
      className={className}
      label="A B-tree drawn as levels of pages: one root, three internal pages, six leaves; one path from the root to a leaf and down to the table is picked out."
      points={pts}
    >
      <IsoBox at={heap} size={[120, 60, 8]} />
      <OnTop origin={[heap[0], heap[1], heap[2] + 8]}>
        {[1, 2, 3, 4].map((i) => (
          <line key={i} x1={0} y1={12 * i} x2={120} y2={12 * i} stroke="var(--fig-line)" strokeWidth={0.6} />
        ))}
        <rect x={24} y={24} width={40} height={12} fill="var(--fig-accent-fill)" stroke="var(--fig-accent)" strokeWidth={1} />
      </OnTop>
      <IsoLine ps={[bottom(levels[2].as[lit[2]], levels[2].z), [heap[0] + 44, heap[1] + 30, heap[2] + 8]]} ink="accent" width={1.4} dashed arrow fig={id} />
      {levels[2].as.map((a, i) => (
        <IsoBox key={`l${i}`} at={at(a, levels[2].z)} size={S} top={i === lit[2] ? "accent" : "paper"} ink={i === lit[2] ? "accent" : "ink"} />
      ))}
      {levels[1].as.map((a, i) =>
        levels[2].as.slice(i * 2, i * 2 + 2).map((b, j) =>
          edge(a, levels[1].z, b, levels[2].z, i === lit[1] && i * 2 + j === lit[2], `e1-${i}-${j}`),
        ),
      )}
      {levels[1].as.map((a, i) => (
        <IsoBox key={`m${i}`} at={at(a, levels[1].z)} size={S} top={i === lit[1] ? "accent" : "paper"} ink={i === lit[1] ? "accent" : "ink"} />
      ))}
      {levels[1].as.map((a, i) => edge(levels[0].as[0], levels[0].z, a, levels[1].z, i === lit[1], `e0-${i}`))}
      <IsoBox at={at(levels[0].as[0], levels[0].z)} size={S} top="accent" ink="accent" />
    </Canvas>
  );
}

/** Part IV, Changing it: a line of work stopped behind one waiting lock. */
export function ChangeArt({ id, className }: PartArtProps) {
  const C: P3 = [34, 34, 28];
  const gate: P3 = [0, -20, 0];
  const queue = [70, 120, 170, 220, 270, 320];
  return (
    <Canvas
      id={id}
      className={className}
      label="A long block holds a gate; behind it one accented block waits for the lock, and a line of ordinary blocks waits behind that one."
      points={[[-200, -40, 0], [370, 60, 0], [0, 0, 80], [-200, 60, 0], [370, -40, 0]]}
    >
      <IsoLine ps={[[-200, 17, 0], [370, 17, 0]]} ink="faint" />
      <IsoLine ps={[[-200, -12, 0], [370, -12, 0]]} ink="faint" />
      <IsoLine ps={[[-200, 46, 0], [370, 46, 0]]} ink="faint" />
      <IsoBox at={[-190, 0, 0]} size={[170, 34, 28]} />
      <IsoBox at={gate} size={[10, 74, 70]} top="shade-2" />
      {queue.map((x, i) => (
        <IsoBox key={x} at={[x, 0, 0]} size={C} top={i === 0 ? "accent" : "paper"} ink={i === 0 ? "accent" : "ink"} />
      ))}
      <IsoLine ps={[[64, 17, 14], [16, 17, 14]]} ink="accent" width={1.3} arrow fig={id} />
    </Canvas>
  );
}

/** Part V, Running it: many connections, one pooler, one server. */
export function RunArt({ id, className }: PartArtProps) {
  const server: P3 = [150, 0, 0];
  const pooler: P3 = [20, 30, 0];
  const clients = Array.from({ length: 7 }, (_, i) => i);
  return (
    <Canvas
      id={id}
      className={className}
      label="Seven client lines converge on a small pooler box, which feeds two lines into one large server box."
      points={[[-170, -40, 0], [300, 130, 0], [150, 0, 110], [-170, 130, 0]]}
    >
      {clients.map((i) => {
        const y = -30 + i * 23;
        return (
          <g key={i}>
            <IsoBox at={[-160, y, 0]} size={[16, 14, 12]} width={0.8} />
            <IsoLine ps={[[-144, y + 7, 6], [pooler[0], pooler[1] + 20, 10]]} ink="line" width={0.8} />
          </g>
        );
      })}
      <IsoBox at={pooler} size={[36, 40, 20]} top="accent" ink="accent" />
      <IsoLine ps={[[pooler[0] + 36, pooler[1] + 12, 10], [server[0], pooler[1] + 12, 10]]} ink="accent" width={1.4} />
      <IsoLine ps={[[pooler[0] + 36, pooler[1] + 28, 10], [server[0], pooler[1] + 28, 10]]} ink="accent" width={1.4} />
      <IsoBox at={server} size={[130, 110, 90]} />
      <OnTop origin={[server[0], server[1], 90]}>
        {[0, 1, 2, 3].map((r) => (
          <rect key={r} x={14} y={14 + r * 22} width={102} height={12} fill="var(--fig-shade)" stroke="var(--fig-ink)" strokeWidth={0.8} />
        ))}
        <rect x={14} y={14} width={40} height={12} fill="var(--fig-accent-fill)" stroke="var(--fig-accent)" strokeWidth={1} />
      </OnTop>
    </Canvas>
  );
}

/** Part VI, Scaling out: one primary, its log streaming to three copies. */
export function ScaleArt({ id, className }: PartArtProps) {
  const at = (a: number, z = 0): P3 => [a, -a, z];
  const P: P3 = [110, 100, 80];
  const C: P3 = [70, 70, 56];
  const primary = at(-190);
  const copies = [at(0), at(105), at(210)];
  const corners = (o: P3, s: P3): P3[] => [o, [o[0] + s[0], o[1] + s[1], o[2]], [o[0], o[1], o[2] + s[2]], [o[0] + s[0], o[1], o[2]], [o[0], o[1] + s[1], o[2]]];
  return (
    <Canvas
      id={id}
      className={className}
      label="One large primary box streams its log to three smaller copies in a row; the primary is picked out."
      points={[...corners(primary, P), ...copies.flatMap((c) => corners(c, C)), [primary[0], primary[1], P[2] + 30 + 2 * 22 + 10]]}
    >
      <IsoBox at={primary} size={P} top="accent" ink="accent" />
      {copies.map((c, i) => (
        <IsoBox key={i} at={c} size={C} />
      ))}
      {copies.map((c, i) => {
        const from: P3 = [primary[0] + P[0] / 2, primary[1] + P[1] / 2, P[2]];
        const to: P3 = [c[0] + C[0] / 2, c[1] + C[1] / 2, C[2]];
        const h = P[2] + 30 + i * 22;
        return (
          <IsoLine
            key={`l${i}`}
            ps={[from, [from[0], from[1], h], [to[0], to[1], h], to]}
            ink="accent"
            width={1.2}
            dashed
            arrow
            fig={id}
          />
        );
      })}
    </Canvas>
  );
}

/** Each part's drawing, by the part name used in the chapters' frontmatter. */
export const PART_ART: Record<string, ComponentType<PartArtProps>> = {
  "The machine": MachineArt,
  "Designing for it": DesignArt,
  "Finding rows fast": FindArt,
  "Changing it": ChangeArt,
  "Running it": RunArt,
  "Scaling out": ScaleArt,
};

export { iso };
