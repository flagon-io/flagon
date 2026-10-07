import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/**
 * The same index, read two ways. OFFSET walks it from the front and discards
 * a million entries before the 20 it returns; keyset descends straight to the
 * bookmark and reads the next 20.
 */
export function OffsetVsKeyset({ id, caption }: FigureProps) {
  const x0 = 40;
  const x1 = 600;
  const mark = 470; // where row 1,000,000 ends
  const shown = 34; // width of the 20 returned entries
  const barA = 92;
  const barB = 258;
  const H = 26;

  return (
    <Figure
      id={id}
      viewBox="0 0 640 330"
      label="The same index on (created_at desc, id desc), drawn twice as a bar in sort order. With limit 20 offset 1000000, Postgres walks the index from the start, reading 1,000,020 entries and 21,422 pages, throws away the first 1,000,000 and shows 20. With keyset pagination, where (created_at, id) is less than the bookmark, it descends the tree straight to the bookmark and reads the next 20 entries, 5 pages."
      caption={caption}
    >
      {/* ---------- OFFSET ---------- */}
      <Text x={x0} y={28} caps size={12}>offset</Text>
      <Text x={x0 + 70} y={28} mono size={10} ink="line">order by created_at desc, id desc limit 20 offset 1000000</Text>

      <Path d={`M${x0},${barA - 16} L${x0},${barA - 8}`} ink="line" />
      <Path d={`M${x0},${barA - 12} L${mark + shown},${barA - 12}`} ink="line" arrow fig={id} />
      <Text x={(x0 + mark + shown) / 2} y={barA - 20} caps size={10} ink="line" anchor="middle">
        1,000,020 entries read, 21,422 pages
      </Text>
      <Rect x={x0} y={barA} w={x1 - x0} h={H} tone="paper" />
      {/* every entry walked, one rule each */}
      {Array.from({ length: Math.floor((mark - x0 - 6) / 6) }, (_, i) => (
        <Path key={i} d={`M${x0 + 6 + i * 6},${barA + 5} L${x0 + 6 + i * 6},${barA + H - 5}`} ink="line" />
      ))}
      <Rect x={mark} y={barA} w={shown} h={H} tone="accent" ink="accent" width={1.4} />
      <Text x={mark + shown / 2} y={barA + 17} mono size={10} anchor="middle" ink="accent">20</Text>

      <Text x={x0} y={barA + H + 18} size={11} ink="line">first in sort order</Text>
      <Text x={mark - 8} y={barA + H + 18} size={11} ink="line" anchor="end">1,000,000 read and thrown away</Text>
      <Text x={mark + shown / 2} y={barA + H + 18} size={11} ink="accent" anchor="middle">shown</Text>

      <Path d={`M${x0},178 L${x1},178`} ink="faint" />

      {/* ---------- keyset ---------- */}
      <Text x={x0} y={208} caps size={12}>keyset</Text>
      <Text x={x0 + 70} y={208} mono size={10} ink="line">where (created_at, id) &lt; (x, y) ... limit 20</Text>

      <Text x={mark - 14} y={barB - 16} size={11} ink="accent" anchor="end">seek to the bookmark</Text>
      <Path d={`M${mark},${barB - 34} L${mark},${barB - 3}`} ink="accent" width={1.4} arrow fig={id} />
      <Rect x={x0} y={barB} w={x1 - x0} h={H} tone="paper" />
      <Rect x={mark} y={barB} w={shown} h={H} tone="accent" ink="accent" width={1.4} />
      <Text x={mark + shown / 2} y={barB + 17} mono size={10} anchor="middle" ink="accent">20</Text>

      <Text x={x0} y={barB + H + 18} size={11} ink="line">skipped, never read</Text>
      <Text x={mark + shown / 2} y={barB + H + 18} size={11} ink="accent" anchor="middle">next 20</Text>
      <Text x={x1} y={barB + H + 36} size={11} ink="line" anchor="end">5 pages, the same on every page</Text>
    </Figure>
  );
}
