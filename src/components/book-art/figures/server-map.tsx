import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** One server: its own processes, a backend per connection, databases holding schemas holding tables. */
export function ServerMap({ id, caption }: FigureProps) {
  const sx0 = 120;
  const sx1 = 620;
  // The server's own processes, as pg_stat_activity lists them, in two rows.
  const row1: [string, number][] = [
    ["checkpointer", 92],
    ["background writer", 124],
    ["walwriter", 78],
    ["autovacuum launcher", 136],
  ];
  const row2: [string, number][] = [
    ["io worker", 72],
    ["io worker", 72],
    ["io worker", 72],
    ["logical replication launcher", 184],
  ];
  const procRow = (row: [string, number][], y: number) => {
    let x = sx0 + 16;
    return row.map(([name, w], i) => {
      const at = x;
      x += w + 8;
      return (
        <g key={i}>
          <Rect x={at} y={y} w={w} h={24} tone="shade" ink="ink" />
          <Text x={at + w / 2} y={y + 16} mono size={10} anchor="middle">
            {name}
          </Text>
        </g>
      );
    });
  };
  const conns = [168, 222, 276];
  const book = { x: 250, y: 162, w: 230, h: 180 };
  const others = ["postgres", "template0", "template1"];
  return (
    <Figure
      id={id}
      viewBox="0 0 640 360"
      label="One PostgreSQL server: its own processes (checkpointer, background writer, walwriter, autovacuum launcher, three io workers, logical replication launcher), one backend process per client connection, and four databases (book, postgres, template0, template1). The book database holds two schemas, public with events and invoices and billing with invoices. Each connection's backend works in one database."
      caption={caption}
    >
      {/* the server */}
      <Rect x={sx0} y={20} w={sx1 - sx0} h={330} tone="paper" ink="ink" width={1.4} />
      <Text x={sx0 + 16} y={40} caps size={11}>server</Text>
      <Text x={sx1 - 16} y={40} size={10} ink="line" anchor="end">one data directory, one set of processes</Text>

      {/* its own processes */}
      <Text x={sx0 + 16} y={62} caps size={10} ink="line">the server&apos;s own processes</Text>
      {procRow(row1, 70)}
      {procRow(row2, 102)}

      <Path d={`M${sx0},140 L${sx1},140`} ink="faint" />

      {/* connections and their backends */}
      <Text x={20} y={156} caps size={10} ink="line">clients</Text>
      <Text x={sx0 + 16} y={156} caps size={10} ink="line">backends</Text>
      {conns.map((y, i) => {
        const on = i === 0;
        return (
          <g key={i}>
            <Rect x={20} y={y} w={74} h={26} tone={on ? "accent" : "shade"} ink={on ? "accent" : "ink"} />
            <Text x={57} y={y + 17} size={10} anchor="middle" ink={on ? "accent" : "ink"}>
              connection
            </Text>
            <Path d={`M94,${y + 13} L${sx0 + 14},${y + 13}`} ink={on ? "accent" : "line"} width={on ? 1.4 : 1} arrow fig={id} />
            <Rect x={sx0 + 16} y={y} w={84} h={26} tone={on ? "accent" : "shade"} ink={on ? "accent" : "ink"} />
            <Text x={sx0 + 58} y={y + 17} mono size={10} anchor="middle" ink={on ? "accent" : "ink"}>
              backend
            </Text>
            <Path
              d={`M${sx0 + 100},${y + 13} L${book.x - 2},${y + 13}`}
              ink={on ? "accent" : "line"}
              width={on ? 1.4 : 1}
              arrow
              fig={id}
            />
          </g>
        );
      })}
      <Text x={sx0 + 16} y={322} size={10} ink="line">one process</Text>
      <Text x={sx0 + 16} y={336} size={10} ink="line">per connection</Text>

      {/* databases */}
      <Text x={book.x} y={156} caps size={10} ink="line">databases</Text>
      <Rect x={book.x} y={book.y} w={book.w} h={book.h} tone="shade" ink="ink" />
      <Text x={book.x + 10} y={book.y + 18} mono size={11} weight={600}>book</Text>

      {/* schema public */}
      <Rect x={book.x + 12} y={book.y + 28} w={book.w - 24} h={70} tone="paper" ink="ink" />
      <Text x={book.x + 22} y={book.y + 44} mono size={10}>public</Text>
      <Text x={book.x + book.w - 22} y={book.y + 44} caps size={9} ink="line" anchor="end">schema</Text>
      <Rect x={book.x + 22} y={book.y + 56} w={88} h={30} tone="shade-2" ink="ink" />
      <Text x={book.x + 66} y={book.y + 75} mono size={10} anchor="middle">events</Text>
      <Rect x={book.x + 118} y={book.y + 56} w={88} h={30} tone="shade-2" ink="ink" />
      <Text x={book.x + 162} y={book.y + 75} mono size={10} anchor="middle">invoices</Text>

      {/* schema billing */}
      <Rect x={book.x + 12} y={book.y + 108} w={book.w - 24} h={62} tone="paper" ink="ink" />
      <Text x={book.x + 22} y={book.y + 124} mono size={10}>billing</Text>
      <Text x={book.x + book.w - 22} y={book.y + 124} caps size={9} ink="line" anchor="end">schema</Text>
      <Rect x={book.x + 22} y={book.y + 134} w={88} h={26} tone="shade-2" ink="ink" />
      <Text x={book.x + 66} y={book.y + 151} mono size={10} anchor="middle">invoices</Text>

      {/* the other databases */}
      {others.map((name, i) => (
        <g key={name}>
          <Rect x={498} y={book.y + i * 38} w={106} h={30} tone="shade" ink="ink" />
          <Text x={508} y={book.y + i * 38 + 19} mono size={10}>{name}</Text>
        </g>
      ))}
      <Text x={498} y={292} size={10} ink="line">roles and settings:</Text>
      <Text x={498} y={306} size={10} ink="line">shared by the whole</Text>
      <Text x={498} y={320} size={10} ink="line">server</Text>
    </Figure>
  );
}
