"use client";

import { useId, useState, type ChangeEvent, type ComponentProps } from "react";
import { cn } from "../lib/cn";
import { controlHeight, focusRing, type ControlSize } from "../lib/control";
import { InputGroup } from "./input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

// Shorthand multipliers, case-insensitive: 35k -> 35_000, 2.5m -> 2_500_000,
// 1b -> 1_000_000_000. Ordered longest-first is unnecessary (all one char).
const SUFFIXES: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/**
 * Evaluate a money expression the way a person would jot it: shorthand suffixes
 * (35k, 2.5m, 1b), grouping commas, a currency symbol, and simple arithmetic
 * (+ - * /) with the usual precedence (* / before + -). No `eval` - a tiny
 * tokenizer + shunting-yard does the math. Returns the number, or null when the
 * text isn't a valid amount/expression.
 *
 * Examples: "35k" -> 35000, "5500 + 7300" -> 12800, "2 * 1.5m + 250k" -> 3250000.
 */
export function evaluateMoney(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;

  // Strip any currency symbol (\p{Sc} covers $, £, €, ¥, ₹, ₩, ...), grouping
  // commas/underscores and whitespace; expand shorthand suffixes attached to a
  // number (e.g. 1,500k -> 1500 * 1000).
  const cleaned = raw
    .replace(/[\p{Sc}\s,_]/gu, "")
    .replace(/(\d+(?:\.\d+)?)([kmb])/gi, (_m, num: string, suf: string) => {
      const n = Number(num) * SUFFIXES[suf.toLowerCase()];
      return String(n);
    });
  if (!cleaned) return null;

  // Only digits, decimal points and the four operators may remain.
  if (!/^[0-9.+\-*/()]+$/.test(cleaned)) return null;

  try {
    const tokens = tokenize(cleaned);
    const rpn = toRPN(tokens);
    const value = evalRPN(rpn);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

type Token = number | "+" | "-" | "*" | "/" | "(" | ")";

function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "+" || c === "*" || c === "/" || c === "(" || c === ")") {
      tokens.push(c);
      i++;
    } else if (c === "-") {
      // Unary minus: at the start, or after another operator/open-paren.
      const prev = tokens[tokens.length - 1];
      if (prev === undefined || prev === "+" || prev === "-" || prev === "*" || prev === "/" || prev === "(") {
        // Fold into the following number by emitting 0 - x via a marker: push 0 then '-'.
        tokens.push(0, "-");
      } else {
        tokens.push("-");
      }
      i++;
    } else if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const num = Number(s.slice(i, j));
      if (!Number.isFinite(num)) throw new Error("bad number");
      tokens.push(num);
      i = j;
    } else {
      throw new Error("bad char");
    }
  }
  return tokens;
}

const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

function toRPN(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const ops: Token[] = [];
  for (const t of tokens) {
    if (typeof t === "number") {
      out.push(t);
    } else if (t === "(") {
      ops.push(t);
    } else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop()!);
      if (ops.pop() !== "(") throw new Error("mismatched paren");
    } else {
      while (
        ops.length &&
        ops[ops.length - 1] !== "(" &&
        PRECEDENCE[ops[ops.length - 1] as string] >= PRECEDENCE[t]
      ) {
        out.push(ops.pop()!);
      }
      ops.push(t);
    }
  }
  while (ops.length) {
    const op = ops.pop()!;
    if (op === "(") throw new Error("mismatched paren");
    out.push(op);
  }
  return out;
}

function evalRPN(rpn: Token[]): number {
  const stack: number[] = [];
  for (const t of rpn) {
    if (typeof t === "number") {
      stack.push(t);
      continue;
    }
    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) throw new Error("bad expression");
    stack.push(t === "+" ? a + b : t === "-" ? a - b : t === "*" ? a * b : a / b);
  }
  if (stack.length !== 1) throw new Error("bad expression");
  return stack[0];
}

/**
 * Format a number as currency. Integers show no cents ($35,000); fractional
 * amounts show two ($12.50), unless `decimals` forces a fixed count. Set
 * `symbol: false` to format the grouped number alone (e.g. when a currency
 * picker already shows the currency).
 */
export function formatMoney(
  value: number,
  opts?: { currency?: string; locale?: string; decimals?: number; symbol?: boolean },
): string {
  const { currency = "USD", locale, decimals, symbol = true } = opts ?? {};
  const fraction = decimals ?? (Number.isInteger(value) ? 0 : 2);
  return new Intl.NumberFormat(locale, {
    style: symbol ? "currency" : "decimal",
    currency: symbol ? currency : undefined,
    minimumFractionDigits: fraction,
    maximumFractionDigits: decimals ?? 2,
  }).format(value);
}

/** The currency symbol for an ISO code (e.g. USD -> "$", JPY -> "¥"). */
export function currencySymbol(code: string, locale?: string): string {
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency: code }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? code;
}

/**
 * Detect which of the selectable currencies a person meant from what they typed:
 * a currency symbol (¥, €, £, ...) or the ISO code itself (eur, JPY). Returns the
 * matching code, or null. Longer symbols win (CA$ before $) so ambiguous symbols
 * resolve to the most specific listed currency.
 */
export function detectCurrency(text: string, currencies: string[], locale?: string): string | null {
  const candidates = currencies
    .map((code) => ({ code, symbol: currencySymbol(code, locale) }))
    .sort((a, b) => b.symbol.length - a.symbol.length);
  for (const c of candidates) {
    if (c.symbol && text.includes(c.symbol)) return c.code;
  }
  const upper = text.toUpperCase();
  for (const code of currencies) {
    if (new RegExp(`\\b${code}\\b`).test(upper)) return code;
  }
  return null;
}

