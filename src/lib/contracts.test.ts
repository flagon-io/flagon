import { describe, it, expect } from "vitest";
import {
  contractStatus,
  daysElapsed,
  envelopeFor,
  formatTerm,
  termDays,
  termWindow,
} from "./contracts";
import { isoDay } from "./billing-period";
import { EVALUATION_METER } from "./quota";

const YEAR = { start: "2026-01-01", end: "2026-12-31" };

describe("term arithmetic", () => {
  it("counts an inclusive year", () => {
    expect(termDays(YEAR)).toBe(365);
    expect(termDays({ start: "2028-01-01", end: "2028-12-31" })).toBe(366);
  });

  it("counts a single-day term as one day, not zero", () => {
    expect(termDays({ start: "2026-05-01", end: "2026-05-01" })).toBe(1);
  });

  it("refuses an inverted term rather than returning a negative length", () => {
    expect(termDays({ start: "2026-12-31", end: "2026-01-01" })).toBe(0);
  });

  it("clamps elapsed days to the term at both ends", () => {
    // Before it starts: nothing has elapsed, so nothing can be projected.
    expect(daysElapsed(YEAR, new Date("2025-11-01T00:00:00Z"))).toBe(0);
    expect(daysElapsed(YEAR, new Date("2026-01-01T12:00:00Z"))).toBe(1);
    // After it ends it stops moving, so a finished agreement can't project
    // past its own end or drift as the calendar rolls on.
    expect(daysElapsed(YEAR, new Date("2027-06-01T00:00:00Z"))).toBe(365);
  });

  it("exposes the term as a rollup-grain window", () => {
    const window = termWindow(YEAR);
    expect(isoDay(window.from)).toBe("2026-01-01");
    expect(isoDay(window.to)).toBe("2026-12-31");
  });

  it("formats the term for the console", () => {
    expect(formatTerm(YEAR)).toBe("Jan 1, 2026 - Dec 31, 2026");
  });
});

describe("envelopes", () => {
  it("reports draw-down against the contracted volume", () => {
    const envelope = envelopeFor({
      meter: EVALUATION_METER,
      contracted: 750_000_000,
      used: 412_000_000,
      elapsedFraction: 0.61,
    });

    expect(envelope.contracted).toBe(750_000_000);
    expect(envelope.remaining).toBe(338_000_000);
    expect(envelope.usedPercent).toBeCloseTo(54.93, 1);
    // Projects to 675.4M against 750M contracted - a hair inside the 10%
    // tolerance, so it reads as on estimate rather than under. Asserted at the
    // boundary deliberately: this is where a change to the band shows up.
    expect(envelope.projected).toBe(675_409_836);
    expect(envelope.pace).toBe("on");
    // Labels come from the registry, so the API and the console agree.
    expect(envelope.label).toBe("Flag evaluations");
  });

  it("calls consumption clearly below the term's share under estimate", () => {
    const envelope = envelopeFor({
      meter: EVALUATION_METER,
      contracted: 750_000_000,
      used: 300_000_000,
      elapsedFraction: 0.61,
    });
    expect(envelope.pace).toBe("under");
  });

  it("keeps counting past the envelope instead of pinning at 100%", () => {
    // Overrun is a true-up to coordinate, not a wall. A bar that stopped at
    // 100% would hide how far over the conversation needs to cover.
    const envelope = envelopeFor({
      meter: EVALUATION_METER,
      contracted: 100_000,
      used: 250_000,
      elapsedFraction: 0.5,
    });

    expect(envelope.usedPercent).toBe(250);
    // Remaining floors at zero: there is no negative headroom.
    expect(envelope.remaining).toBe(0);
    expect(envelope.pace).toBe("over");
  });

  it("treats an unmentioned meter as silent, not as an agreement to zero", () => {
    const envelope = envelopeFor({
      meter: EVALUATION_METER,
      contracted: null,
      used: 5_000,
      elapsedFraction: 0.5,
    });

    // Null throughout rather than 0/0/100%: the agreement says nothing about
    // this meter, which must not render as an instant total breach.
    expect(envelope.contracted).toBeNull();
    expect(envelope.usedPercent).toBeNull();
    expect(envelope.pace).toBeNull();
    expect(envelope.used).toBe(5_000);
  });

  it("offers no pace before enough of the term has elapsed", () => {
    // One busy launch week into a year would otherwise project ~52x and cry
    // catastrophe. No answer beats a confident wrong one.
    const envelope = envelopeFor({
      meter: EVALUATION_METER,
      contracted: 750_000_000,
      used: 40_000_000,
      elapsedFraction: 0.02,
    });

    expect(envelope.projected).toBeNull();
    expect(envelope.pace).toBeNull();
    // The cumulative facts are still reported; only the extrapolation is held.
    expect(envelope.usedPercent).toBeCloseTo(5.33, 1);
  });

  it("tolerates ordinary variance rather than alarming on it", () => {
    // 5% ahead of a perfectly even burn is noise, not a signal.
    const envelope = envelopeFor({
      meter: EVALUATION_METER,
      contracted: 1_000_000,
      used: 525_000,
      elapsedFraction: 0.5,
    });
    expect(envelope.pace).toBe("on");
  });
});

