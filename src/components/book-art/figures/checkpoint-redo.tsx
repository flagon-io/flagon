import { Figure, Path, Span, Text, type FigureProps } from "../kit";

/** A checkpoint starts at its redo point and logs its record when done; recovery replays from the redo point. */
export function CheckpointRedo({ id, caption }: FigureProps) {
  const y = 76;
  const redo = 170;
  const ckpt = 380;
  const crash = 540;
  const rec = 168;
  return (
    <Figure
      id={id}
      viewBox="0 0 640 210"
      label="A WAL stream running left to right. A checkpoint starts at the redo point and writes dirty pages; later its checkpoint record is written. After a crash, recovery replays the WAL from the redo point forward to the crash; everything before the redo point is already in the data files."
      caption={caption}
    >
      <Text x={40} y={y - 10} caps size={10} ink="line">WAL stream</Text>
      <Path d={`M40,${y} L610,${y}`} ink="ink" width={1.4} arrow fig={id} />

      <Span x1={redo} x2={ckpt} y={y - 20} label="checkpoint writes dirty pages" />
      <Text x={96} y={y + 64} size={10} ink="line" anchor="middle">before the redo point:</Text>
      <Text x={96} y={y + 78} size={10} ink="line" anchor="middle">already in the data files</Text>

      {/* marks */}
      {[
        { x: redo, a: "redo point", b: "(checkpoint starts)", on: true },
        { x: ckpt, a: "checkpoint", b: "record written", on: false },
        { x: crash, a: "crash here", b: "", on: false },
      ].map((m) => (
        <g key={m.a}>
          <Path d={`M${m.x},${y - 10} L${m.x},${y + 10}`} ink={m.on ? "accent" : "ink"} width={1.6} />
          <Text x={m.x} y={y + 28} size={10.5} anchor="middle" ink={m.on ? "accent" : "ink"} weight={m.on ? 600 : 400}>{m.a}</Text>
          {m.b ? <Text x={m.x} y={y + 42} size={10} anchor="middle" ink="line">{m.b}</Text> : null}
        </g>
      ))}

      {/* recovery */}
      <Path d={`M${redo},${y + 50} L${redo},${rec}`} ink="accent" dots />
      <Path d={`M${crash},${y + 34} L${crash},${rec}`} ink="line" dots />
      <Path d={`M${redo},${rec} L${crash - 2},${rec}`} ink="accent" width={1.6} arrow fig={id} />
      <Text x={(redo + crash) / 2} y={rec + 20} size={10.5} anchor="middle" ink="accent">recovery replays from here forward</Text>
    </Figure>
  );
}
