import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** A router sends a tenant's query to one shard; a query without the key goes to all. */
export function RouteByTenant({ id, caption }: FigureProps) {
  const rx = 236;
  const rw = 124;
  const sx = 446;
  const sw = 154;
  const sh = 50;
  const sy = (i: number) => 56 + i * 64;
  const qA = sy(0) + 18; // the tenant query's line
  const qB = sy(2) + 18; // the cross-tenant query's line
  const bus = 410;
  return (
    <Figure
      id={id}
      viewBox="0 0 640 286"
      label="Queries enter a router that knows which shard holds each account_id. A query with where account_id = 42 goes to the one shard holding account 42, whose users, projects and events sit together. A query with no account_id fans out to every shard and the results are merged."
      caption={caption}
    >
      {/* router */}
      <Rect x={rx} y={sy(0)} w={rw} h={sy(2) + sh - sy(0)} tone="shade" ink="ink" width={1.4} />
      <Text x={rx + rw / 2} y={sy(1) + 18} caps size={11} anchor="middle">router</Text>
      <Text x={rx + rw / 2} y={sy(1) + 36} mono size={10} anchor="middle" ink="line">{"account_id -> shard"}</Text>

      {/* shards */}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Rect x={sx} y={sy(i)} w={sw} h={sh} tone={i === 0 ? "accent" : "paper"} ink={i === 0 ? "accent" : "ink"} width={i === 0 ? 1.4 : 1} />
          <Text x={sx + 10} y={sy(i) + 18} mono size={10.5} ink={i === 0 ? "accent" : "ink"}>{`shard ${i + 1}`}</Text>
        </g>
      ))}
      <Text x={sx + 66} y={sy(0) + 18} mono size={10} ink="accent">account 42</Text>
      <Text x={sx + 10} y={sy(0) + 38} size={10} ink="line">users, projects, events</Text>
      <Text x={sx + 10} y={sy(1) + 38} size={10} ink="line">other accounts</Text>
      <Text x={sx + 10} y={sy(2) + 38} size={10} ink="line">other accounts</Text>
      <Text x={sx + sw / 2} y={sy(2) + sh + 22} mono size={11} ink="line" anchor="middle">...</Text>

      {/* the tenant query: one shard */}
      <Text x={40} y={qA - 6} mono size={10}>where account_id = 42</Text>
      <Text x={40} y={qA + 12} size={10} ink="line">names the shard key</Text>
      <Path d={`M40,${qA} L${rx - 4},${qA}`} ink="accent" width={1.4} arrow fig={id} />
      <Path d={`M${rx + rw},${qA} L${sx - 4},${qA}`} ink="accent" width={1.4} arrow fig={id} />
      <Text x={(rx + rw + sx) / 2 - 6} y={qA - 6} size={10} ink="accent" anchor="middle">one shard</Text>

      {/* the cross-tenant query: every shard */}
      <Text x={40} y={qB - 6} mono size={10}>{"where email = '...'"}</Text>
      <Text x={40} y={qB + 12} size={10} ink="line">no shard key</Text>
      <Path d={`M40,${qB} L${rx - 4},${qB}`} ink="line" arrow fig={id} />
      <Path d={`M${rx + rw},${qB} L${bus},${qB}`} ink="line" />
      <Path d={`M${bus},${sy(0) + 38} L${bus},${sy(2) + 38}`} ink="line" />
      {[0, 1, 2].map((i) => (
        <Path key={i} d={`M${bus},${sy(i) + 38} L${sx - 4},${sy(i) + 38}`} ink="line" arrow fig={id} />
      ))}
      <Text x={rx} y={sy(2) + sh + 22} size={10} ink="line">no key: fans out to every shard, results merged</Text>
    </Figure>
  );
}
