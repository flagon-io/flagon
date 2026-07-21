import { describe, it, expect } from "vitest";
import {
  METERS,
  PRODUCTS,
  activeMeters,
  activeProducts,
  allocateProRata,
  applyIncludedCredit,
  billableQuantity,
  formatMeterRate,
  formatQuantity,
  getMeter,
  lineFromMeter,
  meterCostCents,
  meterRate,
  rateCostCents,
  type UsageLine,
} from "./meters";
import {
  buildUsageInvoiceLines,
  invoiceLinesTotalCents,
} from "./usage-invoice";

const flags = getMeter("flags.evaluations")!;

describe("meter registry", () => {
  it("keeps meter ids unique and well formed", () => {
    const ids = new Set<string>();
    for (const meter of METERS) {
      expect(ids.has(meter.id), `duplicate meter id ${meter.id}`).toBe(false);
      ids.add(meter.id);
      expect(meter.per, meter.id).toBeGreaterThan(0);
      expect(meter.product, meter.id).toBeTruthy();
      expect(meter.unit, meter.id).toBeTruthy();
      expect(meter.description, meter.id).toBeTruthy();
    }
  });

  it("has no free meters", () => {
    // A price of zero on a usage page reads as a promise. Something the
    // platform does not charge for stays out of the registry entirely rather
    // than shipping as "included, not charged".
    for (const meter of METERS) {
      expect(
        meter.unitAmountCents,
        `${meter.id} must be chargeable`,
      ).toBeGreaterThan(0);
    }
    expect(activeMeters().length).toBeGreaterThan(0);
  });

  it("only offers products that actually meter something", () => {
    // PRODUCTS is the label table and may name a product before it bills for
    // anything. Filter menus come from activeProducts(), so an unlaunched
    // product can never appear as a filter that always returns zero.
    const offered = activeProducts().map((product) => product.id);
    expect(offered.length).toBeGreaterThan(0);
    for (const id of offered) {
      expect(
        activeMeters().some((meter) => meter.product === id),
        `${id} is offered as a filter but has no active meters`,
      ).toBe(true);
    }
    const named = Object.keys(PRODUCTS);
    expect(offered.length).toBeLessThanOrEqual(named.length);
  });

  it("prices every evaluation, in whole cents", () => {
    // $1.00 per 1M events. The meter itself includes NOTHING: the
    // allowance is the plan's usage credit, so that one number sizes both the
    // free evaluations and the hard cap (see quota.test.ts).
    expect(meterCostCents(flags, 0)).toBe(0);
    expect(meterCostCents(flags, 1_000_000)).toBe(100);
    expect(meterCostCents(flags, 4_400_000)).toBe(440);
    // A single evaluation still rounds up to a cent rather than to nothing.
    expect(meterCostCents(flags, 1)).toBe(1);
    expect(billableQuantity(flags, 2_500_000)).toBe(2_500_000);
    expect(billableQuantity(flags, 500_000)).toBe(500_000);
  });

  it("prices from a frozen rate, not the registry", () => {
    // What a closed period does: the rate travels with the line, so changing
    // the registry tomorrow cannot move a bill that already went out.
    // The old $0.05-per-1M-with-1M-included rate, exactly as a period closed
    // before the July 2026 repricing would have frozen it.
    const oldRate = {
      unitAmountCents: 5,
      per: 1_000_000,
      includedQuantity: 1_000_000,
    };
    expect(rateCostCents(oldRate, 3_000_000)).toBe(10);
    // Same quantity, today's registry rate: deliberately different, which is
    // the whole point of freezing.
    expect(meterCostCents(flags, 3_000_000)).toBe(300);
    expect(meterRate(flags)).toEqual({
      unitAmountCents: 100,
      per: 1_000_000,
      includedQuantity: 0,
    });
  });

  it("states the rate up front", () => {
    // No "included" clause: the meter grants nothing, the plan does.
    expect(formatMeterRate(flags)).toBe("$1.00 per 1M events");
  });

  it("formats quantities for humans", () => {
    expect(formatQuantity(999)).toBe("999");
    expect(formatQuantity(12_400)).toBe("12.4K");
    expect(formatQuantity(3_400_000)).toBe("3.4M");
    expect(formatQuantity(2_000_000_000)).toBe("2B");
  });
});

