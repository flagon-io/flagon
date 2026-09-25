"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  Badge,
  BrandProvider,
  Button,
  Card,
  ColorInput,
  Input,
  Label,
  SelectField,
  Slider,
  brandPresets,
  densityScales,
  serializeBrand,
  type Brand,
  type BrandColors,
} from "@flagon-io/ui";

const FONTS = [
  "Inter",
  "Roboto",
  "Montserrat",
  "Poppins",
  "Figtree",
  "DM Sans",
  "Manrope",
  "Space Grotesk",
  "Source Sans 3",
  "IBM Plex Sans",
  "Lora",
  "Merriweather",
];
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  FONTS.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`).join("&") +
  "&display=swap";

const DENSITY_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
];
const FONT_OPTIONS = FONTS.map((f) => ({ value: f, label: f }));
const DEFAULT_CHART = ["#0d9488", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];

// The editable palette (light mode). Defaults mirror the base Flagon light tokens;
// a preset overlays whatever hex values it sets.
const COLOR_GROUPS: { group: string; fields: { key: keyof BrandColors; label: string }[] }[] = [
  {
    group: "Surfaces",
    fields: [
      { key: "background", label: "Background" },
      { key: "foreground", label: "Text" },
      { key: "card", label: "Card" },
      { key: "muted", label: "Muted" },
      { key: "mutedForeground", label: "Muted text" },
      { key: "border", label: "Border" },
    ],
  },
  {
    group: "Accents",
    fields: [
      { key: "primary", label: "Primary" },
      { key: "primaryForeground", label: "On primary" },
      { key: "secondary", label: "Secondary" },
      { key: "accent", label: "Accent" },
      { key: "ring", label: "Focus ring" },
    ],
  },
  {
    group: "Status",
    fields: [
      { key: "success", label: "Success" },
      { key: "warning", label: "Warning" },
      { key: "destructive", label: "Destructive" },
    ],
  },
];
const DEFAULT_COLORS: Record<string, string> = {
  background: "#fbfbfc",
  foreground: "#0b0b0d",
  card: "#ffffff",
  muted: "#f1f2f3",
  mutedForeground: "#52525a",
  border: "#e3e3e6",
  primary: "#0c8074",
  primaryForeground: "#ffffff",
  secondary: "#f4f5f6",
  accent: "#f1f2f3",
  ring: "#0d9488",
  destructive: "#d83a40",
  success: "#047857",
  warning: "#b45309",
};

type EditorState = {
  colors: Record<string, string>;
  radius: number;
  density: string;
  bodyFont: string;
  headingFont: string;
  chart: string[];
};

const isHex = (v?: string) => !!v && /^#[0-9a-fA-F]{6}$/.test(v);

function toBrand(s: EditorState): Brand {
  const c = s.colors;
  const light: Partial<BrandColors> = {
    ...(c as Partial<BrandColors>),
    brand: c.primary,
    brandBright: c.primary,
    brandForeground: c.primaryForeground,
    link: c.primary,
    // Buttons/inputs read --input and --hairline; mirror the edited Border into
    // them so the preview's borders track the picker (and don't vanish against a
    // custom surface).
    input: c.border,
    hairline: c.border,
    chart: s.chart,
  };
  const dark: Partial<BrandColors> = {
    primary: c.primary,
    primaryForeground: c.primaryForeground,
    ring: c.ring,
    brand: c.primary,
    brandBright: c.primary,
    brandForeground: c.primaryForeground,
    link: c.primary,
    chart: s.chart,
  };
  return {
    name: "Custom",
    radius: `${s.radius}rem`,
    density: densityScales[s.density] ?? densityScales.comfortable,
    fonts: { body: s.bodyFont, heading: s.headingFont },
    light,
    dark,
  };
}

function fromPreset(p: Brand): EditorState {
  const colors: Record<string, string> = { ...DEFAULT_COLORS };
  for (const [k, v] of Object.entries(p.light ?? {})) {
    if (typeof v === "string" && isHex(v)) colors[k] = v;
  }
  const headingRaw = (p.fonts?.heading ?? p.fonts?.body ?? "Inter").split(",")[0].trim();
  const density =
    Object.entries(densityScales).find(([, v]) => v.md === p.density?.md)?.[0] ?? "comfortable";
  return {
    colors,
    radius: parseFloat(p.radius ?? "0.375") || 0.375,
    density,
    bodyFont: FONTS.includes(p.fonts?.body ?? "") ? (p.fonts?.body as string) : "Inter",
    headingFont: FONTS.includes(headingRaw) ? headingRaw : "Inter",
    chart: (p.light?.chart ?? DEFAULT_CHART).map((c) => (isHex(c) ? c : "#0d9488")),
  };
}

export function BrandEditor() {
  const [state, setState] = useState<EditorState>(() => fromPreset(brandPresets[0]));
  const [copied, setCopied] = useState(false);
  const setColor = (key: string, value: string) =>
    setState((s) => ({ ...s, colors: { ...s.colors, [key]: value } }));

  const brand = useMemo(() => toBrand(state), [state]);
  const json = useMemo(() => serializeBrand(brand), [brand]);

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="rounded-2xl border border-hairline bg-card">
      <link href={FONTS_HREF} rel="stylesheet" />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Start from</span>
          {brandPresets.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => setState(fromPreset(p))}
              className="flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span
                className="size-3 rounded-full ring-1 ring-black/10"
                style={{ background: p.light?.primary }}
              />
              {p.name}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={copyJson}>
          {copied ? <Check className="size-4 text-brand" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy Brand JSON"}
        </Button>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Controls */}
        <div className="space-y-5">
          {COLOR_GROUPS.map((g) => (
            <div key={g.group} className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {g.group}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {g.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{f.label}</Label>
                    <ColorInput
                      size="sm"
                      value={state.colors[f.key] ?? "#000000"}
                      onChange={(v) => setColor(f.key, v)}
                      aria-label={f.label}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Shape & type</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Radius · {state.radius}rem</Label>
              <Slider
                min={0}
                max={1.25}
                step={0.05}
                value={[state.radius]}
                onValueChange={([v]) => setState((s) => ({ ...s, radius: v }))}
                aria-label="Radius"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Density</Label>
                <SelectField
                  size="sm"
                  aria-label="Density"
                  className="w-full"
                  options={DENSITY_OPTIONS}
                  value={state.density}
                  onValueChange={(v) => setState((s) => ({ ...s, density: v }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Body font</Label>
                <SelectField
                  size="sm"
                  aria-label="Body font"
                  className="w-full"
                  options={FONT_OPTIONS}
                  value={state.bodyFont}
                  onValueChange={(v) => setState((s) => ({ ...s, bodyFont: v }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Heading font</Label>
                <SelectField
                  size="sm"
                  aria-label="Heading font"
                  className="w-full"
                  options={FONT_OPTIONS}
                  value={state.headingFont}
                  onValueChange={(v) => setState((s) => ({ ...s, headingFont: v }))}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Chart palette</p>
            <div className="flex flex-wrap gap-1.5">
              {state.chart.map((c, i) => (
                <ColorInput
                  key={i}
                  compact
                  value={c}
                  onChange={(v) =>
                    setState((s) => ({ ...s, chart: s.chart.map((cc, idx) => (idx === i ? v : cc)) }))
                  }
                  aria-label={`Chart color ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Live preview */}
        <BrandProvider brand={brand} className="rounded-xl border border-hairline bg-background p-6">
          <h3 className="text-2xl font-semibold text-foreground">The quick brown fox</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Body text in your chosen font. Jackdaws love my big sphinx of quartz - 0123456789.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="destructive">Delete</Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="brand">Brand</Badge>
            <Badge variant="outline">Outline</Badge>
            <Input className="w-48" placeholder="Input field" />
          </div>

          <Card className="mt-4 p-4">
            <p className="text-sm font-medium text-foreground">Card surface</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Radius, borders, and surfaces all follow the tokens.
            </p>
          </Card>

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Chart palette</p>
            <div className="flex h-10 items-end gap-1.5">
              {["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-6"].map(
                (bg, i) => (
                  <div key={bg} className={`w-8 rounded-t ${bg}`} style={{ height: `${40 + i * 8}%` }} />
                ),
              )}
            </div>
          </div>
        </BrandProvider>
      </div>
    </div>
  );
}
