"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { Check, Palette } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@flagon-io/ui";

type ThemeDef = { value: string; label: string; swatch: string };

const THEMES: ThemeDef[] = [
  { value: "flagon", label: "Flagon", swatch: "#0d9488" },
  { value: "indigo", label: "Indigo", swatch: "#6366f1" },
  { value: "rose", label: "Rose", swatch: "#e11d48" },
  { value: "mono", label: "Mono", swatch: "#18181b" },
];

const KEY = "flagon-ui-theme";
const EVENT = "flagon:ui-themechange";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
function getSnapshot() {
  try {
    return localStorage.getItem(KEY) || "flagon";
  } catch {
    return "flagon";
  }
}
const getServerSnapshot = () => "flagon";

function setTheme(t: string) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

const Ctx = createContext<{ theme: string; setTheme: (t: string) => void }>({
  theme: "flagon",
  setTheme,
});

/** Wraps the docs and applies the chosen design theme via data-theme. */
export function UiThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <Ctx.Provider value={{ theme, setTheme }}>
      <div data-theme={theme === "flagon" ? undefined : theme}>{children}</div>
    </Ctx.Provider>
  );
}

/** Design-theme picker, separate from the light/dark mode toggle. */
export function ThemeSelect() {
  const { theme, setTheme } = useContext(Ctx);
  const current = THEMES.find((t) => t.value === theme) ?? THEMES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-8 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:text-foreground"
        aria-label="Design theme"
      >
        <Palette className="size-4" />
        <span className="hidden sm:inline">{current.label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Design theme</DropdownMenuLabel>
        {THEMES.map((t) => (
          <DropdownMenuItem key={t.value} onSelect={() => setTheme(t.value)}>
            <span
              className="size-4 shrink-0 rounded-full border border-black/10"
              style={{ background: t.swatch }}
            />
            <span className="flex-1">{t.label}</span>
            {theme === t.value && <Check className="text-brand" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
