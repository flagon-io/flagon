"use client";

import { Select as S } from "radix-ui";

/**
 * A styled, accessible select built on Radix. Replaces the native <select> so
 * the menu matches the rest of the dark UI and is keyboard/screen-reader sound.
 * Simple value/options API for the common case; the Radix parts stay internal.
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
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger
        aria-label={ariaLabel}
        className={[
          "flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors",
          "focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20",
          "disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-zinc-500",
          className ?? "",
        ].join(" ")}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon className="text-zinc-500">
          <ChevronDown />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-white/10 bg-zinc-900/95 shadow-xl backdrop-blur"
        >
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer items-center rounded-md py-2 pr-8 pl-3 text-sm text-zinc-200 outline-none select-none data-[highlighted]:bg-white/5 data-[highlighted]:text-zinc-100 data-[state=checked]:text-teal-300"
              >
                <S.ItemText>{o.label}</S.ItemText>
                <S.ItemIndicator className="absolute right-2.5 text-teal-400">
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
