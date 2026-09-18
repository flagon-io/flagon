"use client";

import { useSyncExternalStore } from "react";
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@flagon-io/ui";

// Same store the topbar ThemeToggle uses (shared key + event), so both stay in
// sync: light/dark/system, applied via the `.dark` class on <html>.
type Theme = "light" | "dark" | "system";
const KEY = "flagon-theme";
const EVENT = "flagon:themechange";

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function applyClass(pref: Theme) {
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}
function subscribe(onChange: () => void) {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    applyClass((localStorage.getItem(KEY) as Theme) || "system");
    onChange();
  };
  mql.addEventListener("change", onMedia);
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    mql.removeEventListener("change", onMedia);
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
const getSnapshot = (): Theme => {
  try {
    return (localStorage.getItem(KEY) as Theme) || "system";
  } catch {
    return "system";
  }
};
const getServerSnapshot = (): Theme => "system";

const OPTIONS: { value: Theme; label: string; hint: string; icon: LucideIcon }[] = [
  { value: "system", label: "System", hint: "Match your device", icon: Monitor },
  { value: "light", label: "Light", hint: "Always light", icon: Sun },
  { value: "dark", label: "Dark", hint: "Always dark", icon: Moon },
];

export function AppearanceForm() {
  const pref = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function choose(next: Theme) {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    applyClass(next);
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {OPTIONS.map(({ value, label, hint, icon: Icon }) => {
        const active = pref === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => choose(value)}
            aria-pressed={active}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
              active
                ? "border-brand bg-brand/5"
                : "border-hairline hover:border-muted-foreground/30 hover:bg-panel",
            )}
          >
            <Icon className={cn("mt-0.5 size-5 shrink-0", active ? "text-brand-bright" : "text-muted-foreground")} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                {label}
                {active && <Check className="size-3.5 text-brand" />}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
