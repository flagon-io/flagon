/**
 * The experiment statistics engine. PURE: given each arm's sufficient statistics
 * it returns a full frequentist + Bayesian read of a metric. No I/O, no clock, no
 * randomness — every result is exactly reproducible for the same inputs, so it is
 * exhaustively unit-testable (mirrors the flag evaluation engine's discipline).
 *
 * Two metric families, both compared against a designated control arm:
 *   - CONVERSION (binary): rate = converted units / exposed units. Two-proportion
 *     z-test + pooled p-value, Wilson score interval, relative-lift CI via the
 *     log-relative-risk SE, and a Bayesian P(beat control) from Beta-Binomial
 *     posteriors integrated on a grid.
 *   - CONTINUOUS (mean / count / sum-per-unit): Welch's t-test (unequal variance)
 *     + Student-t p-value, t-interval on the mean, relative-lift CI via the delta
 *     method, and a Normal-approximation Bayesian P(beat control).
 *
 * Plus a sample-ratio-mismatch (SRM) chi-square guardrail that flags broken
 * assignment. The shape is chosen so sequential/always-valid tests and CUPED
 * variance reduction can be layered on later without changing this contract.
 *
 * The numeric special functions (erf, incomplete beta/gamma, inverse normal) are
 * standard textbook approximations (Abramowitz & Stegun, Numerical Recipes,
 * Acklam) implemented locally so the engine has zero dependencies.
 */

// ============================================================================
// Numeric special functions
// ============================================================================

/** Standard normal PDF. */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Error function (Abramowitz & Stegun 7.1.26), max error ~1.5e-7. */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF. */
export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/**
 * Inverse standard normal CDF (quantile) via Acklam's rational approximation,
 * relative error < 1.15e-9. Used for confidence-interval z multipliers.
 */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number;
  let r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q +
        c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r +
        a[5]!) *
        q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  );
}

/** Natural log of the gamma function (Lanczos approximation). */
export function lnGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return (
      Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x)
    );
  }
  x -= 1;
  let a = c[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Regularized incomplete beta function I_x(a,b) (Numerical Recipes: betacf
 * continued fraction). Underlies the Student-t and Beta CDFs.
 */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta =
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(lbeta);
  // Use the symmetry relation for faster continued-fraction convergence.
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betacf(x, a, b)) / a;
  }
  return 1 - (Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + b * Math.log(1 - x) + a * Math.log(x),
  ) * betacf(1 - x, b, a)) / b;
}

function betacf(x: number, a: number, b: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Student-t CDF for t with df degrees of freedom. */
export function studentTCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const ib = 0.5 * incompleteBeta(x, df / 2, 0.5);
  return t > 0 ? 1 - ib : ib;
}

/** Student-t two-sided quantile t* such that P(|T| <= t*) = 1 - alpha (bisection). */
export function studentTQuantile(p: number, df: number): number {
  // p is the cumulative prob (e.g. 0.975). Invert studentTCdf by bisection.
  if (p <= 0.5) return -studentTQuantile(1 - p, df);
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Beta CDF I_x(a,b). */
export function betaCdf(x: number, a: number, b: number): number {
  return incompleteBeta(x, a, b);
}

/** Beta PDF. */
export function betaPdf(x: number, a: number, b: number): number {
  if (x <= 0 || x >= 1) return 0;
  const ln =
    (a - 1) * Math.log(x) +
    (b - 1) * Math.log(1 - x) -
    (lnGamma(a) + lnGamma(b) - lnGamma(a + b));
  return Math.exp(ln);
}

/**
 * Lower regularized incomplete gamma P(a,x) (Numerical Recipes: series +
 * continued fraction). Underlies the chi-square CDF used by the SRM check.
 */
export function lowerGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    // Series representation.
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  // Continued fraction for the complement, then 1 - that.
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  return 1 - q;
}

/** Chi-square CDF with k degrees of freedom. */
export function chiSquareCdf(x: number, k: number): number {
  return lowerGammaP(k / 2, x / 2);
}

export type Correction = "none" | "bonferroni" | "bh";

