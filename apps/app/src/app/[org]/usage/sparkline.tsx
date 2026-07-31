/**
 * A tiny line+area sparkline for a usage table row. Plain SVG (no chart lib, no
 * client hooks) so it renders on the server alongside the table. Matches the
 * per-row trend lines on Vercel's usage table.
 */
export function Sparkline({
  values,
  color,
  width = 96,
  height = 28,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const n = values.length;
  const max = Math.max(1, ...values);

  // A single point can't draw a line; degrade to a flat baseline.
  const xFor = (i: number) => pad + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const yFor = (v: number) => pad + h - (v / max) * h;

  const line = values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ");
  const area =
    n > 0
      ? `M${xFor(0)},${pad + h} ` +
        values.map((v, i) => `L${xFor(i)},${yFor(v)}`).join(" ") +
        ` L${xFor(n - 1)},${pad + h} Z`
      : "";

  const gradId = `spark-${color.replace("#", "")}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {area ? <path d={area} fill={`url(#${gradId})`} /> : null}
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
