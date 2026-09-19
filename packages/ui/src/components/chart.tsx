"use client";

import {
  createContext,
  useContext,
  useId,
  type ComponentProps,
  type ReactNode,
} from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "../lib/cn";

/**
 * Composable, themeable charts on Recharts. Wrap a Recharts tree in
 * <ChartContainer config={...}> - the config maps each data key to a label and a
 * color (a token or hex), which is exposed as `--color-<key>` CSS variables the
 * chart primitives read, so charts follow the active Brand and light/dark.
 */
export type ChartConfig = Record<
  string,
  {
    label?: ReactNode;
    icon?: React.ComponentType;
    color?: string;
  }
>;

interface ChartContextValue {
  config: ChartConfig;
}
const ChartContext = createContext<ChartContextValue | null>(null);

function useChart() {
  const ctx = useContext(ChartContext);
  if (!ctx) throw new Error("useChart must be used within a <ChartContainer />");
  return ctx;
}

export function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: ComponentProps<"div"> & {
  config: ChartConfig;
  children: ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  const uniqueId = useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs",
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line]:stroke-hairline/60",
          "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-hairline",
          "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-panel",
          "[&_.recharts-radial-bar-background-sector]:fill-panel",
          "[&_.recharts-reference-line_line]:stroke-hairline",
          "[&_.recharts-dot[stroke='#fff']]:stroke-transparent",
          "[&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none",
          "[&_.recharts-surface]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorEntries = Object.entries(config).filter(([, c]) => c.color);
  if (!colorEntries.length) return null;
  const css = `[data-chart=${id}] {\n${colorEntries
    .map(([key, c]) => `  --color-${key}: ${c.color};`)
    .join("\n")}\n}`;
  // eslint-disable-next-line react/no-danger
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

export const ChartTooltip = RechartsPrimitive.Tooltip;

export function ChartTooltipContent({
  active,
  payload,
  label,
  labelKey,
  nameKey,
  hideLabel = false,
  hideIndicator = false,
  indicator = "dot",
  className,
}: {
  active?: boolean;
  // Recharts passes an untyped payload array; keep it loose.
  payload?: Array<Record<string, unknown>>;
  label?: ReactNode;
  labelKey?: string;
  nameKey?: string;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: "dot" | "line";
  className?: string;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        "grid min-w-32 items-start gap-1.5 rounded-lg border border-hairline bg-popover px-2.5 py-1.5 text-xs shadow-lg",
        className,
      )}
    >
      {!hideLabel && (
        <div className="font-medium text-foreground">
          {config[labelKey ?? ""]?.label ?? label}
        </div>
      )}
      <div className="grid gap-1.5">
        {payload.map((item, i) => {
          const key = String(nameKey ?? item.dataKey ?? item.name ?? i);
          const itemConfig = config[key];
          const color = (item.color as string) || `var(--color-${key})`;
          return (
            <div key={i} className="flex w-full items-center gap-2">
              {!hideIndicator && (
                <span
                  className={cn(
                    "shrink-0 rounded-[2px]",
                    indicator === "dot" ? "size-2.5" : "h-2.5 w-1",
                  )}
                  style={{ background: color }}
                />
              )}
              <span className="text-muted-foreground">{itemConfig?.label ?? item.name as ReactNode}</span>
              <span className="ml-auto font-medium tabular-nums text-foreground">
                {item.value as ReactNode}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ChartLegend = RechartsPrimitive.Legend;

export function ChartLegendContent({
  payload,
  className,
  nameKey,
}: {
  payload?: Array<Record<string, unknown>>;
  className?: string;
  nameKey?: string;
}) {
  const { config } = useChart();
  if (!payload?.length) return null;
  return (
    <div className={cn("flex items-center justify-center gap-4 pt-3", className)}>
      {payload.map((item, i) => {
        const key = String(nameKey ?? item.dataKey ?? item.value ?? i);
        const itemConfig = config[key];
        return (
          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: (item.color as string) || `var(--color-${key})` }}
            />
            {itemConfig?.label ?? (item.value as ReactNode)}
          </div>
        );
      })}
    </div>
  );
}
