"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

type Side = "left" | "right";

const sideClasses: Record<Side, string> = {
  left: "inset-y-0 left-0 border-r",
  right: "inset-y-0 right-0 border-l",
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
        className={cn(
          "fixed z-50 flex h-full w-[min(20rem,85vw)] flex-col border-hairline bg-card shadow-xl outline-none",
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
