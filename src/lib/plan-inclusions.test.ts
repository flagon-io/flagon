import { describe, it, expect } from "vitest";
import { applyIncludedCredit, getMeter, lineFromMeter } from "./meters";
import { rateForMeter, resolveEntitlements } from "./entitlements";

/**
 * How a plan's two inclusion mechanisms interact.
 *
 * A plan can grant usage two different ways, and they are NOT alternatives -
 * they compose, in a specific order:
 *
 *   1. per-meter `included_quantity` is subtracted from the quantity first
 *   2. the pooled `included_credit_cents` then absorbs whatever that cost
 *
 * Pro uses mechanism 2 for evaluations (included_quantity 0, covered by the $20
 * credit) and mechanism 1 for syncs (50M, a bandwidth guardrail the credit is
 * not meant to buy). That is why the editor shows 0 evaluations for a plan that
 * effectively includes 20M of them.
 *
 * These tests exist because the composition is easy to get wrong in the
 * expensive direction: setting both on the same meter gives the customer both.
 */
const EVAL = "flags.evaluations";
const SYNC = "flags.syncs";

/** Price a period the way usageSummary does, for one org's resolved terms. */
function priceUsage(
  entitlements: ReturnType<typeof resolveEntitlements>,
  usage: Record<string, number>,
) {
  const lines = Object.entries(usage).map(([meterId, quantity]) => {
    const meter = getMeter(meterId);
    if (!meter) throw new Error(`unknown meter ${meterId}`);
    return lineFromMeter(
      meter,
      quantity,
      rateForMeter(entitlements, meterId) ?? undefined,
    );
  });
  return applyIncludedCredit(lines, entitlements.includedCreditCents);
}

/** Pro as seeded: $20 credit, 0 evaluations declared, 50M syncs. */
const pro = () =>
  resolveEntitlements({
    plan: "pro",
    price: {
      billable: true,
      includedCreditCents: 2000,
      meterAllowances: { [EVAL]: 0, [SYNC]: 50_000_000 },
      hardCaps: {},
    },
  });

describe("pooled credit as the inclusion mechanism", () => {
  /**
   * The number an operator actually cares about: what does Pro include?
   * Nothing declares 20M anywhere - it falls out of $20 at $1.00/1M.
   */
  it("covers 20M evaluations with the $20 credit, despite declaring 0", () => {
    const atAllowance = priceUsage(pro(), { [EVAL]: 20_000_000 });
    expect(atAllowance.usageCents).toBe(2000);
    expect(atAllowance.creditAppliedCents).toBe(2000);
    expect(atAllowance.overageCents).toBe(0);

    // One million past it bills exactly one million's worth.
    const over = priceUsage(pro(), { [EVAL]: 21_000_000 });
    expect(over.overageCents).toBe(100);
  });

  /**
   * POOLED, not per-product. The same credit spent on syncs instead leaves less
   * for evaluations - which is the whole point, and the reason the plan cannot
   * advertise a fixed evaluation count.
   */
  it("is spent across meters, not allocated per meter", () => {
    // 60M syncs = 10M past the 50M allowance = $7.50, taken from the same $20.
    const mixed = priceUsage(pro(), { [EVAL]: 12_000_000, [SYNC]: 60_000_000 });
    expect(mixed.usageCents).toBe(1200 + 750);
    expect(mixed.overageCents).toBe(0);
    // Now the credit is exhausted and evaluations start billing sooner.
    const more = priceUsage(pro(), { [EVAL]: 14_000_000, [SYNC]: 60_000_000 });
    expect(more.usageCents).toBe(1400 + 750);
    expect(more.overageCents).toBe(150);
  });

  /** The per-meter allowance is free BEFORE the credit is touched. */
  it("does not spend credit on usage inside a per-meter allowance", () => {
    const inside = priceUsage(pro(), { [SYNC]: 50_000_000 });
    expect(inside.usageCents).toBe(0);
    expect(inside.creditAppliedCents).toBe(0);
  });
});

describe("the two mechanisms stack", () => {
  /**
   * THE FOOTGUN. Declaring 20M evaluations while leaving the $20 credit in
   * place does not "make the 20M explicit" - it grants 20M AND another 20M
   * bought by the credit. An operator tidying up the editor could double what
   * the plan gives away without touching the price.
   */
  it("gives BOTH the declared quantity and the credit", () => {
    const doubled = resolveEntitlements({
      plan: "pro",
      price: {
        billable: true,
        includedCreditCents: 2000,
        meterAllowances: { [EVAL]: 20_000_000, [SYNC]: 50_000_000 },
        hardCaps: {},
      },
    });

    // 40M is free: 20M declared, then $20 of credit buys the next 20M.
    const atForty = priceUsage(doubled, { [EVAL]: 40_000_000 });
    expect(atForty.overageCents).toBe(0);
    // Only past 40M does anything bill.
    expect(priceUsage(doubled, { [EVAL]: 41_000_000 }).overageCents).toBe(100);
  });

  /** Declaring the quantity and zeroing the credit is the honest swap. */
  it("is equivalent to the credit when the credit is removed", () => {
    const declared = resolveEntitlements({
      plan: "pro",
      price: {
        billable: true,
        includedCreditCents: 0,
        meterAllowances: { [EVAL]: 20_000_000, [SYNC]: 50_000_000 },
        hardCaps: {},
      },
    });
    expect(priceUsage(declared, { [EVAL]: 20_000_000 }).overageCents).toBe(0);
    expect(priceUsage(declared, { [EVAL]: 21_000_000 }).overageCents).toBe(100);
  });
});
