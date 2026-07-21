import { describe, it, expect } from "vitest";
import { calendarMonthPeriod } from "./billing-period";
import { getMeter, rateCostCents } from "./meters";
import { PLANS } from "./plans";
import {
  EVALUATION_METER,
  SYNC_METER,
  allowanceFor,
  counterMonth,
  counterPeriodStart,
  evaluationAllowance,
  exceedsAllowance,
  hardCap,
  planRate,
  pricingAllowance,
} from "./quota";

describe("evaluation allowance", () => {
  it("caps Hobby at exactly what its credit buys", () => {
    // $10.00 at $1.00 per 1M = 10M events a month.
    expect(evaluationAllowance("free")).toBe(10_000_000);
  });

  it("puts 20M inside Pro's base, even though Pro is not capped", () => {
    // The same arithmetic the cap uses, applied to Pro's credit: $20 at
    // $1.00 per 1M is the 20M the pricing page advertises. Pro is uncapped,
    // so this is what it gets for free rather than a ceiling.
    const meter = getMeter(EVALUATION_METER)!;
    expect(allowanceFor(meter, PLANS.pro.includedUsageCents)).toBe(20_000_000);
  });

  it("derives the cap from the registry rather than restating it", () => {
    // The point of the derivation: this arithmetic and the enforced number are
    // the same number, so re-pricing the meter moves the cap automatically.
    const meter = getMeter(EVALUATION_METER)!;
    const derived =
      meter.includedQuantity +
      (PLANS.free.includedUsageCents / meter.unitAmountCents) * meter.per;
    expect(evaluationAllowance("free")).toBe(derived);
  });

  it("leaves paid plans uncapped", () => {
    // Going over produces a bill, never a refusal - and Enterprise contracts
    // promise no hard caps in writing.
    expect(evaluationAllowance("pro")).toBeNull();
    expect(evaluationAllowance("enterprise")).toBeNull();
  });

  it("fails toward the cap when a rate is missing or malformed", () => {
    const included = { unitAmountCents: 0, per: 0, includedQuantity: 25 };
    // A pricing typo must not read as "infinite credit".
    expect(allowanceFor(included, 500)).toBe(25);
    expect(allowanceFor({ ...included, unitAmountCents: 5, per: 100 }, 0)).toBe(25);
  });

  it("floors partial units: a fraction of a unit is not an entitlement", () => {
    const rate = { unitAmountCents: 3, per: 10, includedQuantity: 0 };
    // 10c / 3c per 10 units = 33.33 units -> 33.
    expect(allowanceFor(rate, 10)).toBe(33);
  });
});

describe("allowance boundary", () => {
  const limit = 10_000_000;

  it("admits usage up to and including the limit, and no further", () => {
    // The exact boundary, from both sides. Landing precisely ON the allowance
    // is allowed; one unit past it is not.
    expect(exceedsAllowance(limit, limit - 1, 1)).toBe(false);
    expect(exceedsAllowance(limit, limit, 0)).toBe(false);
    expect(exceedsAllowance(limit, limit, 1)).toBe(true);
    expect(exceedsAllowance(limit, limit - 1, 2)).toBe(true);
  });

  it("rejects a batch that would straddle the limit, whole", () => {
    // All-or-nothing: a 10-flag evaluation with 4 units of headroom is
    // refused rather than partially served, so the receipt and the response
    // always describe the same amount of work.
    expect(exceedsAllowance(limit, limit - 4, 10)).toBe(true);
  });

  it("never rejects an uncapped plan", () => {
    expect(exceedsAllowance(null, Number.MAX_SAFE_INTEGER, 1_000_000)).toBe(false);
  });
});

describe("sync guardrail", () => {
  it("hard-caps Hobby but never Pro or Enterprise", () => {
    // The guardrail exists because config syncs are real bandwidth and scale
    // with SDK instance count, so a polling fleet costs us money while
    // generating no evaluations at all.
    expect(hardCap("free", SYNC_METER)).toBe(5_000_000);
    expect(hardCap("pro", SYNC_METER)).toBeNull();
    expect(hardCap("enterprise", SYNC_METER)).toBeNull();
  });

  it("gives Pro the 50M allowance the pricing page promises", () => {
    // What is FREE, which is a different question from what is ALLOWED: Pro
    // is billed past this, never refused.
    expect(pricingAllowance("pro", SYNC_METER)).toBe(50_000_000);
    expect(pricingAllowance("free", SYNC_METER)).toBe(5_000_000);
  });

  it("prices the same quantity differently per plan", () => {
    // The reason planRate exists: one meter, two allowances. 60M syncs is 10M
    // billable on Pro and 55M billable on Hobby.
    const pro = planRate("pro", SYNC_METER)!;
    const free = planRate("free", SYNC_METER)!;
    expect(rateCostCents(pro, 60_000_000)).toBe(750);
    expect(rateCostCents(free, 60_000_000)).toBe(4125);
    // Inside the allowance, nothing is charged on either.
    expect(rateCostCents(pro, 50_000_000)).toBe(0);
  });

  it("leaves meters without a plan entry on their own included quantity", () => {
    // flags.evaluations has no per-plan allowance; its ceiling comes from the
    // usage credit instead, so the meter's own zero must survive untouched.
    expect(pricingAllowance("pro", EVALUATION_METER)).toBe(0);
    expect(planRate("pro", EVALUATION_METER)?.includedQuantity).toBe(0);
  });

  it("returns null for a meter that is not in the registry", () => {
    expect(planRate("pro", "nope.nothing")).toBeNull();
    expect(hardCap("pro", "nope.nothing")).toBeNull();
  });
});

describe("counter period", () => {
  it("keys on the org's own billing window, not the calendar", () => {
    // An anniversary cycle counts the 19th to the 19th, exactly like the
    // invoice. Keying on the month here would give one product two different
    // answers to "this period".
    expect(
      counterPeriodStart({
        from: new Date("2026-07-19T00:00:00Z"),
        to: new Date("2026-08-18T00:00:00Z"),
      }),
    ).toBe("2026-07-19");
  });

  it("falls back to the calendar month when there is no cycle", () => {
    // Hobby has no subscription, so its window IS the calendar month. This is
    // why drizzle/0027 was a pure rename for every row that existed.
    expect(
      counterPeriodStart(calendarMonthPeriod(new Date("2026-03-17T23:30:00Z"))),
    ).toBe("2026-03-01");
  });
});

describe("counter month", () => {
  it("keys on the first day of the UTC month", () => {
    expect(counterMonth(new Date("2026-03-17T23:30:00Z"))).toBe("2026-03-01");
    expect(counterMonth(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
    expect(counterMonth(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-01");
  });

  it("rolls on the UTC boundary, not a local one", () => {
    // 2026-03-31T23:00 in UTC+2 is already April locally; the counter must
    // still be March's, or a westward deploy would reset caps early.
    expect(counterMonth(new Date("2026-03-31T23:00:00Z"))).toBe("2026-03-01");
    expect(counterMonth(new Date("2026-04-01T00:00:00Z"))).toBe("2026-04-01");
  });
});