/**
 * Multiple-hypothesis correction across a FAMILY of p-values (every treatment×metric
 * comparison in an experiment). Returns, per input, whether it clears the corrected
 * bar — so testing many metrics/arms doesn't inflate false positives.
 *   - 'none': p < alpha.
 *   - 'bonferroni': p < alpha/m (family-wise error rate).
 *   - 'bh': Benjamini-Hochberg FDR — sort ascending, find the largest rank k with
 *     p_(k) <= (k/m)·alpha, reject all p <= p_(k).
 * Null p-values (control arm / not computable) map to false.
 */
export function correctSignificance(
  pValues: (number | null)[],
  alpha: number,
  method: Correction,
): boolean[] {
  const idx = pValues
    .map((p, i) => ({ p, i }))
    .filter((x): x is { p: number; i: number } => x.p !== null);
  const m = idx.length;
  const out = new Array(pValues.length).fill(false);
  if (m === 0) return out;

  if (method === "bonferroni") {
    const thr = alpha / m;
    for (const x of idx) out[x.i] = x.p < thr;
    return out;
  }
  if (method === "bh") {
    const sorted = [...idx].sort((a, b) => a.p - b.p);
    let cutoff = -1;
    sorted.forEach((x, rank) => {
      if (x.p <= ((rank + 1) / m) * alpha) cutoff = x.p;
    });
    for (const x of idx) out[x.i] = cutoff >= 0 && x.p <= cutoff;
    return out;
  }
  for (const x of idx) out[x.i] = x.p < alpha;
  return out;
}

/**
 * Always-valid (anytime) inference via a self-tuning mSPRT — a mixture Sequential
 * Probability Ratio Test with the mixture variance set to the effect estimate's
 * own variance (τ² = V). Unlike a fixed-horizon p-value, this stays valid under
 * CONTINUOUS MONITORING: peek any time and stop the moment it's significant without
 * inflating the false-positive rate (the peeking-safety Statsig is known for). It
 * is deliberately more conservative than the fixed test — roughly |z| ≳ 3.9 vs 1.96
 * — which is the price of safe peeking.
 *
 * With τ² = V the mixture likelihood ratio is Λ = √(1/2)·exp(z²/4) (z² = δ̂²/V), so
 * the anytime p-value is min(1, √2·exp(−z²/4)) and the confidence-sequence
 * half-width on δ̂ is √(2V·ln(2/α²)).
 */
export function sequentialTest(
  deltaHat: number,
  varDelta: number,
  alpha = 0.05,
): { pValue: number; radius: number } {
  if (!(varDelta > 0)) return { pValue: 1, radius: Infinity };
  const z2 = (deltaHat * deltaHat) / varDelta;
  const pValue = Math.min(1, Math.SQRT2 * Math.exp(-z2 / 4));
  const radius = Math.sqrt(2 * varDelta * Math.log(2 / (alpha * alpha)));
  return { pValue, radius };
}

/**
 * Power analysis: the sample size PER ARM a two-proportion test needs to detect a
 * `mde` RELATIVE change from a `baseline` conversion rate, at significance `alpha`
 * and statistical `power` (1 − β). Standard normal approximation:
 *
 *   n = ( z_{α/2}·√(2·p̄(1−p̄)) + z_power·√(p₁(1−p₁)+p₂(1−p₂)) )² / (p₂−p₁)²
 *
 * where p₁ = baseline, p₂ = p₁(1+mde), p̄ = (p₁+p₂)/2. Returns Infinity for a zero
 * effect or an out-of-range target rate. Answers "how many users per arm before I
 * can trust a result" and, with current enrollment, how far along an experiment is.
 */
export function sampleSizePerArm(
  baseline: number,
  mde: number,
  opts: { alpha?: number; power?: number } = {},
): number {
  const alpha = opts.alpha ?? 0.05;
  const power = opts.power ?? 0.8;
  const p1 = baseline;
  const p2 = baseline * (1 + mde);
  const delta = p2 - p1;
  if (!(Math.abs(delta) > 0) || p1 <= 0 || p1 >= 1 || p2 <= 0 || p2 >= 1) {
    return Infinity;
  }
  const zA = normInv(1 - alpha / 2);
  const zB = normInv(power);
  const pBar = (p1 + p2) / 2;
  const num =
    zA * Math.sqrt(2 * pBar * (1 - pBar)) +
    zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((num * num) / (delta * delta));
}

