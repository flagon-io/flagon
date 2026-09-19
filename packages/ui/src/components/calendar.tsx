"use client";

import type { ChangeEvent, ComponentProps } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import { format as formatDate } from "date-fns";
import { DayPicker, type DropdownProps } from "react-day-picker";
import { cn } from "../lib/cn";
import { buttonClasses } from "./button";
import { SelectField } from "./select";

export type CalendarProps = ComponentProps<typeof DayPicker>;

/**
 * Month/year navigation control. Uses the design system's adaptive SelectField,
 * so the picker is our themed Radix menu on desktop (no jarring OS-native list
 * in dark mode) and the native OS picker on mobile. Bridges the Radix string
 * value back to react-day-picker's native-select onChange contract.
 */
function CaptionDropdown({ options, value, onChange, disabled, "aria-label": ariaLabel }: DropdownProps) {
  const opts = (options ?? []).map((o) => ({
    value: String(o.value),
    label: o.label,
    disabled: o.disabled,
  }));
  return (
    <SelectField
      options={opts}
      value={value != null ? String(value) : undefined}
      disabled={disabled}
      aria-label={ariaLabel}
      triggerClassName="h-8 w-auto gap-1 px-2.5 font-medium hover:bg-panel"
      contentClassName="max-h-64"
      onValueChange={(v) =>
        onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as ChangeEvent<HTMLSelectElement>)
      }
    />
  );
}

/**
 * Month-grid date picker built on react-day-picker, themed with Flagon tokens.
 * Supports single date, multiple, and range selection (via `mode`), month/year
 * dropdowns (`captionLayout="dropdown"`, bounded by `startMonth`/`endMonth`), and
 * any disabled-date matcher (`disabled`).
 */
export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: CalendarProps) {
  const navButton = cn(
    buttonClasses({ variant: "outline", size: "icon" }),
    // pointer-events-auto: the nav bar spans the full width over the caption, so
    // it is pointer-events-none (to let clicks reach the centered dropdowns
    // beneath it); the arrows themselves must opt back in.
    "pointer-events-auto size-7 bg-transparent p-0 opacity-80 hover:opacity-100",
  );
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      // `relative` makes the root the positioning context for the nav arrows.
      className={cn("relative p-3", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-4",
        // Classic layout: month/year dropdowns centered, a prev/next arrow at
        // each end of the caption row (absolute, so they never reflow it). The
        // px keeps the centered dropdowns clear of the corner arrows.
        month_caption: "flex h-8 items-center justify-center gap-1.5 px-8",
        caption_label: "inline-flex items-center gap-1 text-sm font-medium text-foreground",
        // The month/year controls are our adaptive SelectField (see
        // CaptionDropdown); this just lays the two out in a row.
        dropdowns: "flex items-center gap-1.5",
        nav: "pointer-events-none absolute inset-x-3 top-3 flex h-8 items-center justify-between",
        button_previous: navButton,
        button_next: navButton,
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-[0.72rem] font-normal text-muted-foreground",
        week: "mt-1.5 flex w-full",
        day: "relative size-9 p-0 text-center text-sm focus-within:z-20",
        day_button: cn(
          buttonClasses({ variant: "ghost", size: "icon" }),
          "size-9 rounded-md p-0 font-normal aria-selected:opacity-100",
        ),
        // rdp v9 applies these to the day <td>; target the inner button. Range
        // endpoints are solid and round only their OUTER corner so they merge
        // seamlessly into the connecting band; the middle is a flat accent band.
        selected:
          "[&>button]:bg-primary [&>button]:font-medium [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        range_start: "[&>button]:rounded-r-none",
        range_end: "[&>button]:rounded-l-none",
        range_middle:
          "[&>button]:!rounded-none [&>button]:!bg-accent [&>button]:!font-normal [&>button]:!text-accent-foreground [&>button]:hover:!bg-accent",
        // Today: a bold number, and a subtle ring so it reads as "today" without
        // fighting a selection or range band it may sit inside.
        today:
          "[&>button]:font-semibold [&>button:not([aria-selected=true])]:ring-1 [&>button:not([aria-selected=true])]:ring-inset [&>button:not([aria-selected=true])]:ring-border",
        outside: "text-muted-foreground/40",
        disabled: "text-muted-foreground/40 opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      // Short month labels ("Aug") keep the dropdowns compact.
      formatters={{
        formatMonthDropdown: (month) => formatDate(month, "LLL"),
        ...props.formatters,
      }}
      components={{
        Dropdown: CaptionDropdown,
        Chevron: ({ orientation, className: cls }) => {
          const Icon =
            orientation === "left"
              ? ChevronLeft
              : orientation === "right"
                ? ChevronRight
                : orientation === "up"
                  ? ChevronUp
                  : ChevronDown;
          return <Icon className={cn("size-4", cls)} />;
        },
        ...components,
      }}
      {...props}
    />
  );
}
