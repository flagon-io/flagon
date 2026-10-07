import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** Two read-modify-write transactions under read committed: tx2 overwrites tx1. */
export function LostUpdate({ id, caption }: FigureProps) {
  const l1 = 250; // tx1's lane
  const l2 = 390; // tx2's lane
  const bx = 296; // the row's balance bar
  const bw = 48;
  const y = (i: number) => 92 + i * 26;
  const top = 74;
  const end = y(8) + 4;
  const dot = (x: number, yy: number, accent = false) => (
    <Rect x={x - 3} y={yy - 3} w={6} h={6} tone={accent ? "accent" : "ink"} ink={accent ? "accent" : "ink"} />
  );
  return (
    <Figure
      id={id}
      viewBox="0 0 640 344"
      label="Two lanes over time with the row's balance between them. tx1 and tx2 each read a balance of 100. tx1 updates it to 70; tx2's update to 80 waits for tx1's row lock. tx1 commits and the balance is 70, then tx2 proceeds, overwrites, and commits, and the balance ends at 80."
      caption={caption}
    >
      {/* headers */}
      <Text x={l1 - 12} y={50} mono size={11} anchor="end" weight={600}>tx1 (spend 30)</Text>
      <Text x={l2 + 12} y={50} mono size={11} weight={600}>tx2 (spend 20)</Text>
      <Text x={bx + bw / 2} y={50} caps size={10} ink="line" anchor="middle">balance</Text>

      {/* lanes */}
      <Path d={`M${l1},${top} L${l1},${y(6)}`} ink="line" />
      <Path d={`M${l2},${top} L${l2},${y(5)}`} ink="line" />
      <Path d={`M${l2},${y(5)} L${l2},${y(7)}`} ink="line" dashed />
      <Path d={`M${l2},${y(7)} L${l2},${y(8)}`} ink="line" />

      {/* the row's balance over time: 100, then 70 at tx1's commit, then 80 at tx2's */}
      <Rect x={bx} y={top} w={bw} h={y(6) - top} tone="shade" ink="ink" />
      <Text x={bx + bw / 2} y={(top + y(6)) / 2 + 4} mono size={12} anchor="middle">100</Text>
      <Rect x={bx} y={y(6)} w={bw} h={y(8) - y(6)} tone="shade" ink="ink" />
      <Text x={bx + bw / 2} y={(y(6) + y(8)) / 2 + 4} mono size={12} anchor="middle">70</Text>
      <Rect x={bx} y={y(8)} w={bw} h={end + 18 - y(8)} tone="accent" ink="accent" width={1.4} />
      <Text x={bx + bw / 2} y={y(8) + 15} mono size={12} anchor="middle" ink="accent" weight={600}>80</Text>

      {/* tx1 */}
      {dot(l1, y(0))}
      <Text x={l1 - 12} y={y(0) + 4} mono size={10} anchor="end">begin;</Text>
      {dot(l1, y(1))}
      <Text x={l1 - 12} y={y(1) + 4} mono size={10} anchor="end">{"select balance ... -> 100"}</Text>
      <Path d={`M${bx - 2},${y(1)} L${l1 + 8},${y(1)}`} ink="line" arrow fig={id} />
      {dot(l1, y(4))}
      <Text x={l1 - 12} y={y(4) + 4} mono size={10} anchor="end">update ... set balance = 70;</Text>
      {dot(l1, y(6))}
      <Text x={l1 - 12} y={y(6) + 4} mono size={10} anchor="end">commit;</Text>
      <Path d={`M${l1 + 4},${y(6)} L${bx - 2},${y(6)}`} ink="ink" arrow fig={id} />

      {/* tx2 */}
      {dot(l2, y(2))}
      <Text x={l2 + 12} y={y(2) + 4} mono size={10}>begin;</Text>
      {dot(l2, y(3))}
      <Text x={l2 + 12} y={y(3) + 4} mono size={10}>{"select balance ... -> 100"}</Text>
      <Path d={`M${bx + bw + 2},${y(3)} L${l2 - 8},${y(3)}`} ink="line" arrow fig={id} />
      {dot(l2, y(5))}
      <Text x={l2 + 12} y={y(5) + 4} mono size={10}>update ... set balance = 80;</Text>
      <Text x={l2 + 12} y={y(5) + 30} size={10} ink="line">waits for tx1&apos;s row lock</Text>
      {dot(l2, y(7))}
      <Text x={l2 + 12} y={y(7) + 4} size={10} ink="accent">proceeds, overwrites</Text>
      {dot(l2, y(8), true)}
      <Text x={l2 + 12} y={y(8) + 4} mono size={10}>commit;</Text>
      <Path d={`M${l2 - 4},${y(8)} L${bx + bw + 2},${y(8)}`} ink="accent" width={1.4} arrow fig={id} />

      {/* time */}
      <Path d={`M40,${top} L40,${end + 14}`} ink="line" arrow fig={id} />
      <Text x={48} y={end + 12} caps size={10} ink="line">time</Text>
    </Figure>
  );
}