// ============================================================================
// Public analysis API
// ============================================================================

export type Direction = "increase" | "decrease";

export interface ConversionArmInput {
  variantKey: string;
  isControl: boolean;
  units: number;
  conversions: number;
}

export interface ContinuousArmInput {
  variantKey: string;
  isControl: boolean;
  n: number;
  sum: number;
  sumSq: number;
}

export interface VariantAnalysis {
  variantKey: string;
  isControl: boolean;
  units: number;
  /** Point estimate: conversion rate, or the per-unit mean. */
  estimate: number;
  /** CI on the estimate itself (Wilson for conversion, t for continuous). */
  ciLow: number;
  ciHigh: number;
  /** vs control — null on the control arm. */
  absoluteLift: number | null;
  relativeLift: number | null;
  relativeLiftCiLow: number | null;
  relativeLiftCiHigh: number | null;
  /** Two-sided frequentist p-value vs control. */
  pValue: number | null;
  /** Bayesian probability this arm beats control, in the metric's good direction. */
  probabilityToBeatControl: number | null;
  /** p < alpha AND the relative-lift CI excludes 0. */
  significant: boolean;
  /**
   * ALWAYS-VALID (sequential) p-value — safe to peek at any time without inflating
   * the false-positive rate (mSPRT; the peeking-safety Statsig is known for). Null
   * on the control arm.
   */
  sequentialPValue: number | null;
  /** Always-valid confidence sequence on the RELATIVE lift (wider than the fixed CI). */
  sequentialCiLow: number | null;
  sequentialCiHigh: number | null;
  /** Sequentially significant: safe to STOP now and call it. */
  sequentiallySignificant: boolean;
}

export interface MetricAnalysis {
  family: "conversion" | "continuous";
  direction: Direction;
  /** Confidence level used, e.g. 0.95. */
  confidence: number;
  variants: VariantAnalysis[];
  /** SRM guardrail across all arms, or null if not enough data. */
  srm: SrmResult | null;
  /** Present when CUPED variance reduction was applied to this metric. */
  cuped?: CupedInfo;
}

export interface CupedInfo {
  /** True when a usable pre-period covariate existed (θ ≠ 0) and CUPED was applied. */
  applied: boolean;
  /** The regression coefficient θ = Cov(Y,X)/Var(X), pooled across all arms. */
  theta: number;
  /** Fraction of variance removed, ρ² = Corr(Y,X)² (0..1). Higher = tighter results. */
  varianceReduction: number;
}

/** Per-arm sufficient statistics for CUPED: the response Y and the pre-period
 *  covariate X, as sums that let a pooled θ and per-arm adjusted moments be
 *  computed without per-unit rows. */
export interface CupedArmInput {
  variantKey: string;
  isControl: boolean;
  n: number;
  sumY: number;
  sumYY: number;
  sumX: number;
  sumXX: number;
  sumXY: number;
}

export interface SrmResult {
  chiSquare: number;
  pValue: number;
  /** False when the observed split diverges from expected (assignment is suspect). */
  healthy: boolean;
}

export interface AnalyzeOptions {
  direction?: Direction;
  /** Confidence level for intervals and significance; default 0.95. */
  confidence?: number;
  /** SRM p-value threshold below which the split is flagged; default 0.001. */
  srmThreshold?: number;
  /** Expected allocation weights per variantKey for SRM; default equal. */
  expectedWeights?: Record<string, number>;
  /** Grid resolution for the Bayesian conversion integral; default 512. */
  bayesGrid?: number;
}

const clampP = (p: number): number => Math.min(1, Math.max(0, p));

/**
 * Analyze a CONVERSION (binary) metric across arms. Each arm supplies exposed
 * `units` and converted `conversions`; the control arm is the comparison
 * baseline. Returns per-arm rate + CI, and vs-control lift/p-value/P(beat).
 */
