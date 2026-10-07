import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** One idle reporting transaction, one waiting ALTER, and every read queued behind it. */
export function LockQueue({ id, caption }: FigureProps) {
  const x0 = 40;
  const t0 = 132; // the timeline starts here
  const commit = 470; // the reporting transaction ends here
  const h = 22;
  const lane = (i: number) => 58 + i * 36;
  // Waiting sessions: name, arrival, lock mode, why it waits.
  const waiting: { name: string; at: number; mode?: string; why: string }[] = [
    { name: "migration", at: 176, mode: "AccessExclusiveLock", why: "waits for reporting" },
    { name: "web", at: 226, mode: "AccessShareLock", why: "waits for migration" },
    { name: "web", at: 268, mode: "AccessShareLock", why: "waits" },
    { name: "...", at: 310, why: "every new query on accounts" },
  ];
  return (
    <Figure
      id={id}
      viewBox="0 0 640 290"
      label="A lock queue on accounts over time. A reporting session holds AccessShareLock, idle in transaction. A migration arrives and waits for AccessExclusiveLock behind it. Every later query, even plain reads asking only for AccessShareLock, waits behind the migration. When reporting commits, the migration runs and the line drains."
      caption={caption}
    >
      <Text x={x0} y={30} caps size={11} ink="line">accounts lock queue</Text>

      {/* the moment the reporting transaction ends */}
      <Path d={`M${commit},40 L${commit},${lane(4) + h + 8}`} ink="line" dashed />
      <Text x={commit} y={34} size={10} ink="line" anchor="middle">reporting commits</Text>

      {/* granted: the idle reporting transaction */}
      <Text x={x0} y={lane(0) + 15} mono size={11}>reporting</Text>
      <Rect x={t0} y={lane(0)} w={commit - t0} h={h} tone="shade" ink="ink" />
      <Text x={t0 + 10} y={lane(0) + 15} mono size={10}>AccessShareLock</Text>
      <Text x={t0 + 110} y={lane(0) + 15} size={10} ink="line">granted, idle in transaction</Text>

      {/* the queue */}
      {waiting.map((w, i) => {
        const y = lane(i + 1);
        const isMig = i === 0;
        const ink = isMig ? "accent" : i === 3 ? "faint" : "line";
        return (
          <g key={i}>
            <Text x={x0} y={y + 15} mono size={11} ink={i === 3 ? "line" : "ink"}>{w.name}</Text>
            <Rect x={w.at} y={y} w={commit - w.at} h={h} tone="paper" ink={ink} width={isMig ? 1.4 : 1} dashed />
            {w.mode ? (
              <>
                <Text x={w.at + 10} y={y + 15} mono size={10} ink={isMig ? "accent" : "ink"}>{w.mode}</Text>
                <Text x={w.at + (isMig ? 132 : 108)} y={y + 15} size={10} ink={isMig ? "accent" : "line"}>{w.why}</Text>
              </>
            ) : (
              <Text x={w.at + 10} y={y + 15} size={10} ink="line">{w.why}</Text>
            )}
          </g>
        );
      })}

      {/* after the commit: the migration takes its lock briefly, then the reads run */}
      <Rect x={commit} y={lane(1)} w={10} h={h} tone="accent" ink="accent" />
      <Text x={commit + 18} y={lane(1) + 15} size={10} ink="line">runs in a millisecond</Text>
      {[2, 3, 4].map((i) => (
        <Rect key={i} x={commit + 10} y={lane(i)} w={18} h={h} tone="shade" ink="ink" />
      ))}
      <Text x={commit + 36} y={lane(2) + 15} size={10} ink="line">then the line</Text>
      <Text x={commit + 36} y={lane(3) + 15} size={10} ink="line">drains</Text>

      {/* time axis and key */}
      <Path d={`M${t0},252 L600,252`} ink="line" arrow fig={id} />
      <Text x={600} y={268} caps size={10} ink="line" anchor="end">time</Text>
      <Rect x={t0} y={262} w={16} h={10} tone="shade" ink="ink" />
      <Text x={t0 + 22} y={271} size={10} ink="line">granted</Text>
      <Rect x={t0 + 84} y={262} w={16} h={10} tone="paper" ink="line" dashed />
      <Text x={t0 + 106} y={271} size={10} ink="line">waiting</Text>
    </Figure>
  );
}
