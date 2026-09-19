"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Pipette } from "lucide-react";
import { cn } from "../lib/cn";
import { controlHeight, type ControlSize } from "../lib/control";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

// --- color math -----------------------------------------------------------

type RGB = { r: number; g: number; b: number };
type HSV = { h: number; s: number; v: number };

function clamp(n: number, lo = 0, hi = 1) {
  return Math.min(hi, Math.max(lo, n));
}
function normalizeHex(input: string): string | null {
  let h = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return `#${h.toLowerCase()}`;
}
function hexToRgb(hex: string): RGB {
  const h = (normalizeHex(hex) ?? "#000000").slice(1);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function rgbToHex({ r, g, b }: RGB): string {
  const to = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
function rgbToHsv({ r, g, b }: RGB): HSV {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

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
      className="block size-5 shrink-0 rounded ring-1 ring-inset ring-black/15"
      style={{ background: hex }}
    />
  );

  return (
    <Popover>
      {compact ? (
        <PopoverTrigger
          aria-label={ariaLabel ?? "Pick a color"}
          disabled={disabled}
          className={cn(
            "block size-8 rounded-md ring-1 ring-inset ring-hairline outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            className,
          )}
          style={{ background: hex }}
        />
      ) : (
        <div
          className={cn(
            controlHeight[size],
            "flex items-center gap-2 rounded-md border border-input bg-background pr-2 pl-2 text-sm",
            "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
            disabled && "opacity-50",
            className,
          )}
        >
          <PopoverTrigger
            aria-label="Open color picker"
            disabled={disabled}
            className="rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    <div className="space-y-3">
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
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
            "min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-sm text-foreground uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
            className="size-6 rounded ring-1 ring-inset ring-black/15 outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}