export function analyzeConversion(
  arms: ConversionArmInput[],
  opts: AnalyzeOptions = {},
): MetricAnalysis {
  const direction = opts.direction ?? "increase";
  const confidence = opts.confidence ?? 0.95;
  const alpha = 1 - confidence;
  const z = normInv(1 - alpha / 2);
  const bayesGrid = opts.bayesGrid ?? 512;

  const control = arms.find((a) => a.isControl) ?? arms[0];
  const variants: VariantAnalysis[] = arms.map((arm) => {
    const rate = arm.units > 0 ? arm.conversions / arm.units : 0;
    const [ciLow, ciHigh] = wilsonInterval(arm.conversions, arm.units, z);

    if (!control || arm.variantKey === control.variantKey) {
      return {
        variantKey: arm.variantKey,
        isControl: arm.isControl,
        units: arm.units,
        estimate: rate,
        ciLow,
        ciHigh,
        absoluteLift: null,
        relativeLift: null,
        relativeLiftCiLow: null,
        relativeLiftCiHigh: null,
        pValue: null,
        probabilityToBeatControl: null,
        significant: false,
        sequentialPValue: null,
        sequentialCiLow: null,
        sequentialCiHigh: null,
        sequentiallySignificant: false,
      };
    }

    const pC = control.units > 0 ? control.conversions / control.units : 0;
    const pV = rate;
    const absoluteLift = pV - pC;
    const relativeLift = pC > 0 ? (pV - pC) / pC : 0;

    // Two-proportion pooled z-test.
    const pPool =
      (control.conversions + arm.conversions) / (control.units + arm.units);
    const se = Math.sqrt(
      pPool * (1 - pPool) * (1 / control.units + 1 / arm.units),
    );
    const zStat = se > 0 ? (pV - pC) / se : 0;
    const pValue = clampP(2 * (1 - normalCdf(Math.abs(zStat))));

    // Relative-lift CI via the log-relative-risk standard error.
    const [rlLow, rlHigh] = relativeRiskCi(
      arm.conversions,
      arm.units,
      control.conversions,
      control.units,
      z,
    );

    const pBeat = betaProbabilityToBeat(
      arm.conversions,
      arm.units,
      control.conversions,
      control.units,
      direction,
      bayesGrid,
    );

    const significant =
      pValue < alpha && rlLow !== null && rlHigh !== null && rlLow * rlHigh > 0;

    // Always-valid (sequential) test on the absolute lift (unpooled variance),
    // projected onto the relative-lift scale so it lines up with the fixed CI.
    const varDelta =
      (pV * (1 - pV)) / arm.units + (pC * (1 - pC)) / control.units;
    const seq = sequentialTest(absoluteLift, varDelta, alpha);
    const seqExcludesZero = Math.abs(absoluteLift) > seq.radius;

    return {
      variantKey: arm.variantKey,
      isControl: arm.isControl,
      units: arm.units,
      estimate: rate,
      ciLow,
      ciHigh,
      absoluteLift,
      relativeLift,
      relativeLiftCiLow: rlLow,
      relativeLiftCiHigh: rlHigh,
      pValue,
      probabilityToBeatControl: pBeat,
      significant,
      sequentialPValue: seq.pValue,
      sequentialCiLow: pC > 0 ? (absoluteLift - seq.radius) / pC : null,
      sequentialCiHigh: pC > 0 ? (absoluteLift + seq.radius) / pC : null,
      sequentiallySignificant: seq.pValue < alpha && seqExcludesZero,
    };
  });

  return {
    family: "conversion",
    direction,
    confidence,
    variants,
    srm: srm(
      arms.map((a) => ({ variantKey: a.variantKey, count: a.units })),
      opts,
    ),
  };
}

/**
 * Analyze a CONTINUOUS metric (mean / count / sum-per-unit) across arms using
 * each arm's n, sum, and sum of squares. Welch's t-test vs control, t-interval
 * on the mean, delta-method lift CI, Normal-approximation P(beat).
 */
