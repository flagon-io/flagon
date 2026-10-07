import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** The 8 KB heap page: header, line pointers from the front, tuples from the back. */
export function PageAnatomy({ id, caption }: FigureProps) {
  const x0 = 40;
  const x1 = 600;
  const lp = [0, 1, 2]; // one line pointer per tuple
  const slotW = 50;
  // Tuples from the back: [left edge, width]. Row widths vary, as real rows do.
  const tuples: [number, number][] = [
    [478, 122],
    [366, 112],
    [262, 104],
  ];
  const lower = x0 + slotW * lp.length;
  const upper = tuples[2][0];
  return (
    <Figure
      id={id}
      viewBox="0 0 640 290"
      label="An 8 KB page: a 24-byte header, then line pointers growing from the front, free space in the middle, and tuples growing from the back; each line pointer points at one tuple."
      caption={caption}
    >
      {/* byte offsets */}
      <Text x={x0} y={28} mono size={10} ink="line">0</Text>
      <Text x={x1} y={28} mono size={10} ink="line" anchor="end">8191</Text>
      <Text x={(x0 + x1) / 2} y={28} caps size={11} ink="line" anchor="middle">one page, 8,192 bytes</Text>

      {/* the page */}
      <Rect x={x0} y={40} w={x1 - x0} h={238} tone="paper" ink="ink" width={1.4} />

      {/* header */}
      <Rect x={x0} y={40} w={x1 - x0} h={24} tone="shade-2" ink="ink" />
      <Text x={x0 + 10} y={56} caps size={11}>page header</Text>
      <Text x={x1 - 10} y={56} mono size={10} ink="line" anchor="end">24 bytes: LSN, checksum, pd_lower, pd_upper</Text>

      {/* line pointers */}
      {lp.map((i) => (
        <g key={i}>
          <Rect x={x0 + i * slotW} y={64} w={slotW} h={24} tone={i === 0 ? "accent" : "shade"} ink={i === 0 ? "accent" : "ink"} />
          <Text x={x0 + i * slotW + slotW / 2} y={80} mono size={10} anchor="middle" ink={i === 0 ? "accent" : "ink"}>
            {`lp ${i + 1}`}
          </Text>
        </g>
      ))}
      {/* pd_lower sits right after the last pointer, beside the row (the curves below would cross it) */}
      <Path d={`M${lower},64 L${lower},96`} ink="ink" />
      <Text x={lower + 6} y={80} mono size={10}>pd_lower</Text>
      <Path d={`M${lower + 64},76 L${lower + 136},76`} ink="line" arrow fig={id} />
      <Text x={lower + 144} y={80} size={11} ink="line">line pointers grow forward, 4 bytes each</Text>

      {/* pd_upper */}
      <Path d={`M${upper},230 L${upper},218`} ink="ink" />
      <Text x={upper} y={212} mono size={10} anchor="middle">pd_upper</Text>

      {/* free space */}
      <Text x={x1 - 14} y={118} caps size={12} ink="line" anchor="end">free space</Text>
      <Text x={x1 - 14} y={134} size={11} ink="line" anchor="end">the page is full when the two ends meet</Text>

      {/* pointers from slots to tuples */}
      {tuples.map(([tx, tw], i) => {
        const sx = x0 + i * slotW + slotW / 2;
        const tcx = tx + tw / 2;
        return (
          <Path
            key={i}
            d={`M${sx},88 C${sx},150 ${tcx},170 ${tcx},${232}`}
            ink={i === 0 ? "accent" : "line"}
            width={i === 0 ? 1.4 : 1}
            arrow
            fig={id}
          />
        );
      })}

      {/* tuples */}
      {tuples.map(([tx, tw], i) => (
        <g key={i}>
          <Rect x={tx} y={232} w={tw} h={26} tone={i === 0 ? "accent" : "shade"} ink={i === 0 ? "accent" : "ink"} />
          <Text x={tx + tw / 2} y={249} mono size={10} anchor="middle" ink={i === 0 ? "accent" : "ink"}>
            {`tuple ${i + 1}`}
          </Text>
        </g>
      ))}
      <Path d={`M${upper - 12},245 L${upper - 94},245`} ink="line" arrow fig={id} />
      <Text x={upper - 102} y={249} size={11} ink="line" anchor="end">tuples grow backward</Text>

      {/* special space */}
      <Rect x={x0} y={258} w={x1 - x0} h={20} tone="paper" ink="line" dashed />
      <Text x={x0 + 10} y={272} caps size={10} ink="line">special space</Text>
      <Text x={x1 - 10} y={272} size={10} ink="line" anchor="end">empty on table pages; indexes keep their bookkeeping here</Text>

    </Figure>
  );
}
