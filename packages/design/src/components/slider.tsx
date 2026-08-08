"use client";

import { useCallback, useId, useRef, useState } from "react";
import { cn } from "../cn";

/**
 * A STEPPED slider over a fixed set of discrete steps (not a continuous range) — built
 * for choices like a check's frequency, where the values are a ladder (10s, 1min, 5min…)
 * and some rungs are gated (rendered disabled with a small `badge` beneath). Drag the
 * thumb, click a tick, or focus + arrow-key it; a floating bubble shows the live value.
 * Understated but lively: a gradient teal fill with a soft glow, a thumb that lifts on
 * interaction, and ticks that fill as you pass them. Disabled steps are skipped.
 */
export type SliderStep = {
  value: string;
  /** The tick label (kept short so ticks don't collide), e.g. "5 min". */
  label: string;
  /** A small line beneath the label, e.g. a plan/roadmap gate ("Soon"). */
  badge?: string;
  /** A disabled step is shown muted and cannot be selected. */
  disabled?: boolean;
};

export function Slider({
  steps,
  value,
  onValueChange,
  ariaLabel,
  className,
}: {
  steps: SliderStep[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const id = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const n = steps.length;
  const current = Math.max(
    0,
    steps.findIndex((s) => s.value === value),
  );
  const pct = n > 1 ? (current / (n - 1)) * 100 : 0;

  const selectIndex = useCallback(
    (target: number) => {
      // Snap to the nearest ENABLED step, searching outward from `target`.
      for (let d = 0; d < n; d++) {
        const up = target + d;
        const down = target - d;
        if (up < n && !steps[up]!.disabled)
          return onValueChange(steps[up]!.value);
        if (down >= 0 && !steps[down]!.disabled)
          return onValueChange(steps[down]!.value);
      }
    },
    [n, steps, onValueChange],
  );

  const indexFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return current;
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      return Math.round(ratio * (n - 1));
    },
    [current, n],
  );

  function step(dir: 1 | -1) {
    selectIndex(current + dir);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      selectIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      selectIndex(n - 1);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    selectIndex(indexFromClientX(e.clientX));
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    selectIndex(indexFromClientX(e.clientX));
  }
  function endDrag(e: React.PointerEvent) {
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  const posStyle = (i: number): React.CSSProperties => {
    const left = n > 1 ? (i / (n - 1)) * 100 : 0;
    const transform =
      i === 0 ? "none" : i === n - 1 ? "translateX(-100%)" : "translateX(-50%)";
    return { left: `${left}%`, transform };
  };
  const centered = (i: number): React.CSSProperties => ({
    left: `${n > 1 ? (i / (n - 1)) * 100 : 0}%`,
    transform: "translate(-50%, -50%)",
  });

  return (
    <div className={cn("pt-9 w-full select-none", className)}>
      {/* interaction surface (track + ticks + thumb); tall for an easy grab target */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={current}
        aria-valuetext={steps[current]?.label}
        aria-describedby={id}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="h-7 rounded focus-visible:ring-teal-500/30 relative cursor-pointer touch-none outline-none focus-visible:ring-2"
      >
        {/* floating value bubble above the thumb (tracks position instantly) */}
        <div
          className="-top-8 rounded-md bg-teal-500 px-2 py-0.5 text-xs font-semibold text-zinc-950 shadow-sm pointer-events-none absolute z-10 -translate-x-1/2"
          style={{ left: `${pct}%` }}
        >
          {steps[current]?.label}
          <span className="size-2 bg-teal-500 absolute top-full left-1/2 -mt-px -translate-x-1/2 rotate-45" />
        </div>

        {/* track */}
        <div className="left-0 h-2 bg-white/8 absolute top-1/2 w-full -translate-y-1/2 rounded-full" />
        {/* fill — position is instant (no transition on width) so drag tracks the pointer */}
        <div
          className="h-2 bg-teal-500 absolute top-1/2 -translate-y-1/2 rounded-full"
          style={{ width: `${pct}%` }}
        />

        {/* ticks — only color/scale transition, never position */}
        {steps.map((s, i) => (
          <button
            key={s.value}
            type="button"
            aria-hidden
            tabIndex={-1}
            disabled={s.disabled}
            onClick={() => !s.disabled && onValueChange(s.value)}
            style={centered(i)}
            className={cn(
              "size-2.5 absolute top-1/2 rounded-full border transition-colors",
              s.disabled
                ? "border-white/10 bg-white/10 cursor-not-allowed"
                : i <= current
                  ? "border-teal-300 bg-teal-400"
                  : "border-white/20 bg-zinc-800 hover:border-teal-400/70",
            )}
          />
        ))}

        {/* thumb — `left` is instant; only the interaction state (scale/ring) transitions */}
        <div
          aria-hidden
          className={cn(
            "size-5 border-teal-200 bg-teal-400 shadow-sm ring-teal-500/0 pointer-events-none absolute top-1/2 grid -translate-1/2 -translate-y-1/2 place-items-center rounded-full border-2 ring-4 transition-[transform,box-shadow] duration-100",
            dragging ? "ring-teal-500/15 scale-110" : "hover:ring-teal-500/10",
          )}
          style={{ left: `${pct}%` }}
        >
          <span className="size-1.5 bg-teal-900/70 rounded-full" />
        </div>
      </div>

      {/* labels + badges */}
      <div id={id} className="mx-1 mt-3 h-8 relative">
        {steps.map((s, i) => (
          <div
            key={s.value}
            style={posStyle(i)}
            className={cn(
              "top-0 gap-0.5 absolute flex flex-col items-center text-center transition-colors",
              s.disabled
                ? "text-zinc-600"
                : i === current
                  ? "font-semibold text-teal-300"
                  : "text-zinc-500",
            )}
          >
            <span className="text-[10px] leading-none whitespace-nowrap">
              {s.label}
            </span>
            {s.badge ? (
              <span className="rounded bg-white/5 px-1 py-0.5 font-semibold tracking-wide text-zinc-400 text-[8px] uppercase">
                {s.badge}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
