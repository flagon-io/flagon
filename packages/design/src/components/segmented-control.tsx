"use client";

/**
 * A segmented control (single-select toggle group). Deliberately UNDERSTATED:
 * the selected segment lifts on a soft translucent surface rather than a stark
 * fill, so it reads as a control, not a call to action. Use it for small,
 * mutually-exclusive choices like a value type.
 */
export type SegmentedOption = { value: string; label: string };

export function SegmentedControl({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SegmentedOption[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[
        "inline-grid w-full grid-flow-col auto-cols-fr gap-1 rounded-md border border-white/10 bg-white/5 p-1",
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
              "rounded px-3 py-1.5 text-sm font-medium transition-colors outline-none",
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
