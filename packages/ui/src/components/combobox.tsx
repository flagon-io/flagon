"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
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
  options: ComboboxOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  size?: ControlSize;
  disabled?: boolean;
  className?: string;
  /** Set false to keep a fixed trigger width instead of matching the trigger. */
  matchTriggerWidth?: boolean;
  id?: string;
}

/** A typeahead select with search and keyboard nav (Popover + Command). */
export function Combobox({
  options,
  value: controlledValue,
  defaultValue,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results found.",
  size = "md",
  disabled,
  className,
  matchTriggerWidth = true,
  id,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const value = controlledValue ?? uncontrolled;
  const selected = options.find((o) => o.value === value);

  function select(next: string) {
    if (controlledValue === undefined) setUncontrolled(next);
    onValueChange?.(next);
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
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("p-0", matchTriggerWidth && "w-[var(--radix-popover-trigger-width)]")}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label, ...(option.keywords ?? [])]}
                  disabled={option.disabled}
                  onSelect={select}
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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
