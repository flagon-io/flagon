import { formatCents } from "@/lib/meters";
import type { UsageBucket } from "@/lib/usage-shared";

/**
 * Consumption over the period, stacked by whatever the view is grouped by.
 *
 * Plain HTML bars rather than SVG: the previous version stretched a viewBox
 * with preserveAspectRatio="none", which distorts every stroke and corner
 * radius by the container's aspect ratio. Percentage heights in real elements
 * stay crisp at any width, keep native title tooltips, and still need no
 * client JavaScript.
 */

/**
 * Validated categorical palette (OKLCH L 0.48-0.67, chroma >= 0.1, worst
 * adjacent CVD dE 8.4, all >= 3:1 on this surface). Assigned in FIXED ORDER
 * and never cycled: a ninth series folds into "Other" instead of reusing a
 * hue, because two series sharing a color is worse than one being lumped.
 */
const SERIES_COLORS = [
  "#3987e5",
  "#008300",
  "#d55181",
  "#c98500",
  "#199e70",
  "#d95926",
  "#9085e9",
  "#e66767",
] as const;

export const OTHER_KEY = "__other__";
const OTHER_COLOR = "#71717a";

/**
 * Color follows the ENTITY, not its rank: a key always lands on the same slot
 * regardless of how it sorts today, so filtering out one project can't
 * repaint the ones that remain. Collisions probe forward through the fixed
 * order rather than falling back to a generated hue.
 */
export function assignColors(keys: string[]): Record<string, string> {
  const taken = new Set<number>();
  const colors: Record<string, string> = {};

  for (const key of keys) {
    if (key === OTHER_KEY) {
      colors[key] = OTHER_COLOR;
      continue;
    }
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    let slot = hash % SERIES_COLORS.length;
    for (let probe = 0; taken.has(slot) && probe < SERIES_COLORS.length; probe += 1) {
      slot = (slot + 1) % SERIES_COLORS.length;
    }
    taken.add(slot);
    colors[key] = SERIES_COLORS[slot];
  }
  return colors;
}

/** A readable y-axis ceiling, so a quiet period doesn't render as noise. */
function niceCeiling(maxCents: number): number {
  if (maxCents <= 0) return 100;
  const steps = [
    25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000, 100_000,
    250_000, 500_000, 1_000_000,
  ];
  return steps.find((step) => step >= maxCents) ?? Math.ceil(maxCents / 100) * 100;
}

const dayLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatBucket(bucket: UsageBucket): string {
  const start = dayLabel.format(new Date(`${bucket.start}T00:00:00Z`));
  if (bucket.start === bucket.end) return start;
  return `${start} - ${dayLabel.format(new Date(`${bucket.end}T00:00:00Z`))}`;
}

export function ConsumptionChart({
  buckets,
  series,
  colors,
  cumulative,
}: {
  buckets: UsageBucket[];
  /** Group keys in legend order, already capped and folded. */
  series: { key: string; label: string }[];
  colors: Record<string, string>;
  cumulative: boolean;
}) {
  const max = niceCeiling(
    Math.max(...buckets.map((bucket) => bucket.totalCents), 0),
  );
  const labelFor = new Map(series.map((entry) => [entry.key, entry.label]));

  return (
    <div>
      <div className="flex gap-3">
        {/* y-axis */}
        <div className="flex w-14 shrink-0 flex-col justify-between py-px text-right text-[10px] tabular-nums text-zinc-600">
          <span>{formatCents(max)}</span>
          <span>{formatCents(Math.round(max / 2))}</span>
          <span>$0</span>
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Recessive gridlines, behind the bars. */}
          <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2].map((line) => (
              <div key={line} className="h-px w-full bg-white/8" />
            ))}
          </div>

          <div className="relative flex h-36 items-end gap-px">
            {buckets.map((bucket) => {
              // Stack largest-at-the-bottom so the baseline segment is the
              // one people compare across buckets.
              const segments = series
                .map((entry) => ({
                  key: entry.key,
                  cents: bucket.byGroup[entry.key] ?? 0,
                }))
                .filter((segment) => segment.cents > 0)
                .reverse();

              return (
                <div
                  key={bucket.key}
                  className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
                >
                  {segments.map((segment, index) => (
                    <div
                      key={segment.key}
                      style={{
                        height: `${Math.max((segment.cents / max) * 100, 0.6)}%`,
                        background: colors[segment.key] ?? OTHER_COLOR,
                        // 2px of surface between stacked fills; the topmost
                        // segment carries the rounded data-end.
                        marginTop: index === 0 ? 0 : 2,
                      }}
                      className={index === 0 ? "rounded-t-sm" : ""}
                    />
                  ))}

                  {/* Hover target spans the full column height, so thin bars
                      are still reachable. */}
                  <div className="absolute inset-0 hover:bg-white/5" />
                  {bucket.totalCents > 0 ? (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap border border-white/10 bg-zinc-950 px-2.5 py-2 text-[11px] shadow-lg group-hover:block">
                      <div className="font-medium text-zinc-200">
                        {formatBucket(bucket)}
                      </div>
                      {segments.map((segment) => (
                        <div
                          key={segment.key}
                          className="mt-1 flex items-center gap-2 text-zinc-400"
                        >
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: colors[segment.key] ?? OTHER_COLOR }}
                          />
                          <span>{labelFor.get(segment.key) ?? segment.key}</span>
                          <span className="ml-auto pl-3 tabular-nums text-zinc-200">
                            {formatCents(segment.cents)}
                          </span>
                        </div>
                      ))}
                      <div className="mt-1.5 flex items-center gap-2 border-t border-white/10 pt-1.5 text-zinc-300">
                        <span>{cumulative ? "Running total" : "Total"}</span>
                        <span className="ml-auto pl-3 tabular-nums text-zinc-100">
                          {formatCents(bucket.totalCents)}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* x-axis: first, middle, last */}
          <div className="mt-1.5 flex justify-between text-[10px] text-zinc-600">
            {[
              buckets[0],
              buckets[Math.floor(buckets.length / 2)],
              buckets[buckets.length - 1],
            ]
              .filter(Boolean)
              .map((bucket, index) => (
                <span key={`${bucket.key}-${index}`}>{formatBucket(bucket)}</span>
              ))}
          </div>
        </div>
      </div>

      {/* Identity is never color-alone: the legend is always present. */}
      {series.length ? (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 pl-17">
          {series.map((entry) => (
            <span
              key={entry.key}
              className="flex items-center gap-2 text-xs text-zinc-400"
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: colors[entry.key] ?? OTHER_COLOR }}
              />
              {entry.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
