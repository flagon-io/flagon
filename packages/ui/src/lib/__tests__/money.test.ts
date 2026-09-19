import { describe, expect, it } from "vitest";
import { currencySymbol, detectCurrency, evaluateMoney, formatMoney } from "../../components/money-input";

describe("evaluateMoney", () => {
  it("returns null for empty or nonsense input", () => {
    expect(evaluateMoney("")).toBeNull();
    expect(evaluateMoney("   ")).toBeNull();
    expect(evaluateMoney("abc")).toBeNull();
  });

  it("parses plain numbers and grouping commas", () => {
    expect(evaluateMoney("1200")).toBe(1200);
    expect(evaluateMoney("1,200")).toBe(1200);
    expect(evaluateMoney("1_200")).toBe(1200);
    expect(evaluateMoney("12.50")).toBe(12.5);
  });

  it("expands shorthand suffixes case-insensitively", () => {
    expect(evaluateMoney("35k")).toBe(35_000);
    expect(evaluateMoney("2.5m")).toBe(2_500_000);
    expect(evaluateMoney("1B")).toBe(1_000_000_000);
    expect(evaluateMoney("1,500k")).toBe(1_500_000);
  });

  it("strips a leading currency symbol", () => {
    expect(evaluateMoney("$35,000")).toBe(35_000);
    expect(evaluateMoney("€2.5m")).toBe(2_500_000);
  });

  it("evaluates arithmetic with correct precedence", () => {
    expect(evaluateMoney("5500 + 7300")).toBe(12_800);
    expect(evaluateMoney("2 * 1.5m + 250k")).toBe(3_250_000);
    expect(evaluateMoney("100 - 30 - 20")).toBe(50);
    expect(evaluateMoney("(2 + 3) * 10")).toBe(50);
  });

  it("handles a unary minus", () => {
    expect(evaluateMoney("-50")).toBe(-50);
    expect(evaluateMoney("100 + -25")).toBe(75);
  });

  it("returns null on malformed expressions", () => {
    expect(evaluateMoney("5 +")).toBeNull();
    expect(evaluateMoney("(1 + 2")).toBeNull();
    expect(evaluateMoney("1 / 0")).toBeNull(); // Infinity is not finite
  });
});

describe("formatMoney", () => {
  it("hides cents for integers and shows two for fractions", () => {
    expect(formatMoney(35000)).toBe("$35,000");
    expect(formatMoney(12.5)).toBe("$12.50");
  });

  it("formats other currencies", () => {
    expect(formatMoney(1000, { currency: "EUR", locale: "en-US" })).toBe("€1,000");
    // JPY has no minor unit.
    expect(formatMoney(1000, { currency: "JPY", locale: "en-US" })).toBe("¥1,000");
  });

  it("can drop the symbol for a decimal group", () => {
    expect(formatMoney(35000, { symbol: false })).toBe("35,000");
  });
});

describe("currencySymbol", () => {
  it("maps ISO codes to symbols", () => {
    expect(currencySymbol("USD", "en-US")).toBe("$");
    expect(currencySymbol("JPY", "en-US")).toBe("¥");
    expect(currencySymbol("GBP", "en-US")).toBe("£");
  });
});

describe("detectCurrency", () => {
  const currencies = ["USD", "EUR", "GBP", "JPY"];

  it("detects a typed symbol", () => {
    expect(detectCurrency("¥5000", currencies, "en-US")).toBe("JPY");
    expect(detectCurrency("£20", currencies, "en-US")).toBe("GBP");
  });

  it("detects a typed ISO code", () => {
    expect(detectCurrency("500 eur", currencies, "en-US")).toBe("EUR");
  });

  it("returns null when nothing matches", () => {
    expect(detectCurrency("5000", currencies, "en-US")).toBeNull();
  });
});
