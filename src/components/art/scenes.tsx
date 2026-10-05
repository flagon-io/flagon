import { FlagonMark } from "@/brand/flagon-mark";
import {
  Art,
  Box,
  Face,
  Line,
  Node,
  OnFace,
  TextLines,
  artIds,
  corners,
  frame,
  iso,
  type P3,
} from "@/components/art/iso";

/**
 * The site's illustrations, composed from the iso kit. Each is a quiet,
 * technical line drawing about one idea, built back to front and framed on its
 * subject. They take color from the --art-* variables, so they follow the
 * theme, and a wrapper class (like .art-g1t) can repaint them.
 */

type SceneProps = {
  id?: string;
  className?: string;
  /** Describe the drawing for screen readers; omit when it is decoration. */
  label?: string;
};

/** Long construction lines along both axes through a point, faded by <Art>. */
function axes(at: P3, reach = 520) {
  const [x, y, z] = at;
  return (
    <>
      <Line ps={[[x - reach, y, z], [x + reach, y, z]]} ink="faint" dots />
      <Line ps={[[x, y - reach, z], [x, y + reach, z]]} ink="faint" dots />
    </>
  );
}

/** A flat callout: a marker on a point, a short leader, and a mono label. */
function Callout({
  p,
  text,
  dx = 28,
  dy = -18,
  ink = "accent",
}: {
  p: P3;
  text: string;
  dx?: number;
  dy?: number;
  ink?: "accent" | "ink";
}) {
  const [x, y] = iso(p);
  const color = ink === "accent" ? "var(--art-accent)" : "var(--art-ink)";
  const anchor = dx < 0 ? "end" : "start";
  return (
    <g>
      <polyline
        points={`${x},${y} ${x + dx * 0.6},${y + dy} ${x + dx},${y + dy}`}
        fill="none"
        stroke={color}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <Node p={p} ink={ink} />
      <text
        x={x + dx + (dx < 0 ? -4 : 4)}
        y={y + dy}
        dominantBaseline="middle"
        textAnchor={anchor}
        fontFamily="var(--font-mono)"
        fontSize={11}
        fontWeight={600}
        letterSpacing="0.06em"
        fill={color}
      >
        {text}
      </text>
    </g>
  );
}

const PAGE_CORNERS = ["t00", "t10", "t11", "t01"] as const;
const below = (k: (typeof PAGE_CORNERS)[number]) => k.replace("t", "b") as "b00";

/** The handbook: a stack of pages, the top one lifted and written on. */
export function HandbookArt({ id = "art-handbook", className, label }: SceneProps) {
  const W = 150;
  const D = 104;
  const x0 = -60;
  const y0 = -50;
  const lift = 64;
  const topAt: P3 = [x0 - 20, y0, lift];
  const top = corners(topAt, [W, D, 3]);
  const under = corners([x0 - 16, y0, 36], [W, D, 3]);
  const noteAt: P3 = [x0 + 120, y0 - 92, 96];
  const note = corners(noteAt, [62, 42, 2]);
  return (
    <Art
      id={id}
      viewBox={frame([corners([x0 - 16, y0, 0], [W + 16, D, 0]).b01, top.t00, top.t01, note.t10, note.t00, [x0 + W, y0 + D, 0]])}
      className={className}
      label={label}
      guides={
        <>
          {axes([x0 + W, y0 + D, 0])}
          {axes(top.t00)}
        </>
      }
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <Box key={i} at={[x0 - i * 4, y0, i * 9]} size={[W, D, 3]} ink="line" />
      ))}
      {PAGE_CORNERS.map((k) => (
        <Line key={k} ps={[under[k], top[below(k)]]} ink="line" dots />
      ))}
      <Box at={topAt} size={[W, D, 3]} nodes />
      <OnFace face="top" origin={[topAt[0] + 14, topAt[1] + 12, lift + 3]}>
        <g style={{ color: "var(--art-ink)" }}>
          <FlagonMark variant="mono" size={30} lid={false} lever={false} />
        </g>
        <TextLines x={40} y={6} width={84} lines={3} />
        <TextLines x={0} y={44} width={124} lines={5} heading={false} />
      </OnFace>
      {/* A note pinned off to the side, tied back to the page. */}
      <Line ps={[top.t10, note.b01]} ink="line" dashed />
      <Box at={noteAt} size={[62, 42, 2]} ink="line" />
      <OnFace face="top" origin={[noteAt[0] + 8, noteAt[1] + 8, noteAt[2] + 2]}>
        <TextLines width={44} lines={2} gap={6} />
      </OnFace>
      <Node p={note.t01} ink="accent" />
    </Art>
  );
}

