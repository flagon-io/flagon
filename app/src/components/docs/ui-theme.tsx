"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
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
function brandFor(value: string): Brand {
  return THEMES.find((t) => t.value === value)?.brand ?? THEMES[0].brand;
}

// The cookie mirrors the localStorage choice so the SERVER can render the chosen
// Brand on first paint (localStorage is client-only). That is what prevents the
// flash of the default Brand on refresh.
function writeCookie(t: string) {
  try {
    document.cookie = `${KEY}=${encodeURIComponent(t)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* ignore */
  }
}

function setTheme(t: string) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  writeCookie(t);
  window.dispatchEvent(new Event(EVENT));
}

const Ctx = createContext<{ theme: string; setTheme: (t: string) => void }>({
  theme: "flagon",
  setTheme,
});

/**
 * Wraps the docs and applies the chosen Brand (full token set) live. `initialTheme`
 * comes from the server (a cookie), so the very first render already uses the right
 * Brand and there is no flash of the default on refresh. After hydration the store
 * reconciles with localStorage (the source of truth for the user's choice).
 */
export function UiThemeProvider({
  initialTheme = "flagon",
  children,
}: {
  initialTheme?: string;
  children: ReactNode;
}) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => initialTheme);

  // Self-heal the cookie from localStorage on mount, so a user who chose a Brand
  // before cookies were written gets a flash-free load next time.
  useEffect(() => {
    try {
      writeCookie(localStorage.getItem(KEY) || "flagon");
    } catch {
      /* ignore */
    }
  }, []);

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
