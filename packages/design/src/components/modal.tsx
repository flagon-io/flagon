"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * The house modal. Structure is fixed on purpose: a header and a footer, each
 * divided from the body by a FULL-WIDTH border, with the body scrolling between
 * them when content is tall. Every modal looks and behaves the same unless there
 * is an extraordinary reason — compose Modal + ModalHeader + ModalBody +
 * ModalFooter and you get it right by default.
 *
 * Closes on Escape and on overlay click. Controlled by the caller
 * (conditionally render it); `onClose` fires for both dismissals.
 */
const SIZES = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-2xl" } as const;

export function Modal({
  onClose,
  children,
  size = "lg",
  className,
}: {
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="inset-0 bg-black/60 p-4 fixed z-50 flex items-start justify-center overflow-y-auto pt-[8vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={[
          "flex max-h-[84vh] w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl",
          SIZES[size],
          className ?? "",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  description,
  onClose,
}: {
  title: string;
  description?: string;
  onClose?: () => void;
}) {
  return (
    <div className="gap-4 border-white/10 px-6 py-4 flex shrink-0 items-start justify-between border-b">
      <div>
        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
        {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1.5 -mt-1 h-8 w-8 rounded-md text-zinc-500 hover:bg-white/5 hover:text-zinc-300 grid shrink-0 place-items-center transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function ModalBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["flex-1 overflow-y-auto px-6 py-5", className ?? ""].join(" ")}>
      {children}
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div className="gap-2 border-white/10 px-6 py-4 flex shrink-0 items-center justify-end border-t">
      {children}
    </div>
  );
}
