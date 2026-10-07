import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** After each checkpoint, the first change to a page carries a full image of it; later changes are small records. */
export function CheckpointFpi({ id, caption }: FigureProps) {
  const y = 92; // top of the records
  const h = 30;
  const big = 84;
  const small = 18;
  const gap = 5;
  // [page, full-page image?] in log order, split by checkpoints
  const seq: ([string, boolean] | "ckpt")[] = [
    "ckpt",
    ["A", true],
    ["B", true],
    ["A", false],
    ["B", false],
    ["A", false],
    ["A", false],
    "ckpt",
    ["A", true],
    ["A", false],
    ["B", true],
    ["A", false],
  ];
  let x = 40;
  const items = seq.map((s) => {
    if (s === "ckpt") {
      const at = x + 6;
      x += 22;
      return { kind: "ckpt" as const, x: at };
    }
    const w = s[1] ? big : small;
    const at = x;
    x += w + gap;
    return { kind: "rec" as const, x: at, w, page: s[0], fpi: s[1] };
  });
  return (
    <Figure
      id={id}
      viewBox="0 0 640 220"
      label="A WAL stream with two checkpoints. After the first, the first change to page A and the first change to page B each carry a full 8 KB page image; the later changes to A and B are small records. After the second checkpoint, the first change to each page carries an image again."
      caption={caption}
    >
      <Text x={40} y={34} caps size={10} ink="line">WAL stream, oldest first</Text>
      <Path d={`M30,${y + h + 10} L610,${y + h + 10}`} ink="line" arrow fig={id} />

      {items.map((it, i) =>
        it.kind === "ckpt" ? (
          <g key={i}>
            <Path d={`M${it.x},${y - 22} L${it.x},${y + h + 18}`} ink="ink" width={1.6} />
            <Text x={it.x} y={y - 28} size={10.5} anchor="middle">checkpoint</Text>
          </g>
        ) : (
          <g key={i}>
            <Rect x={it.x} y={y} w={it.w} h={h} tone={it.fpi ? "accent" : "shade"} ink={it.fpi ? "accent" : "ink"} width={it.fpi ? 1.4 : 1} />
            {it.fpi ? (
              <>
                <Rect x={it.x} y={y} w={small} h={h} tone="shade" ink="accent" width={1.4} />
                <Text x={it.x + small / 2} y={y + 19} mono size={10} anchor="middle">{it.page}</Text>
                <Text x={it.x + small + (big - small) / 2} y={y + 19} size={10} anchor="middle" ink="accent">image</Text>
              </>
            ) : (
              <Text x={it.x + small / 2} y={y + 19} mono size={10} anchor="middle">{it.page}</Text>
            )}
          </g>
        ),
      )}

      {/* key */}
      <Rect x={40} y={162} w={small} h={18} tone="shade" ink="accent" width={1.4} />
      <Rect x={40 + small} y={162} w={42} h={18} tone="accent" ink="accent" width={1.4} />
      <Text x={112} y={175} size={10.5}>first change to a page since the checkpoint: the record plus a full 8 KB page image</Text>
      <Rect x={40} y={188} w={small} h={18} tone="shade" ink="ink" />
      <Text x={112} y={201} size={10.5}>any later change to that page: just the small record</Text>
    </Figure>
  );
}
