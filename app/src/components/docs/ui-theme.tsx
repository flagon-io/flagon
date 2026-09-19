"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { Check, Palette } from "lucide-react";
import {
  BrandProvider,
  brandPresets,
  buttonClasses,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  type Brand,
} from "@flagon-io/ui";

// The docs theme picker swaps the whole Brand (colors + radius + charts +
// density), not just an accent - a live demo of the Brand system.
const THEMES: { value: string; label: string; swatch: string; brand: Brand }[] = brandPresets.map(
  (brand) => ({
    value: brand.name.toLowerCase(),
    label: brand.name,
    swatch: brand.light?.primary ?? "#0d9488",
    brand,
  }),
);

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

function brandFor(value: string): Brand {
  return THEMES.find((t) => t.value === value)?.brand ?? THEMES[0].brand;
}

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

/** Wraps the docs and applies the chosen Brand (full token set) live. */
export function UiThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <Ctx.Provider value={{ theme, setTheme }}>
      <BrandProvider brand={brandFor(theme)}>{children}</BrandProvider>
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
        className={buttonClasses({ variant: "outline", size: "sm", className: "gap-1.5" })}
        aria-label="Brand"
      >
        <Palette className="size-4" />
        <span className="hidden sm:inline">{current.label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Brand</DropdownMenuLabel>
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