export function analyzeContinuous(
  arms: ContinuousArmInput[],
  opts: AnalyzeOptions = {},
): MetricAnalysis {
  const direction = opts.direction ?? "increase";
  const confidence = opts.confidence ?? 0.95;
  const alpha = 1 - confidence;
  const z = normInv(1 - alpha / 2);

  const control = arms.find((a) => a.isControl) ?? arms[0];
  const cMean = control && control.n > 0 ? control.sum / control.n : 0;
  const cVar = control ? sampleVariance(control.n, control.sum, control.sumSq) : 0;
  const cSe2 = control && control.n > 0 ? cVar / control.n : 0;

  const variants: VariantAnalysis[] = arms.map((arm) => {
    const mean = arm.n > 0 ? arm.sum / arm.n : 0;
    const variance = sampleVariance(arm.n, arm.sum, arm.sumSq);
    const se2 = arm.n > 0 ? variance / arm.n : 0;
    const se = Math.sqrt(se2);
    // t-interval on this arm's mean.
    const tq = arm.n > 1 ? studentTQuantile(1 - alpha / 2, arm.n - 1) : z;
    const ciLow = mean - tq * se;
    const ciHigh = mean + tq * se;

    if (!control || arm.variantKey === control.variantKey) {
      return {
        variantKey: arm.variantKey,
        isControl: arm.isControl,
        units: arm.n,
        estimate: mean,
        ciLow,
        ciHigh,
        absoluteLift: null,
        relativeLift: null,
        relativeLiftCiLow: null,
        relativeLiftCiHigh: null,
        pValue: null,
        probabilityToBeatControl: null,
        significant: false,
        sequentialPValue: null,
        sequentialCiLow: null,
        sequentialCiHigh: null,
        sequentiallySignificant: false,
      };
    }

    const absoluteLift = mean - cMean;
    const relativeLift = cMean !== 0 ? (mean - cMean) / cMean : 0;

    // Welch's t-test.
    const seDiff2 = cSe2 + se2;
    const seDiff = Math.sqrt(seDiff2);
    const tStat = seDiff > 0 ? (mean - cMean) / seDiff : 0;
    const df =
      seDiff2 > 0 && control.n > 1 && arm.n > 1
        ? (seDiff2 * seDiff2) /
          ((cSe2 * cSe2) / (control.n - 1) + (se2 * se2) / (arm.n - 1))
        : Math.max(1, control.n + arm.n - 2);
    const pValue = clampP(2 * (1 - studentTCdf(Math.abs(tStat), df)));

    // Delta-method CI on the relative lift (ratio mean/cMean - 1).
    let rlLow: number | null = null;
    let rlHigh: number | null = null;
    if (cMean !== 0) {
      const seRel = Math.sqrt(
        se2 / (cMean * cMean) + (cSe2 * mean * mean) / Math.pow(cMean, 4),
      );
      rlLow = relativeLift - z * seRel;
      rlHigh = relativeLift + z * seRel;
    }

    // Normal-approximation Bayesian P(beat): mean posterior ~ N(mean, se^2).
    const pGreater =
      seDiff > 0 ? normalCdf((mean - cMean) / seDiff) : mean > cMean ? 1 : 0;
    const pBeat = direction === "increase" ? pGreater : 1 - pGreater;

    const significant =
      pValue < alpha && rlLow !== null && rlHigh !== null && rlLow * rlHigh > 0;

    // Always-valid (sequential) test on the mean difference (Welch variance).
    const seq = sequentialTest(absoluteLift, seDiff2, alpha);
    const seqExcludesZero = Math.abs(absoluteLift) > seq.radius;

    return {
      variantKey: arm.variantKey,
      isControl: arm.isControl,
      units: arm.n,
      estimate: mean,
      ciLow,
      ciHigh,
      absoluteLift,
      relativeLift,
      relativeLiftCiLow: rlLow,
      relativeLiftCiHigh: rlHigh,
      pValue,
      probabilityToBeatControl: clampP(pBeat),
      significant,
      sequentialPValue: seq.pValue,
      sequentialCiLow: cMean !== 0 ? (absoluteLift - seq.radius) / cMean : null,
      sequentialCiHigh: cMean !== 0 ? (absoluteLift + seq.radius) / cMean : null,
      sequentiallySignificant: seq.pValue < alpha && seqExcludesZero,
    };
  });

  return {
    family: "continuous",
    direction,
    confidence,
    variants,
    srm: srm(
      arms.map((a) => ({ variantKey: a.variantKey, count: a.n })),
      opts,
    ),
  };
}

