import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** One update on page 0: the old version keeps its slot, gains an xmax and a ctid; the new version lands in slot 4. */
export function UpdateNewVersion({ id, caption }: FigureProps) {
  const x0 = 40;
  const x1 = 600;
  const rows = [
    { lp: "lp1", xmin: "869572", xmax: "869576", ctid: "(0,4)", note: "old" },
    { lp: "lp2", xmin: "869572", xmax: "0", ctid: "(0,2)", note: "" },
    { lp: "lp3", xmin: "869572", xmax: "0", ctid: "(0,3)", note: "" },
    { lp: "lp4", xmin: "869576", xmax: "0", ctid: "(0,4)", note: "current" },
  ];
  const y0 = 64;
  const gap = 44;
  const h = 30;
  const lpX = 60;
  const tX = 146;
  const cols = [
    { k: "xmin" as const, w: 120 },
    { k: "xmax" as const, w: 120 },
    { k: "ctid" as const, w: 104 },
  ];
  const tW = cols.reduce((a, c) => a + c.w, 0);
  const ctidX = tX + 240;
  const ry = (i: number) => y0 + i * gap;
  return (
    <Figure
      id={id}
      viewBox="0 0 640 262"
      label="Page 0 after one update. Line pointer 1 points at the old version: xmin 869572, xmax 869576, ctid (0,4). Line pointers 2 and 3 point at untouched rows with xmax 0. Line pointer 4 points at the new, current version: xmin 869576, xmax 0, ctid (0,4). An arrow runs from the old version's ctid to slot 4."
      caption={caption}
    >
      <Text x={x0} y={30} caps size={11}>page 0</Text>
      <Text x={x1} y={30} size={10} ink="line" anchor="end">four tuples for three rows</Text>
      <Rect x={x0} y={40} w={x1 - x0} h={210} tone="paper" ink="ink" width={1.4} />

      {/* column heads */}
      {cols.map((c, j) => {
        const cx = tX + cols.slice(0, j).reduce((a, d) => a + d.w, 0);
        return (
          <Text key={c.k} x={cx + 10} y={y0 - 8} caps size={9} ink="line">
            {c.k}
          </Text>
        );
      })}

      {rows.map((r, i) => {
        const y = ry(i);
        const on = i === 3;
        const quiet = i === 1 || i === 2;
        let cx = tX;
        return (
          <g key={r.lp}>
            <Rect x={lpX} y={y} w={52} h={h} tone={on ? "accent" : "shade"} ink={on ? "accent" : "ink"} width={on ? 1.4 : 1} />
            <Text x={lpX + 26} y={y + 19} mono size={10.5} anchor="middle" ink={on ? "accent" : "ink"}>
              {r.lp}
            </Text>
            <Path d={`M${lpX + 52},${y + h / 2} L${tX - 2},${y + h / 2}`} ink={on ? "accent" : "line"} arrow fig={id} />
            {cols.map((c) => {
              const at = cx;
              cx += c.w;
              return (
                <g key={c.k}>
                  <Rect
                    x={at}
                    y={y}
                    w={c.w}
                    h={h}
                    tone={on ? "accent" : quiet ? "paper" : "shade"}
                    ink={on ? "accent" : quiet ? "line" : "ink"}
                    width={on ? 1.4 : 1}
                  />
                  <Text x={at + 10} y={y + 19} mono size={10.5} ink={on ? "accent" : quiet ? "line" : "ink"} weight={c.k === "xmax" && i === 0 ? 600 : 400}>
                    {r[c.k]}
                  </Text>
                </g>
              );
            })}
            {r.note ? (
              <Text x={tX + tW + 40} y={y + 19} caps size={10} ink={on ? "accent" : "line"}>
                {r.note}
              </Text>
            ) : null}
          </g>
        );
      })}

      {/* the old version's ctid points at the new one */}
      <Path
        d={`M${ctidX + 104},${ry(0) + h / 2} L${ctidX + 124},${ry(0) + h / 2} L${ctidX + 124},${ry(3) + h / 2} L${ctidX + 106},${ry(3) + h / 2}`}
        ink="ink"
        width={1.2}
        arrow
        fig={id}
      />
    </Figure>
  );
}
