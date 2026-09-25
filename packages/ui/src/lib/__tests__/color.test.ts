import { describe, expect, it } from "vitest";
import { clamp, hexToRgb, hsvToRgb, normalizeHex, rgbToHex, rgbToHsv } from "../color";

describe("normalizeHex", () => {
  it("lowercases and prefixes a 6-digit hex", () => {
    expect(normalizeHex("0D9488")).toBe("#0d9488");
    expect(normalizeHex("#FFaa00")).toBe("#ffaa00");
  });

  it("expands the 3-digit shorthand", () => {
    expect(normalizeHex("#f0a")).toBe("#ff00aa");
    expect(normalizeHex("abc")).toBe("#aabbcc");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeHex("  #123456 ")).toBe("#123456");
  });

  it("rejects anything that is not a 3- or 6-digit hex", () => {
    for (const bad of ["", "#", "#12", "#1234", "#12345", "#1234567", "#ggg", "red", "rgb(0,0,0)"]) {
      expect(normalizeHex(bad)).toBeNull();
    }
  });
});

describe("hexToRgb / rgbToHex", () => {
  it("parses channels", () => {
    expect(hexToRgb("#0d9488")).toEqual({ r: 13, g: 148, b: 136 });
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("reads invalid input as black", () => {
    expect(hexToRgb("nope")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("formats, rounding and clamping out-of-range channels", () => {
    expect(rgbToHex({ r: 13, g: 148, b: 136 })).toBe("#0d9488");
    expect(rgbToHex({ r: 12.6, g: -20, b: 300 })).toBe("#0d00ff");
  });
});

describe("rgbToHsv", () => {
  it("maps the primaries to their hues at full saturation and value", () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 1, v: 1 });
  });

  it("gives greys zero hue and saturation", () => {
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 });
    const grey = rgbToHsv({ r: 128, g: 128, b: 128 });
    expect(grey.h).toBe(0);
    expect(grey.s).toBe(0);
    expect(grey.v).toBeCloseTo(128 / 255, 6);
  });

  it("keeps hue in [0, 360) for magenta-side colors (no negative hue)", () => {
    const { h } = rgbToHsv({ r: 255, g: 0, b: 128 });
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
    expect(h).toBeCloseTo(329.9, 0);
  });
});

describe("hsvToRgb", () => {
  it("covers every hue sextant", () => {
    const at = (h: number) => rgbToHex(hsvToRgb({ h, s: 1, v: 1 }));
    expect(at(0)).toBe("#ff0000");
    expect(at(60)).toBe("#ffff00");
    expect(at(120)).toBe("#00ff00");
    expect(at(180)).toBe("#00ffff");
    expect(at(240)).toBe("#0000ff");
    expect(at(300)).toBe("#ff00ff");
  });

  it("round-trips hex -> hsv -> hex", () => {
    for (const hex of ["#0d9488", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#000000", "#ffffff", "#71717a"]) {
      expect(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex))))).toBe(hex);
    }
  });
});

describe("clamp", () => {
  it("defaults to the unit interval", () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(2)).toBe(1);
    expect(clamp(0.25)).toBe(0.25);
    expect(clamp(300, 0, 255)).toBe(255);
  });
});
