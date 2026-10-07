import { Figure, Path, Rect, Span, Text, type FigureProps } from "../kit";

/**
 * InnoDB keeps full rows in the primary key B-tree and points secondary
 * indexes at the key; Postgres keeps rows in a heap and points every index at
 * a (page, item) address. The accent follows one lookup for account 7 through
 * the secondary index in each.
 */
export function HeapVsClustered({ id, caption }: FigureProps) {
  // InnoDB leaves: [x, w, label, accent]
  const leaves: [number, number, string, boolean][] = [
    [40, 130, "id 1..n", false],
    [190, 130, "id n+1..", true],
    [400, 130, "..100000", false],
  ];
  const root = { x: 215, y: 52, w: 160, h: 26 };
  const rootCx = root.x + root.w / 2;
  const leafY = 118;
  const leafH = 26;

  // Postgres heap pages
  const hx0 = 96;
  const hw = 84;
  const heap = ["page 0", "page 1", "...", "row's page", "...", "last page"];
  const heapY = 418;
  const target = 3;
  const tcx = hx0 + target * hw + hw / 2;

  return (
    <Figure
      id={id}
      viewBox="0 0 640 486"
      label="Two layouts. InnoDB: the table is the primary key B-tree, a root of id ranges over leaves holding full rows in id order; a secondary index entry on (account_id, email) for account 7 holds the row's primary key, so a lookup descends the primary key tree again. Postgres: a heap of pages where rows land wherever there is room, and both users_pkey and the (account_id, email) index hold a (page, item) address pointing straight at the row's heap page."
      caption={caption}
    >
      {/* ---------- InnoDB ---------- */}
      <Text x={40} y={28} caps size={12}>InnoDB: the table is the primary key B-tree</Text>

      {/* root to leaves */}
      {leaves.map(([x, w, , acc]) => (
        <Path
          key={x}
          d={`M${rootCx},${root.y + root.h} L${x + w / 2},${leafY}`}
          ink={acc ? "accent" : "line"}
          width={acc ? 1.4 : 1}
          arrow={acc}
          fig={id}
        />
      ))}
      <Path d={`M${rootCx},${root.y + root.h} L360,${leafY}`} ink="line" dashed />

      <Rect x={root.x} y={root.y} w={root.w} h={root.h} tone="shade-2" />
      <Text x={rootCx} y={root.y + 17} mono size={10} anchor="middle">root: id ranges</Text>

      {leaves.map(([x, w, label, acc]) => (
        <g key={x}>
          <Rect x={x} y={leafY} w={w} h={leafH} tone={acc ? "accent" : "shade"} ink={acc ? "accent" : "ink"} width={acc ? 1.4 : 1} />
          <Text x={x + w / 2} y={leafY + 17} mono size={10} anchor="middle" ink={acc ? "accent" : "ink"}>
            {label}
          </Text>
        </g>
      ))}
      <Rect x={335} y={leafY} w={50} h={leafH} tone="paper" ink="line" dashed />
      <Text x={360} y={leafY + 17} mono size={10} anchor="middle" ink="line">...</Text>
      <Span x1={40} x2={530} y={leafY + leafH + 8} below label="leaves: full rows, in id order" />

      {/* secondary index */}
      <Text x={40} y={196} caps size={10} ink="line">secondary index (account_id, email)</Text>
      <Rect x={40} y={204} w={200} h={26} tone="shade" />
      <Text x={140} y={221} mono size={10} anchor="middle">{"(7, email)"}</Text>
      <Rect x={240} y={204} w={78} h={26} tone="accent" ink="accent" width={1.4} />
      <Text x={279} y={221} mono size={10} anchor="middle" ink="accent">PK id</Text>

      <Path
        d={`M318,217 L590,217 L590,${root.y + root.h / 2} L${root.x + root.w},${root.y + root.h / 2}`}
        ink="accent"
        width={1.4}
        arrow
        fig={id}
      />
      <Text x={582} y={236} size={11} ink="accent" anchor="end">descend the PK tree again</Text>

      {/* divider */}
      <Path d="M40,262 L600,262" ink="faint" />

      {/* ---------- Postgres ---------- */}
      <Text x={40} y={294} caps size={12}>Postgres: a heap, plus indexes that point into it</Text>

      <Text x={40} y={324} mono size={10} ink="line">users_pkey</Text>
      <Rect x={40} y={332} w={70} h={26} tone="shade" />
      <Text x={75} y={349} mono size={10} anchor="middle">id</Text>
      <Rect x={110} y={332} w={96} h={26} tone="shade" />
      <Text x={158} y={349} mono size={10} anchor="middle">(page, item)</Text>

      <Text x={296} y={324} mono size={10} ink="line">users_account_id_email_key</Text>
      <Rect x={296} y={332} w={208} h={26} tone="shade" />
      <Text x={400} y={349} mono size={10} anchor="middle">{"(7, email)"}</Text>
      <Rect x={504} y={332} w={96} h={26} tone="accent" ink="accent" width={1.4} />
      <Text x={552} y={349} mono size={10} anchor="middle" ink="accent">(page, item)</Text>

      <Path d={`M158,358 C158,392 ${tcx - 14},384 ${tcx - 14},${heapY}`} ink="line" arrow fig={id} />
      <Path d={`M552,358 C552,392 ${tcx + 14},384 ${tcx + 14},${heapY}`} ink="accent" width={1.4} arrow fig={id} />

      <Text x={40} y={heapY + 17} caps size={11}>heap</Text>
      {heap.map((label, i) => {
        const acc = i === target;
        const dots = label === "...";
        return (
          <g key={i}>
            <Rect
              x={hx0 + i * hw}
              y={heapY}
              w={hw}
              h={26}
              tone={acc ? "accent" : dots ? "paper" : "shade"}
              ink={acc ? "accent" : "ink"}
              width={acc ? 1.4 : 1}
            />
            <Text x={hx0 + i * hw + hw / 2} y={heapY + 17} mono size={10} anchor="middle" ink={acc ? "accent" : dots ? "line" : "ink"}>
              {label}
            </Text>
          </g>
        );
      })}
      <Text x={hx0} y={heapY + 46} size={11} ink="line">rows land wherever there is room; no order kept</Text>
    </Figure>
  );
}
