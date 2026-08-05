"use client";

import { Select as S } from "radix-ui";
import { cn } from "../cn";

/**
 * A styled, accessible select built on Radix. Replaces the native <select> so
 * the menu matches the rest of the dark UI and is keyboard/screen-reader sound.
 * Simple value/options API for the common case; the Radix parts stay internal.
 *
 * SIZING: fills its container by default (`w-full`), like Input/Textarea — in a
 * stacked form or grid cell it lines up with the fields above and below. For an
 * inline/auto-width control (a filter bar, a toolbar), set `fullWidth={false}` and
 * it sizes to its content — the clean, explicit way to go inline, no width-class
 * juggling. (A `className` width still wins via tailwind-merge if you need an exact
 * size.) The selected value NEVER wraps or grows the box — a long label truncates
 * with an ellipsis and the full text stays in the dropdown.
 */
export type SelectOption = { value: string; label: string };

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled = false,
  ariaLabel,
  className,
  fullWidth = true,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Fill the container (default, like Input) or size to content for inline use. */
  fullWidth?: boolean;
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger
        aria-label={ariaLabel}
        className={cn(
          "h-10 min-w-0 gap-2 rounded-md border-white/10 bg-white/5 px-3 text-sm text-zinc-100 flex items-center justify-between border transition-colors outline-none",
          fullWidth ? "w-full" : "w-auto",
          "focus:border-teal-500/50 focus:ring-teal-500/20 focus:ring-2",
          "data-placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        <S.Value placeholder={placeholder} className="min-w-0 flex-1 truncate text-left" />
        <S.Icon className="text-zinc-500 shrink-0">
          <ChevronDown />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className="rounded-lg border-white/10 bg-zinc-900/95 shadow-xl backdrop-blur z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden border"
        >
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="rounded-md py-2 pr-8 pl-3 text-sm text-zinc-200 data-highlighted:bg-white/5 data-highlighted:text-zinc-100 data-[state=checked]:text-teal-300 relative flex cursor-pointer items-center outline-none select-none"
              >
                <S.ItemText>{o.label}</S.ItemText>
                <S.ItemIndicator className="right-2.5 text-teal-400 absolute">
                  <Check />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M13.5 4.5L6.5 11.5L3 8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
