"use client";

import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A styled select on Radix, matching the site's other menus (the theme
 * toggle's popover). Pass `name` and it takes part in a <form> like a native
 * select: Radix renders a hidden <select> carrying the value for FormData.
 */
export function Select({
  id,
  name,
  options,
  defaultValue,
  required,
  className,
}: {
  id?: string;
  name: string;
  options: readonly string[];
  defaultValue?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <RadixSelect.Root name={name} defaultValue={defaultValue ?? options[0]} required={required}>
      <RadixSelect.Trigger
        id={id}
        className={cn(
          "group flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-foreground outline-none transition",
          "hover:border-foreground/25 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 data-[state=open]:border-brand",
          className,
        )}
      >
        <span className="truncate">
          <RadixSelect.Value />
        </span>
        <RadixSelect.Icon>
          <ChevronDown
            className="size-4 text-subtle transition-transform group-data-[state=open]:rotate-180"
            strokeWidth={2}
          />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) min-w-40 overflow-hidden rounded-xl border border-hairline bg-popover p-1.5 shadow-xl shadow-black/20"
        >
          <RadixSelect.Viewport>
            {options.map((o) => (
              <RadixSelect.Item
                key={o}
                value={o}
                className="relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-3 pr-8 text-sm text-muted-foreground outline-none transition-colors data-highlighted:bg-panel data-highlighted:text-foreground data-[state=checked]:text-foreground"
              >
                <RadixSelect.ItemText>{o}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="absolute right-2.5">
                  <Check className="size-4 text-brand" strokeWidth={2} aria-hidden />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
