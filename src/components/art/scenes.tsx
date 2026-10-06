import type { CSSProperties, ReactNode } from "react";
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
  pts,
  type P3,
} from "@/components/art/iso";

/**
 * The site's illustrations, composed from the iso kit. Each is a quiet,
 * technical line drawing about one idea, built back to front and framed on its
 * subject. They take color from the --art-* variables, so they follow the
 * theme, and a wrapper class (like .art-g1t) can repaint them.
 *
 * They also answer the pointer: parts wrapped in <Move> or <Hop> act out the
 * idea while the drawing's host (an element with .art-host, like a card) is
 * hovered or focused. See the .art-move rules in globals.css.
 */

type SceneProps = {
  id?: string;
  className?: string;
  /** Describe the drawing for screen readers; omit when it is decoration. */
  label?: string;
};

/**
 * A part that moves while the drawing's host is hovered: `to` is a CSS
 * transform in drawing units. With `box`, the transform is about the part's
 * own bounds (e.g. scaleY from its bottom, to stretch a line).
 */
function Move({
  to,
  origin,
  box = false,
  delay = 0,
  children,
}: {
  to: string;
  origin?: string;
  box?: boolean;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <g
      className={box ? "art-move art-move-box" : "art-move"}
      style={{ "--to": to, transformOrigin: origin, transitionDelay: `${delay}ms` } as CSSProperties}
    >
      {children}
    </g>
  );
}

/** A part that hops once when the drawing's host is hovered, after `delay` ms. */
function Hop({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  return (
    <g className="art-hop" style={{ "--d": `${delay}ms` } as CSSProperties}>
      {children}
    </g>
  );
}

/**
 * How much to stretch a line from `a` up to `b` (scaleY about its bottom) so
 * its top end follows a part lifted by `d`.
 */
function stretch(a: P3, b: P3, d: number): number {
  const h = Math.abs(iso(a)[1] - iso(b)[1]);
  return (h + d) / h;
}

/** Screen offset for `d` drawing units along space's +x or +y axis. */
const along = (axis: "x" | "y", d: number) =>
  `translate(${Math.round((axis === "x" ? 1 : -1) * d * Math.cos(Math.PI / 6) * 100) / 100}px, ${d / 2}px)`;

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
  // On hover the top page lifts further off the stack, its note with it.
  const raise = 16;
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
        <Move key={k} to={`scaleY(${stretch(under[k], top[below(k)], raise)})`} origin="bottom" box>
          <Line ps={[under[k], top[below(k)]]} ink="line" dots />
        </Move>
      ))}
      <Move to={`translateY(-${raise}px)`}>
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
        <Move to="translate(4px, -6px)" delay={80}>
          <Box at={noteAt} size={[62, 42, 2]} ink="line" />
          <OnFace face="top" origin={[noteAt[0] + 8, noteAt[1] + 8, noteAt[2] + 2]}>
            <TextLines width={44} lines={2} gap={6} />
          </OnFace>
          <Node p={note.t01} ink="accent" />
        </Move>
      </Move>
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
  // On hover the lid rises higher and what's inside floats up after it.
  const raise = 18;
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
        <Move key={i} to={`translateY(-${10 + i * 5}px)`} delay={60 + i * 50}>
          <Box
            at={c.at}
            size={[c.s, c.s, c.s]}
            top={c.accent ? "accent" : "top"}
            ink={c.accent ? "accent" : "ink"}
          />
        </Move>
      ))}
      {PAGE_CORNERS.map((k) => (
        <Move key={k} to={`scaleY(${stretch(box[k], lid[below(k)], raise)})`} origin="bottom" box>
          <Line ps={[box[k], lid[below(k)]]} ink="line" dots />
        </Move>
      ))}
      <Move to={`translateY(-${raise}px)`}>
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
      </Move>
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
      <Callout p={cost.t11} text="COST" dx={-30} dy={18} ink="ink" />
      {/* On hover the markup hops up off the cost, so you can see it's a
          separate, stated slice. */}
      <Move to="translateY(-12px)">
        <Box at={[b[0], b[1], H]} size={[S, S, slab]} top="accent" ink="accent" nodes />
        <Callout p={priced.t10} text="+20%" dx={30} dy={-16} />
      </Move>
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
      {/* On hover the core lifts, then each team in turn. */}
      <Move to="translateY(-10px)">
        <Box at={core} size={[52, 52, 46]} top="accent" ink="accent" nodes />
        <OnFace face="top" origin={[core[0] + 10, core[1] + 8, 46]}>
          <g style={{ color: "var(--art-accent)" }}>
            <FlagonMark variant="mono" size={34} lid={false} lever={false} />
          </g>
        </OnFace>
      </Move>
      {clusters.map((c, i) => (
        <Move key={i} to="translateY(-7px)" delay={90 + i * 70}>
          <Box at={c} size={[C, C, C]} />
          <Box at={[c[0] + C + gap, c[1], 0]} size={[C, C, C * 1.4]} />
          <Box at={[c[0], c[1] + C + gap, 0]} size={[C, C, C * 0.8]} />
          <Box at={[c[0] + C + gap, c[1] + C + gap, 0]} size={[C, C, C * 1.15]} nodes />
        </Move>
      ))}
    </Art>
  );
}

