import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

const H = 28;

function Box({ x, y, w, label, accent = false, dashed = false }: { x: number; y: number; w: number; label?: string; accent?: boolean; dashed?: boolean }) {
  return (
    <g>
      <Rect
        x={x}
        y={y}
        w={w}
        h={H}
        tone={accent ? "accent" : dashed ? "paper" : "shade"}
        ink={accent ? "accent" : dashed ? "line" : "ink"}
        width={accent ? 1.4 : 1}
        dashed={dashed}
      />
      {label ? (
        <Text x={x + w / 2} y={y + 18} mono size={10} anchor="middle" ink={accent ? "accent" : dashed ? "line" : "ink"}>
          {label}
        </Text>
      ) : null}
    </g>
  );
}

/**
 * The primary key of `events`: 1 root page, 19 internal pages, 5,465 leaves,
 * over a 35,173-page heap. A lookup reads one page per level plus one heap page.
 */
export function BtreeLevels({ id, caption }: FigureProps) {
  const y = { root: 36, internal: 106, leaves: 176, heap: 256 };
  const levels: [keyof typeof y, string, string][] = [
    ["root", "root", "1 page"],
    ["internal", "internal", "19 pages"],
    ["leaves", "leaves", "5,465 pages"],
    ["heap", "heap", "35,173 pages"],
  ];

  const root = { x: 330, w: 96 };
  const rootCx = root.x + root.w / 2;
  const internal = [230, 330, 430];
  const iw = 70;
  const leaves = [
    { x: 210, w: 70, label: "1..366" },
    { x: 304, w: 70, label: "367.." },
  ];
  const heap = [
    { x: 210, w: 70, label: "page 0" },
    { x: 304, w: 70, label: "page 1" },
  ];
  const step = (n: number, x: number, row: number) => (
    <Text x={x - 8} y={row + 18} mono size={10} anchor="end" ink="accent">
      {String(n)}
    </Text>
  );

  return (
    <Figure
      id={id}
      viewBox="0 0 640 330"
      label="The primary key of events as levels of 8 KB pages: 1 root page, 19 internal pages, 5,465 leaf pages holding keys 1..366, 367.. and so on, linked sideways to their neighbors, over a heap of 35,173 pages with rows at (0,1), (0,2) and so on. A lookup follows one page per level, root, internal, leaf, three in the tree, then one heap page."
      caption={caption}
    >
      {/* level labels */}
      {levels.map(([k, name, count]) => (
        <g key={k}>
          <Text x={40} y={y[k] + 12} caps size={11}>{name}</Text>
          <Text x={40} y={y[k] + 26} mono size={10} ink="line">{count}</Text>
        </g>
      ))}
      <Path d={`M40,${y.heap - 18} L600,${y.heap - 18}`} ink="faint" dashed />

      {/* root to internal */}
      {internal.map((x, i) => (
        <Path
          key={x}
          d={`M${rootCx},${y.root + H} L${x + iw / 2},${y.internal}`}
          ink={i === 0 ? "accent" : "line"}
          width={i === 0 ? 1.4 : 1}
          arrow={i === 0}
          fig={id}
        />
      ))}
      <Path d={`M${rootCx},${y.root + H} L${530},${y.internal}`} ink="line" dashed />

      {/* internal 0 to leaves */}
      {leaves.map((l, i) => (
        <Path
          key={l.x}
          d={`M${internal[0] + iw / 2},${y.internal + H} L${l.x + l.w / 2},${y.leaves}`}
          ink={i === 0 ? "accent" : "line"}
          width={i === 0 ? 1.4 : 1}
          arrow={i === 0}
          fig={id}
        />
      ))}
      <Path d={`M${internal[0] + iw / 2},${y.internal + H} L${418},${y.leaves}`} ink="line" dashed />

      {/* leaf to heap */}
      <Path d={`M${245},${y.leaves + H} L${245},${y.heap}`} ink="accent" width={1.4} arrow fig={id} />

      {/* boxes */}
      <Box x={root.x} y={y.root} w={root.w} accent />
      <Path d={`M${root.x + 32},${y.root} L${root.x + 32},${y.root + H}`} ink="accent" />
      <Path d={`M${root.x + 64},${y.root} L${root.x + 64},${y.root + H}`} ink="accent" />
      {step(1, root.x, y.root)}

      {internal.map((x, i) => (
        <Box key={x} x={x} y={y.internal} w={iw} accent={i === 0} />
      ))}
      <Box x={510} y={y.internal} w={40} label="..." dashed />
      {step(2, internal[0], y.internal)}

      {leaves.map((l, i) => (
        <Box key={l.x} x={l.x} y={y.leaves} w={l.w} label={l.label} accent={i === 0} />
      ))}
      <Box x={398} y={y.leaves} w={40} label="..." dashed />
      <Path d={`M282,${y.leaves + H / 2} L302,${y.leaves + H / 2}`} ink="line" arrow start fig={id} />
      <Path d={`M376,${y.leaves + H / 2} L396,${y.leaves + H / 2}`} ink="line" arrow start fig={id} />
      <Text x={452} y={y.leaves + 18} size={11} ink="line">linked to neighbors</Text>
      {step(3, leaves[0].x, y.leaves)}

      {heap.map((h, i) => (
        <Box key={h.x} x={h.x} y={y.heap} w={h.w} label={h.label} accent={i === 0} />
      ))}
      <Box x={398} y={y.heap} w={40} label="..." dashed />
      <Text x={210} y={y.heap + 48} mono size={10} ink="line">rows at (0,1), (0,2), ...</Text>
      {step(4, heap[0].x, y.heap)}

      {/* what a lookup costs */}
      <Path d={`M594,${y.root} L600,${y.root} L600,${y.leaves + H} L594,${y.leaves + H}`} ink="line" />
      <Text x={590} y={y.root + 18} size={11} ink="line" anchor="end">three in the tree</Text>
      <Path d={`M594,${y.heap} L600,${y.heap} L600,${y.heap + H} L594,${y.heap + H}`} ink="line" />
      <Text x={590} y={y.heap + 18} size={11} ink="line" anchor="end">one in the heap</Text>
    </Figure>
  );
}
