import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** The clock sweep: the hand takes a point from each buffer it passes, skips pinned ones, and stops at a zero. */
export function ClockSweep({ id, caption }: FigureProps) {
  const x0 = 96;
  const cw = 46;
  const before = [3, 0, 5, 1, 0, 2, 5, 1, 0, 4];
  const start = 2; // where the hand stands
  const pinned = 3;
  const victim = 4;
  const after = before.map((u, i) => (i === start ? u - 1 : u));
  const cx = (i: number) => x0 + i * cw + cw / 2;
  const r1 = 74;
  const r2 = 176;
  const h = 34;
  const x1 = x0 + before.length * cw;

  const row = (counts: number[], y: number, label: string, done: boolean) => (
    <g>
      <Text x={x0 - 14} y={y + 21} caps size={10} ink="line" anchor="end">{label}</Text>
      {counts.map((u, i) => {
        const isVictim = done && i === victim;
        return (
          <g key={i}>
            <Rect
              x={x0 + i * cw}
              y={y}
              w={cw}
              h={h}
              tone={isVictim ? "accent" : i === pinned ? "paper" : "shade"}
              ink={isVictim ? "accent" : "ink"}
              width={isVictim || i === pinned ? 1.4 : 1}
            />
            <Text x={cx(i)} y={y + 22} mono size={12} anchor="middle" ink={isVictim ? "accent" : "ink"} weight={isVictim ? 600 : 400}>
              {`${u}`}
            </Text>
          </g>
        );
      })}
    </g>
  );

  return (
    <Figure
      id={id}
      viewBox="0 0 640 270"
      label="Ten buffers with usage counts 3, 0, 5, 1, 0, 2, 5, 1, 0, 4. The clock hand moves right from the buffer holding 5: it takes one point away, leaving 4; it skips the next buffer because it is pinned; it stops at the following buffer, whose count is 0, and that buffer is the victim. The hand wraps around from the last buffer to the first."
      caption={caption}
    >
      {/* the hand */}
      <Text x={cx(start)} y={26} caps size={10} anchor="middle">clock hand</Text>
      <Path d={`M${cx(start)},34 L${cx(start)},${r1 - 4}`} ink="ink" width={1.4} arrow fig={id} />
      <Path d={`M${cx(start) + 14},50 L${cx(victim) + 10},50`} ink="line" arrow fig={id} />
      <Text x={cx(victim) + 18} y={54} size={10.5} ink="line">moves right</Text>

      {row(before, r1, "before", false)}

      {/* what the hand does at each buffer */}
      <Text x={cx(start)} y={r1 + h + 22} size={10.5} anchor="middle">take</Text>
      <Text x={cx(start)} y={r1 + h + 36} size={10.5} anchor="middle">a point</Text>
      <Text x={cx(pinned)} y={r1 + h + 22} size={10.5} anchor="middle">pinned:</Text>
      <Text x={cx(pinned)} y={r1 + h + 36} size={10.5} anchor="middle">skip</Text>
      <Text x={cx(victim)} y={r1 + h + 22} size={10.5} anchor="middle" ink="accent">0: the</Text>
      <Text x={cx(victim)} y={r1 + h + 36} size={10.5} anchor="middle" ink="accent">victim</Text>
      {[start, pinned, victim].map((i) => (
        <Path key={i} d={`M${cx(i)},${r1 + h + 44} L${cx(i)},${r2 - 4}`} ink={i === victim ? "accent" : "line"} arrow fig={id} />
      ))}

      {row(after, r2, "after", true)}

      {/* wrap around */}
      <Path
        d={`M${x1},${r2 + h / 2} L${x1 + 16},${r2 + h / 2} L${x1 + 16},${r2 + h + 22} L${cx(0)},${r2 + h + 22} L${cx(0)},${r2 + h + 3}`}
        ink="line"
        dashed
        arrow
        fig={id}
      />
      <Text x={(x0 + x1) / 2} y={r2 + h + 42} size={10.5} ink="line" anchor="middle">
        the hand wraps around and keeps going
      </Text>

      {/* key */}
      <Text x={x1 + 12} y={r1 + 12} size={10} ink="line">usage</Text>
      <Text x={x1 + 12} y={r1 + 25} size={10} ink="line">counts</Text>
      <Rect x={x1 + 12} y={r1 + 40} w={12} h={12} tone="paper" ink="ink" width={1.4} />
      <Text x={x1 + 30} y={r1 + 50} size={10} ink="line">pinned</Text>
    </Figure>
  );
}
