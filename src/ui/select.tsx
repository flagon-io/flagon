"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

/**
 * Select (Radix Select underneath: keyboard navigation, typeahead, a11y).
 * The dropdown panel is ours, so it matches the theme instead of the OS
 * native popup. Controlled: pass value + onValueChange.
 */
export type SelectOption = { value: string; label: string };

export function Select({
  id,
  value,
  onValueChange,
  placeholder = "Select...",
  options,
  disabled,
  className = "",
}: {
  id?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  options: readonly SelectOption[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={`mt-1 flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/4 px-3 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-teal-500/60 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-zinc-600 ${className}`}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 text-zinc-500" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-white/10 bg-[#111113] shadow-xl shadow-black/40"
        >
          <SelectPrimitive.Viewport className="max-h-72 p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-md px-3 py-1.5 text-sm text-zinc-300 outline-none transition data-[highlighted]:bg-white/5 data-[highlighted]:text-zinc-100"
              >
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="h-3.5 w-3.5 text-teal-400" aria-hidden />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
