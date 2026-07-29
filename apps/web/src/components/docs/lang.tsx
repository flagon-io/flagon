"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/** The languages the docs offer code samples in, in display order. */
export type LangId = "typescript" | "go" | "python" | "php" | "curl";

export const LANGS: { id: LangId; label: string }[] = [
  { id: "typescript", label: "Node.js" },
  { id: "go", label: "Go" },
  { id: "python", label: "Python" },
  { id: "php", label: "PHP" },
  { id: "curl", label: "cURL" },
];

const STORAGE_KEY = "flagon-docs-lang";
const DEFAULT: LangId = "typescript";

// A tiny module-global store for the preferred language, read through
// useSyncExternalStore so it (a) shares one choice across every code block,
// (b) hydrates from localStorage without an effect or a mismatch (SSR renders
// the default, the client swaps in the stored value), and (c) syncs across tabs.
let cache: LangId | null = null;
const listeners = new Set<() => void>();

function readStored(): LangId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as LangId | null;
    return stored && LANGS.some((l) => l.id === stored) ? stored : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function emit() {
  for (const cb of listeners) cb();
}

function onStorage(e: StorageEvent) {
  if (e.key === STORAGE_KEY) {
    cache = readStored();
    emit();
  }
}

function subscribe(cb: () => void): () => void {
  if (listeners.size === 0 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function getSnapshot(): LangId {
  if (cache === null) cache = readStored();
  return cache;
}

function getServerSnapshot(): LangId {
  return DEFAULT;
}

export function useLang() {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setLang = (l: LangId) => {
    cache = l;
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // A blocked localStorage just means the choice isn't remembered.
    }
    emit();
  };
  return { lang, setLang };
}

/**
 * Passthrough wrapper so the docs layout can mark the docs subtree as
 * language-aware; the preference itself is module-global (see the store above).
 */
export function LangProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** A compact segmented control for the preferred language. */
export function LangSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/2 p-0.5">
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => setLang(l.id)}
          className={
            "rounded-md px-2.5 py-1 text-xs font-medium transition " +
            (l.id === lang
              ? "bg-teal-400/15 text-teal-300"
              : "text-zinc-400 hover:text-zinc-200")
          }
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
