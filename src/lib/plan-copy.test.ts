import { describe, it, expect } from "vitest";
import {
  renderCopy,
  renderFeatures,
  unresolvedTokens,
  type PlanCopyContext,
} from "./plan-copy";

/**
 * Marketing copy interpolation.
 *
 * This renders numbers customers read on the public pricing page, so the two
 * failure modes worth testing are opposite: a token that silently vanishes
 * (shipping "  of included usage") and a token that quietly reports a stale
 * number. Both are worse than a visible mistake.
 */
function context(over: Partial<PlanCopyContext> = {}): PlanCopyContext {
  return {
    includedCreditCents: 2000,
    unitAmountCents: 2000,
    interval: "month",
    maxProjects: null,
    maxMembers: null,
    maxFreeOrgs: 1,
    meters: [
      {
        meter: "flags.evaluations",
        mode: "included",
        includedQuantity: 20_000_000,
        hardCap: null,
      },
      {
        meter: "flags.syncs",
        mode: "included",
        includedQuantity: 50_000_000,
        hardCap: 5_000_000,
      },
    ],
    ...over,
  };
}

describe("plan copy tokens", () => {
  it("fills money and interval from the plan", () => {
    expect(renderCopy("{credit} of included usage", context())).toBe(
      "$20.00 of included usage",
    );
    expect(renderCopy("{price} per {interval}", context())).toBe(
      "$20.00 per month",
    );
  });

  it("renders an absent limit as Unlimited rather than a blank", () => {
    expect(renderCopy("{projects} projects", context())).toBe(
      "Unlimited projects",
    );
    expect(
      renderCopy("{projects} projects", context({ maxProjects: 2 })),
    ).toBe("2 projects");
  });

  it("fills per-meter quantities, abbreviated the way the UI shows them", () => {
    expect(
      renderCopy("{flags.evaluations.included} evaluations", context()),
    ).toBe("20M evaluations");
    expect(renderCopy("up to {flags.syncs.cap} syncs", context())).toBe(
      "up to 5M syncs",
    );
  });

  /**
   * The number moving is the entire point: copy written once must re-render
   * against whatever the plan says today, or it becomes a lie on the pricing
   * page the first time someone changes a price.
   */
  it("tracks the plan when its numbers change", () => {
    const repriced = context({
      includedCreditCents: 10_000,
      meters: [
        {
          meter: "flags.evaluations",
          mode: "included",
          includedQuantity: 100_000_000,
          hardCap: null,
        },
      ],
    });
    expect(
      renderCopy(
        "{credit} covers {flags.evaluations.included} evaluations",
        repriced,
      ),
    ).toBe("$100.00 covers 100M evaluations");
  });

  /**
   * A typo must stay VISIBLE. Blanking it would ship a sentence with a hole in
   * it, which reads as finished copy and so never gets fixed.
   */
  it("leaves an unresolvable token in place", () => {
    expect(renderCopy("{creditt} of usage", context())).toBe(
      "{creditt} of usage",
    );
    expect(renderCopy("{nope.included} things", context())).toBe(
      "{nope.included} things",
    );
  });

  it("reports unresolvable tokens so the editor can warn", () => {
    expect(
      unresolvedTokens(["{credit} ok", "{creditt} bad", "{nope.cap} bad"], context()),
    ).toEqual(["creditt", "nope.cap"]);
    expect(unresolvedTokens(["{credit} of usage"], context())).toEqual([]);
  });

  /** An unbilled tier has no credit; quoting one would invent a promise. */
  it("does not invent a credit for an unbilled plan", () => {
    const free = context({ includedCreditCents: null, unitAmountCents: null });
    expect(renderCopy("{credit} of usage", free)).toBe("{credit} of usage");
    expect(unresolvedTokens(["{credit} of usage"], free)).toEqual(["credit"]);
  });

  /** A meter the plan does not offer has no quantity to quote. */
  it("resolves nothing for an unavailable meter", () => {
    const limited = context({
      meters: [
        {
          meter: "flags.evaluations",
          mode: "unavailable",
          includedQuantity: 0,
          hardCap: null,
        },
      ],
    });
    expect(
      renderCopy("{flags.evaluations.included} evaluations", limited),
    ).toBe("{flags.evaluations.included} evaluations");
  });

  it("leaves plain copy untouched", () => {
    expect(renderFeatures(["Team collaboration", "Unlimited flags"], context())).toEqual(
      ["Team collaboration", "Unlimited flags"],
    );
  });
});
