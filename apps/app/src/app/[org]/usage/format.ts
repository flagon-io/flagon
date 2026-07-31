/**
 * Display formatting for the usage views. Pure — safe in both the server table
 * and the client chart.
 */

/** Cents to a plain USD string, e.g. 2035 -> "$20.35". Always two decimals. */
export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
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
