"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Pipette } from "lucide-react";
import { cn } from "../lib/cn";
import { controlHeight, focusRing, focusWithinRing, type ControlSize } from "../lib/control";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { clamp, hexToRgb, hsvToRgb, normalizeHex, rgbToHex, rgbToHsv, type HSV } from "../lib/color";

// --- component ------------------------------------------------------------

export type ColorInputProps = {
  /** Current color as a hex string (#rrggbb). */
  value: string;
  onChange: (hex: string) => void;
  /** Swatch-only trigger (no inline hex field). */
  compact?: boolean;
  size?: ControlSize;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * A color field: a swatch + free-typed hex, opening a full HSV picker (drag the
 * saturation/value area and the hue bar, type any hex, or use the eyedropper
 * where the browser supports it). Radix and shadcn don't ship one - this is ours.
 */
export function ColorInput({
  value,
  onChange,
  compact,
  size = "md",
  disabled,
  className,
  "aria-label": ariaLabel,
}: ColorInputProps) {
  const hex = normalizeHex(value) ?? "#000000";
  const [text, setText] = useState(hex);

  const swatch = (
    <span
      className="block size-5 shrink-0 rounded ring-1 ring-inset ring-hairline"
      style={{ background: hex }}
    />
  );

  return (
    <Popover>
      {compact ? (
        <PopoverTrigger
          data-slot="color-input"
          aria-label={ariaLabel ?? "Pick a color"}
          disabled={disabled}
          className={cn(
            "block size-8 rounded-md ring-1 ring-inset ring-hairline transition disabled:opacity-50",
            focusRing,
            className,
          )}
          style={{ background: hex }}
        />
      ) : (
        <div
          data-slot="color-input"
          className={cn(
            controlHeight[size],
            "flex items-center gap-2 rounded-md border border-input bg-background pr-2 pl-2 text-sm",
            focusWithinRing,
            disabled && "opacity-50",
            className,
          )}
        >
          <PopoverTrigger
            aria-label="Open color picker"
            disabled={disabled}
            className={cn("rounded", focusRing)}
          >
            {swatch}
          </PopoverTrigger>
          <input
            value={text}
            disabled={disabled}
            data-hex="1"
            spellCheck={false}
            aria-label={ariaLabel ?? "Hex color"}
            onChange={(e) => {
              setText(e.target.value);
              const n = normalizeHex(e.target.value);
              if (n) onChange(n);
            }}
            onBlur={() => setText(hex)}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-foreground uppercase outline-none"
          />
        </div>
      )}
      <PopoverContent align="start" className="w-60 p-3">
        <ColorPicker
          value={hex}
          onChange={(h) => {
            setText(h);
            onChange(h);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

const PRESETS = [
  "#0d9488", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f59e0b", "#22c55e", "#14b8a6", "#000000", "#71717a", "#ffffff",
];

/** The picker surface: SV area, hue slider, hex input, eyedropper, presets. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const hsv = rgbToHsv(hexToRgb(value));
  const [text, setText] = useState(value);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  const emit = useCallback(
    (next: HSV) => {
      const hex = rgbToHex(hsvToRgb(next));
      setText(hex);
      onChange(hex);
    },
    [onChange],
  );

  function onSvPointer(e: ReactPointerEvent<HTMLDivElement>) {
    const el = svRef.current;
    if (!el || (e.buttons & 1) === 0) return;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const s = clamp((e.clientX - rect.left) / rect.width);
    const v = clamp(1 - (e.clientY - rect.top) / rect.height);
    emit({ ...hsv, s, v });
  }
  function onHuePointer(e: ReactPointerEvent<HTMLDivElement>) {
    const el = hueRef.current;
    if (!el || (e.buttons & 1) === 0) return;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    emit({ ...hsv, h: clamp((e.clientX - rect.left) / rect.width) * 360 });
  }

  async function eyedrop() {
    const EyeDropper = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } })
      .EyeDropper;
    if (!EyeDropper) return;
    try {
      const { sRGBHex } = await new EyeDropper().open();
      const n = normalizeHex(sRGBHex);
      if (n) {
        setText(n);
        onChange(n);
      }
    } catch {
      /* cancelled */
    }
  }

  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

  return (
    <div data-slot="color-picker" className="space-y-3">
      <div
        ref={svRef}
        onPointerDown={onSvPointer}
        onPointerMove={onSvPointer}
        className="relative h-32 w-full cursor-crosshair rounded-md"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
        }}
      >
        <span
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/30"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }}
        />
      </div>

      <div
        ref={hueRef}
        onPointerDown={onHuePointer}
        onPointerMove={onHuePointer}
        className="relative h-3 w-full cursor-pointer rounded-full"
        style={{
          background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/30"
          style={{ left: `${(hsv.h / 360) * 100}%`, background: hueColor }}
        />
      </div>

      <div className="flex items-center gap-2">
        {hasEyeDropper && (
          <button
            type="button"
            onClick={eyedrop}
            aria-label="Pick from screen"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:text-foreground",
              focusRing,
            )}
          >
            <Pipette className="size-4" />
          </button>
        )}
        <input
          value={text}
          spellCheck={false}
          aria-label="Hex color"
          onChange={(e) => {
            setText(e.target.value);
            const n = normalizeHex(e.target.value);
            if (n) onChange(n);
          }}
          onBlur={() => setText(value)}
          className={cn(
            controlHeight.sm,
            "min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground uppercase",
            focusRing,
          )}
        />
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        {PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            onClick={() => {
              setText(c);
              onChange(c);
            }}
            className={cn("size-6 rounded ring-1 ring-inset ring-hairline transition", focusRing)}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}
