import type { ReactNode } from "react";
import { Figure, Path, Rect, Text, type FigureProps } from "../kit";

/** A run of monospace inside a sans label. */
function M({ children }: { children: ReactNode }) {
  return <tspan fontFamily="var(--font-mono), ui-monospace, monospace">{children}</tspan>;
}

type Row = { cause: string; fix: ReactNode[] };

const YES: Row[] = [
  { cause: "stale stats?", fix: [<><M>ANALYZE</M> the table</>] },
  { cause: "skewed column?", fix: ["per-column statistics", "target"] },
  { cause: "correlated columns?", fix: [<M key="c">CREATE STATISTICS</M>] },
  { cause: "expression?", fix: ["expression stats", "or index"] },
  { cause: "redundant join key?", fix: ["rewrite the join"] },
];

const NO: Row[] = [
  { cause: "no index fits", fix: ["add the index that matches", "filter + order"] },
  { cause: "shape hides it", fix: ["flatten, make sargable,", <><M>LATERAL</M>, <M>MATERIALIZED</M></>] },
  { cause: "prices off", fix: [<><M>random_page_cost</M> etc,</>, "once, server-wide"] },
];

const LINE = 15;

/** A list of cause and fix pairs; returns the drawn rows and their height. */
function Rows({ rows, x, y, fixX }: { rows: Row[]; x: number; y: number; fixX: number }) {
  // Each row starts below the ones before it: its top is y plus their heights.
  const tops = rows.map((_, i) => y + rows.slice(0, i).reduce((h, r) => h + r.fix.length * LINE + 7, 0));
  return (
    <g>
      {rows.map((r, n) => {
        const top = tops[n];
        return (
          <g key={r.cause}>
            <Text x={x} y={top} size={11}>{r.cause}</Text>
            {r.fix.map((f, i) => (
              <Text key={i} x={fixX} y={top + i * LINE} size={11} ink="line">{f}</Text>
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** When the plan is wrong: find the node, then fix the estimate or the work. */
export function PlanDecisionPath({ id, caption }: FigureProps) {
  const cx = 320;
  const L = { x: 40, w: 270 };
  const R = { x: 330, w: 270 };
  const lc = L.x + L.w / 2;
  const rc = R.x + R.w / 2;
  const colY = 206;
  const colH = 182;

  return (
    <Figure
      id={id}
      viewBox="0 0 640 540"
      label="A decision path for a slow query. Run EXPLAIN (ANALYZE, BUFFERS) with real parameter values, then ask whether the lowest node's estimated and actual rows differ 10x or more. If yes, the estimate is wrong: stale stats, ANALYZE the table; skewed column, per-column statistics target; correlated columns, CREATE STATISTICS; expression, expression stats or index; redundant join key, rewrite the join. If no, the rows are right but the work is wrong: no index fits, add the index that matches filter and order; shape hides it, flatten, make sargable, LATERAL, MATERIALIZED; prices off, random_page_cost and the like, once, server-wide. Still wrong: set enable_* in your session to see the rejected plan's cost and compare estimate with real runtime. Emergency only: pg_hint_plan, or a setting scoped with SET LOCAL, per role or per function."
      caption={caption}
    >
      {/* slow query */}
      <Rect x={cx - 70} y={20} w={140} h={26} tone="shade" />
      <Text x={cx} y={37} size={11} anchor="middle">slow query</Text>
      <Path d={`M${cx},46 L${cx},64`} ink="line" arrow fig={id} />

      {/* explain */}
      <Rect x={cx - 170} y={66} w={340} h={42} tone="shade" />
      <Text x={cx} y={83} mono size={10} anchor="middle">EXPLAIN (ANALYZE, BUFFERS)</Text>
      <Text x={cx} y={99} size={11} ink="line" anchor="middle">with real parameter values</Text>
      <Path d={`M${cx},108 L${cx},126`} ink="line" arrow fig={id} />

      {/* the question */}
      <Rect x={cx - 210} y={128} w={420} h={30} tone="accent" ink="accent" width={1.4} />
      <Text x={cx} y={147} size={11} anchor="middle" ink="accent">
        lowest node where estimated vs actual rows differ 10x+?
      </Text>

      {/* branch */}
      <Path d={`M${cx},158 L${cx},176`} ink="line" />
      <Path d={`M${lc},176 L${rc},176`} ink="line" />
      <Path d={`M${lc},176 L${lc},${colY - 2}`} ink="line" arrow fig={id} />
      <Path d={`M${rc},176 L${rc},${colY - 2}`} ink="line" arrow fig={id} />
      <Text x={lc - 8} y={194} size={11} anchor="end" weight={600}>yes</Text>
      <Text x={rc + 8} y={194} size={11} weight={600}>no</Text>

      {/* yes: the estimate is wrong */}
      <Rect x={L.x} y={colY} w={L.w} h={colH} tone="paper" />
      <Text x={L.x + 12} y={colY + 22} size={11} weight={600}>the estimate is wrong</Text>
      <Rows rows={YES} x={L.x + 12} y={colY + 46} fixX={L.x + 130} />

      {/* no: right rows, wrong work */}
      <Rect x={R.x} y={colY} w={R.w} h={colH} tone="paper" />
      <Text x={R.x + 12} y={colY + 22} size={11} weight={600}>right rows, wrong work</Text>
      <Rows rows={NO} x={R.x + 12} y={colY + 46} fixX={R.x + 108} />

      {/* merge */}
      <Path d={`M${lc},${colY + colH} L${lc},400 L${rc},400 L${rc},${colY + colH}`} ink="line" />
      <Path d={`M${cx},400 L${cx},418`} ink="line" arrow fig={id} />

      {/* still wrong */}
      <Rect x={cx - 230} y={420} w={460} h={42} tone="shade" />
      <Text x={cx} y={437} size={11} anchor="middle">
        <tspan fontWeight={600}>still wrong?</tspan> set <M>enable_*</M> in your session to see the
      </Text>
      <Text x={cx} y={453} size={11} anchor="middle">
        rejected plan&apos;s cost; compare estimate vs real runtime
      </Text>
      <Path d={`M${cx},462 L${cx},480`} ink="line" arrow fig={id} />

      {/* emergency */}
      <Rect x={cx - 230} y={482} w={460} h={42} tone="paper" dashed />
      <Text x={cx} y={499} size={11} anchor="middle">
        <tspan fontWeight={600}>emergency only:</tspan> <M>pg_hint_plan</M>, or a setting scoped with
      </Text>
      <Text x={cx} y={515} size={11} anchor="middle">
        <M>SET LOCAL</M> / per role / per function
      </Text>
    </Figure>
  );
}
