"use client";

import { Check, ChevronsUpDown, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import type { ControlSize } from "../lib/control";

export interface ComboboxOption {
  value: string;
  label: string;
  keywords?: string[];
  disabled?: boolean;
}

export interface ComboboxProps {
  /** Static options, filtered on the client as you type. Omit and pass
   *  `loadOptions` instead to source options from a server search. */
  options?: ComboboxOption[];
  /**
   * Async source: when provided, the combobox re-queries this as you type (and
   * once on open) instead of filtering a static `options` list, so it works over
   * lists too large to send at once - pair it with a paginated `?q=` endpoint.
   * The server does the matching, so return exactly the rows to show. Wrap it in
   * useCallback so it is stable.
   */
  loadOptions?: (query: string) => Promise<ComboboxOption[]>;
  value?: string;
  defaultValue?: string;
  /** Called with the chosen value and its full option (or null if unknown). */
  onValueChange?: (value: string, option: ComboboxOption | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Shown while an async `loadOptions` is in flight. */
  loadingText?: string;
  /** Debounce for async searches (ms). */
  debounceMs?: number;
  size?: ControlSize;
  disabled?: boolean;
  className?: string;
  /** Set false to keep a fixed trigger width instead of matching the trigger. */
  matchTriggerWidth?: boolean;
  id?: string;
  /**
   * Accessible name for the trigger. A `role="combobox"` element does not take its
   * name from its text content, so label it: associate a `<Label htmlFor>` with the
   * combobox's `id` in a form, or pass this for a standalone control.
   */
  "aria-label"?: string;
}

/**
 * A typeahead select (Popover + Command) with two sources:
 *   - `options`: a static list, filtered on the client (the default); or
 *   - `loadOptions`: an async source queried as you type, for lists too large to
 *     send at once (server-backed search).
 * One component, one API - pass whichever source fits.
 */
export function Combobox({
  options: staticOptions = [],
  loadOptions,
  value: controlledValue,
  defaultValue,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results found.",
  loadingText = "Searching…",
  debounceMs = 250,
  size = "md",
  disabled,
  className,
  matchTriggerWidth = true,
  id,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const isAsync = typeof loadOptions === "function";

  const [open, setOpen] = useState(false);
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const value = controlledValue ?? uncontrolled;

  // Async state (unused in static mode).
  const [query, setQuery] = useState("");
  const [fetched, setFetched] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);
  // Remembers the label of an async-chosen option, whose row may not be in the
  // current (search-filtered) result set.
  const [chosen, setChosen] = useState<ComboboxOption | null>(null);

  // Keep loadOptions out of the effect deps (callers may pass a fresh closure each
  // render) by reading it through a ref updated during render.
  const loadRef = useRef(loadOptions);
  loadRef.current = loadOptions;

  useEffect(() => {
    if (!isAsync || !open) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const opts = await loadRef.current!(query.trim());
        if (!controller.signal.aborted) setFetched(opts);
      } catch {
        if (!controller.signal.aborted) setFetched([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? debounceMs : 0);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [isAsync, open, query, debounceMs]);

  const options = isAsync ? fetched : staticOptions;
  const selectedLabel =
    options.find((o) => o.value === value)?.label ??
    (chosen?.value === value ? chosen.label : undefined);

  function select(option: ComboboxOption) {
    if (controlledValue === undefined) setUncontrolled(option.value);
    setChosen(option);
    onValueChange?.(option.value, option);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          size={size}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
            {selectedLabel ?? placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("p-0", matchTriggerWidth && "w-[var(--radix-popover-trigger-width)]")}
      >
        {/* In async mode the server already filtered, so cmdk must not filter again
            (shouldFilter=false) and we drive the query ourselves. In static mode we
            let cmdk own the search field and do the filtering. */}
        <Command shouldFilter={!isAsync}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={isAsync ? query : undefined}
            onValueChange={isAsync ? setQuery : undefined}
          />
          <CommandList>
            {isAsync && loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                {loadingText}
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyText}</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      keywords={[option.label, ...(option.keywords ?? [])]}
                      disabled={option.disabled}
                      onSelect={() => select(option)}
                    >
                      <span className="truncate">{option.label}</span>
                      <Check
                        className={cn(
                          "ml-auto size-4",
                          option.value === value ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
