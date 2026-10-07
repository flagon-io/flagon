import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** Point-in-time recovery: a base backup plus archived WAL, replayed up to a target time. */
export function PitrTimeline({ id, caption }: FigureProps) {
  const fx = 40;
  const fw = 92;
  const sx = 176; // first segment
  const sw = 42;
  const gap = 5;
  const n = 8;
  const segY = 70;
  const segH = 34;
  const seg = (i: number) => sx + i * (sw + gap);
  const stop = 5; // the target falls inside this segment
  const target = seg(stop) + 33;
  const mistake = target + 6;
  return (
    <Figure
      id={id}
      viewBox="0 0 640 214"
      label="A nightly base backup finished at 03:00, followed by a row of WAL segments archived continuously. Recovery copies the base backup, then replays WAL forward and stops at recovery_target_time, 14:01:59, just before the 14:02 mistake; the server opens there and later WAL is not replayed."
      caption={caption}
    >
      {/* base backup */}
      <Text x={fx} y={50} caps size={11} ink="line">base backup</Text>
      <Rect x={fx} y={segY} w={fw} h={segH} tone="shade-2" ink="ink" width={1.4} />
      <Text x={fx + fw / 2} y={segY + 21} mono size={11} anchor="middle">files</Text>
      <Text x={fx} y={segY + segH + 18} mono size={10} ink="line">nightly, 03:00</Text>
      <Text x={(fx + fw + sx) / 2} y={segY + 22} size={16} ink="line" anchor="middle">+</Text>

      {/* archived WAL */}
      <Text x={sx} y={50} caps size={11} ink="line">WAL segments archived continuously</Text>
      {Array.from({ length: n }, (_, i) => {
        const replayed = i <= stop;
        return (
          <g key={i}>
            <Rect x={seg(i)} y={segY} w={sw} h={segH} tone={replayed ? "shade" : "paper"} ink={replayed ? "ink" : "line"} dashed={!replayed} />
            <Text x={seg(i) + 7} y={segY + 21} mono size={10} ink={replayed ? "ink" : "line"}>seg</Text>
          </g>
        );
      })}
      <Text x={seg(n) + 4} y={segY + 21} mono size={11} ink="line">...</Text>

      {/* the mistake */}
      <Path d={`M${mistake},${segY - 8} L${mistake},${segY + segH + 6}`} ink="ink" dashed />
      <Text x={mistake + 6} y={segY - 10} size={10} ink="line">the 14:02 mistake</Text>

      {/* replay up to the target */}
      <Path d={`M${target},${segY - 8} L${target},${segY + segH + 42}`} ink="accent" width={1.6} />
      <Path d={`M${fx},${segY + segH + 32} L${target - 4},${segY + segH + 32}`} ink="accent" width={1.4} arrow fig={id} />
      <Text x={(sx + target) / 2} y={segY + segH + 26} caps size={10} ink="accent" anchor="middle">restore, then replay</Text>
      <Text x={target} y={segY + segH + 62} mono size={10} ink="accent" anchor="middle">
        recovery_target_time = &apos;2026-10-05 14:01:59+00&apos;
      </Text>
      <Text x={target} y={segY + segH + 78} size={10} ink="line" anchor="middle">replay stops here, server opens</Text>
    </Figure>
  );
}
