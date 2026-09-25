"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { overlayClasses } from "../lib/overlay";

/** Sheet root (no DOM of its own). Compose Sheet > Trigger + Content. */
export const Sheet = DialogPrimitive.Root;

export function SheetTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}
export function SheetClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}
export function SheetTitle(props: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="sheet-title" {...props} />;
}
export function SheetDescription(props: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="sheet-description" {...props} />;
}

type Side = "top" | "right" | "bottom" | "left";

// Each side pins its two axes, sets which edge gets the border, and slides in
// from that edge. Left/right are vertical panels; top/bottom are horizontal.
const sideClasses: Record<Side, string> = {
  top: "inset-x-0 top-0 h-auto max-h-[85vh] w-full border-b data-[state=open]:animate-slide-in-top",
  right: "inset-y-0 right-0 h-full w-[min(22rem,85vw)] border-l data-[state=open]:animate-slide-in-right",
  bottom: "inset-x-0 bottom-0 h-auto max-h-[85vh] w-full border-t data-[state=open]:animate-slide-in-bottom",
  left: "inset-y-0 left-0 h-full w-[min(22rem,85vw)] border-r data-[state=open]:animate-slide-in-left",
};

export function SheetContent({
  className,
  children,
  side = "left",
  overlayClassName,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  side?: Side;
  /** Extra classes for this sheet's backdrop (merged over the shared overlay). */
  overlayClassName?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="sheet-overlay"
        className={cn(overlayClasses, "data-[state=closed]:opacity-0", overlayClassName)}
      />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col border-hairline bg-card shadow-xl outline-none",
          sideClasses[side],
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
