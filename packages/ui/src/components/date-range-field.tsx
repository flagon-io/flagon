"use client";

import { useId, useRef, useState, type ComponentProps, type PointerEvent as ReactPointerEvent } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { DayButton as DefaultDayButton, type DateRange, type Matcher } from "react-day-picker";
import { cn } from "../lib/cn";
import { controlHeight, focusRing, type ControlSize } from "../lib/control";
import { dateKey, formatRange, parseDateKey, rangeMatcher, yearsFromNow } from "../lib/date-range";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

// Each day button is tagged with its local date so a drag can map a pointer to a
// day without threading React state through every cell.
function DragDayButton(props: ComponentProps<typeof DefaultDayButton>) {
  return <DefaultDayButton {...props} data-date={dateKey(props.day.date)} />;
}

export type { DateRange };

export type DateRangeFieldProps = {
  /** Uncontrolled starting range. */
  defaultValue?: DateRange;
  /** Controlled range (pass with onChange). */
  value?: DateRange;
  /** Fires whenever the selection changes. */
  onChange?: (range: DateRange | undefined) => void;
  /** Months shown side by side in the popover (default 2). */
  numberOfMonths?: number;
  /** Earliest selectable date (also bounds the calendar). */
  min?: Date;
  /** Latest selectable date. */
  max?: Date;
  /** Extra disabled-date matcher(s), merged with min/max. */
  disabledDates?: Matcher | Matcher[];
  displayFormat?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: ControlSize;
  "aria-label"?: string;
};

/**
 * A date-range picker: a field-styled trigger showing the selected range, and a
 * two-month range calendar in a popover. Controlled or uncontrolled. For a single
 * date use `DateField`.
 */
export function DateRangeField({
  defaultValue,
  value,
  onChange,
  numberOfMonths = 2,
  min,
  max,
  disabledDates,
  displayFormat = "MMM d, yyyy",
  id,
  placeholder = "Select a date range",
  disabled,
  className,
  size = "md",
  "aria-label": ariaLabel,
}: DateRangeFieldProps) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState<DateRange | undefined>(defaultValue);
  const range = controlled ? value : internal;

  const [open, setOpen] = useState(false);
  const autoId = useId();
  const fieldId = id ?? autoId;

  // One month per calendar panel, navigated independently. Initialized to
  // consecutive months from the range start (or today).
  const [months, setMonths] = useState<Date[]>(() => {
    const base = defaultValue?.from ?? value?.from ?? min ?? new Date();
    return Array.from(
      { length: Math.max(1, numberOfMonths) },
      (_, i) => new Date(base.getFullYear(), base.getMonth() + i, 1),
    );
  });
  function setMonthAt(i: number, next: Date) {
    setMonths((prev) => prev.map((m, idx) => (idx === i ? next : m)));
  }

  // Drag-to-select: press on a day and drag to the other end. A real drag ends on
  // a different element than it began, so no click fires and it never collides
  // with click-to-select or keyboard selection.
  const anchorRef = useRef<Date | null>(null);
  const draggedRef = useRef(false);

  function select(next: DateRange | undefined) {
    if (!controlled) setInternal(next);
    onChange?.(next);
  }

  function dayUnderPointer(target: EventTarget | null): Date | null {
    const el = (target as HTMLElement | null)?.closest?.("[data-date]") as HTMLElement | null;
    if (!el || el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return null;
    const key = el.getAttribute("data-date");
    return key ? parseDateKey(key) : null;
  }
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const d = dayUnderPointer(e.target);
    if (!d) return;
    anchorRef.current = d;
    draggedRef.current = false;
  }
  function onPointerOver(e: ReactPointerEvent<HTMLDivElement>) {
    const anchor = anchorRef.current;
    if (!anchor || (e.buttons & 1) === 0) return;
    const d = dayUnderPointer(e.target);
    if (!d || d.getTime() === anchor.getTime()) return;
    draggedRef.current = true;
    const [from, to] = d < anchor ? [d, anchor] : [anchor, d];
    select({ from, to });
  }
  function endDrag() {
    anchorRef.current = null;
    draggedRef.current = false;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-slot="date-range-field"
        id={fieldId}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? "Select a date range"}
        className={cn(
          controlHeight[size],
          "flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-foreground",
          "transition",
          focusRing,
          "disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-ring",
          className,
        )}
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !range?.from && "text-muted-foreground")}>
          {range?.from ? formatRange(range, displayFormat) : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        {/* One calendar per month, each navigable on its own (its own arrows +
            month/year dropdowns). All share the selection, and the single drag
            wrapper lets a drag cross from one calendar into the next. */}
        <div
          className="flex select-none flex-col sm:flex-row"
          onPointerDown={onPointerDown}
          onPointerOver={onPointerOver}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          {months.map((m, i) => (
            <Calendar
              key={i}
              mode="range"
              selected={range}
              onSelect={select}
              month={m}
              onMonthChange={(next) => setMonthAt(i, next)}
              numberOfMonths={1}
              captionLayout="dropdown"
              startMonth={min ?? yearsFromNow(-5)}
              endMonth={max ?? yearsFromNow(10)}
              disabled={rangeMatcher(min, max, disabledDates)}
              components={{ DayButton: DragDayButton }}
              className={i > 0 ? "sm:border-l sm:border-hairline" : undefined}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
