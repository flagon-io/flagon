"use client";

/**
 * A segmented control (single-select toggle group). Deliberately UNDERSTATED:
 * the selected segment lifts on a soft translucent surface rather than a stark
 * fill, so it reads as a control, not a call to action. Use it for small,
 * mutually-exclusive choices like a value type.
 *
 * Sizing matches the rest of the system so it lines up in a row of controls:
 * `md` (default) is the standard 40px height — the same as Select and the default
 * Button — and `sm` (32px) is for genuinely dense, inline contexts. The segments
 * stretch to fill that fixed height, so the buttons never set it themselves.
 */
export type SegmentedOption = { value: string; label: string };
export type SegmentedSize = "md" | "sm";

const SIZES: Record<SegmentedSize, { container: string; button: string }> = {
  md: { container: "h-10", button: "text-sm" },
  sm: { container: "h-8", button: "text-xs" },
};

export function SegmentedControl({
  value,
  onValueChange,
  options,
  ariaLabel,
  size = "md",
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SegmentedOption[];
  ariaLabel?: string;
  size?: SegmentedSize;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[
        "inline-grid w-full grid-flow-col auto-cols-fr gap-1 rounded-md border border-white/10 bg-white/5 p-1",
        s.container,
        className ?? "",
      ].join(" ")}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onValueChange(o.value)}
            className={[
              "flex items-center justify-center rounded px-3 font-medium transition-colors outline-none",
              s.button,
              "focus-visible:ring-2 focus-visible:ring-teal-500/30",
              selected
                ? "bg-white/10 text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