/**
 * CUPED (Controlled-experiment Using Pre-Experiment Data) variance reduction.
 *
 * Given each unit's response Y and a pre-period covariate X that is correlated
 * with Y but UNAFFECTED by the treatment (here: the unit's value of the same
 * metric BEFORE it was exposed), replace Y with the adjusted response
 *
 *     Y* = Y − θ·(X − X̄),   θ = Cov(Y,X)/Var(X)  (pooled over all arms)
 *
 * Y* has the same expectation as Y (X is pre-treatment, so its arm means are
 * equal in expectation) but variance reduced by the factor (1 − ρ²), where ρ is
 * Corr(Y,X). Tighter variance means narrower intervals and significance reached
 * with less data — the standard industry speed-up (Microsoft/Netflix/Statsig).
 *
 * θ is estimated once, pooled across every arm (correct: X is independent of
 * assignment). If the covariate carries no signal (Var(X) = 0, e.g. no unit has
 * pre-period data), θ = 0 and Y* = Y, so CUPED degrades gracefully to the raw
 * analysis. Pure: derives the pooled θ and each arm's adjusted (sum, sumSq) from
 * the supplied moments, with no per-unit data.
 */
export function cupedAdjust(arms: CupedArmInput[]): {
  arms: ContinuousArmInput[];
  info: CupedInfo;
} {
  const N = arms.reduce((s, a) => s + a.n, 0);
  const Tx = arms.reduce((s, a) => s + a.sumX, 0);
  const Ty = arms.reduce((s, a) => s + a.sumY, 0);
  const Txx = arms.reduce((s, a) => s + a.sumXX, 0);
  const Tyy = arms.reduce((s, a) => s + a.sumYY, 0);
  const Txy = arms.reduce((s, a) => s + a.sumXY, 0);

  const covNum = Txy - (Tx * Ty) / N; // ∝ Cov(Y,X)
  const varXNum = Txx - (Tx * Tx) / N; // ∝ Var(X)
  const varYNum = Tyy - (Ty * Ty) / N; // ∝ Var(Y)

  const theta = N > 1 && varXNum > 0 ? covNum / varXNum : 0;
  const varianceReduction =
    varXNum > 0 && varYNum > 0
      ? clampP((covNum * covNum) / (varXNum * varYNum)) // ρ²
      : 0;
  const xBar = N > 0 ? Tx / N : 0;

  const adjusted: ContinuousArmInput[] = arms.map((a) => ({
    variantKey: a.variantKey,
    isControl: a.isControl,
    n: a.n,
    // Σ Y*  = ΣY − θ(ΣX − n·X̄)
    sum: a.sumY - theta * (a.sumX - a.n * xBar),
    // Σ Y*² = ΣY² − 2θ(ΣXY − X̄·ΣY) + θ²(ΣX² − 2X̄·ΣX + n·X̄²)
    sumSq:
      a.sumYY -
      2 * theta * (a.sumXY - xBar * a.sumY) +
      theta * theta * (a.sumXX - 2 * xBar * a.sumX + a.n * xBar * xBar),
  }));

  return {
    arms: adjusted,
    info: { applied: theta !== 0, theta, varianceReduction },
  };
}

/**
 * Analyze a metric with CUPED variance reduction: adjust each arm's response by
 * the pre-period covariate, then run the continuous analysis on the adjusted
 * values (Y* is real-valued even for a conversion metric). The returned
 * MetricAnalysis carries a `cuped` block reporting θ and the variance removed.
 */
export function analyzeCuped(
  arms: CupedArmInput[],
  opts: AnalyzeOptions = {},
): MetricAnalysis {
  const { arms: adjusted, info } = cupedAdjust(arms);
  const analysis = analyzeContinuous(adjusted, opts);
  analysis.cuped = info;
  return analysis;
}