/**
 * g1t, as an exploded stack: main is the base plate, and the fleet's forks
 * float above it, each one a copy of the code with its own change on it. The
 * checks grid at the side runs, and the mint fork, the one that passed, settles
 * onto main as a new commit. Animated in a slow loop (the .g1t-* rules in
 * globals.css); with reduced motion it holds still, just before the merge.
 * Drawn for g1t's own palette (.art-g1t): lavender for the fleet, mint for
 * what lands. Compact on purpose, so it still reads on a small card.
 */
export function G1tArt({ id = "art-g1t", className, label }: SceneProps) {
  const ids = artIds(id);
  const baseAt: P3 = [-85, -65, 0];
  const baseSize: P3 = [170, 130, 8];
  const base = corners(baseAt, baseSize);
  const top = baseAt[2] + baseSize[2];
  const plate: P3 = [140, 100, 3];
  // The forks, bottom to top: the one that lands, then the fleet, each a step
  // higher and a little further back.
  const forks = [0, 1, 2, 3].map((i) => ({
    at: [-70 + i * 14, -50 - i * 14, top + 26 + i * 30] as P3,
    won: i === 0,
  }));
  const highest = corners(forks[3].at, plate);
  const issueAt: P3 = [-178, -10, 120];
  const issueSize: P3 = [50, 36, 2];
  const issue = corners(issueAt, issueSize);
  const panelAt: P3 = [100, -48, 0];
  const panelSize: P3 = [3, 96, 62];
  const panel = corners(panelAt, panelSize);
  const floor: P3[] = [
    [-520, -520, 0],
    [520, -520, 0],
    [520, 520, 0],
    [-520, 520, 0],
  ];
  return (
    <Art
      id={id}
      viewBox={frame([base.b01, base.b11, base.b10, highest.t00, highest.t10, issue.t00, issue.t01, panel.t10, panel.b11], 1.3, 22, 0)}
      className={className}
      label={label}
      guides={
        <>
          <polygon points={pts(floor)} fill={`url(#${ids.dots})`} />
          {axes(base.b11)}
          {/* Rails the forks float along, up from main's corners. */}
          {[base.t00, base.t10, base.t01].map((p, i) => (
            <Line key={i} ps={[p, [p[0], p[1], 240]]} ink="faint" dots />
          ))}
        </>
      }
    >
      {/* Main: the base plate and its history. */}
      <Box at={baseAt} size={baseSize} hatch="right" hatchId={ids.hatch} nodes />
      <OnFace face="top" origin={[baseAt[0], baseAt[1], top]}>
        <text
          x={16}
          y={98}
          fontFamily="var(--font-mono)"
          fontSize={9}
          fontWeight={600}
          letterSpacing="0.08em"
          fill="var(--art-line)"
        >
          MAIN
        </text>
        <line x1={16} y1={110} x2={156} y2={110} stroke="var(--art-line)" strokeWidth={1.2} />
        {[28, 58, 88].map((x) => (
          <circle key={x} cx={x} cy={110} r={3.2} fill="var(--art-node)" stroke="var(--art-line)" strokeWidth={1.2} />
        ))}
        {/* What landing looks like: the plate lights, a new commit appears. */}
        <rect
          className="g1t-flash"
          x={4}
          y={4}
          width={baseSize[0] - 8}
          height={baseSize[1] - 8}
          rx={3}
          fill="var(--art-accent-fill)"
          stroke="var(--art-accent)"
          strokeWidth={1}
        />
        <line className="g1t-commit" x1={88} y1={110} x2={130} y2={110} stroke="var(--art-accent)" strokeWidth={1.6} />
        <circle className="g1t-commit" cx={130} cy={110} r={4} fill="var(--art-accent)" />
        <circle className="g1t-ping" cx={130} cy={110} r={5} fill="none" stroke="var(--art-accent)" strokeWidth={1} />
      </OnFace>

      {/* The forks. Each floats on its own rhythm; the mint one lands. */}
      {forks.map((f, i) => (
        <Move key={i} to={`translateY(-${i * 7}px)`} delay={i * 40}>
          <g className={f.won ? "g1t-land" : `g1t-bob g1t-bob-${i}`}>
            <Box
              at={f.at}
              size={plate}
              top={f.won ? "accent" : "accent-2"}
              ink={f.won ? "accent" : "accent-2"}
              nodes={i === 3}
            />
            <OnFace face="top" origin={[f.at[0] + 14, f.at[1] + 14, f.at[2] + plate[2]]}>
              <TextLines width={92} lines={4} gap={9} />
              {[0, 1, 2].map((k) => (
                <rect
                  key={k}
                  className="g1t-diff"
                  style={{ animationDelay: `${-(i * 0.7 + k * 0.45)}s` }}
                  x={100}
                  y={11 + k * 18}
                  width={10}
                  height={4}
                  rx={1}
                  fill={f.won || k !== 1 ? "var(--art-accent)" : "var(--art-ink)"}
                />
              ))}
            </OnFace>
          </g>
        </Move>
      ))}

      {/* The checks: a grid of runs that flicker, then sweep mint as one passes. */}
      <Box at={panelAt} size={panelSize} ink="line" />
      <OnFace face="right" origin={[panel.t11[0], panel.t11[1] - 10, panel.t11[2] - 10]}>
        {Array.from({ length: 12 }, (_, n) => {
          const col = n % 4;
          const row = Math.floor(n / 4);
          const x = col * 19;
          const y = row * 14;
          return (
            <g key={n}>
              <rect x={x} y={y} width={14} height={9} fill="none" stroke="var(--art-faint)" strokeWidth={0.8} />
              <rect
                className="g1t-cell"
                style={{ animationDelay: `${-((n * 7) % 11) * 0.37}s` }}
                x={x}
                y={y}
                width={14}
                height={9}
                fill="var(--art-accent-2)"
              />
              <rect
                className="g1t-pass"
                style={{ animationDelay: `${(col + row) * 0.08}s` }}
                x={x}
                y={y}
                width={14}
                height={9}
                fill="var(--art-accent)"
              />
            </g>
          );
        })}
      </OnFace>

      {/* The issue that set the fleet going, floating off to the side. */}
      <Move to="translateY(-14px)" delay={80}>
        <g className="g1t-bob g1t-bob-issue">
          <Line ps={[issue.b11, [forks[2].at[0], forks[2].at[1] + plate[1], forks[2].at[2]]]} ink="line" dots />
          <Box at={issueAt} size={issueSize} nodes />
          <OnFace face="top" origin={[issueAt[0] + 8, issueAt[1] + 7, issueAt[2] + 2]}>
            <text y={10} fontFamily="var(--font-mono)" fontSize={11} fontWeight={600} fill="var(--art-accent)">
              #128
            </text>
            <TextLines y={17} width={32} lines={2} heading={false} gap={6} />
          </OnFace>
        </g>
      </Move>
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
  // Extension lines run long enough for the dimensions to slide out along
  // them on hover.
  const ext = o + 16;
  const out = 11;
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
      <Line ps={[c.b01, [c.b01[0], c.b01[1] + ext, 0]]} ink="line" />
      <Line ps={[c.b11, [c.b11[0], c.b11[1] + ext, 0]]} ink="line" />
      <Line ps={[c.b11, [c.b11[0] + ext, c.b11[1], 0]]} ink="line" />
      <Line ps={[c.b10, [c.b10[0] + ext, c.b10[1], 0]]} ink="line" />
      <Line ps={[c.t10, [c.t10[0] + ext, c.t10[1], c.t10[2]]]} ink="line" />
      <Move to={along("y", out)}>
        <Line ps={[[c.b01[0], c.b01[1] + o, 0], [c.b11[0], c.b11[1] + o, 0]]} ink="accent" />
        <Callout p={[c.b01[0] + 60, c.b01[1] + o, 0]} text="120.00" dx={-26} dy={20} />
      </Move>
      <Move to={along("x", out)} delay={70}>
        <Line ps={[[c.b11[0] + o, c.b11[1], 0], [c.b10[0] + o, c.b10[1], 0]]} ink="accent" />
        <Callout p={[c.b11[0] + o, c.b11[1] - 45, 0]} text="90.00" dx={30} dy={18} />
      </Move>
      <Move to={along("x", out)} delay={140}>
        <Line ps={[[c.b10[0] + o, c.b10[1], 0], [c.t10[0] + o, c.t10[1], c.t10[2]]]} ink="accent" />
        <Callout p={[c.b10[0] + o, c.b10[1], 33]} text="66.00" dx={30} dy={-10} />
      </Move>
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
          <Move key={i} to={`translateY(-${placeholder ? 4 : 6 + (i - 1) * 4}px)`} delay={(3 - i) * 60}>
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
          </Move>
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
          <Hop key={i} delay={i * 70}>
            <Box
              at={s.at}
              size={[D, S, s.h]}
              hatch="right"
              hatchId={ids.hatch}
              top={isLast ? "accent" : "top"}
              ink={isLast ? "accent" : "ink"}
            />
          </Hop>
        );
      })}
      {/* Where it goes next; on hover a wave climbs the steps to it. */}
      <Hop delay={(n - 1) * 70}>
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
      </Hop>
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
