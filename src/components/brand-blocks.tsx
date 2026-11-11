import type { ReactNode } from "react";
import { FlagonMark } from "@/brand/flagon-mark";
import { Schematic, SchematicGrid } from "@/components/schematic";
import { site } from "@/lib/site";

/*
 * Visual brand blocks for the handbook. These render the live Flagon mark,
 * palette, type specimen, and usage rules inside MDX (registered in mdx.tsx), so
 * the brand pages show the real identity instead of describing it. Keep them
 * self-contained: no props beyond what a handbook author would want to pass.
 */

/** The three mark treatments, side by side, each with a spec and a note. */
export function MarkTreatments() {
  return (
    <Schematic bleed className="not-prose my-8">
      <SchematicGrid cols={3}>
        <Treatment
          name="Full"
          spec="Screen · gradient + sheen"
          note="The default. Teal brew gradient held in clear glass, with a soft sheen."
        >
          <FlagonMark size={72} variant="full" className="text-foreground" />
        </Treatment>
        <Treatment
          name="Flat"
          spec="Print · matte, spot-colour"
          note="Solid brew, no gradient or gloss. Silkscreen, embroidery, signage."
        >
          <FlagonMark size={72} variant="flat" className="text-foreground" />
        </Treatment>
        <Treatment
          name="Mono"
          spec="Tiny / inline · one ink"
          note="A single currentColor in tonal fills. Tints to any context."
        >
          <FlagonMark size={72} variant="mono" className="text-foreground" />
        </Treatment>
      </SchematicGrid>
    </Schematic>
  );
}

/** The mark at a range of sizes, to show it holds from favicon to hero. */
export function MarkSizes() {
  return (
    <Schematic bleed className="not-prose my-8">
      <div className="flex flex-wrap items-end gap-8 p-6 text-foreground sm:p-8">
        {[16, 20, 24, 32, 48, 96].map((s) => (
          <div key={s} className="flex flex-col items-center gap-3">
            <FlagonMark size={s} />
            <span className="font-mono text-[10px] text-subtle">{s}px</span>
          </div>
        ))}
      </div>
    </Schematic>
  );
}

/** The mark held still vs. pouring, so the motion reads as part of the identity. */
export function MarkMotion() {
  return (
    <Schematic bleed className="not-prose my-8">
      <SchematicGrid cols={2}>
        <div className="flex flex-col items-center gap-4 p-8 sm:p-10">
          <FlagonMark size={84} className="text-foreground" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
            Held
          </span>
        </div>
        <div className="flex flex-col items-center gap-4 p-8 sm:p-10">
          <FlagonMark size={84} animated className="text-foreground" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
            In motion
          </span>
        </div>
      </SchematicGrid>
    </Schematic>
  );
}

/** The full brand palette as swatches. */
export function Palette() {
  return (
    <Schematic bleed className="not-prose my-8">
      <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-3 sm:p-8 lg:grid-cols-4">
        <Swatch name="Brand" hex="#14b8a6" fill="#14b8a6" />
        <Swatch name="Brand bright" hex="#2dd4bf" fill="#2dd4bf" />
        <Swatch name="Brew deep" hex="#0f766e" fill="#0f766e" />
        <Swatch name="Highlight" hex="#d6fbf2" fill="#d6fbf2" dark />
        <Swatch name="Ink" hex="#000000" fill="#000000" />
        <Swatch name="Surface (dark)" hex="#0b0b0d" fill="#0b0b0d" />
        <Swatch name="Paper" hex="#fbfbfc" fill="#fbfbfc" dark />
        <Swatch name="Muted" hex="#a1a1aa" fill="#a1a1aa" />
      </div>
    </Schematic>
  );
}

/** Type specimen: Hanken Grotesk headlines, Geist body, JetBrains Mono code. */
export function TypeSpecimen() {
  return (
    <Schematic bleed className="not-prose my-8">
      <SchematicGrid cols={2}>
        <div className="p-6 sm:p-8">
          <div className="font-mono text-[10px] uppercase tracking-widest text-subtle">
            Hanken Grotesk · headlines
          </div>
          <div className="mt-4 font-heading text-5xl font-bold tracking-[-0.033em] text-foreground">
            Ag
          </div>
          <div className="mt-3 font-heading text-2xl font-semibold tracking-tight text-foreground">
            Good software, on tap.
          </div>
          <div className="mt-6 font-mono text-[10px] uppercase tracking-widest text-subtle">
            Geist · body &amp; UI
          </div>
          <div className="mt-2 leading-relaxed text-muted-foreground">
            The quick brown fox jumps over the lazy dog. 0123456789
          </div>
        </div>
        <div className="p-6 sm:p-8">
          <div className="font-mono text-[10px] uppercase tracking-widest text-subtle">
            JetBrains Mono · code &amp; labels
          </div>
          <div className="mt-4 font-mono text-5xl font-medium tracking-tight text-foreground">Ag</div>
          <div className="mt-4 font-mono text-sm/relaxed text-muted-foreground">
            const flagon = &quot;on tap&quot;; // 0123456789
          </div>
          <div className="mt-3 font-mono text-sm uppercase tracking-widest text-muted-foreground">
            Building in public · {site.domain}
          </div>
        </div>
      </SchematicGrid>
    </Schematic>
  );
}

/** Do/don't usage rules for the mark. */
export function MarkUsage() {
  return (
    <Schematic bleed className="not-prose my-8">
      <SchematicGrid cols={4}>
        <Rule ok title="Give it room">
          Leave clear space around the mark equal to the height of the lid. Let
          the vessel breathe.
        </Rule>
        <Rule title="Don't empty it">
          Never ship the outline alone. The brew is the mark; a hollow flagon
          isn&rsquo;t the brand.
        </Rule>
        <Rule ok title="Recolour the whole mark">
          Use the mono cut to tint the entire mark to an accent in one colour.
        </Rule>
        <Rule title="Don't mix inks">
          Don&rsquo;t pair an off-brand outline with the teal brew, or stretch,
          rotate, or reproportion the vessel.
        </Rule>
      </SchematicGrid>
    </Schematic>
  );
}

function Treatment({
  name,
  spec,
  note,
  children,
}: {
  name: string;
  spec: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 p-6 sm:p-8">
      <div className="flex h-28 items-center justify-center rounded-lg border border-hairline bg-background">
        {children}
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-lg font-semibold tracking-tight text-foreground">{name}</div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-subtle">
            {spec}
          </span>
        </div>
        <div className="mt-2 text-sm/relaxed text-muted-foreground">{note}</div>
      </div>
    </div>
  );
}

function Swatch({
  name,
  hex,
  fill,
  dark = false,
}: {
  name: string;
  hex: string;
  fill: string;
  dark?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-background">
      <div className="h-24" style={{ background: fill }} />
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="text-sm font-medium">{name}</span>
        <span className="font-mono text-[11px] uppercase text-subtle">{hex}</span>
      </div>
      {dark && <span className="sr-only">Light value, sits on a dark ground.</span>}
    </div>
  );
}

function Rule({
  title,
  children,
  ok = false,
}: {
  title: string;
  children: ReactNode;
  ok?: boolean;
}) {
  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex size-5 items-center justify-center rounded-full font-mono text-xs ${
            ok ? "bg-brand/15 text-brand" : "bg-red-500/15 text-red-500"
          }`}
          aria-hidden
        >
          {ok ? "✓" : "✕"}
        </span>
        <div className="text-base font-semibold tracking-tight text-foreground">{title}</div>
      </div>
      <div className="mt-3 text-sm/relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
