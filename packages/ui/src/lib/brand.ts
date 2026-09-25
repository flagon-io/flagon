/**
 * A Brand is an organization's whole visual identity as data: colors, corner
 * radius, typography, chart palette, and density. It compiles to the CSS custom
 * properties the components already consume, so applying a Brand re-skins the
 * entire system. Light and dark are two modes WITHIN a Brand.
 *
 * Every field is optional and overrides only what it sets - the base token
 * contract (styles.css) fills the rest - so a preset can be as small as "primary
 * + radius" or as complete as a full palette. This is a package concern, not an
 * API one: a Brand is just config an app hands to <BrandProvider>. Persisting an
 * org's Brand is an optional, separate layer.
 */

/** Per-mode color tokens (light or dark). All optional; unset falls back to base. */
export type BrandColors = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  /** Text/icons on a solid destructive fill (the destructive Button). */
  destructiveForeground: string;
  /** Status: success (Badge/Alert "success"); readable as text and as a fill. */
  success: string;
  successForeground: string;
  /** Status: warning (Badge/Alert "warning"); readable as text and as a fill. */
  warning: string;
  warningForeground: string;
  /** Modal backdrop color (usually translucent), behind every dialog/sheet/drawer. */
  overlay: string;
  border: string;
  input: string;
  ring: string;
  brand: string;
  brandBright: string;
  /** Text/icons on a solid brand fill (e.g. the notification count badge). */
  brandForeground: string;
  link: string;
  subtle: string;
  hairline: string;
  panel: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
  /** Categorical chart series colors (up to 6 used by utilities chart-1..6). */
  chart: string[];
};

export type BrandFonts = { body?: string; heading?: string; mono?: string };

/** Control heights (any CSS length) that set the system's density. */
export type BrandDensity = { sm: string; md: string; lg: string };

export type Brand = {
  /** Display name, e.g. "Flagon" or an organization's name. */
  name: string;
  /** Base corner radius (e.g. "0.375rem"); the sm/md/lg/xl scale derives from it. */
  radius?: string;
  density?: BrandDensity;
  fonts?: BrandFonts;
  /**
   * Chunky button elevation GEOMETRY (a hard ring + a hard offset shadow). The
   * COLOR is not set here - each button uses a darker shade of its OWN color, so
   * a primary button gets a dark-primary edge and a neutral button a dark edge,
   * like the classic "3D block" buttons. Omit for flat buttons.
   * - `ring`: border-ring thickness, e.g. "2px".
   * - `offset`: hard shadow offset (x and y), e.g. "4px".
   * - `pressOffset`: the offset on :active (the button sinks), e.g. "1px".
   */
  elevation?: { ring?: string; offset?: string; pressOffset?: string };
  light?: Partial<BrandColors>;
  dark?: Partial<BrandColors>;
};

/** Named density scales, for pickers. Values feed --control-sm/md/lg. */
export const densityScales: Record<string, BrandDensity> = {
  compact: { sm: "1.75rem", md: "2.25rem", lg: "2.5rem" },
  comfortable: { sm: "2rem", md: "2.5rem", lg: "2.75rem" },
  spacious: { sm: "2.25rem", md: "2.75rem", lg: "3rem" },
};

// Maps a BrandColors key to its CSS custom property name.
const COLOR_VARS: Record<Exclude<keyof BrandColors, "chart">, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  destructiveForeground: "--destructive-foreground",
  success: "--success",
  successForeground: "--success-foreground",
  warning: "--warning",
  warningForeground: "--warning-foreground",
  overlay: "--overlay",
  border: "--border",
  input: "--input",
  ring: "--ring",
  brand: "--brand",
  brandBright: "--brand-bright",
  brandForeground: "--brand-foreground",
  link: "--link",
  subtle: "--subtle",
  hairline: "--hairline",
  panel: "--panel",
  sidebar: "--sidebar",
  sidebarForeground: "--sidebar-foreground",
  sidebarPrimary: "--sidebar-primary",
  sidebarPrimaryForeground: "--sidebar-primary-foreground",
  sidebarAccent: "--sidebar-accent",
  sidebarAccentForeground: "--sidebar-accent-foreground",
  sidebarBorder: "--sidebar-border",
  sidebarRing: "--sidebar-ring",
};

