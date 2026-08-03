import { describe, expect, it } from "vitest";
import {
  analyzeContinuous,
  analyzeConversion,
  analyzeCuped,
  cupedAdjust,
  betaCdf,
  betaProbabilityToBeat,
  chiSquareCdf,
  correctSignificance,
  erf,
  incompleteBeta,
  normalCdf,
  normInv,
  relativeRiskCi,
  sampleSizePerArm,
  sampleVariance,
  sequentialTest,
  srm,
  studentTCdf,
  studentTQuantile,
  wilsonInterval,
} from "./stats.js";

const near = (a: number, b: number, tol = 1e-3) => Math.abs(a - b) <= tol;

describe("special functions", () => {
  it("erf matches known values", () => {
    expect(near(erf(0), 0)).toBe(true);
    expect(near(erf(1), 0.8427, 1e-3)).toBe(true);
    expect(near(erf(-1), -0.8427, 1e-3)).toBe(true);
    expect(near(erf(3), 0.99998, 1e-4)).toBe(true);
  });

  it("normalCdf matches the standard normal table", () => {
    expect(near(normalCdf(0), 0.5)).toBe(true);
    expect(near(normalCdf(1.96), 0.975, 1e-3)).toBe(true);
    expect(near(normalCdf(-1.96), 0.025, 1e-3)).toBe(true);
    expect(near(normalCdf(2.576), 0.995, 1e-3)).toBe(true);
  });

  it("normInv inverts normalCdf", () => {
    expect(near(normInv(0.5), 0)).toBe(true);
    expect(near(normInv(0.975), 1.95996, 1e-3)).toBe(true);
    expect(near(normInv(0.995), 2.5758, 1e-3)).toBe(true);
    // round trip
    expect(near(normalCdf(normInv(0.83)), 0.83, 1e-4)).toBe(true);
  });

  it("incompleteBeta / betaCdf are correct on known cases", () => {
    // Uniform: Beta(1,1) CDF is the identity.
    expect(near(betaCdf(0.37, 1, 1), 0.37, 1e-6)).toBe(true);
    // Symmetric Beta(2,2): median at 0.5.
    expect(near(betaCdf(0.5, 2, 2), 0.5, 1e-6)).toBe(true);
    expect(near(incompleteBeta(0, 3, 5), 0)).toBe(true);
    expect(near(incompleteBeta(1, 3, 5), 1)).toBe(true);
  });

  it("studentTCdf and its quantile agree with t-tables", () => {
    expect(near(studentTCdf(0, 10), 0.5)).toBe(true);
    // t critical, df=10, upper 0.975 tail ~ 2.228
    expect(near(studentTCdf(2.228, 10), 0.975, 2e-3)).toBe(true);
    expect(near(studentTQuantile(0.975, 10), 2.228, 5e-3)).toBe(true);
    expect(near(studentTQuantile(0.975, 1000), 1.9623, 5e-3)).toBe(true);
  });

  it("chiSquareCdf matches critical values", () => {
    expect(near(chiSquareCdf(0, 1), 0)).toBe(true);
    // chi-square df=1, 0.95 quantile ~ 3.841
    expect(near(chiSquareCdf(3.841, 1), 0.95, 2e-3)).toBe(true);
    // df=2, 0.95 quantile ~ 5.991
    expect(near(chiSquareCdf(5.991, 2), 0.95, 2e-3)).toBe(true);
  });
});

describe("sampleVariance", () => {
  it("recovers variance from sufficient statistics", () => {
    // values 2,4,4,4,5,5,7,9 -> mean 5, sample var 4.571...
    const vals = [2, 4, 4, 4, 5, 5, 7, 9];
    const n = vals.length;
    const sum = vals.reduce((a, b) => a + b, 0);
    const sumSq = vals.reduce((a, b) => a + b * b, 0);
    expect(near(sampleVariance(n, sum, sumSq), 4.5714, 1e-3)).toBe(true);
  });
  it("is zero below two observations", () => {
    expect(sampleVariance(1, 5, 25)).toBe(0);
    expect(sampleVariance(0, 0, 0)).toBe(0);
  });
});

describe("wilsonInterval", () => {
  it("brackets the point estimate and stays in [0,1]", () => {
    const [lo, hi] = wilsonInterval(140, 1000, 1.96);
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeLessThan(1);
    expect(lo).toBeLessThan(0.14);
    expect(hi).toBeGreaterThan(0.14);
    // Known Wilson 95% CI for 140/1000 ~ [0.1198, 0.1633]
    expect(near(lo, 0.1198, 3e-3)).toBe(true);
    expect(near(hi, 0.1633, 3e-3)).toBe(true);
  });
});

