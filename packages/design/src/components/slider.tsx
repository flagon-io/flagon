"use client";

import type { ReactNode } from "react";
import { Slider as S } from "radix-ui";
import { cn } from "../cn";

/**
 * A single-value slider built on Radix, styled to match the dark UI (like Select).
 * Emits the plain number, not Radix's array. Optional `marks` render tick labels that
 * line up with the thumb's real stops: the thumb centre travels from `THUMB_R` to
 * `width - THUMB_R`, so marks are positioned in that same inset range (not naively
 * spread), which is what keeps a label sitting exactly under its stop.
 */

/** Half the thumb width (size-4 = 16px), the track inset the thumb centre travels within. */
const THUMB_R = 8;

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  ariaLabel,
  className,
  marks,
}: {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Tick labels aligned to the thumb stops. Each label carries its own styling. */
  marks?: { value: number; label: ReactNode }[];
}) {
  const range = max - min || 1;
  return (
    <div className={className}>
      <S.Root
        className="h-5 relative flex w-full touch-none items-center select-none"
        value={[value]}
        onValueChange={(v) => onValueChange(v[0] ?? min)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      >
        <S.Track className="h-1.5 bg-white/10 relative w-full grow rounded-full">
          <S.Range className="bg-emerald-500 absolute h-full rounded-full" />
        </S.Track>
        <S.Thumb
          aria-label={ariaLabel}
          className="size-4 border-emerald-400 bg-white shadow focus-visible:ring-emerald-500/50 block rounded-full border transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-50"
        />
      </S.Root>
      {marks ? (
        <div className="mt-3 h-4 relative text-[10px]">
          {marks.map((m) => (
            <span
              key={m.value}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `calc(${THUMB_R}px + (100% - ${THUMB_R * 2}px) * ${(m.value - min) / range})` }}
            >
              {m.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