/** Built in the open: a box with its lid lifted and its contents rising out. */
export function OpenArt({ id = "art-open", className, label }: SceneProps) {
  const ids = artIds(id);
  const at: P3 = [-60, -45, 0];
  const size: P3 = [120, 90, 54];
  const box = corners(at, size);
  const lidAt: P3 = [at[0] + 34, at[1] - 34, 150];
  const lid = corners(lidAt, [120, 90, 4]);
  const cubes: { at: P3; s: number; accent?: boolean }[] = [
    { at: [-20, -10, 74], s: 18 },
    { at: [18, -30, 104], s: 14, accent: true },
    { at: [-38, 14, 96], s: 11 },
  ];
  return (
    <Art
      id={id}
      viewBox={frame([box.b01, box.b11, box.b10, lid.t00, lid.t10, lid.t01])}
      className={className}
      label={label}
      guides={axes(box.b11)}
    >
      {/* The box, open at the top: back walls and floor, then the front walls. */}
      <Face ps={[box.b00, box.b10, box.t10, box.t00]} tone="right" ink="line" />
      <Face ps={[box.b00, box.b01, box.t01, box.t00]} tone="left" ink="line" />
      <Face ps={[box.b00, box.b10, box.b11, box.b01]} tone="top" ink="line" />
      <Face ps={[box.b01, box.b11, box.t11, box.t01]} tone="left" hatch={ids.hatch} />
      <Face ps={[box.b10, box.b11, box.t11, box.t10]} tone="right" />
      <Line ps={[box.t00, box.t10, box.t11, box.t01, box.t00]} ink="ink" />
      {cubes.map((c, i) => (
        <Box
          key={i}
          at={c.at}
          size={[c.s, c.s, c.s]}
          top={c.accent ? "accent" : "top"}
          ink={c.accent ? "accent" : "ink"}
        />
      ))}
      {PAGE_CORNERS.map((k) => (
        <Line key={k} ps={[box[k], lid[below(k)]]} ink="line" dots />
      ))}
      <Box at={lidAt} size={[120, 90, 4]} nodes />
      <OnFace face="top" origin={[lidAt[0] + 30, lidAt[1] + 26, lidAt[2] + 4]}>
        <text
          y={30}
          fontFamily="var(--font-mono)"
          fontSize={30}
          fontWeight={600}
          fill="var(--art-ink)"
        >
          {"</>"}
        </text>
      </OnFace>
    </Art>
  );
}

/** Priced close to cost: what it costs, and the thin slice we add on top. */
export function PricingArt({ id = "art-pricing", className, label }: SceneProps) {
  const ids = artIds(id);
  const S = 60;
  const H = 110;
  const slab = 22;
  const a: P3 = [-140, -10, 0];
  const b: P3 = [10, -10, 0];
  const cost = corners(a, [S, S, H]);
  const priced = corners(b, [S, S, H + slab]);
  return (
    <Art
      id={id}
      viewBox={frame([cost.b01, cost.t00, priced.t10, priced.b11, priced.t00])}
      className={className}
      label={label}
      guides={
        <>
          {axes(priced.b11)}
          {/* The cost line, carried across both columns. */}
          <Line ps={[[-520, a[1], H], [520, a[1], H]]} ink="faint" dots />
        </>
      }
    >
      <Face
        ps={[[-190, -70, 0], [110, -70, 0], [110, 90, 0], [-190, 90, 0]]}
        tone="none"
        ink="faint"
        dashed
      />
      <Box at={a} size={[S, S, H]} hatch="right" hatchId={ids.hatch} nodes />
      <Box at={b} size={[S, S, H]} hatch="right" hatchId={ids.hatch} />
      <Box at={[b[0], b[1], H]} size={[S, S, slab]} top="accent" ink="accent" nodes />
      <Callout p={cost.t11} text="COST" dx={-30} dy={18} ink="ink" />
      <Callout p={priced.t10} text="+20%" dx={30} dy={-16} />
    </Art>
  );
}