describe("relativeRiskCi", () => {
  it("returns null bounds on zero counts", () => {
    expect(relativeRiskCi(0, 100, 10, 100, 1.96)).toEqual([null, null]);
  });
  it("brackets the observed relative lift", () => {
    const [lo, hi] = relativeRiskCi(140, 1000, 100, 1000, 1.96);
    // observed relative lift = 0.4
    expect(lo).not.toBeNull();
    expect(lo!).toBeLessThan(0.4);
    expect(hi!).toBeGreaterThan(0.4);
  });
});

describe("correctSignificance (multiple hypotheses)", () => {
  const ps = [0.01, 0.02, 0.04];
  it("no correction is just p < alpha", () => {
    expect(correctSignificance(ps, 0.05, "none")).toEqual([true, true, true]);
    expect(correctSignificance([0.01, 0.2], 0.05, "none")).toEqual([true, false]);
  });
  it("Bonferroni is strictest (alpha/m)", () => {
    // alpha/3 ≈ 0.0167 → only 0.01 clears.
    expect(correctSignificance(ps, 0.05, "bonferroni")).toEqual([true, false, false]);
  });
  it("Benjamini-Hochberg (FDR) is between none and Bonferroni", () => {
    // BH keeps all three here; strictly more powerful than Bonferroni.
    expect(correctSignificance(ps, 0.05, "bh")).toEqual([true, true, true]);
  });
  it("null p-values (control / not computable) map to false", () => {
    expect(correctSignificance([null, 0.01], 0.05, "none")).toEqual([false, true]);
    expect(correctSignificance([], 0.05, "bh")).toEqual([]);
  });
});

describe("sampleSizePerArm (power analysis)", () => {
  it("matches standard power calculators", () => {
    // 10% baseline, +10% relative (→11%), α=0.05, power=0.8 → ~14.7k per arm.
    const n = sampleSizePerArm(0.1, 0.1);
    expect(n).toBeGreaterThan(14000);
    expect(n).toBeLessThan(15500);
    // A big effect (10%→20%) needs far fewer — ~200 per arm.
    const big = sampleSizePerArm(0.1, 1.0);
    expect(big).toBeGreaterThan(150);
    expect(big).toBeLessThan(260);
  });
  it("more power / higher confidence needs more samples", () => {
    expect(sampleSizePerArm(0.1, 0.1, { power: 0.9 })).toBeGreaterThan(
      sampleSizePerArm(0.1, 0.1, { power: 0.8 }),
    );
    expect(sampleSizePerArm(0.1, 0.1, { alpha: 0.01 })).toBeGreaterThan(
      sampleSizePerArm(0.1, 0.1, { alpha: 0.05 }),
    );
  });
  it("is infinite for a zero effect or out-of-range target", () => {
    expect(sampleSizePerArm(0.1, 0)).toBe(Infinity);
    expect(sampleSizePerArm(0.9, 0.2)).toBe(Infinity); // 0.9·1.2 = 1.08 > 1
  });
});

describe("sequentialTest (always-valid / mSPRT)", () => {
  it("is 1 for no effect and stays conservative where the fixed test fires", () => {
    expect(sequentialTest(0, 1).pValue).toBe(1);
    // deltaHat=2, V=1 → z²=4 (z=2, fixed-significant). NOT sequentially significant.
    const r = sequentialTest(2, 1);
    expect(r.pValue).toBeGreaterThan(0.05);
    expect(near(r.pValue, Math.SQRT2 * Math.exp(-1), 1e-6)).toBe(true); // √2·e^-1 ≈ 0.520
  });

  it("flags a large effect and its confidence sequence is wider than the fixed CI", () => {
    const r = sequentialTest(5, 1); // z²=25
    expect(r.pValue).toBeLessThan(0.05);
    // Always-valid radius √(2·ln(800)) ≈ 3.66 se, wider than the fixed 1.96 se.
    expect(r.radius).toBeGreaterThan(1.96);
    expect(near(r.radius, Math.sqrt(2 * Math.log(2 / 0.0025)), 1e-9)).toBe(true);
  });

  it("degenerate variance is not significant", () => {
    expect(sequentialTest(1, 0).pValue).toBe(1);
    expect(sequentialTest(1, 0).radius).toBe(Infinity);
  });
});

