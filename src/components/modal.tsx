"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./form-controls";

export function Modal({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
  size = "md",
}: {
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  size?: "sm" | "md" | "lg";
}) {
  const width =
    size === "sm" ? "max-w-md" : size === "lg" ? "max-w-2xl" : "max-w-lg";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-[121] max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-white/10 bg-[#111113] p-6 shadow-2xl shadow-black/70 outline-none ${width}`}
        >
          <div className="pr-10">
            <Dialog.Title className="text-lg font-semibold text-zinc-100">
              {title}
            </Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-1 text-sm leading-6 text-zinc-500">
                {description}
              </Dialog.Description>
            ) : null}
          </div>
          <Dialog.Close asChild>
            <Button
              variant="bare"
              size="sm"
              aria-label="Close dialog"
              className="absolute right-4 top-4 px-2"
            >
              <X className="h-4 w-4" />
            </Button>
          </Dialog.Close>
          <div className="mt-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ModalClose({ children = "Cancel" }: { children?: ReactNode }) {
  return (
    <Dialog.Close asChild>
      <Button variant="secondary">{children}</Button>
    </Dialog.Close>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-6 -mb-6 mt-6 flex items-center justify-end gap-2 rounded-b-xl border-t border-white/10 bg-black/15 px-6 py-4">
      {children}
    </div>
  );
}