describe("contract status", () => {
  const allowances = { [EVALUATION_METER]: 1_200_000_000 };

  it("nets a heavy summer against a quiet winter across the term", () => {
    // THE case this model exists for. Both halves are read at the same point
    // in the term, and only the cumulative view calls the customer on plan.
    //
    // Half the year gone, 55% of the volume consumed in a summer spike.
    const midYear = contractStatus({
      term: YEAR,
      meterAllowances: allowances,
      used: { [EVALUATION_METER]: 660_000_000 },
      now: new Date("2026-07-02T00:00:00Z"),
    });
    const summer = midYear.envelopes[0];
    // 10% over an even burn is inside tolerance: no alarm in July.
    expect(summer.pace).toBe("on");

    // A quiet second half pulls the average back: the term lands under.
    const yearEnd = contractStatus({
      term: YEAR,
      meterAllowances: allowances,
      used: { [EVALUATION_METER]: 900_000_000 },
      now: new Date("2026-12-31T00:00:00Z"),
    });
    const winter = yearEnd.envelopes[0];
    expect(winter.pace).toBe("under");
    expect(winter.remaining).toBe(300_000_000);
    expect(Math.round(yearEnd.elapsedPercent)).toBe(100);
  });

  it("surfaces usage on meters the agreement never mentioned", () => {
    // Exactly what a renewal review has to see, so it is never dropped.
    const status = contractStatus({
      term: YEAR,
      meterAllowances: allowances,
      used: new Map([
        [EVALUATION_METER, 10_000],
        ["flags.syncs", 4_000_000],
      ]),
      now: new Date("2026-07-02T00:00:00Z"),
    });

    expect(status.envelopes).toHaveLength(2);
    // Contracted meters lead; the unmentioned one sorts after.
    expect(status.envelopes[0].meter).toBe(EVALUATION_METER);
    expect(status.envelopes[1].meter).toBe("flags.syncs");
    expect(status.envelopes[1].contracted).toBeNull();
    expect(status.envelopes[1].used).toBe(4_000_000);
  });

  it("reports a contracted meter with no usage rather than omitting it", () => {
    const status = contractStatus({
      term: YEAR,
      meterAllowances: allowances,
      used: {},
      now: new Date("2026-07-02T00:00:00Z"),
    });

    expect(status.envelopes).toHaveLength(1);
    expect(status.envelopes[0].used).toBe(0);
    expect(status.envelopes[0].remaining).toBe(1_200_000_000);
  });

  it("survives a zero-length term without dividing by it", () => {
    const status = contractStatus({
      term: { start: "2026-12-31", end: "2026-01-01" },
      meterAllowances: allowances,
      used: { [EVALUATION_METER]: 5 },
      now: new Date("2026-07-02T00:00:00Z"),
    });

    expect(status.daysTotal).toBe(0);
    expect(status.elapsedPercent).toBe(0);
    expect(status.envelopes[0].pace).toBeNull();
  });
});