describe("analyzeConversion", () => {
  it("finds a real winner significant with high P(beat)", () => {
    const res = analyzeConversion([
      { variantKey: "control", isControl: true, units: 1000, conversions: 100 },
      { variantKey: "treatment", isControl: false, units: 1000, conversions: 140 },
    ]);
    const control = res.variants.find((v) => v.isControl)!;
    const treat = res.variants.find((v) => !v.isControl)!;

    expect(near(control.estimate, 0.1)).toBe(true);
    expect(control.pValue).toBeNull();
    expect(near(treat.estimate, 0.14)).toBe(true);
    expect(near(treat.relativeLift!, 0.4, 1e-9)).toBe(true);
    // two-proportion z ~ 2.75 -> p ~ 0.006
    expect(treat.pValue!).toBeGreaterThan(0.004);
    expect(treat.pValue!).toBeLessThan(0.008);
    expect(treat.significant).toBe(true);
    expect(treat.probabilityToBeatControl!).toBeGreaterThan(0.99);
    expect(res.srm!.healthy).toBe(true);
  });

  it("sequential significance needs more data than the fixed test (peeking-safe)", () => {
    // n=1000: fixed-significant, but NOT yet sequentially significant.
    const small = analyzeConversion([
      { variantKey: "control", isControl: true, units: 1000, conversions: 100 },
      { variantKey: "treatment", isControl: false, units: 1000, conversions: 140 },
    ]).variants.find((v) => !v.isControl)!;
    expect(small.significant).toBe(true);
    expect(small.sequentiallySignificant).toBe(false);
    expect(small.sequentialPValue!).toBeGreaterThan(small.pValue!);

    // n=5000, same rates: now the always-valid test fires too.
    const big = analyzeConversion([
      { variantKey: "control", isControl: true, units: 5000, conversions: 500 },
      { variantKey: "treatment", isControl: false, units: 5000, conversions: 1000 },
    ]).variants.find((v) => !v.isControl)!;
    expect(big.sequentiallySignificant).toBe(true);
    expect(big.sequentialPValue!).toBeLessThan(0.05);
  });

  it("does not call a null effect significant", () => {
    const res = analyzeConversion([
      { variantKey: "control", isControl: true, units: 1000, conversions: 100 },
      { variantKey: "treatment", isControl: false, units: 1000, conversions: 102 },
    ]);
    const treat = res.variants.find((v) => !v.isControl)!;
    expect(treat.significant).toBe(false);
    expect(treat.pValue!).toBeGreaterThan(0.05);
    expect(treat.probabilityToBeatControl!).toBeGreaterThan(0.4);
    expect(treat.probabilityToBeatControl!).toBeLessThan(0.7);
  });

  it("honors a 'decrease is good' direction for P(beat)", () => {
    // treatment reduces the rate; that is the win when direction=decrease.
    const down = analyzeConversion(
      [
        { variantKey: "control", isControl: true, units: 1000, conversions: 200 },
        { variantKey: "treatment", isControl: false, units: 1000, conversions: 150 },
      ],
      { direction: "decrease" },
    );
    const t = down.variants.find((v) => !v.isControl)!;
    expect(t.probabilityToBeatControl!).toBeGreaterThan(0.99);
  });
});

describe("betaProbabilityToBeat", () => {
  it("is ~0.5 for identical arms", () => {
    const p = betaProbabilityToBeat(100, 1000, 100, 1000, "increase", 512);
    expect(near(p, 0.5, 0.03)).toBe(true);
  });
  it("approaches 1 for a strong lift", () => {
    const p = betaProbabilityToBeat(200, 1000, 100, 1000, "increase", 512);
    expect(p).toBeGreaterThan(0.999);
  });
});

describe("analyzeContinuous", () => {
  const arm = (key: string, isControl: boolean, n: number, mean: number, sd: number) => ({
    variantKey: key,
    isControl,
    n,
    sum: mean * n,
    sumSq: n * (sd * sd + mean * mean),
  });

  it("Welch t-test flags a real mean shift at scale", () => {
    const res = analyzeContinuous([
      arm("control", true, 1000, 50, 10),
      arm("treatment", false, 1000, 52, 10),
    ]);
    const t = res.variants.find((v) => !v.isControl)!;
    // t ~ 4.47 -> p far below 0.05
    expect(t.pValue!).toBeLessThan(1e-4);
    expect(t.significant).toBe(true);
    expect(near(t.relativeLift!, 0.04, 1e-9)).toBe(true);
    expect(t.probabilityToBeatControl!).toBeGreaterThan(0.999);
  });

  it("does not over-call a small sample", () => {
    const res = analyzeContinuous([
      arm("control", true, 100, 50, 10),
      arm("treatment", false, 100, 52, 10),
    ]);
    const t = res.variants.find((v) => !v.isControl)!;
    // t ~ 1.41, df ~ 198 -> p ~ 0.16
    expect(t.pValue!).toBeGreaterThan(0.1);
    expect(t.pValue!).toBeLessThan(0.2);
    expect(t.significant).toBe(false);
  });
});

