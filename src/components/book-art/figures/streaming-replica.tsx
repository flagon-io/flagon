import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** Streaming replication: WAL flows from walsender to walreceiver; the standby replays it. */
export function StreamingReplica({ id, caption }: FigureProps) {
  const p = { x: 40, w: 230 };
  const s = { x: 370, w: 230 };
  const top = 52;
  const bottom = 252;
  const box = (x: number, y: number, w: number, name: string, note?: string, accent = false) => (
    <g>
      <Rect x={x} y={y} w={w} h={34} tone={accent ? "accent" : "shade"} ink={accent ? "accent" : "ink"} />
      <Text x={x + 10} y={y + (note ? 15 : 21)} mono size={10.5} ink={accent ? "accent" : "ink"}>{name}</Text>
      {note ? (
        <Text x={x + 10} y={y + 28} size={10} ink="line">{note}</Text>
      ) : null}
    </g>
  );
  return (
    <Figure
      id={id}
      viewBox="0 0 640 296"
      label="A primary and a standby. On the primary, walsender reads pg_wal and streams WAL to the standby's walreceiver, which writes and flushes it; the startup process replays it into data pages. The standby reports its positions as LSNs back to the primary, where they show in pg_stat_replication. The standby takes reads and refuses writes."
      caption={caption}
    >
      {/* the two servers */}
      <Rect x={p.x} y={top} w={p.w} h={bottom - top} tone="paper" ink="ink" width={1.4} />
      <Text x={p.x} y={top - 12} caps size={11}>primary</Text>
      <Rect x={s.x} y={top} w={s.w} h={bottom - top} tone="paper" ink="ink" width={1.4} />
      <Text x={s.x} y={top - 12} caps size={11}>standby</Text>
      <Text x={s.x + s.w} y={top - 12} size={10} ink="line" anchor="end">in recovery, read-only</Text>

      {/* primary */}
      {box(p.x + 16, 76, 80, "pg_wal")}
      <Path d={`M${p.x + 100},93 L${p.x + 118},93`} ink="line" arrow fig={id} />
      {box(p.x + 122, 76, 92, "walsender")}
      {box(p.x + 16, 196, 198, "pg_stat_replication")}

      {/* standby */}
      {box(s.x + 16, 76, 198, "walreceiver", "write, flush")}
      <Path d={`M${s.x + 115},112 L${s.x + 115},130`} ink="line" arrow fig={id} />
      {box(s.x + 16, 134, 198, "startup process", "replays into pages")}
      <Path d={`M${s.x + 115},170 L${s.x + 115},188`} ink="line" arrow fig={id} />
      {Array.from({ length: 6 }, (_, i) => (
        <Rect key={i} x={s.x + 16 + i * 33} y={192} w={33} h={22} tone="paper" ink="ink" />
      ))}
      <Text x={s.x + 16} y={234} size={10} ink="line">data pages, a byte-for-byte copy</Text>

      {/* WAL out, positions back */}
      <Path d={`M${p.x + p.w - 16},93 L${s.x + 12},93`} ink="accent" width={1.6} arrow fig={id} />
      <Text x={(p.x + p.w + s.x) / 2} y={85} caps size={11} ink="accent" anchor="middle">WAL</Text>
      {/* the walreceiver sends the feedback */}
      <Path d={`M${s.x + 16},104 L${(p.x + p.w + s.x) / 2},104 L${(p.x + p.w + s.x) / 2},213 L${p.x + 16 + 198 + 4},213`} ink="line" arrow fig={id} />
      <Text x={(p.x + p.w + s.x) / 2 + 6} y={160} size={10} ink="line">positions</Text>
      <Text x={(p.x + p.w + s.x) / 2 + 6} y={174} size={10} ink="line">(LSNs)</Text>

      {/* clients */}
      <Text x={s.x} y={bottom + 22} size={10} ink="line">reads run; writes fail with</Text>
      <Text x={s.x + 132} y={bottom + 22} mono size={10}>25006</Text>
    </Figure>
  );
}