export type MoneyInputProps = Omit<
  ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "size" | "prefix"
> & {
  /** Uncontrolled starting amount. */
  defaultValue?: number | null;
  /** Controlled amount (pass with onValueChange). */
  value?: number | null;
  /** Fires with the evaluated amount, or null when empty/invalid. */
  onValueChange?: (value: number | null) => void;
  /**
   * Active ISO currency code (default USD). Drives the symbol and default
   * decimals. When `currencies` is set, this is the controlled selection.
   */
  currency?: string;
  /**
   * Pass a list of ISO codes to let the user switch currency: the field renders
   * as an input group with a currency picker, and the amount is formatted
   * without a symbol (the picker shows the currency instead).
   */
  currencies?: string[];
  /** Starting currency when the picker is uncontrolled (defaults to currencies[0]). */
  defaultCurrency?: string;
  /** Fires when the user changes the currency. */
  onCurrencyChange?: (currency: string) => void;
  locale?: string;
  /** Force a fixed number of fraction digits (otherwise integers hide cents). */
  decimals?: number;
  size?: ControlSize;
};

/**
 * A money field with a little magic: type shorthand (35k, 2.5m, 1b) or a quick
 * sum (5500 + 7300, 2 * 1.5m + 250k) and it resolves to a formatted amount when
 * you leave the field. On focus it shows the plain number so it's easy to edit;
 * on blur it evaluates and formats. The parsed number flows out via
 * `onValueChange`; the formatting is for the eyes, not the value.
 *
 * Works in any currency via `currency` (an ISO code). Pass `currencies` to let
 * the user pick one: the field becomes an input group with a currency selector.
 */
export function MoneyInput({
  defaultValue = null,
  value,
  onValueChange,
  currency,
  currencies,
  defaultCurrency,
  onCurrencyChange,
  locale,
  decimals,
  size = "md",
  className,
  id,
  disabled,
  placeholder,
  onFocus,
  onBlur,
  ...props
}: MoneyInputProps) {
  const controlled = value !== undefined;
  const autoId = useId();
  const fieldId = id ?? autoId;

  const selectable = !!currencies && currencies.length > 0;
  const currencyControlled = currency !== undefined;
  const [ownCurrency, setOwnCurrency] = useState(defaultCurrency ?? currencies?.[0] ?? currency ?? "USD");
  const activeCurrency = currencyControlled ? (currency as string) : ownCurrency;

  const [numeric, setNumeric] = useState<number | null>(controlled ? (value ?? null) : defaultValue);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  // The current amount (controlled value wins). While focused we show the raw
  // editable buffer; otherwise we DERIVE the formatted display from the amount
  // and the active currency - so switching currency reformats with no extra work.
  const current = controlled ? (value ?? null) : numeric;
  const fmt = (n: number) => formatMoney(n, { currency: activeCurrency, locale, decimals, symbol: !selectable });
  const display = focused ? text : current != null ? fmt(current) : "";

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    setFocused(true);
    setText(current != null ? String(current) : "");
    onFocus?.(e);
  }
  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    setFocused(false);
    let working = text;
    // Typing a currency (a symbol like ¥ or an ISO code) switches the picker to
    // it, and we drop that token so the number still parses.
    if (selectable && currencies) {
      const detected = detectCurrency(working, currencies, locale);
      if (detected) {
        if (detected !== activeCurrency) changeCurrency(detected);
        working = working.split(currencySymbol(detected, locale)).join(" ");
        working = working.replace(new RegExp(`\\b${detected}\\b`, "gi"), " ");
      }
    }
    const parsed = evaluateMoney(working);
    if (!controlled) setNumeric(parsed);
    onValueChange?.(parsed);
    onBlur?.(e);
  }
  function changeCurrency(next: string) {
    if (!currencyControlled) setOwnCurrency(next);
    onCurrencyChange?.(next);
  }

  const inputProps = {
    id: fieldId,
    inputMode: "decimal" as const,
    autoComplete: "off",
    disabled,
    placeholder: placeholder ?? (selectable ? "0" : "$0"),
    value: display,
    onChange: (e: ChangeEvent<HTMLInputElement>) => setText(e.target.value),
    onFocus: handleFocus,
    onBlur: handleBlur,
    ...props,
  };

  if (selectable) {
    return (
      <InputGroup
        size={size}
        className={className}
        inputClassName="tabular-nums"
        prefixClassName="p-0"
        prefix={
          // Our themed Select (not a native <select>) so the option list is
          // always theme-correct - native popups follow the OS, not our tokens.
          <Select value={activeCurrency} onValueChange={changeCurrency} disabled={disabled}>
            <SelectTrigger
              size={size}
              aria-label="Currency"
              className="h-full w-auto gap-1 rounded-none border-0 bg-transparent px-3 font-medium text-muted-foreground shadow-none focus-visible:outline-none data-[state=open]:text-foreground"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies!.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        {...inputProps}
      />
    );
  }

  return (
    <input
      data-slot="money-input"
      {...inputProps}
      className={cn(
        controlHeight[size],
        "w-full rounded-md border border-input bg-background px-3 text-sm text-foreground tabular-nums",
        "placeholder:text-muted-foreground",
        "transition",
        focusRing,
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}