describe("srm", () => {
  it("passes a clean even split", () => {
    const r = srm([
      { variantKey: "a", count: 5000 },
      { variantKey: "b", count: 5050 },
    ])!;
    expect(r.healthy).toBe(true);
    expect(r.pValue).toBeGreaterThan(0.1);
  });

  it("flags a broken split", () => {
    const r = srm([
      { variantKey: "a", count: 6000 },
      { variantKey: "b", count: 4000 },
    ])!;
    expect(r.healthy).toBe(false);
    expect(r.pValue).toBeLessThan(0.001);
  });

  it("respects expected weights (90/10 by design is healthy)", () => {
    const r = srm(
      [
        { variantKey: "a", count: 9000 },
        { variantKey: "b", count: 1000 },
      ],
      { expectedWeights: { a: 90, b: 10 } },
    )!;
    expect(r.healthy).toBe(true);
  });

  it("returns null without at least two arms or traffic", () => {
    expect(srm([{ variantKey: "a", count: 100 }])).toBeNull();
    expect(srm([
      { variantKey: "a", count: 0 },
      { variantKey: "b", count: 0 },
    ])).toBeNull();
  });
});

describe("CUPED variance reduction", () => {
  // Build per-arm sufficient stats from explicit per-unit (x, y) pairs.
  const armFrom = (
    variantKey: string,
    isControl: boolean,
    pairs: [number, number][],
  ) => {
    let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0;
    for (const [x, y] of pairs) {
      sumX += x; sumY += y; sumXX += x * x; sumYY += y * y; sumXY += x * y;
    }
    return { variantKey, isControl, n: pairs.length, sumX, sumY, sumXX, sumYY, sumXY };
  };
  const contFrom = (variantKey: string, isControl: boolean, ys: number[]) => ({
    variantKey,
    isControl,
    n: ys.length,
    sum: ys.reduce((s, v) => s + v, 0),
    sumSq: ys.reduce((s, v) => s + v * v, 0),
  });

  // y = 3x + small structured noise, treatment adds a +1.5 lift. x (pre-period
  // covariate) explains almost all variance, so CUPED should nearly erase it.
  const LIFT = 1.5;
  const ctrlPairs: [number, number][] = [];
  const trtPairs: [number, number][] = [];
  for (let i = 0; i < 100; i++) {
    const xc = i % 20, xt = i % 20;
    ctrlPairs.push([xc, 3 * xc + (i % 5)]);
    trtPairs.push([xt, 3 * xt + (i % 5) + LIFT]);
  }

  it("computes theta ~ Cov(Y,X)/Var(X) and reports variance removed", () => {
    const { info } = cupedAdjust([
      armFrom("control", true, ctrlPairs),
      armFrom("treatment", false, trtPairs),
    ]);
    expect(info.applied).toBe(true);
    expect(near(info.theta, 3, 0.15)).toBe(true); // y = 3x + noise
    expect(info.varianceReduction).toBeGreaterThan(0.9); // x explains the bulk
    expect(info.varianceReduction).toBeLessThanOrEqual(1);
  });

  it("preserves the pooled mean exactly", () => {
    const arms = [armFrom("control", true, ctrlPairs), armFrom("treatment", false, trtPairs)];
    const { arms: adj } = cupedAdjust(arms);
    const rawTotal = arms.reduce((s, a) => s + a.sumY, 0);
    const adjTotal = adj.reduce((s, a) => s + a.sum, 0);
    expect(Math.abs(adjTotal - rawTotal)).toBeLessThan(1e-6);
  });

  it("reaches significance that the raw analysis misses", () => {
    const rawP = analyzeContinuous([
      contFrom("control", true, ctrlPairs.map(([, y]) => y)),
      contFrom("treatment", false, trtPairs.map(([, y]) => y)),
    ]).variants.find((v) => !v.isControl)!.pValue!;

    const cuped = analyzeCuped([
      armFrom("control", true, ctrlPairs),
      armFrom("treatment", false, trtPairs),
    ]);
    const cupedV = cuped.variants.find((v) => !v.isControl)!;

    expect(cuped.family).toBe("continuous");
    expect(cuped.cuped?.applied).toBe(true);
    expect(cupedV.pValue!).toBeLessThan(rawP); // tighter
    expect(cupedV.significant).toBe(true); // and now detectable
    expect(rawP).toBeGreaterThan(0.05); // raw could not see it
  });

  it("is a graceful no-op when the covariate has no variance", () => {
    const flat: [number, number][] = Array.from({ length: 50 }, (_, i) => [5, i % 7]);
    const { arms: adj, info } = cupedAdjust([
      armFrom("control", true, flat),
      armFrom("treatment", false, flat),
    ]);
    expect(info.applied).toBe(false);
    expect(info.theta).toBe(0);
    // Y* == Y when theta is 0.
    expect(adj[0]!.sum).toBe(flat.reduce((s, [, y]) => s + y, 0));
  });
});
