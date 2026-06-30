'use client';

import { useEffect, useRef, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';

type Theme = 'light' | 'dark' | 'system';

/**
 * Apply the theme to the document. `system` removes both classes and lets the
 * `prefers-color-scheme` rule in globals.css decide (and track OS changes live);
 * an explicit choice adds `.dark` / `.light` to override the OS.
 */
function apply(theme: Theme) {
  const root = document.documentElement.classList;
  root.remove('dark', 'light');
  if (theme === 'dark') root.add('dark');
  else if (theme === 'light') root.add('light');
}

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <Sun size={15} /> },
  { value: 'dark', label: 'Dark', icon: <Moon size={15} /> },
  { value: 'system', label: 'System', icon: <Monitor size={15} /> },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reflect the saved choice. For `system` this is a no-op (no class), so the
    // CSS already showed the right theme at first paint — no flash. Only an
    // explicit light/dark that differs from the OS changes anything here.
    const stored = (localStorage.getItem('flagon-theme') as Theme | null) ?? 'system';
    setTheme(stored);
    apply(stored);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function choose(value: Theme) {
    setTheme(value);
    setOpen(false);
    try {
      localStorage.setItem('flagon-theme', value);
    } catch {
      /* storage unavailable - applies for this session */
    }
    apply(value);
  }

  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Theme"
        className={cn(buttonVariants({ variant: 'secondary', size: 'icon' }), 'text-muted')}
      >
        {current.icon}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {OPTIONS.map((o) => {
            const active = o.value === theme;
            return (
              <button
                key={o.value}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(o.value)}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active ? 'text-brand-500' : 'text-foreground hover:bg-card-muted'
                }`}
              >
                <span className={active ? 'text-brand-500' : 'text-muted'}>{o.icon}</span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
