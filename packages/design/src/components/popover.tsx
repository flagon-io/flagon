"use client";

import type { ComponentPropsWithoutRef } from "react";
import { Popover as RP } from "radix-ui";

/**
 * Styled popover primitives built on Radix. Composable like Radix itself
 * (Popover / PopoverTrigger / PopoverContent / PopoverClose), so callers keep
 * full control of the trigger and the content while getting the shared dark
 * styling, portal, and focus/aria behavior for free.
 *
 * Unlike Menu (a menu with menu-item semantics), Popover is a free-form panel:
 * use it when the content is a search field, a list, a form, etc. Use `asChild`
 * on PopoverTrigger to render a custom element (e.g. a button).
 */
export const Popover = RP.Root;
export const PopoverTrigger = RP.Trigger;
export const PopoverClose = RP.Close;
export const PopoverAnchor = RP.Anchor;

function cn(...parts: (string | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  collisionPadding = 8,
  ...props
}: ComponentPropsWithoutRef<typeof RP.Content>) {
  return (
    <RP.Portal>
      <RP.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          // Near-black to sit on the pure-black chrome (Vercel-style); the thin
          // border and shadow are what lift it off the page. collisionPadding
          // keeps a gap from the viewport edges so it never rubs the side.
          "z-50 overflow-hidden rounded-lg border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60",
          className,
        )}
        {...props}
      />
    </RP.Portal>
  );
}
