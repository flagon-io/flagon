"use client";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useRef, type ComponentProps } from "react";
import { cn } from "../lib/cn";
import { buttonClasses } from "./button";

/** A modal that interrupts for a confirm/cancel decision (focus-trapped). */
export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export function AlertDialogContent({
  className,
  dismissible = false,
  children,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Content> & {
  /**
   * By design an alert dialog does NOT close on a backdrop click - it forces a
   * deliberate choice. Set `dismissible` to let a click on the overlay cancel it.
   * (Radix requires the Cancel inside Content, so the backdrop button forwards
   * its click to a hidden Cancel; Escape closes it as usual.)
   */
  dismissible?: boolean;
}) {
  const overlayClass = "fixed inset-0 z-50 bg-black/50";
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialogPrimitive.Portal>
      {dismissible ? (
        // A decorative backdrop (Radix marks Content's siblings aria-hidden, so
        // Escape stays the accessible dismiss path); a click forwards to Cancel.
        <button
          type="button"
          tabIndex={-1}
          data-slot="alert-dialog-overlay"
          onClick={() => cancelRef.current?.click()}
          className={cn(overlayClass, "pointer-events-auto cursor-default")}
        />
      ) : (
        <AlertDialogPrimitive.Overlay data-slot="alert-dialog-overlay" className={overlayClass} />
      )}
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-hairline bg-card p-6 shadow-xl outline-none",
          className,
        )}
        {...props}
      >
        {children}
        {dismissible && (
          <AlertDialogPrimitive.Cancel ref={cancelRef} aria-hidden tabIndex={-1} className="sr-only" />
        )}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("space-y-1.5", className)} {...props} />;
}
export function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
export function AlertDialogTitle({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title className={cn("text-lg font-semibold text-foreground", className)} {...props} />;
}
export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function AlertDialogAction({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return <AlertDialogPrimitive.Action className={cn(buttonClasses(), className)} {...props} />;
}
export function AlertDialogCancel({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return <AlertDialogPrimitive.Cancel className={cn(buttonClasses({ variant: "outline" }), className)} {...props} />;
}