function colorVars(colors: Partial<BrandColors> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!colors) return out;
  for (const [key, cssVar] of Object.entries(COLOR_VARS)) {
    const value = colors[key as keyof BrandColors];
    if (typeof value === "string") out[cssVar] = value;
  }
  (colors.chart ?? []).slice(0, 6).forEach((c, i) => {
    if (c) out[`--chart-${i + 1}`] = c;
  });
  return out;
}

const SANS_FALLBACK = "ui-sans-serif, system-ui, sans-serif";
const MONO_FALLBACK = "ui-monospace, SFMono-Regular, monospace";

function structuralVars(brand: Brand): Record<string, string> {
  const out: Record<string, string> = {};
  if (brand.radius) out["--radius"] = brand.radius;
  if (brand.density) {
    out["--control-sm"] = brand.density.sm;
    out["--control-md"] = brand.density.md;
    out["--control-lg"] = brand.density.lg;
  }
  // Override the FINAL font tokens directly (not intermediate --font-body etc.):
  // custom properties inherit their already-computed value, so a token defined at
  // :root as var(--font-body, ...) won't re-resolve just because a nested scope
  // sets --font-body. Redeclaring --font-sans/-heading/-mono here recomputes them
  // at the scope, and the components' font utilities + the scope font-family pick
  // up the Brand's typeface.
  if (brand.fonts?.body) out["--font-sans"] = `${brand.fonts.body}, ${SANS_FALLBACK}`;
  if (brand.fonts?.heading) out["--font-heading"] = `${brand.fonts.heading}, ${SANS_FALLBACK}`;
  if (brand.fonts?.mono) out["--font-mono"] = `${brand.fonts.mono}, ${MONO_FALLBACK}`;
  // Also expose the raw families for anyone reading them directly.
  if (brand.fonts?.body) out["--font-body"] = brand.fonts.body;
  if (brand.fonts?.heading) out["--font-display"] = brand.fonts.heading;
  if (brand.fonts?.mono) out["--font-code"] = brand.fonts.mono;
  // Elevation is GEOMETRY only (sizes) - the Button colors it from each button's
  // own shade. Sizes are mode-independent, so no dark-block re-emit is needed.
  if (brand.elevation) {
    const e = brand.elevation;
    if (e.ring) out["--el-ring"] = e.ring;
    if (e.offset) {
      out["--el-x"] = e.offset;
      out["--el-y"] = e.offset;
    }
    if (e.pressOffset) {
      out["--el-xp"] = e.pressOffset;
      out["--el-yp"] = e.pressOffset;
    }
  }
  return out;
}

function block(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
}

/**
 * Compile a Brand to CSS scoped to `selector`. Structural tokens (radius, density,
 * fonts, elevation) are mode-independent and apply at the scope unconditionally.
 * COLOR tokens are gated by mode: light colors apply only outside a `.dark` context
 * and dark colors only inside one. This matters for a partial Brand: if it sets a
 * background token but not its foreground pair (or defines only `light`), the unset
 * token falls back to the BASE contract for the CURRENT mode rather than leaking the
 * other mode's value - so you never get, say, a light surface with dark-mode text.
 */
export function brandCss(brand: Brand, selector: string): string {
  const structural = structuralVars(brand);
  const light = colorVars(brand.light);
  const dark = colorVars(brand.dark);
  // Structural block + re-anchored font. Re-anchoring is required because the
  // document font is computed at <html> and inherits as a resolved value, so a
  // nested scope must re-declare font-family to pick up its own token.
  let css = `${selector} {\n${block(structural)}\n  font-family: var(--font-sans);\n}`;
  // Light colors only when no `.dark` ancestor and the scope itself isn't dark, so
  // they never bleed into dark mode. (The app toggles dark mode on <html>.)
  if (Object.keys(light).length) {
    css += `\n:root:not(.dark) ${selector}, ${selector}:not(.dark) {\n${block(light)}\n}`;
  }
  if (Object.keys(dark).length) {
    css += `\n.dark ${selector}, ${selector}.dark {\n${block(dark)}\n}`;
  }
  return css;
}

/** Serialize / parse a Brand as JSON, for export / import ("Get code"). */
export function serializeBrand(brand: Brand): string {
  return JSON.stringify(brand, null, 2);
}
export function parseBrand(json: string): Brand {
  const b = JSON.parse(json) as Brand;
  if (!b || typeof b.name !== "string") throw new Error("Not a valid Brand");
  return b;
}
