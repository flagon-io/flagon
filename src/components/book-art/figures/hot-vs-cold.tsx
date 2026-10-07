import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/**
 * Cold vs HOT. Cold: the new version goes to another page and every index gets
 * a new entry. HOT: the new version stays on the page, chained from the old one,
 * and the indexes don't change.
 */
export function HotVsCold({ id, caption }: FigureProps) {
  const idxY = [78, 136, 194];
  const ih = 40;

  /* ----- cold (left panel) ----- */
  const cIdxX = 132;
  const cIdxW = 76;
  const pA = { x: 24, y: 70, w: 82, h: 172 };
  const pB = { x: 234, y: 70, w: 82, h: 172 };
  const cLp = { y: pA.y + 30 };

  /* ----- HOT (right panel) ----- */
  const hIdxX = 352;
  const hIdxW = 64;
  const pH = { x: 448, y: 70, w: 170, h: 172 };
  const v1 = { x: pH.x + 10, y: pH.y + 120, w: 60, h: 34 };
  const v2 = { x: pH.x + 100, y: pH.y + 120, w: 60, h: 34 };
  const lp1 = { x: v1.x + 10, y: pH.y + 30, w: 40, h: 22 };
  const lp2 = { x: v2.x + 10, y: pH.y + 30, w: 40, h: 22 };

  return (
    <Figure
      id={id}
      viewBox="0 0 640 330"
      label="Left, a cold update: the old version v1 stays on its page, the new version v2 is written to another page, and each of the three indexes gets a new entry pointing at v2 beside its old entry pointing at v1. Right, a HOT update: v2 is written on the same page, v1's t_ctid points at it, and the three indexes keep their single entries pointing at line pointer 1. After pruning, line pointer 1 becomes a redirect to line pointer 2."
      caption={caption}
    >
      <Text x={24} y={28} caps size={11}>cold update</Text>
      <Text x={24} y={44} size={10} ink="line">new version on another page</Text>
      <Text x={352} y={28} caps size={11}>HOT update</Text>
      <Text x={352} y={44} size={10} ink="line">new version on the same page</Text>
      <Path d="M330,16 L330,316" ink="faint" />

      {/* cold: page A holds the old version, page B the new one */}
      {[
        { p: pA, v: "v1", lp: "lp1", on: false, name: "page A" },
        { p: pB, v: "v2", lp: "lp", on: true, name: "page B" },
      ].map(({ p, v, lp, on, name }) => (
        <g key={name}>
          <Rect x={p.x} y={p.y} w={p.w} h={p.h} tone="paper" ink="ink" width={1.2} />
          <Text x={p.x + p.w / 2} y={p.y - 6} mono size={10} anchor="middle" ink="line">{name}</Text>
          <Rect x={p.x + 8} y={cLp.y} w={36} h={22} tone={on ? "accent" : "shade"} ink={on ? "accent" : "ink"} />
          <Text x={p.x + 26} y={cLp.y + 15} mono size={10} anchor="middle" ink={on ? "accent" : "ink"}>{lp}</Text>
          <Path d={`M${p.x + 26},${cLp.y + 22} L${p.x + 26},${p.y + 118}`} ink={on ? "accent" : "line"} arrow fig={id} />
          <Rect x={p.x + 8} y={p.y + 120} w={p.w - 16} h={34} tone={on ? "accent" : "shade"} ink={on ? "accent" : "ink"} width={on ? 1.4 : 1} />
          <Text x={p.x + p.w / 2} y={p.y + 141} mono size={10.5} anchor="middle" ink={on ? "accent" : "ink"}>{v}</Text>
        </g>
      ))}

      {/* cold: every index, an old entry (to A) and a new one (to B) */}
      {idxY.map((y, i) => (
        <g key={i}>
          <Rect x={cIdxX} y={y} w={cIdxW} h={ih} tone="paper" ink="ink" />
          <Text x={cIdxX + cIdxW / 2} y={y - 4} size={9.5} ink="line" anchor="middle">index</Text>
          <Rect x={cIdxX + 6} y={y + 9} w={28} h={22} tone="shade" ink="ink" />
          <Rect x={cIdxX + cIdxW - 34} y={y + 9} w={28} h={22} tone="accent" ink="accent" width={1.4} />
          <Text x={cIdxX + cIdxW - 20} y={y + 24} size={9.5} anchor="middle" ink="accent">new</Text>
          <Path d={`M${cIdxX + 6},${y + 20} L${pA.x + 46},${cLp.y + 11}`} ink="line" arrow fig={id} />
          <Path d={`M${cIdxX + cIdxW - 6},${y + 20} L${pB.x + 6},${cLp.y + 11}`} ink="accent" arrow fig={id} />
        </g>
      ))}
      <Text x={170} y={270} size={10.5} anchor="middle">a new entry in every index,</Text>
      <Text x={170} y={284} size={10.5} anchor="middle">even if its columns didn&apos;t change</Text>

      {/* HOT: one page, two versions, chained */}
      <Rect x={pH.x} y={pH.y} w={pH.w} h={pH.h} tone="paper" ink="ink" width={1.2} />
      <Text x={pH.x + pH.w / 2} y={pH.y - 6} mono size={10} anchor="middle" ink="line">page A</Text>
      <Rect x={lp1.x} y={lp1.y} w={lp1.w} h={lp1.h} tone="shade" ink="ink" />
      <Text x={lp1.x + lp1.w / 2} y={lp1.y + 15} mono size={10} anchor="middle">lp1</Text>
      <Rect x={lp2.x} y={lp2.y} w={lp2.w} h={lp2.h} tone="accent" ink="accent" />
      <Text x={lp2.x + lp2.w / 2} y={lp2.y + 15} mono size={10} anchor="middle" ink="accent">lp2</Text>
      <Path d={`M${lp1.x + lp1.w / 2},${lp1.y + lp1.h} L${lp1.x + lp1.w / 2},${v1.y - 2}`} ink="line" arrow fig={id} />
      <Path d={`M${lp2.x + lp2.w / 2},${lp2.y + lp2.h} L${lp2.x + lp2.w / 2},${v2.y - 2}`} ink="accent" arrow fig={id} />
      <Rect x={v2.x} y={v2.y} w={v2.w} h={v2.h} tone="accent" ink="accent" width={1.4} />
      <Text x={v2.x + v2.w / 2} y={v2.y + 21} mono size={10.5} anchor="middle" ink="accent">v2</Text>
      <Rect x={v1.x} y={v1.y} w={v1.w} h={v1.h} tone="shade" ink="ink" />
      <Text x={v1.x + v1.w / 2} y={v1.y + 21} mono size={10.5} anchor="middle">v1</Text>
      {/* t_ctid: v1 -> v2 */}
      <Path d={`M${v1.x + v1.w},${v1.y + v1.h / 2} L${v2.x - 2},${v2.y + v2.h / 2}`} ink="ink" width={1.2} arrow fig={id} />
      <Text x={(v1.x + v1.w + v2.x) / 2} y={v1.y - 8} mono size={10} anchor="middle">t_ctid</Text>

      {/* HOT: the indexes keep one entry, pointing at lp1 */}
      {idxY.map((y, i) => (
        <g key={i}>
          <Rect x={hIdxX} y={y} w={hIdxW} h={ih} tone="paper" ink="ink" />
          <Text x={hIdxX + hIdxW / 2} y={y - 4} size={9.5} ink="line" anchor="middle">index</Text>
          <Rect x={hIdxX + hIdxW - 34} y={y + 9} w={28} h={22} tone="shade" ink="ink" />
          <Path d={`M${hIdxX + hIdxW - 6},${y + 20} L${lp1.x - 2},${lp1.y + 11}`} ink="line" arrow fig={id} />
        </g>
      ))}
      <Text x={384} y={270} size={10.5} anchor="middle">no index</Text>
      <Text x={384} y={284} size={10.5} anchor="middle">changes</Text>

      {/* after pruning */}
      <Text x={448} y={270} caps size={9.5} ink="line">after pruning</Text>
      <Rect x={448} y={280} w={78} h={22} tone="shade" ink="ink" dashed />
      <Text x={487} y={295} mono size={9.5} anchor="middle">lp1 REDIRECT</Text>
      <Path d="M526,291 L554,291" ink="line" arrow fig={id} />
      <Rect x={556} y={280} w={40} h={22} tone="shade" ink="ink" />
      <Text x={576} y={295} mono size={10} anchor="middle">lp2</Text>
    </Figure>
  );
}