/** Small teams: clusters of people around one shared core. */
export function TeamsArt({ id = "art-teams", className, label }: SceneProps) {
  const C = 22;
  const gap = 5;
  const clusters: P3[] = [
    [-170, -40, 0],
    [40, -160, 0],
    [60, 60, 0],
  ];
  const core: P3 = [-26, -26, 0];
  const corePt: P3 = [0, 0, 0];
  const span = 2 * C + gap;
  return (
    <Art
      id={id}
      viewBox={frame([[-170, -40 + span, 0], [40 + span, -160, 0], [60 + span, 60 + span, 0], [40, -160, 40], [-26, -26, 60]])}
      className={className}
      label={label}
      guides={axes(corePt)}
    >
      {/* Paths from each team to the core, along the grid like traces. */}
      {clusters.map((c, i) => {
        const from: P3 = [c[0] + C, c[1] + C, 0];
        const mid: P3 = [from[0], 0, 0];
        return (
          <g key={i}>
            <Line ps={[from, mid, corePt]} ink="line" dashed />
            <Node p={mid} size={3.5} ink="line" />
          </g>
        );
      })}
      <Box at={core} size={[52, 52, 46]} top="accent" ink="accent" nodes />
      <OnFace face="top" origin={[core[0] + 10, core[1] + 8, 46]}>
        <g style={{ color: "var(--art-accent)" }}>
          <FlagonMark variant="mono" size={34} lid={false} lever={false} />
        </g>
      </OnFace>
      {clusters.map((c, i) => (
        <g key={i}>
          <Box at={c} size={[C, C, C]} />
          <Box at={[c[0] + C + gap, c[1], 0]} size={[C, C, C * 1.4]} />
          <Box at={[c[0], c[1] + C + gap, 0]} size={[C, C, C * 0.8]} />
          <Box at={[c[0] + C + gap, c[1] + C + gap, 0]} size={[C, C, C * 1.15]} nodes />
        </g>
      ))}
    </Art>
  );
}

/**
 * g1t: many agents' changes on their own lanes, converging onto one main line,
 * and the fleet (three 1s stepping back in depth, as in g1t's mark) standing
 * at the end of it. Drawn for g1t's own palette (.art-g1t in globals.css).
 */
