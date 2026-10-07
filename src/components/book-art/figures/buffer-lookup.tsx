import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** Finding a page: hash the tag into one of the mapping table's partitions; a hit pins, a miss evicts and reads. */
export function BufferLookup({ id, caption }: FigureProps) {
  const x0 = 40;
  const x1 = 600;
  const ty = 112; // table top
  const cells = 12;
  const cw = 32;
  const hit = 5; // the partition the tag hashes to
  const px = (i: number) => x0 + 12 + i * cw;
  const hx = px(hit) + cw / 2;
  const steps = [
    "pick a victim buffer (clock sweep)",
    "write it out first if it's dirty",
    "remap the tag",
    "read the page in",
  ];
  return (
    <Figure
      id={id}
      viewBox="0 0 640 352"
      label="A backend wants block 7 of the users table's main fork. It hashes the tag into the buffer mapping table, which has 128 partitions each with its own lock and maps tags to buffer ids. If the tag is found, the backend pins that buffer: a hit. If not, it picks a victim buffer by clock sweep, writes it out first if dirty, remaps the tag and reads the page in: a read in EXPLAIN."
      caption={caption}
    >
      {/* the request */}
      <Text x={hx} y={26} caps size={10} ink="line" anchor="middle">want</Text>
      <Rect x={hx - 90} y={34} w={180} h={28} tone="shade-2" ink="ink" />
      <Text x={hx} y={52} mono size={11} anchor="middle">(users, main, block 7)</Text>
      <Text x={hx + 10} y={86} size={10.5} ink="accent">hash the tag</Text>

      {/* the mapping table */}
      <Rect x={x0} y={ty} w={x1 - x0} h={58} tone="paper" ink="ink" width={1.4} />
      <Text x={x0 + 12} y={ty + 16} mono size={10.5} weight={600}>buffer mapping table</Text>
      <Text x={x1 - 12} y={ty + 16} mono size={10} ink="line" anchor="end">tag -&gt; buffer id</Text>
      {Array.from({ length: cells }, (_, i) => (
        <Rect
          key={i}
          x={px(i)}
          y={ty + 26}
          w={cw}
          h={22}
          tone={i === hit ? "accent" : "shade"}
          ink={i === hit ? "accent" : "ink"}
          width={i === hit ? 1.4 : 1}
        />
      ))}
      <Text x={px(cells) + 10} y={ty + 41} mono size={10} ink="line">...</Text>
      <Text x={x1 - 12} y={ty + 41} size={10} ink="line" anchor="end">128 partitions, each</Text>
      <Text x={x1 - 12} y={ty + 54} size={10} ink="line" anchor="end">with its own lock</Text>

      <Path d={`M${hx},62 L${hx},${ty + 25}`} ink="accent" width={1.4} arrow fig={id} />

      {/* the two outcomes */}
      <Path d={`M${hx},${ty + 48} L${hx},${ty + 74} L120,${ty + 74} L120,${ty + 98}`} ink="ink" arrow fig={id} />
      <Path d={`M${hx},${ty + 74} L380,${ty + 74} L380,${ty + 98}`} ink="ink" arrow fig={id} />
      <Text x={128} y={ty + 92} caps size={10}>found</Text>
      <Text x={388} y={ty + 92} caps size={10}>not found</Text>

      <Rect x={x0} y={ty + 100} w={180} h={40} tone="shade" ink="ink" />
      <Text x={x0 + 12} y={ty + 124} mono size={10.5}>pin buffer N</Text>
      <Text x={x0 + 12} y={ty + 160} size={10.5} ink="line">a</Text>
      <Text x={x0 + 22} y={ty + 160} mono size={10.5} ink="line">hit</Text>
      <Text x={x0 + 46} y={ty + 160} size={10.5} ink="line">in EXPLAIN</Text>

      <Rect x={300} y={ty + 100} w={300} h={110} tone="shade" ink="ink" />
      {steps.map((s, i) => (
        <g key={i}>
          <Text x={318} y={ty + 122 + i * 24} mono size={10} ink="line" anchor="middle">{i + 1}</Text>
          <Text x={330} y={ty + 122 + i * 24} size={10.5}>{s}</Text>
        </g>
      ))}
      <Text x={312} y={ty + 230} size={10.5} ink="line">a</Text>
      <Text x={322} y={ty + 230} mono size={10.5} ink="line">read</Text>
      <Text x={352} y={ty + 230} size={10.5} ink="line">in EXPLAIN</Text>
    </Figure>
  );
}
