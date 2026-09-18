"use client";

import { useSyncExternalStore } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { buttonClasses } from "@flagon-io/ui";
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
 * Light / Dark / System theme switcher on Radix DropdownMenu. Defaults to
 * System. Preference is read through useSyncExternalStore, so there's no
 * setState-in-effect and no hydration mismatch.
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
          className={buttonClasses({ variant: "ghost", size: "icon" })}
        >
          <Current className="size-4.5" strokeWidth={2} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-40 min-w-[168px] rounded-xl border border-hairline bg-popover p-1.5 shadow-xl shadow-black/10"
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenu.Item
              key={value}
              onSelect={() => choose(value)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none transition-colors",
                "hover:bg-panel focus:bg-panel",
              )}
            >
              <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
              <span className="flex-1">{label}</span>
              {pref === value && (
                <Check className="h-4 w-4 text-brand" strokeWidth={2} />
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
