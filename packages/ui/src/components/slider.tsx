"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/**
 * A slider for picking a number (or a range, with multiple values). Built on the
 * Radix primitive and styled with our tokens, so it themes with the Brand.
 * Pass `value`/`defaultValue` as an array; one entry is a single thumb, two is a
 * range.
 */
export function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbs = value ?? defaultValue ?? [min, max];
  const count = Array.isArray(thumbs) ? thumbs.length : 1;
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
        "data-[orientation=vertical]:h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative grow overflow-hidden rounded-full bg-muted",
          "data-[orientation=horizontal]:h-1.5 data-[orientation=vertical]:w-1.5",
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute rounded-full bg-primary data-[orientation=vertical]:w-full data-[orientation=horizontal]:h-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: count }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          data-slot="slider-thumb"
          className={cn(
            "block size-4 shrink-0 rounded-full border-2 border-primary bg-background shadow-sm transition-[color,box-shadow]",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "hover:ring-4 hover:ring-ring/20 disabled:pointer-events-none",
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}
