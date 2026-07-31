"use client";

import { useMemo, useState } from "react";
import { SegmentedControl, Switch } from "@flagon/design";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import { BarStack } from "@visx/shape";
import { useTooltip, useTooltipInPortal } from "@visx/tooltip";
import type { UsageSeries } from "@/lib/flags-api";
import { MAX_SERIES, OTHER_COLOR, OTHER_KEY, seriesColor } from "./colors";
import { compact, usd, usdTick } from "./format";

type Interval = "day" | "week" | "month";
type Metric = "usage" | "cost";

type ChartSeries = {
  key: string;
  label: string;
  color: string;
  unit: string;
  values: number[];
};
type Bucket = { key: string; label: string; full: string };
// The x-field is namespaced so it can never collide with a series key (a flag
// could legitimately be keyed "key").
type BucketDatum = { __bucket: string } & Record<string, number | string>;

const MARGIN = { top: 8, right: 8, bottom: 28, left: 48 };
const HEIGHT = 300;

/**
 * The Consumption Breakdown: a stacked bar chart over time, one stack per series
 * (meter, or a flag/env/reason slice), with Daily/Weekly/Monthly rebucketing and
 * a cumulative toggle — all client-side over the daily points, so the controls
 * are instant. A Usage/Cost switch flips the y-axis between raw volume (checks are
 * free but real) and dollars (the billing view; ~$0 until the Events meter flows).
 */
