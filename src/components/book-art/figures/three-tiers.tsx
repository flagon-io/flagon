import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** Where a page can be: shared_buffers, the OS page cache, the storage device, each slower than the last. */
export function ThreeTiers({ id, caption }: FigureProps) {
  const x0 = 40;
  const ax = 100; // the vertical path the request follows
  const cx = 430; // cost column
  const tiers = [
    { y: 92, w: 230, name: "shared_buffers", sub: "shared memory, default 128 MB", cost: ["hit: a memory lookup,", "no system call"] },
    { y: 186, w: 300, name: "OS page cache", sub: "the rest of free RAM", cost: ["4 to 5 µs a page:", "a system call and a copy"] },
    { y: 280, w: 370, name: "storage device", sub: "local NVMe or network disk", cost: ["tens of µs (local NVMe) to", "milliseconds (network disk)"] },
  ];
  const h = 48;
  return (
    <Figure
      id={id}
      viewBox="0 0 640 350"
      label="A backend process looks for a page first in shared_buffers, a memory lookup with no system call; on a miss, which EXPLAIN reports as read, it asks the OS page cache, 4 to 5 microseconds a page for a system call and a copy; on a further miss the kernel goes to the storage device, tens of microseconds on local NVMe to milliseconds on a network disk. EXPLAIN counts both of the lower two as read and cannot tell them apart."
      caption={caption}
    >
      <Text x={cx} y={28} caps size={10} ink="line">cost of finding the page here</Text>

      {/* the asker */}
      <Rect x={x0} y={20} w={170} h={30} tone="shade-2" ink="ink" />
      <Text x={x0 + 85} y={39} mono size={10} anchor="middle">PostgreSQL backend</Text>
      <Path d={`M${ax},50 L${ax},${tiers[0].y - 2}`} ink="ink" arrow fig={id} />
      <Text x={ax + 10} y={76} size={10} ink="line">needs a page</Text>

      {tiers.map((t, i) => (
        <g key={t.name}>
          <Rect x={x0} y={t.y} w={t.w} h={h} tone={i === 0 ? "shade" : "paper"} ink="ink" width={i === 0 ? 1.4 : 1} />
          <Text x={x0 + 12} y={t.y + 20} mono size={11} weight={600}>{t.name}</Text>
          <Text x={x0 + 12} y={t.y + 37} size={10} ink="line">{t.sub}</Text>
          {t.cost.map((line, j) => (
            <Text key={j} x={cx} y={t.y + 16 + j * 14} size={10.5} ink={i === 0 ? "ink" : "line"}>
              {line}
            </Text>
          ))}
        </g>
      ))}

      {/* first miss: the one EXPLAIN calls "read" */}
      <Path d={`M${ax},${tiers[0].y + h} L${ax},${tiers[1].y - 2}`} ink="accent" width={1.4} arrow fig={id} />
      <Text x={ax + 10} y={tiers[0].y + h + 21} size={10.5} ink="accent">miss:</Text>
      <Text x={ax + 42} y={tiers[0].y + h + 21} mono size={10.5} ink="accent">read</Text>
      <Text x={ax + 72} y={tiers[0].y + h + 21} size={10.5} ink="accent">in EXPLAIN</Text>

      {/* second miss: invisible to Postgres */}
      <Path d={`M${ax},${tiers[1].y + h} L${ax},${tiers[2].y - 2}`} ink="line" arrow fig={id} />
      <Text x={ax + 10} y={tiers[1].y + h + 21} size={10.5} ink="line">miss</Text>

      {/* both lower tiers report the same way: Postgres can't tell them apart */}
      <Path d={`M${x0 - 4},${tiers[1].y} L${x0 - 10},${tiers[1].y} L${x0 - 10},${tiers[2].y + h} L${x0 - 4},${tiers[2].y + h}`} ink="accent" />
      <g transform={`rotate(-90 ${x0 - 16} ${(tiers[1].y + tiers[2].y + h) / 2})`}>
        <Text x={x0 - 16} y={(tiers[1].y + tiers[2].y + h) / 2} anchor="middle" caps size={10} ink="accent">
          both count as read
        </Text>
      </g>
    </Figure>
  );
}
