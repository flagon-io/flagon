"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

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
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { side?: Side }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=closed]:opacity-0"
      />
      <DialogPrimitive.Content
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