export function ConsumptionBreakdown({
  periods,
  series,
}: {
  periods: string[];
  series: UsageSeries[];
}) {
  const [metric, setMetric] = useState<Metric>("usage");
  const [interval, setInterval] = useState<Interval>("day");
  const [cumulative, setCumulative] = useState(false);

  const { buckets, chartSeries, max } = useMemo(
    () => build(periods, series, interval, cumulative, metric),
    [periods, series, interval, cumulative, metric],
  );

  const hasData = max > 0;

  return (
    <section className="rounded-xl border border-white/10 bg-white/2">
      <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">
          Consumption Breakdown
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            ariaLabel="Metric"
            value={metric}
            onValueChange={(v) => setMetric(v as Metric)}
            options={[
              { value: "usage", label: "Usage" },
              { value: "cost", label: "Cost" },
            ]}
            size="sm"
            className="w-auto!"
          />
          <SegmentedControl
            ariaLabel="Bucket size"
            value={interval}
            onValueChange={(v) => setInterval(v as Interval)}
            options={[
              { value: "day", label: "Daily" },
              { value: "week", label: "Weekly" },
              { value: "month", label: "Monthly" },
            ]}
            size="sm"
            className="w-auto!"
          />
          <label className="ml-1 flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
            <Switch
              ariaLabel="Cumulative"
              checked={cumulative}
              onCheckedChange={setCumulative}
            />
            Cumulative
          </label>
        </div>
      </div>

      <div className="px-2 py-4">
        <div className="relative" style={{ height: HEIGHT }}>
          <ParentSize>
            {({ width }) =>
              width > 0 ? (
                <Chart
                  width={width}
                  buckets={buckets}
                  chartSeries={chartSeries}
                  max={max}
                  cumulative={cumulative}
                  metric={metric}
                />
              ) : null
            }
          </ParentSize>
          {!hasData ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-zinc-500">
                {metric === "cost"
                  ? "No billable usage in this range yet."
                  : "No usage recorded in this range yet."}
              </p>
            </div>
          ) : null}
        </div>

        {chartSeries.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 px-3">
            {chartSeries.map((s) => (
              <li
                key={s.key}
                className="flex items-center gap-1.5 text-xs text-zinc-400"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function Chart({
  width,
  buckets,
  chartSeries,
  max,
  cumulative,
  metric,
}: {
  width: number;
  buckets: Bucket[];
  chartSeries: ChartSeries[];
  max: number;
  cumulative: boolean;
  metric: Metric;
}) {
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const xScale = useMemo(
    () =>
      scaleBand<string>({
        domain: buckets.map((b) => b.key),
        range: [0, innerW],
        padding: 0.3,
      }),
    [buckets, innerW],
  );
  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, max > 0 ? max : 1],
        range: [innerH, 0],
        nice: true,
      }),
    [max, innerH],
  );

  const data = useMemo<BucketDatum[]>(
    () =>
      buckets.map((b, i) => {
        const row: BucketDatum = { __bucket: b.key };
        for (const s of chartSeries) row[s.key] = s.values[i]!;
        return row;
      }),
    [buckets, chartSeries],
  );

  const colorByKey = useMemo(
    () => new Map(chartSeries.map((s) => [s.key, s.color])),
    [chartSeries],
  );
  const keys = chartSeries.map((s) => s.key);

  // Thin the x labels to ~8 so daily/90-day ranges don't collide.
  const tickValues = useMemo(() => {
    const stride = Math.ceil(buckets.length / 8) || 1;
    return buckets.filter((_, i) => i % stride === 0).map((b) => b.key);
  }, [buckets]);

  const axisTick = (v: number) => (metric === "cost" ? usdTick(v) : compact(v));

  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<number>();
  const { containerRef, TooltipInPortal } = useTooltipInPortal({
    scroll: true,
    detectBounds: true,
  });

  const step = buckets.length > 0 ? innerW / buckets.length : 0;

  return (
    <div ref={containerRef} className="relative">
      <svg width={width} height={HEIGHT}>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows
            scale={yScale}
            width={innerW}
            numTicks={4}
            stroke="#ffffff"
            strokeOpacity={0.06}
          />
          <BarStack<BucketDatum, string>
            data={data}
            keys={keys}
            x={(d) => d.__bucket}
            xScale={xScale}
            yScale={yScale}
            color={(key) => colorByKey.get(key) ?? OTHER_COLOR}
          >
            {(barStacks) =>
              barStacks.map((barStack) =>
                barStack.bars.map((bar) =>
                  bar.height > 0 ? (
                    <rect
                      key={`${barStack.index}-${bar.index}`}
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={Math.max(1, bar.height - 1)}
                      fill={bar.color}
                      rx={2}
                    />
                  ) : null,
                ),
              )
            }
          </BarStack>

          {/* Full-height hover targets, one per column, for a breakdown tooltip. */}
          {buckets.map((b, i) => (
            <rect
              key={`hit-${b.key}`}
              x={i * step}
              y={0}
              width={step}
              height={innerH}
              fill="transparent"
              onMouseMove={() =>
                showTooltip({
                  tooltipData: i,
                  tooltipLeft: MARGIN.left + (xScale(b.key) ?? 0) + xScale.bandwidth() / 2,
                  tooltipTop: MARGIN.top + innerH * 0.15,
                })
              }
              onMouseLeave={hideTooltip}
            />
          ))}

          <AxisBottom
            top={innerH}
            scale={xScale}
            tickValues={tickValues}
            tickFormat={(key) => buckets.find((b) => b.key === key)?.label ?? ""}
            stroke="#ffffff20"
            hideTicks
            tickLabelProps={() => ({
              fill: "#898781",
              fontSize: 11,
              textAnchor: "middle",
              dy: "0.25em",
            })}
          />
          <AxisLeft
            scale={yScale}
            numTicks={4}
            tickFormat={(v) => axisTick(Number(v))}
            hideAxisLine
            hideTicks
            tickLabelProps={() => ({
              fill: "#898781",
              fontSize: 11,
              textAnchor: "end",
              dx: "-0.35em",
              dy: "0.28em",
            })}
          />
        </Group>
      </svg>

      {tooltipOpen && tooltipData !== undefined ? (
        <TooltipInPortal
          left={tooltipLeft}
          top={tooltipTop}
          className="z-50 rounded-lg border border-white/10 bg-zinc-900/95 text-zinc-100 shadow-xl backdrop-blur"
          unstyled
        >
          <TooltipBody
            bucket={buckets[tooltipData]!}
            chartSeries={chartSeries}
            index={tooltipData}
            cumulative={cumulative}
            metric={metric}
          />
        </TooltipInPortal>
      ) : null}
    </div>
  );
}

function TooltipBody({
  bucket,
  chartSeries,
  index,
  cumulative,
  metric,
}: {
  bucket: Bucket;
  chartSeries: ChartSeries[];
  index: number;
  cumulative: boolean;
  metric: Metric;
}) {
  const rows = chartSeries
    .map((s) => ({ ...s, value: s.values[index]! }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  const fmt = (v: number, unit?: string) =>
    metric === "cost" ? usd(v * 100) : `${compact(v)}${unit ? ` ${unit}s` : ""}`;

  return (
    <div className="min-w-44 rounded-lg p-3 text-xs">
      <div className="mb-2 font-medium text-zinc-300">
        {cumulative ? `Through ${bucket.full}` : bucket.full}
      </div>
      {rows.length === 0 ? (
        <div className="text-zinc-500">No usage</div>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: r.color }}
              />
              <span className="text-zinc-400">{r.label}</span>
              <span className="ml-auto font-medium tabular-nums text-zinc-200">
                {fmt(r.value, r.unit)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 font-medium text-zinc-200">
        <span>Total</span>
        <span className="tabular-nums">{fmt(total)}</span>
      </div>
    </div>
  );
}

// --- Bucketing --------------------------------------------------------------

/** The bucket a day belongs to for the chosen interval, as a YYYY-MM-DD key. */
function bucketKeyOf(day: string, interval: Interval): string {
  if (interval === "day") return day;
  if (interval === "month") return `${day.slice(0, 7)}-01`;
  // Week: snap to the Monday of that ISO week, in UTC.
  const d = new Date(`${day}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function shortLabel(key: string, interval: Interval): string {
  const d = new Date(`${key}T00:00:00Z`);
  if (interval === "month")
    return d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function fullLabel(key: string, interval: Interval): string {
  const d = new Date(`${key}T00:00:00Z`);
  if (interval === "month")
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return interval === "week" ? `Week of ${date}` : date;
}

/**
 * Fold the daily points into the chosen interval, metric, and series set:
 * rebucket by day/week/month, read either usage counts or dollar charge, cap to
 * MAX_SERIES distinct hues (rest into "Other"), apply the cumulative running sum,
 * and return chart-ready values plus the stack max for the y domain.
 */
function build(
  periods: string[],
  series: UsageSeries[],
  interval: Interval,
  cumulative: boolean,
  metric: Metric,
): { buckets: Bucket[]; chartSeries: ChartSeries[]; max: number } {
  // Ordered, deduped bucket keys from the ascending daily periods.
  const bucketKeys: string[] = [];
  const bucketIndex = new Map<string, number>();
  const dayToBucket: number[] = [];
  for (const day of periods) {
    const key = bucketKeyOf(day, interval);
    let idx = bucketIndex.get(key);
    if (idx === undefined) {
      idx = bucketKeys.length;
      bucketIndex.set(key, idx);
      bucketKeys.push(key);
    }
    dayToBucket.push(idx);
  }

  const buckets: Bucket[] = bucketKeys.map((key) => ({
    key,
    label: shortLabel(key, interval),
    full: fullLabel(key, interval),
  }));

  // Sum each series' points into buckets, in the chosen metric (dollars for cost,
  // raw counts for usage).
  const valueOf = (points: UsageSeries["points"]): number[] => {
    const arr = new Array(buckets.length).fill(0);
    points.forEach((p, i) => {
      const b = dayToBucket[i];
      if (b !== undefined) arr[b] += metric === "cost" ? p.chargeCents : p.usage;
    });
    return metric === "cost" ? arr.map((c) => c / 100) : arr;
  };

  // Keep the top MAX_SERIES by total; fold the tail into a single "Other" stack.
  const kept = series.slice(0, MAX_SERIES);
  const rest = series.slice(MAX_SERIES);

  const chartSeries: ChartSeries[] = kept.map((s, i) => ({
    key: s.key,
    label: s.label,
    color: seriesColor(i),
    unit: s.unit,
    values: valueOf(s.points),
  }));

  if (rest.length > 0) {
    const values = new Array(buckets.length).fill(0);
    for (const s of rest) {
      const v = valueOf(s.points);
      for (let i = 0; i < values.length; i++) values[i] += v[i];
    }
    chartSeries.push({
      key: OTHER_KEY,
      label: `Other (${rest.length})`,
      color: OTHER_COLOR,
      unit: rest[0]?.unit ?? "",
      values,
    });
  }

  // Drop series that are all-zero across the range so they don't clutter legend.
  const nonZero = chartSeries.filter((s) => s.values.some((v) => v > 0));
  const visible = nonZero.length > 0 ? nonZero : chartSeries;

  if (cumulative) {
    for (const s of visible) {
      let run = 0;
      s.values = s.values.map((v) => (run += v));
    }
  }

  // Stack max across buckets, for the y domain.
  let max = 0;
  for (let i = 0; i < buckets.length; i++) {
    let colTotal = 0;
    for (const s of visible) colTotal += s.values[i]!;
    if (colTotal > max) max = colTotal;
  }

  return { buckets, chartSeries: visible, max };
}
