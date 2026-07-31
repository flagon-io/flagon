"use client";

import type { ComponentPropsWithoutRef } from "react";
import { DropdownMenu as DM } from "radix-ui";

/**
 * Styled dropdown-menu primitives built on Radix. Composable like Radix itself
 * (Menu / MenuTrigger / MenuContent / MenuItem / ...), so callers keep full
 * control of triggers and items while getting the shared dark styling, focus
 * management, and keyboard/aria behavior for free.
 *
 * Use `asChild` on MenuTrigger/MenuItem to render a custom element (e.g. a
 * button trigger, or a Next <Link> item).
 */
/**
 * Non-modal by default (unlike Radix's `modal: true` default for DropdownMenu).
 * Modal menus lock body scroll and pad the body to compensate for the removed
 * scrollbar, which visibly shifts sticky/full-width headers when the menu opens.
 * A dropdown does not need that trap; callers can still pass `modal` to opt in.
 */
export function Menu({
  modal = false,
  ...props
}: ComponentPropsWithoutRef<typeof DM.Root>) {
  return <DM.Root modal={modal} {...props} />;
}
export const MenuTrigger = DM.Trigger;

function cn(...parts: (string | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function MenuContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "min-w-56 rounded-lg border-white/10 bg-zinc-900/95 py-1 shadow-xl backdrop-blur z-50 overflow-hidden border",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

export function MenuItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DM.Item>) {
  return (
    <DM.Item
      className={cn(
        "gap-2 px-3 py-2 text-sm text-zinc-300 data-highlighted:bg-white/5 data-highlighted:text-zinc-100 flex cursor-pointer items-center outline-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DM.Separator>) {
  return (
    <DM.Separator className={cn("my-1 bg-white/8 h-px", className)} {...props} />
  );
}

export function MenuLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DM.Label>) {
  return (
    <DM.Label
      className={cn("px-3 py-2 text-xs text-zinc-500", className)}
      {...props}
    />
  );
}
