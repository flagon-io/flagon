import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** Removing a month: delete rows from one big table, or detach and drop one partition. */
export function DetachVsDelete({ id, caption }: FigureProps) {
  // Left: one heap, drawn as rows of tuples.
  const lx = 40;
  const lw = 230;
  const ty = 72;
  const rows = 12;
  const rh = 9;
  const dead = (r: number) => r >= 4 && r <= 7; // the deleted month
  // Right: the partitioned table.
  const rx = 360;
  const pw = 108;
  const ph = 24;
  const py = (i: number) => ty + i * 30;
  return (
    <Figure
      id={id}
      viewBox="0 0 640 300"
      label="Two ways to remove one month of events. Left: delete from the single events table leaves 164,383 dead tuples among the live rows, writes 32 MB of WAL, and the vacuum that cleans them up writes another 12 MB. Right: in the partitioned events_p, the month's partition is detached and dropped, which unlinks its files and updates the catalog, writing under 150 KB of WAL."
      caption={caption}
    >
      {/* divider */}
      <Path d="M320,40 L320,272" ink="faint" />

      {/* LEFT: delete */}
      <Text x={lx} y={34} caps size={11} ink="line">delete one month</Text>
      <Text x={lx} y={56} mono size={11}>events</Text>
      <Rect x={lx} y={ty} w={lw} h={rows * rh} tone="paper" ink="ink" width={1.4} />
      {Array.from({ length: rows }, (_, r) => {
        const y = ty + r * rh;
        return dead(r) ? (
          <g key={r}>
            <Rect x={lx} y={y} w={lw} h={rh} tone="shade-2" ink="none" />
            {Array.from({ length: 11 }, (_, k) => (
              <Path key={k} d={`M${lx + 8 + k * 20},${y + rh / 2} L${lx + 20 + k * 20},${y + rh / 2}`} ink="ink" />
            ))}
          </g>
        ) : (
          <g key={r}>
            {r > 0 ? <Path d={`M${lx},${y} L${lx + lw},${y}`} ink="faint" /> : null}
          </g>
        );
      })}
      <Rect x={lx} y={ty} w={lw} h={rows * rh} tone="none" ink="ink" width={1.4} />
      <Path d={`M${lx + lw + 6},${ty + 4 * rh} L${lx + lw + 10},${ty + 4 * rh} L${lx + lw + 10},${ty + 8 * rh} L${lx + lw + 6},${ty + 8 * rh}`} ink="line" />
      <Text x={lx + lw + 16} y={ty + 6 * rh - 2} size={10} ink="line">dead</Text>
      <Text x={lx + lw + 16} y={ty + 6 * rh + 10} size={10} ink="line">tuples</Text>

      <Text x={lx} y={ty + rows * rh + 30} mono size={12} weight={600}>164,383</Text>
      <Text x={lx + 64} y={ty + rows * rh + 30} size={11} ink="line">dead tuples left behind</Text>
      <Text x={lx} y={ty + rows * rh + 52} mono size={12} weight={600}>32 MB</Text>
      <Text x={lx + 64} y={ty + rows * rh + 52} size={11} ink="line">of WAL for the delete</Text>
      <Text x={lx} y={ty + rows * rh + 74} mono size={12} weight={600}>12 MB</Text>
      <Text x={lx + 64} y={ty + rows * rh + 74} size={11} ink="line">more for the vacuum after it</Text>
      <Text x={lx} y={ty + rows * rh + 102} size={10} ink="line">grows with the rows deleted</Text>

      {/* RIGHT: detach and drop */}
      <Text x={rx} y={34} caps size={11} ink="line">detach and drop</Text>
      <Text x={rx} y={56} mono size={11}>events_p</Text>
      {/* the month's slot, now empty */}
      <Rect x={rx} y={py(0)} w={pw} h={ph} tone="none" ink="faint" dashed />
      {[1, 2].map((i) => (
        <Rect key={i} x={rx} y={py(i)} w={pw} h={ph} tone="shade" ink="ink" />
      ))}
      <Text x={rx + pw / 2} y={py(2) + ph + 18} size={10} ink="line" anchor="middle">other months untouched</Text>

      {/* the detached partition */}
      <Path d={`M${rx + pw + 4},${py(0) + ph / 2} L${rx + pw + 34},${py(0) + ph / 2}`} ink="accent" arrow fig={id} />
      <Text x={rx + pw + 19} y={py(0) - 4} size={10} ink="accent" anchor="middle">detach</Text>
      <Rect x={rx + pw + 38} y={py(0)} w={122} h={ph} tone="accent" ink="accent" width={1.4} dashed />
      <Text x={rx + pw + 99} y={py(0) + 16} mono size={10} ink="accent" anchor="middle">events_p_2025_11</Text>
      <Path d={`M${rx + pw + 99},${py(0) + ph + 4} L${rx + pw + 99},${py(0) + ph + 26}`} ink="accent" arrow fig={id} />
      <Text x={rx + pw + 99} y={py(0) + ph + 42} size={10} ink="accent" anchor="middle">drop: unlink some files,</Text>
      <Text x={rx + pw + 99} y={py(0) + ph + 56} size={10} ink="accent" anchor="middle">update the catalog</Text>

      <Text x={rx} y={ty + rows * rh + 30} mono size={12} weight={600}>none</Text>
      <Text x={rx + 100} y={ty + rows * rh + 30} size={11} ink="line">dead tuples</Text>
      <Text x={rx} y={ty + rows * rh + 52} mono size={12} weight={600}>under 150 KB</Text>
      <Text x={rx + 100} y={ty + rows * rh + 52} size={11} ink="line">of WAL, all told</Text>
      <Text x={rx} y={ty + rows * rh + 102} size={10} ink="line">grows with the number of indexes</Text>
    </Figure>
  );
}
