/**
 * The architecture overview diagram, drawn as SVG so it renders crisply and
 * stays honest about the two things that touch the database: the API (product
 * data and core logic) and the console (identity/auth, via BetterAuth, direct).
 * Docs render on a dark surface only, so the palette is fixed to match.
 */
export function ArchitectureDiagram() {
  const CARD = "#0f1516";
  const STROKE = "#ffffff";
  const TITLE = "#e4e4e7"; // zinc-200
  const SUB = "#71717a"; // zinc-500
  const DIM = "#52525b"; // zinc-600
  const TEAL = "#5eead4";
  const AMBER = "#fbbf24";
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

  return (
    <figure className="not-prose my-8 overflow-x-auto">
      <svg
        viewBox="0 0 800 470"
        role="img"
        aria-label="Flagon architecture: the marketing site, product console, and your services all call the API over HTTP. The API is the control plane for product data and core logic, and it reads and writes Postgres. The console owns authentication and talks to the same Postgres directly for accounts, sessions, and organizations. One Postgres instance, per-organization row-level security."
        className="mx-auto h-auto w-full max-w-3xl min-w-[640px]"
      >
        <defs>
          <marker
            id="arch-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={SUB} />
          </marker>
          <marker
            id="arch-arrow-amber"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={AMBER} />
          </marker>
        </defs>

        {/* Client boxes */}
        {[
          { x: 16, title: "flagon.io", sub: "web + docs" },
          { x: 292, title: "your services", sub: "+ OpenFeature SDKs" },
          { x: 568, title: "app.flagon.io", sub: "product console" },
        ].map((b) => (
          <g key={b.title}>
            <rect
              x={b.x}
              y={22}
              width={216}
              height={66}
              rx={10}
              fill={CARD}
              stroke={STROKE}
              strokeOpacity={0.12}
            />
            <text
              x={b.x + 108}
              y={52}
              textAnchor="middle"
              fontFamily={mono}
              fontSize={13}
              fill={TITLE}
            >
              {b.title}
            </text>
            <text
              x={b.x + 108}
              y={72}
              textAnchor="middle"
              fontFamily={mono}
              fontSize={11}
              fill={SUB}
            >
              {b.sub}
            </text>
          </g>
        ))}

        {/* Feed lines from the three clients down to a bus, then into the API */}
        <g stroke={SUB} strokeWidth={1.5} fill="none">
          <path d="M124,88 L124,164" />
          <path d="M400,88 L400,164" />
          <path d="M636,88 L636,164" />
          <path d="M124,164 L636,164" />
          <path d="M400,164 L400,210" markerEnd="url(#arch-arrow)" />
        </g>

        {/* Feed labels */}
        <text x={132} y={124} fontFamily={mono} fontSize={11} fill={TEAL}>
          /v1
        </text>
        <text x={132} y={138} fontFamily={mono} fontSize={10} fill={DIM}>
          waitlist
        </text>
        <text x={408} y={124} fontFamily={mono} fontSize={11} fill={TEAL}>
          /ofrep/v1
        </text>
        <text x={408} y={138} fontFamily={mono} fontSize={10} fill={DIM}>
          evaluate
        </text>
        <text
          x={628}
          y={124}
          textAnchor="end"
          fontFamily={mono}
          fontSize={11}
          fill={TEAL}
        >
          /v1
        </text>
        <text
          x={628}
          y={138}
          textAnchor="end"
          fontFamily={mono}
          fontSize={10}
          fill={DIM}
        >
          product data
        </text>

        {/* API box */}
        <rect
          x={268}
          y={210}
          width={264}
          height={88}
          rx={10}
          fill={CARD}
          stroke={STROKE}
          strokeOpacity={0.18}
        />
        <text
          x={400}
          y={244}
          textAnchor="middle"
          fontFamily={mono}
          fontSize={13}
          fill={TITLE}
        >
          api.flagon.io
        </text>
        <text
          x={400}
          y={264}
          textAnchor="middle"
          fontFamily={mono}
          fontSize={11}
          fill={SUB}
        >
          control plane · Hono
        </text>
        <text
          x={400}
          y={284}
          textAnchor="middle"
          fontFamily={mono}
          fontSize={11}
          fill={TEAL}
        >
          product data & core logic
        </text>

        {/* API → Postgres */}
        <g stroke={SUB} strokeWidth={1.5} fill="none">
          <path d="M400,298 L400,372" markerEnd="url(#arch-arrow)" />
        </g>
        <text x={410} y={340} fontFamily={mono} fontSize={10} fill={SUB}>
          product data
        </text>

        {/* Postgres box */}
        <rect
          x={236}
          y={372}
          width={328}
          height={64}
          rx={10}
          fill={CARD}
          stroke={STROKE}
          strokeOpacity={0.18}
        />
        <text
          x={400}
          y={400}
          textAnchor="middle"
          fontFamily={mono}
          fontSize={13}
          fill={TITLE}
        >
          Postgres
        </text>
        <text
          x={400}
          y={420}
          textAnchor="middle"
          fontFamily={mono}
          fontSize={11}
          fill={SUB}
        >
          one instance · per-org RLS (FORCE)
        </text>

        {/* Console → Postgres direct (auth path), amber + dashed */}
        <g
          stroke={AMBER}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          fill="none"
          strokeOpacity={0.9}
        >
          <path d="M716,88 L716,404 L564,404" markerEnd="url(#arch-arrow-amber)" />
        </g>
        <text
          x={640}
          y={330}
          textAnchor="middle"
          fontFamily={mono}
          fontSize={10}
          fill={AMBER}
        >
          auth · identity
        </text>
        <text
          x={640}
          y={344}
          textAnchor="middle"
          fontFamily={mono}
          fontSize={10}
          fill={AMBER}
          fillOpacity={0.85}
        >
          BetterAuth, direct
        </text>

        {/* Legend */}
        <g fontFamily={mono} fontSize={10}>
          <line x1={236} y1={456} x2={262} y2={456} stroke={SUB} strokeWidth={1.5} />
          <text x={268} y={459} fill={SUB}>
            API traffic
          </text>
          <line
            x1={380}
            y1={456}
            x2={406}
            y2={456}
            stroke={AMBER}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
          <text x={412} y={459} fill={AMBER}>
            auth · direct to database
          </text>
        </g>
      </svg>
    </figure>
  );
}
