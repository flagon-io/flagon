"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { RadioGroup, RadioGroupItem, cn } from "@flagon-io/ui";

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
    <RadioGroup
      value={pref}
      onValueChange={(v) => choose(v as Theme)}
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {OPTIONS.map(({ value, label, hint, icon: Icon }) => {
        const active = pref === value;
        return (
          <label
            key={value}
            htmlFor={`theme-${value}`}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
              active
                ? "border-brand bg-brand/5"
                : "border-hairline hover:border-muted-foreground/30 hover:bg-panel",
            )}
          >
            <RadioGroupItem id={`theme-${value}`} value={value} className="mt-0.5" />
            <Icon className={cn("mt-0.5 size-5 shrink-0", active ? "text-brand-bright" : "text-muted-foreground")} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
