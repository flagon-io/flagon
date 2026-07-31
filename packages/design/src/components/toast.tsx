"use client";

import { useSyncExternalStore } from "react";

/**
 * Toasts: transient, non-blocking feedback (errors especially). Self-contained —
 * a tiny module-level store (no context wiring needed) + a `<Toaster />` mounted
 * once per app, and a `toast` API callable from anywhere (client components,
 * event handlers, catch blocks).
 *
 *   import { Toaster, toast } from "@flagon/design";
 *   // once, in the root layout:  <Toaster />
 *   // anywhere:                  toast.error("Couldn't sign in", err.message)
 */
export type ToastTone = "error" | "success" | "info";
export type ToastItem = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

const EMPTY: ToastItem[] = [];
let items: ToastItem[] = EMPTY;
let counter = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}
function push(tone: ToastTone, title: string, description?: string) {
  const id = ++counter;
  items = [...items, { id, tone, title, description }];
  emit();
  // Auto-dismiss; errors linger a little longer so they can be read.
  setTimeout(() => dismiss(id), tone === "error" ? 8000 : 5000);
  return id;
}

export const toast = {
  error: (title: string, description?: string) =>
    push("error", title, description),
  success: (title: string, description?: string) =>
    push("success", title, description),
  info: (title: string, description?: string) =>
    push("info", title, description),
  dismiss,
};

const TONE_STYLES: Record<ToastTone, string> = {
  error: "border-red-500/30 bg-red-500/10 text-red-200",
  success: "border-teal-500/30 bg-teal-500/10 text-teal-100",
  info: "border-white/15 bg-white/5 text-zinc-100",
};

/** Mount once, near the root, so `toast.*` calls render. */
export function Toaster() {
  const list = useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY,
  );

  return (
    <div className="bottom-4 right-4 max-w-sm gap-2 pointer-events-none fixed z-100 flex w-full flex-col">
      {list.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={`gap-3 rounded-lg px-4 py-3 shadow-lg backdrop-blur pointer-events-auto flex items-start border ${TONE_STYLES[t.tone]}`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t.title}</p>
            {t.description ? (
              <p className="mt-0.5 text-xs opacity-80">{t.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="rounded p-0.5 shrink-0 text-current/60 transition-colors hover:text-current"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
