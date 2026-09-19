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
