"use client";

import { useSyncExternalStore } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

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

/** Subscribe to anything that changes the stored preference or the OS setting. */
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

const OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Light / Dark / System theme switcher on Radix DropdownMenu. Defaults to System
 * (follows the OS via prefers-color-scheme). The preference is read through
 * useSyncExternalStore, so there is no setState-in-effect and no hydration
 * mismatch; Radix owns the menu's focus, keyboard, and ARIA behavior.
 */
export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function choose(next: string) {
    try {
      localStorage.setItem(KEY, next as Theme);
    } catch {}
    applyClass(next as Theme);
    window.dispatchEvent(new Event(EVENT));
  }

  const Current = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Theme: ${pref}`}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:text-foreground"
        >
          <Current className="size-4.5" strokeWidth={2} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-40 min-w-42 rounded-xl border border-hairline bg-popover p-1.5 shadow-xl shadow-black/10"
        >
          <DropdownMenu.RadioGroup value={pref} onValueChange={choose}>
            {OPTIONS.map((o) => (
              <DropdownMenu.RadioItem
                key={o.value}
                value={o.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none transition-colors data-highlighted:bg-panel data-highlighted:text-foreground",
                  pref === o.value
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <o.icon className="size-4" strokeWidth={2} aria-hidden />
                {o.label}
                <DropdownMenu.ItemIndicator className="ml-auto">
                  <Check
                    className="size-4 text-brand"
                    strokeWidth={2}
                    aria-hidden
                  />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
