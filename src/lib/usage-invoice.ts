import { formatQuantity, type UsageTotals } from "./meters";

/**
 * Turning a period's usage into invoice lines.
 *
 * The shape a customer should be able to read top to bottom:
 *
 *   Flagon Pro                          $20.00   (the subscription itself)
 *   Flag evaluations - 3.4M             $17.00   (one line per meter used)
 *   Storage - 12GB                       $8.00
 *   Included usage credit (Pro)        -$20.00   (what the $20 buys back)
 *   -------------------------------------------
 *   Total                               $25.00
 *
 * Every line is derived from the same summary the usage page shows, so the
 * invoice never says something the customer hasn't already seen coming.
 * Pure function: the Stripe calls live in src/lib/billing.ts.
 */
export type InvoiceLine = {
  /** Stable key so re-running a period can't duplicate lines. */
  key: string;
  description: string;
  amountCents: number;
};

export function buildUsageInvoiceLines(
  totals: UsageTotals,
  options: { planName: string; period: { from: string; to: string } },
): InvoiceLine[] {
  const lines: InvoiceLine[] = totals.lines.map((line) => ({
    key: `usage:${line.meterId}:${options.period.from}`,
    description: `${line.label} - ${formatQuantity(line.quantity)} ${line.unit}`,
    amountCents: line.costCents,
  }));

  // The credit rides as a negative line rather than a coupon so the
  // arithmetic is visible: usage in full, then what the plan absorbs.
  if (totals.creditAppliedCents > 0) {
    lines.push({
      key: `credit:included:${options.period.from}`,
      description: `Included usage credit (${options.planName})`,
      amountCents: -totals.creditAppliedCents,
    });
  }

  return lines;
}

/** What the usage lines add up to: exactly the overage, by construction. */
export function invoiceLinesTotalCents(lines: InvoiceLine[]): number {
  return lines.reduce((total, line) => total + line.amountCents, 0);
}
