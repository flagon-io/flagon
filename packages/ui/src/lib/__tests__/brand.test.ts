import { describe, expect, it } from "vitest";
import { brandCss, densityScales, parseBrand, serializeBrand } from "../brand";
import { flagonBrand, popBrand } from "../brand-presets";

describe("serializeBrand / parseBrand", () => {
  it("round-trips a Brand losslessly", () => {
    const json = serializeBrand(flagonBrand);
    expect(parseBrand(json)).toEqual(flagonBrand);
  });

  it("rejects JSON that isn't a Brand", () => {
    expect(() => parseBrand("{}")).toThrow();
    expect(() => parseBrand("null")).toThrow();
    expect(() => parseBrand("not json")).toThrow();
  });
});

describe("brandCss", () => {
  it("scopes the tokens to the given selector and re-anchors the font", () => {
    const css = brandCss(flagonBrand, '[data-brand="flagon"]');
    expect(css).toContain('[data-brand="flagon"] {');
    expect(css).toContain("font-family: var(--font-sans);");
  });

  it("emits a dark block when the Brand defines dark colors", () => {
    const css = brandCss(flagonBrand, ".scope");
    expect(css).toContain(".dark .scope");
  });

  it("emits the elevation geometry tokens for a chunky Brand", () => {
    const css = brandCss(popBrand, ".pop");
    // Pop sets an elevation, so the geometry vars should be present.
    expect(css).toMatch(/--el-(ring|x|y)/);
  });

  it("gates light colors to light mode so a partial Brand can't leak into dark", () => {
    // A Brand that sets a light background token but no dark counterpart (and no
    // matching foreground) - the exact shape that used to paint a light surface
    // with dark-mode text (invisible). The light color must be scoped away from a
    // dark context, and with no dark colors there is no dark block: the base
    // contract fills dark mode instead.
    const partial = { name: "Partial", light: { secondary: "#f4f5f6" } };
    const css = brandCss(partial, ".p");
    expect(css).toContain(":root:not(.dark) .p");
    expect(css).toContain("#f4f5f6");
    expect(css).not.toContain(".dark .p");
  });
});

describe("status + overlay tokens", () => {
  it("compiles the status, destructive-foreground, and overlay colors to their CSS vars", () => {
    const css = brandCss(
      {
        name: "Status",
        light: {
          success: "#047857",
          successForeground: "#ffffff",
          warning: "#b45309",
          warningForeground: "#ffffff",
          destructiveForeground: "#fafafa",
          overlay: "rgba(0,0,0,0.4)",
        },
        dark: { success: "#34d399", warningForeground: "#1f1300" },
      },
      ".s",
    );
    expect(css).toContain("--success: #047857;");
    expect(css).toContain("--success-foreground: #ffffff;");
    expect(css).toContain("--warning: #b45309;");
    expect(css).toContain("--warning-foreground: #ffffff;");
    expect(css).toContain("--destructive-foreground: #fafafa;");
    expect(css).toContain("--overlay: rgba(0,0,0,0.4);");
    // The dark block carries only the dark values.
    const dark = css.slice(css.indexOf(".dark .s"));
    expect(dark).toContain("--success: #34d399;");
    expect(dark).toContain("--warning-foreground: #1f1300;");
    expect(dark).not.toContain("#047857");
  });

  it("round-trips the new tokens through serialize/parse", () => {
    const b = { name: "RT", light: { success: "#047857", overlay: "rgba(9,9,11,0.5)" } };
    expect(parseBrand(serializeBrand(b))).toEqual(b);
  });
});

describe("densityScales", () => {
  it("exposes the three named scales with sm/md/lg heights", () => {
    for (const key of ["compact", "comfortable", "spacious"] as const) {
      expect(densityScales[key]).toMatchObject({
        sm: expect.any(String),
        md: expect.any(String),
        lg: expect.any(String),
      });
    }
  });
});
