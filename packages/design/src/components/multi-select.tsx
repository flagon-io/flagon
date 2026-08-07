"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "../cn";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";

export type MultiSelectOption = { value: string; label: string };

/**
 * A tag-style multi-select: pick from a dropdown, chosen items render as removable
 * tags in the control. To keep the control on one line it shows up to `maxVisible`
 * tags then a "+N" overflow chip (e.g. "Web, API, Billing +3"). Matches the standard
 * control height/styling so it lines up in a form. Uncontrolled-open via Popover.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select…",
  maxVisible = 3,
  disabled = false,
  ariaLabel,
  className,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  /** How many tags to show before collapsing the rest into a "+N" chip. */
  maxVisible?: number;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const chosen = selected
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is MultiSelectOption => Boolean(o));
  const visible = chosen.slice(0, maxVisible);
  const overflow = chosen.length - visible.length;

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }
  function remove(value: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onChange(selected.filter((v) => v !== value));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "min-h-10 gap-2 rounded-md border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-100 flex w-full items-center border transition-colors outline-none",
            "focus:border-teal-500/50 focus:ring-teal-500/20 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
        >
          {chosen.length === 0 ? (
            <span className="text-zinc-500">{placeholder}</span>
          ) : (
            <span className="min-w-0 gap-1 flex flex-wrap items-center">
              {visible.map((o) => (
                <span
                  key={o.value}
                  className="gap-1 rounded border-white/10 bg-white/8 py-0.5 pr-0.5 pl-2 text-xs text-zinc-200 inline-flex items-center border"
                >
                  <span className="truncate">{o.label}</span>
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${o.label}`}
                    onClick={(e) => remove(o.value, e)}
                    className="size-4 rounded text-zinc-500 hover:bg-white/10 hover:text-zinc-200 grid place-items-center"
                  >
                    <X className="size-3" />
                  </span>
                </span>
              ))}
              {overflow > 0 ? (
                <span className="rounded border-white/10 bg-white/4 px-1.5 py-0.5 text-xs text-zinc-400 border">
                  +{overflow}
                </span>
              ) : null}
            </span>
          )}
          <ChevronDown className="size-4 text-zinc-500 ml-auto shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-64 p-1 w-(--radix-popover-trigger-width) overflow-y-auto"
      >
        {options.length === 0 ? (
          <p className="px-3 py-2 text-sm text-zinc-500">No options.</p>
        ) : (
          <ul className="flex flex-col">
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="gap-2 rounded-md px-2.5 py-2 text-sm text-zinc-200 hover:bg-white/5 flex w-full items-center text-left transition-colors"
                  >
                    <span
                      className={cn(
                        "size-4 rounded grid shrink-0 place-items-center border",
                        on ? "border-teal-500/50 bg-teal-500/20 text-teal-300" : "border-white/15",
                      )}
                    >
                      {on ? <Check className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 truncate">{o.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
