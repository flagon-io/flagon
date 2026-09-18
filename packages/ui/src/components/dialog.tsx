"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

// Raw primitives for composing custom-positioned dialogs (e.g. a top-anchored
// command palette). Nesting Content inside a flex Overlay centers reliably even
// under transformed ancestors, which fixed positioning does not.
export const DialogPortal = DialogPrimitive.Portal;
export const DialogOverlay = DialogPrimitive.Overlay;
export const DialogPanel = DialogPrimitive.Content;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[min(40rem,92vw)] -translate-x-1/2 -translate-y-1/2",
          "rounded-xl border border-hairline bg-popover text-popover-foreground shadow-2xl outline-none",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