// ============================================================================
// Internals
// ============================================================================

/** Unbiased sample variance from n, sum, sum-of-squares. */
export function sampleVariance(n: number, sum: number, sumSq: number): number {
  if (n < 2) return 0;
  const v = (sumSq - (sum * sum) / n) / (n - 1);
  return v > 0 ? v : 0;
}

/** Wilson score interval for a proportion (successes/trials) at z. */
export function wilsonInterval(
  successes: number,
  trials: number,
  z: number,
): [number, number] {
  if (trials <= 0) return [0, 0];
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denom;
  const half =
    (z * Math.sqrt(p * (1 - p) / trials + z2 / (4 * trials * trials))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/**
 * CI on the RELATIVE lift (pV/pC - 1) via the log-relative-risk standard error:
 * SE(ln RR) = sqrt(1/cV - 1/nV + 1/cC - 1/nC). Returns null bounds when a zero
 * count makes the log undefined.
 */
export function relativeRiskCi(
  cV: number,
  nV: number,
  cC: number,
  nC: number,
  z: number,
): [number | null, number | null] {
  if (cV <= 0 || cC <= 0 || nV <= 0 || nC <= 0) return [null, null];
  const pV = cV / nV;
  const pC = cC / nC;
  const rr = pV / pC;
  const lnRr = Math.log(rr);
  const se = Math.sqrt(1 / cV - 1 / nV + 1 / cC - 1 / nC);
  return [Math.exp(lnRr - z * se) - 1, Math.exp(lnRr + z * se) - 1];
}

/**
 * Bayesian P(variant beats control) for a conversion metric. Uniform Beta(1,1)
 * priors → posteriors Beta(1+c, 1+n-c). P(V>C) = ∫ f_C(x)·(1 - F_V(x)) dx on a
 * grid (deterministic; Simpson-weighted). Direction flips it for 'decrease'.
 */
export function betaProbabilityToBeat(
  cV: number,
  nV: number,
  cC: number,
  nC: number,
  direction: Direction,
  grid: number,
): number {
  const aC = 1 + cC;
  const bC = 1 + Math.max(0, nC - cC);
  const aV = 1 + cV;
  const bV = 1 + Math.max(0, nV - cV);
  // Composite Simpson over [0,1]; f_C(x) * (1 - F_V(x)).
  const N = grid % 2 === 0 ? grid : grid + 1;
  const h = 1 / N;
  let acc = 0;
  for (let i = 0; i <= N; i++) {
    const x = i * h;
    const w = i === 0 || i === N ? 1 : i % 2 === 1 ? 4 : 2;
    acc += w * betaPdf(x, aC, bC) * (1 - betaCdf(x, aV, bV));
  }
  const pGreater = clampP((h / 3) * acc);
  return direction === "increase" ? pGreater : 1 - pGreater;
}

/**
 * Sample-ratio-mismatch chi-square goodness-of-fit. `expectedWeights` (default
 * equal across arms) define the intended split; a low p-value means the observed
 * assignment diverges — a data-quality red flag that invalidates the readout.
 * Returns null when there are fewer than two arms or no traffic.
 */
export function srm(
  arms: { variantKey: string; count: number }[],
  opts: AnalyzeOptions = {},
): SrmResult | null {
  if (arms.length < 2) return null;
  const total = arms.reduce((s, a) => s + a.count, 0);
  if (total <= 0) return null;
  const weights = opts.expectedWeights;
  const weightSum = weights
    ? arms.reduce((s, a) => s + (weights[a.variantKey] ?? 0), 0)
    : arms.length;
  if (weightSum <= 0) return null;

  let chi = 0;
  for (const a of arms) {
    const w = weights ? weights[a.variantKey] ?? 0 : 1;
    const expected = (total * w) / weightSum;
    if (expected <= 0) continue;
    chi += Math.pow(a.count - expected, 2) / expected;
  }
  const df = arms.length - 1;
  const pValue = clampP(1 - chiSquareCdf(chi, df));
  const threshold = opts.srmThreshold ?? 0.001;
  return { chiSquare: chi, pValue, healthy: pValue >= threshold };
}