export function G1tArt({ id = "art-g1t", className, label }: SceneProps) {
  const lanes = [-190, -150, -110, -70, -30];
  const mergeX = -10;
  const mainY = -30;
  const winner = 2;
  // The fleet stands just behind main, so the line runs in front of it.
  const fleetY = mainY - 70;
  const fleet = [
    { x: 96, w: 22, h: 80, tone: "accent-2" as const },
    { x: 152, w: 24, h: 98, tone: "accent-2" as const },
    { x: 210, w: 26, h: 118, tone: "top" as const },
  ];
  const front = fleet[2];
  return (
    <Art
      id={id}
      viewBox={frame([[-230, lanes[0], 0], [-230, lanes[4], 0], [280, mainY, 0], [front.x + front.w, fleetY + front.w, 0], [96, fleetY, 80], [front.x, fleetY, front.h]], 1.6, 20)}
      className={className}
      label={label}
      guides={
        <>
          <Line ps={[[-520, mainY, 0], [520, mainY, 0]]} ink="faint" dots />
          <Line ps={[[mergeX, -520, 0], [mergeX, 520, 0]]} ink="faint" dots />
        </>
      }
    >
      {/* Lanes: each agent's work, converging onto main. */}
      {lanes.map((y, i) => (
        <Line
          key={i}
          ps={[[-230, y, 0], [-100, y, 0], [mergeX, mainY, 0]]}
          ink={i === winner ? "accent" : "line"}
          dashed={i !== winner}
        />
      ))}
      {/* One change per lane: the pull requests. The chosen one is lit. */}
      {lanes.map((y, i) => (
        <Box
          key={i}
          at={[-190, y - 11, 0]}
          size={[38, 22, 5]}
          top={i === winner ? "accent" : "top"}
          ink={i === winner ? "accent" : "line"}
        />
      ))}
      {/* The fleet, back to front. */}
      {fleet.map((f) => (
        <Box
          key={f.x}
          at={[f.x, fleetY, 0]}
          size={[f.w, f.w, f.h]}
          top={f.tone}
          ink={f.tone === "top" ? "ink" : "accent-2"}
          nodes={f.tone === "top"}
        />
      ))}
      {/* The front 1's flag, on its left face. */}
      <OnFace face="left" origin={[front.x, fleetY + front.w, front.h]}>
        <path
          d={`M${front.w * 0.55} 7 L3 16`}
          stroke="var(--art-ink)"
          strokeWidth={6}
          strokeLinecap="round"
          fill="none"
        />
      </OnFace>
      <Line ps={[[mergeX, mainY, 0], [280, mainY, 0]]} ink="accent" width={1.5} />
      <Node p={[mergeX, mainY, 0]} ink="accent" />
      <Callout p={[mergeX, mainY, 0]} text="MAIN" dx={-34} dy={22} />
    </Art>
  );
}

/** Crafted: one box, measured carefully. */
export function CraftArt({ id = "art-craft", className, label }: SceneProps) {
  const ids = artIds(id);
  const at: P3 = [-60, -45, 0];
  const size: P3 = [120, 90, 66];
  const c = corners(at, size);
  const o = 20;
  return (
    <Art
      id={id}
      viewBox={frame([c.b01, c.b10, c.t00, [c.b01[0], c.b01[1] + o, 0], [c.b10[0] + o, c.b10[1], 0]])}
      className={className}
      label={label}
      guides={axes(c.b11)}
    >
      <Box at={at} size={size} hatch="left" hatchId={ids.hatch} nodes />
      {/* Dimension lines along each visible edge, offset outward. */}
      <Line ps={[[c.b01[0], c.b01[1] + o, 0], [c.b11[0], c.b11[1] + o, 0]]} ink="accent" />
      <Line ps={[c.b01, [c.b01[0], c.b01[1] + o + 5, 0]]} ink="line" />
      <Line ps={[c.b11, [c.b11[0], c.b11[1] + o + 5, 0]]} ink="line" />
      <Line ps={[[c.b11[0] + o, c.b11[1], 0], [c.b10[0] + o, c.b10[1], 0]]} ink="accent" />
      <Line ps={[c.b11, [c.b11[0] + o + 5, c.b11[1], 0]]} ink="line" />
      <Line ps={[c.b10, [c.b10[0] + o + 5, c.b10[1], 0]]} ink="line" />
      <Line ps={[[c.b10[0] + o, c.b10[1], 0], [c.t10[0] + o, c.t10[1], c.t10[2]]]} ink="accent" />
      <Line ps={[c.t10, [c.t10[0] + o + 5, c.t10[1], c.t10[2]]]} ink="line" />
      <Callout p={[c.b01[0] + 60, c.b01[1] + o, 0]} text="120.00" dx={-26} dy={20} />
      <Callout p={[c.b11[0] + o, c.b11[1] - 45, 0]} text="90.00" dx={30} dy={18} />
      <Callout p={[c.b10[0] + o, c.b10[1], 33]} text="66.00" dx={30} dy={-10} />
    </Art>
  );
}