describe("pro-rata allocation", () => {
  it("splits a cost so the parts sum to exactly the whole", () => {
    // The property that matters: a per-project view can never disagree with
    // the invoice, however the cents fall.
    const shares = allocateProRata(100, [1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(shares).toEqual([34, 33, 33]);
  });

  it("hands the rounding remainder to the largest contributor", () => {
    const shares = allocateProRata(10, [70, 20, 10]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10);
    expect(shares[0]).toBeGreaterThanOrEqual(shares[1]);
  });

  it("allocates nothing when there is nothing to allocate", () => {
    expect(allocateProRata(0, [5, 5])).toEqual([0, 0]);
    expect(allocateProRata(500, [0, 0])).toEqual([0, 0]);
  });
});

describe("included usage credit", () => {
  const line = (costCents: number): UsageLine => ({
    ...lineFromMeter(flags, 1),
    costCents,
  });

  it("absorbs usage up to the credit, then bills the rest", () => {
    // Pro: $20 base returns as $20 of usage.
    const under = applyIncludedCredit([line(1200)], 2000);
    expect(under.usageCents).toBe(1200);
    expect(under.creditAppliedCents).toBe(1200);
    expect(under.creditRemainingCents).toBe(800);
    expect(under.overageCents).toBe(0);

    const over = applyIncludedCredit([line(3500)], 2000);
    expect(over.creditAppliedCents).toBe(2000);
    expect(over.creditRemainingCents).toBe(0);
    expect(over.overageCents).toBe(1500);
  });

  it("handles no usage and no credit", () => {
    expect(applyIncludedCredit([], 2000)).toMatchObject({
      usageCents: 0,
      creditAppliedCents: 0,
      creditRemainingCents: 2000,
      overageCents: 0,
    });
    expect(applyIncludedCredit([line(500)], 0)).toMatchObject({
      creditAppliedCents: 0,
      overageCents: 500,
    });
  });
});

describe("invoice lines", () => {
  const period = { from: "2026-07-19", to: "2026-08-18" };
  const priced = (quantity: number, costCents: number): UsageLine => ({
    ...lineFromMeter(flags, quantity),
    costCents,
  });

  it("bills one line per meter plus the credit, totalling the overage", () => {
    const totals = applyIncludedCredit(
      [priced(3_400_000, 1700), priced(1_600_000, 800)],
      2000,
    );
    const lines = buildUsageInvoiceLines(totals, { planName: "Pro", period });

    expect(lines).toHaveLength(3);
    expect(lines[0].description).toContain("3.4M events");
    expect(lines[2].description).toBe("Included usage credit (Pro)");
    expect(lines[2].amountCents).toBe(-2000);
    // Usage $25.00 - $20.00 credit = $5.00 billed on top of the base.
    expect(invoiceLinesTotalCents(lines)).toBe(500);
    expect(invoiceLinesTotalCents(lines)).toBe(totals.overageCents);
  });

  it("adds nothing when usage stays inside the credit", () => {
    const totals = applyIncludedCredit([priced(1_000_000, 5)], 2000);
    const lines = buildUsageInvoiceLines(totals, { planName: "Pro", period });
    // Usage and credit cancel: the customer pays exactly the base price.
    expect(invoiceLinesTotalCents(lines)).toBe(0);
  });

  it("keys lines stably so re-running a period cannot duplicate them", () => {
    const totals = applyIncludedCredit([priced(1_000_000, 5)], 0);
    const first = buildUsageInvoiceLines(totals, { planName: "Pro", period });
    const second = buildUsageInvoiceLines(totals, { planName: "Pro", period });
    expect(first.map((l) => l.key)).toEqual(second.map((l) => l.key));
    // The period is part of the key, so next month's identical usage is a
    // different line rather than a duplicate that gets skipped.
    const next = buildUsageInvoiceLines(totals, {
      planName: "Pro",
      period: { from: "2026-08-19", to: "2026-09-18" },
    });
    expect(next[0].key).not.toBe(first[0].key);
  });
});
