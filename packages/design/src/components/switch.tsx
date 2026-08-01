"use client";

import { Switch as S } from "radix-ui";
import { cn } from "../cn";

/**
 * An accessible on/off switch built on Radix. Use this for boolean toggles
 * instead of hand-rolling a pill + knob — the thumb slides cleanly, keyboard and
 * screen-reader behavior come for free, and every switch looks identical.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  ariaLabel,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <S.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "h-6 w-11 relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors outline-none",
        "data-[state=checked]:bg-teal-500 data-[state=unchecked]:bg-white/15",
        "focus-visible:ring-teal-500/40 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <S.Thumb className="h-5 w-5 translate-x-0.5 bg-white shadow-sm data-[state=checked]:translate-x-5.5 pointer-events-none block rounded-full transition-transform will-change-transform" />
    </S.Root>
  );
}