/** Its own thing: products standing side by side, each with its own face. */
export function PanelsArt({ id = "art-panels", className, label }: SceneProps) {
  const W = 124;
  const H = 160;
  const step = 70;
  const ys = [-3 * step, -2 * step, -step, 0];
  const x = -W / 2;
  return (
    <Art
      id={id}
      viewBox={frame([[x, 3, 0], [x + W, 3, 0], [x + W, ys[0], H], [x, ys[0], H], [x, 3, H]])}
      className={className}
      label={label}
      guides={axes([x + W, 3, 0])}
    >
      {ys.map((y, i) => {
        const placeholder = i < 2;
        const at: P3 = [x, y, 0];
        return (
          <g key={i}>
            <Box at={at} size={[W, 3, H]} dashed={placeholder} ink={placeholder ? "line" : "ink"} />
            {placeholder ? (
              <OnFace face="left" origin={[x + 36, y + 3, H - 40]}>
                <text y={34} fontFamily="var(--font-mono)" fontSize={40} fill="var(--art-line)">
                  ?
                </text>
              </OnFace>
            ) : (
              <OnFace face="left" origin={[x + 18, y + 3, H - 18]}>
                {i === 3 ? (
                  <g fill="var(--art-ink)">
                    <rect x={10} y={22} width={10} height={40} rx={5} opacity={0.35} />
                    <rect x={26} y={15} width={11} height={47} rx={5.5} opacity={0.65} />
                    <rect x={43} y={8} width={12} height={54} rx={6} />
                  </g>
                ) : (
                  <g>
                    <circle cx={34} cy={34} r={24} fill="none" stroke="var(--art-ink)" strokeWidth={1} />
                    <circle cx={34} cy={34} r={9} fill="var(--art-ink)" />
                  </g>
                )}
                <TextLines y={80} width={66} lines={2} gap={7} />
              </OnFace>
            )}
            <Node p={[x + W, y + 3, H]} ink={placeholder ? "line" : "ink"} />
          </g>
        );
      })}
    </Art>
  );
}

/** The long game: steps that keep climbing, and a dotted line past the last. */
export function StairsArt({ id = "art-stairs", className, label }: SceneProps) {
  const ids = artIds(id);
  const n = 6;
  const S = 30;
  const rise = 20;
  const D = 64;
  const x0 = -D / 2;
  const y0 = 80;
  // Step i sits further back (smaller y) and taller; draw back to front.
  const step = (i: number) => ({ at: [x0, y0 - (i + 1) * S, 0] as P3, h: (i + 1) * rise });
  const last = step(n - 1);
  const lastTop: P3 = [x0 + D, last.at[1], last.h];
  return (
    <Art
      id={id}
      viewBox={frame([[x0, y0, 0], [x0 + D, y0, 0], [x0 + D, last.at[1], 0], [x0, last.at[1], last.h], [x0 + D, last.at[1] - 2 * S, last.h + 2 * rise]])}
      className={className}
      label={label}
      guides={axes([x0 + D, y0, 0])}
    >
      {Array.from({ length: n }, (_, k) => n - 1 - k).map((i) => {
        const s = step(i);
        const isLast = i === n - 1;
        return (
          <Box
            key={i}
            at={s.at}
            size={[D, S, s.h]}
            hatch="right"
            hatchId={ids.hatch}
            top={isLast ? "accent" : "top"}
            ink={isLast ? "accent" : "ink"}
          />
        );
      })}
      {/* Where it goes next. */}
      <Line
        ps={[
          lastTop,
          [x0 + D, last.at[1] - S, last.h + rise],
          [x0 + D, last.at[1] - 2 * S, last.h + 2 * rise],
        ]}
        ink="accent"
        dots
      />
      <Node p={[x0 + D, last.at[1] - 2 * S, last.h + 2 * rise]} ink="accent" />
      <OnFace face="top" origin={[x0 + 18, last.at[1] + 4, last.h]}>
        <g style={{ color: "var(--art-accent)" }}>
          <FlagonMark variant="mono" size={22} lid={false} lever={false} />
        </g>
      </OnFace>
    </Art>
  );
}

export const SCENES = {
  handbook: HandbookArt,
  open: OpenArt,
  pricing: PricingArt,
  teams: TeamsArt,
  g1t: G1tArt,
  craft: CraftArt,
  panels: PanelsArt,
  stairs: StairsArt,
} as const;

export type SceneName = keyof typeof SCENES;
