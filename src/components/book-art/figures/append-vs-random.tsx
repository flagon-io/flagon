import { Figure, Path, Rect, Span, Text, type FigureProps } from "../kit";

const LW = 54; // leaf width
const LH = 64; // leaf height
const GAP = 14;

/** One leaf page, its entries drawn as rules stacked from the bottom to `full` (0..1). */
function Leaf({ x, y, full, accent = false }: { x: number; y: number; full: number; accent?: boolean }) {
  const step = 5;
  const n = Math.round(((LH - 4) * full) / step);
  return (
    <g>
      <Rect x={x} y={y} w={LW} h={LH} tone="paper" ink={accent ? "accent" : "ink"} width={accent ? 1.4 : 1} />
      {Array.from({ length: n }, (_, i) => {
        const ly = y + LH - 4 - i * step;
        return <Path key={i} d={`M${x + 7},${ly} L${x + LW - 7},${ly}`} ink={accent ? "accent" : "line"} />;
      })}
    </g>
  );
}

/**
 * Increasing keys always land on the rightmost leaf; random keys land on any
 * leaf, and a full leaf in the middle splits 50/50.
 */
export function AppendVsRandom({ id, caption }: FigureProps) {
  const x0 = 40;
  const lx = (i: number) => x0 + i * (LW + GAP);
  const rowA = 74;
  const rowB = 300;

  // Appends: every leaf left behind is packed; the rightmost one is being filled.
  const fillA = [0.9, 0.9, 0.9, 0.9, 0.9];
  // Random: leaves at mixed levels; leaves 2 and 3 are the two halves of a split.
  const fillB = [0.8, 0.65, 0.5, 0.5, 0.85, 0.7];
  const splitL = 2;

  const notesX = 470;

  return (
    <Figure
      id={id}
      viewBox="0 0 640 410"
      label="Two rows of B-tree leaf pages in key order. With increasing keys such as identity or UUIDv7, every new key lands on the rightmost leaf, the only one written, and the leaves behind it are left about 90 percent full. With random UUIDv4 keys, new keys land on leaves anywhere in the row; a full leaf in the middle splits 50/50 into two half-full leaves, and leaves settle about 70 percent full."
      caption={caption}
    >
      {/* ---------- increasing keys ---------- */}
      <Text x={x0} y={28} caps size={12}>increasing keys: identity, UUIDv7</Text>

      {fillA.map((f, i) => (
        <Leaf key={i} x={lx(i)} y={rowA} full={f} />
      ))}
      <Leaf x={lx(5)} y={rowA} full={0.45} accent />
      {[-14, 0, 14].map((dx, i) => (
        <Path key={i} d={`M${lx(5) + LW / 2 + dx},${rowA - 30} L${lx(5) + LW / 2 + dx},${rowA - 4}`} ink="accent" width={1.4} arrow fig={id} />
      ))}
      <Text x={lx(5) + LW / 2} y={rowA - 36} size={10} ink="accent" anchor="middle">new keys</Text>
      <Span x1={lx(0)} x2={lx(4) + LW} y={rowA + LH + 8} below label="left behind about 90% full" />

      <Text x={notesX} y={rowA + 18} size={11}>always the rightmost leaf</Text>
      <Text x={notesX} y={rowA + 34} size={11} ink="line">one hot page, stays in memory</Text>
      <Text x={notesX} y={rowA + 50} size={11} ink="line">full-page writes: a few</Text>
      <Text x={notesX} y={rowA + 66} size={11} ink="line">right-edge pages</Text>

      <Path d="M40,196 L600,196" ink="faint" />

      {/* ---------- random keys ---------- */}
      <Text x={x0} y={226} caps size={12}>random keys: UUIDv4</Text>

      {fillB.map((f, i) => (
        <Leaf key={i} x={lx(i)} y={rowB} full={f} accent={i === splitL || i === splitL + 1} />
      ))}
      {[0, 4, 5].map((i) => (
        <Path key={i} d={`M${lx(i) + LW / 2},${rowB - 26} L${lx(i) + LW / 2},${rowB - 4}`} ink="line" arrow fig={id} />
      ))}
      <Path
        d={`M${lx(splitL)},${rowB - 4} L${lx(splitL)},${rowB - 10} L${lx(splitL + 1) + LW},${rowB - 10} L${lx(splitL + 1) + LW},${rowB - 4}`}
        ink="accent"
        width={1.4}
      />
      <Path d={`M${lx(splitL) + LW + GAP / 2},${rowB - 40} L${lx(splitL) + LW + GAP / 2},${rowB - 12}`} ink="accent" width={1.4} arrow fig={id} />
      <Text x={lx(splitL) + LW + GAP / 2} y={rowB - 47} size={10} ink="accent" anchor="middle">a full leaf splits 50/50</Text>
      <Span x1={lx(0)} x2={lx(5) + LW} y={rowB + LH + 8} below label="settle about 70% full" />

      <Text x={notesX} y={rowB + 18} size={11}>any leaf, anywhere</Text>
      <Text x={notesX} y={rowB + 34} size={11} ink="line">whole index must stay cached</Text>
      <Text x={notesX} y={rowB + 50} size={11} ink="line">full-page writes: on nearly</Text>
      <Text x={notesX} y={rowB + 66} size={11} ink="line">every insert</Text>
    </Figure>
  );
}
