/**
 * Display formatting for the usage views. Pure — safe in both the server table
 * and the client chart.
 */

/** Cents to a plain USD string, e.g. 2035 -> "$20.35". Always two decimals. */
export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * A charge that keeps sub-cent accrual VISIBLE: exactly 0 -> "$0.00", any positive
 * amount below a cent -> "< $0.01" (so a customer sees the cost is adding up rather
 * than a flat, misleading $0.00), otherwise the plain dollar amount.
 */
export function charge(cents: number): string {
  if (cents <= 0) return "$0.00";
  if (cents < 0.5) return "< $0.01";
  return usd(cents);
}

/**
 * The per-unit price as a readable rate, e.g. 3000 (cents / 1,000,000 units) ->
 * "$0.03 / 1K events". Shown on the (authenticated) usage page so a customer can
 * see exactly what each meter costs as it adds up — this is their real bill, not
 * a public pricing promise. 0 -> "Free".
 */
export function rate(pricePerMillionCents: number, unit: string): string {
  if (pricePerMillionCents <= 0) return "Free";
  const perThousandDollars = pricePerMillionCents / 1000 / 100; // $/1,000 units
  return `$${perThousandDollars.toFixed(2)} / 1K ${unit}s`;
}

/**
 * A compact count, e.g. 1234 -> "1.23K", 4_500_000 -> "4.5M". Whole numbers
 * under 1000 print as-is. Mirrors the flag panels' compaction.
 */
export function compact(n: number): string {
  if (n < 1000) return `${n}`;
  const units = [
    { v: 1e9, s: "B" },
    { v: 1e6, s: "M" },
    { v: 1e3, s: "K" },
  ];
  for (const { v, s } of units) {
    if (n >= v) {
      const scaled = n / v;
      return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(scaled >= 10 ? 1 : 2)}${s}`;
    }
  }
  return `${n}`;
}

/** A short axis-tick dollar label, e.g. 0 -> "$0", 1.5 -> "$1.50", 12 -> "$12". */
export function usdTick(dollars: number): string {
  if (dollars === 0) return "$0";
  if (dollars < 1) return `$${dollars.toFixed(2)}`;
  if (Number.isInteger(dollars)) return `$${dollars}`;
  return `$${dollars.toFixed(2)}`;
}
