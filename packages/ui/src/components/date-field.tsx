"use client";

import { useId, useMemo, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import type { Matcher } from "react-day-picker";
import { format as formatDate, isValid, parse } from "date-fns";
import { cn } from "../lib/cn";
import { controlHeight, focusRing } from "../lib/control";
import { endOfDay, rangeMatcher, startOfDay, yearsFromNow } from "../lib/date-range";
import { buttonClasses } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

// Named-month spellings we accept in addition to pure-numeric input. Numeric
// input is parsed by hand (below) so we control day/month ordering precisely.
const NAMED_FORMATS = [
  "MMMM d, yyyy",
  "MMMM d yyyy",
  "MMM d, yyyy",
  "MMM d yyyy",
  "d MMMM yyyy",
  "d MMM yyyy",
  "MMMM d",
  "MMM d",
  "d MMMM",
  "d MMM",
];

function build(y: number, m: number, d: number): Date | null {
  // Reject overflow (e.g. 02/30) by round-tripping through the Date fields.
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function expandYear(raw: string): number {
  const n = Number(raw);
  if (raw.length <= 2) return 2000 + n; // 2-digit years land this century
  return n;
}

/**
 * Parse a human-typed date in many shapes: ISO (2026-09-17), slashes, hyphens
 * or dots, 2- or 4-digit years, and month names (Sep 17 2026, 17 September).
 * Ambiguous numeric dates like 01/02/2026 follow `dayFirst` (EU vs US); an order
 * that is impossible (13/01) falls back to the other so it still parses.
 * Returns null when nothing sensible matches.
 */
export function parseFlexibleDate(input: string, opts?: { dayFirst?: boolean }): Date | null {
  const text = input.trim();
  if (!text) return null;
  const dayFirst = opts?.dayFirst ?? false;

  // Pure numeric with separators: 1-3 parts.
  const numeric = text.match(/^(\d{1,4})(?:[\s/.\-](\d{1,4}))?(?:[\s/.\-](\d{1,4}))?$/);
  if (numeric) {
    const [, aRaw, bRaw, cRaw] = numeric;
    const a = Number(aRaw);

    // Three parts.
    if (bRaw != null && cRaw != null) {
      // Leading 4-digit part means ISO year-month-day.
      if (aRaw.length === 4) return build(a, Number(bRaw), Number(cRaw));
      const year = expandYear(cRaw);
      const first = a;
      const second = Number(bRaw);
      // If one position can't be a month, let the value decide the order.
      const orderDayFirst = first > 12 ? true : second > 12 ? false : dayFirst;
      const day = orderDayFirst ? first : second;
      const month = orderDayFirst ? second : first;
      return build(year, month, day);
    }

    // Two parts: day + month in the current year (no year given).
    if (bRaw != null) {
      const b = Number(bRaw);
      const now = new Date();
      const orderDayFirst = a > 12 ? true : b > 12 ? false : dayFirst;
      const day = orderDayFirst ? a : b;
      const month = orderDayFirst ? b : a;
      return build(now.getFullYear(), month, day);
    }

    // Single number is too ambiguous to be a date.
    return null;
  }

  // Month names and mixed formats.
  const ref = new Date();
  for (const f of NAMED_FORMATS) {
    const dt = parse(text, f, ref);
    if (isValid(dt)) return dt;
  }
  return null;
}

export type DateFieldProps = {
  /** Initial date (uncontrolled). The field then owns the typed text. */
  defaultValue?: Date | null;
  /** Fires on every edit with the parsed date, or null when unparseable/empty. */
  onChange?: (date: Date | null) => void;
  /** EU day-first ordering for ambiguous numeric dates (default false = US). */
  dayFirst?: boolean;
  /** Canonical format written when a day is picked from the calendar. */
  displayFormat?: string;
  /** Earliest selectable date (also bounds the calendar). */
  min?: Date;
  /** Latest selectable date. */
  max?: Date;
  /**
   * Extra dates to disable, e.g. weekends `{ dayOfWeek: [0, 6] }`, a list of
   * `Date`s, or any react-day-picker matcher. Merged with `min`/`max`.
   */
  disabledDates?: Matcher | Matcher[];
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function DateField({
  defaultValue = null,
  onChange,
  dayFirst = false,
  displayFormat,
  min,
  max,
  disabledDates,
  id,
  placeholder,
  disabled,
  className,
  "aria-label": ariaLabel,
}: DateFieldProps) {
  // Friendly display for calendar-picked dates ("August 25, 2026"); typing still
  // holds whatever the user enters.
  const outFormat = displayFormat ?? "MMMM d, yyyy";
  const autoId = useId();
  const fieldId = id ?? autoId;

  const [text, setText] = useState(() => (defaultValue ? formatDate(defaultValue, outFormat) : ""));
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(defaultValue ?? new Date());

  const parsed = useMemo(() => parseFlexibleDate(text, { dayFirst }), [text, dayFirst]);
  const outOfRange =
    parsed != null &&
    ((min != null && parsed < startOfDay(min)) || (max != null && parsed > endOfDay(max)));
  const invalid = text.trim() !== "" && (parsed == null || outOfRange);

  function emit(value: string) {
    setText(value);
    const p = parseFlexibleDate(value, { dayFirst });
    const ok = p != null && !(min != null && p < startOfDay(min)) && !(max != null && p > endOfDay(max));
    onChange?.(ok ? p : null);
    if (p) setMonth(p);
  }

  function pick(date: Date | undefined) {
    if (!date) return;
    setText(formatDate(date, outFormat));
    setMonth(date);
    onChange?.(date);
    setOpen(false);
  }

  return (
    <div data-slot="date-field" className={cn("space-y-1.5", className)}>
      <div className="relative">
        <input
          id={fieldId}
          value={text}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder ?? "Select a date"}
          onChange={(e) => emit(e.target.value)}
          className={cn(
            controlHeight.md,
            "w-full rounded-md border bg-background pr-10 pl-3 text-sm text-foreground",
            "placeholder:text-muted-foreground",
            "transition",
            focusRing,
            "disabled:cursor-not-allowed disabled:opacity-50",
            invalid ? "border-destructive" : "border-input",
          )}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            type="button"
            disabled={disabled}
            aria-label="Open calendar"
            className={cn(
              buttonClasses({ variant: "ghost", size: "icon" }),
              "absolute top-1/2 right-1 size-8 -translate-y-1/2",
            )}
          >
            <CalendarIcon className="size-4" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={parsed ?? undefined}
              month={month}
              onMonthChange={setMonth}
              onSelect={pick}
              captionLayout="dropdown"
              startMonth={min ?? yearsFromNow(-5)}
              endMonth={max ?? yearsFromNow(10)}
              disabled={rangeMatcher(min, max, disabledDates)}
            />
          </PopoverContent>
        </Popover>
      </div>
      {invalid ? (
        <p className="text-xs text-destructive">
          {outOfRange ? "That date is out of range." : "Unrecognized date."}
        </p>
      ) : parsed ? (
        <p className="text-xs text-muted-foreground">{formatDate(parsed, "EEEE, MMMM d, yyyy")}</p>
      ) : null}
    </div>
  );
}

