import { Alert, AlertDescription } from "@flagon-io/ui";
import { CodeBlock } from "@/components/docs/code-block";
import { BrandEditor } from "@/components/docs/brand-editor";

export const metadata = {
  title: "Theming - Flagon UI",
  description: "Brands: ship a whole visual identity (colors, radius, fonts, charts, density) as tokens.",
};

const tokens = [
  ["--background / --foreground", "Page surface and text"],
  ["--card / --popover", "Raised surfaces (cards, menus)"],
  ["--primary", "Primary action color"],
  ["--secondary / --muted / --accent", "Subtle surfaces"],
  ["--destructive / --destructive-foreground", "Errors and destructive actions, and text on them"],
  ["--success / --warning (+ -foreground)", "Status colors (Badge, Alert), readable as text and as a fill"],
  ["--border / --input / --ring", "Hairlines, field borders, the one focus-visible outline"],
  ["--overlay / --overlay-blur", "The shared modal backdrop (dialog, sheet, drawer, command)"],
  ["--brand / --brand-bright / --brand-foreground / --link", "Brand accents (and text on a brand fill)"],
  ["--chart-1 … --chart-6", "Categorical chart series"],
  ["--font-body / --font-display / --font-code", "Typography families"],
  ["--control-sm / --control-md / --control-lg", "Density (control heights)"],
  ["--radius", "Base corner radius"],
  ["--el-ring / --el-x / --el-y", "Button elevation geometry (3D block look)"],
];

export default function ThemingPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-4xl font-bold tracking-tight text-foreground">Theming</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        A <strong className="font-semibold text-foreground">Brand</strong> is a whole visual identity
        as data - colors, radius, typography, chart palette, and density. Components are styled against
        CSS variables, so applying a Brand re-skins everything. Light and dark are two{" "}
        <strong className="font-semibold text-foreground">modes</strong> within a Brand.
      </p>

      <section className="mt-8">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Brand editor</h2>
        <p className="mt-2 mb-4 text-sm text-muted-foreground">
          Tweak the tokens and watch the preview re-skin live. Pick a font, drag the radius, recolor
          the charts, then copy the Brand JSON. Switch light/dark with the mode toggle in the top-right.
        </p>
        <BrandEditor />
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Applying a Brand</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <code className="font-mono text-foreground">BrandProvider</code> compiles a Brand to scoped
          CSS variables and applies it to its subtree - no build step, no API. Mount it around your app,
          or around a preview.
        </p>
        <div className="mt-4">
          <CodeBlock
            lang="tsx"
            code={`import { BrandProvider, nocturneBrand } from "@flagon-io/ui";

<BrandProvider brand={nocturneBrand}>
  <App />           {/* everything inside is now Nocturne-flavored */}
</BrandProvider>

// A Brand is plain data you can build, store, or ship:
const myBrand = {
  name: "Acme",
  radius: "1rem",                                  // chunky, playful
  fonts: { body: "Baloo 2", heading: "Baloo 2" },
  elevation: { ring: "2px", offset: "4px", pressOffset: "1px" }, // 3D block buttons
  light: { primary: "#7c5cff", border: "#1a1523", chart: ["#7c5cff", "#06b6d4"] },
  dark:  { primary: "#a78bfa" },
};`}
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Want the chunky, pressable button look? That&rsquo;s the{" "}
          <code className="font-mono text-foreground">elevation</code> field (a ring + offset
          shadow the Button colors from each button&rsquo;s own shade) - see the{" "}
          <strong className="font-medium text-foreground">Pop</strong> Brand in the switcher.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Light, dark & system</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Mode is the <code className="font-mono text-foreground">dark</code> class on{" "}
          <code className="font-mono text-foreground">&lt;html&gt;</code>. A Brand carries both light
          and dark token values; the active mode picks which apply. A tiny inline script sets the mode
          before paint, so there&rsquo;s no flash.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Tokens</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The vocabulary follows shadcn&rsquo;s naming so it&rsquo;s portable, with brand extras. A
          Brand sets any subset; the rest fall back to the base contract.
        </p>
        <dl className="mt-4 divide-y divide-hairline rounded-xl border border-hairline bg-card">
          {tokens.map(([name, desc]) => (
            <div key={name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <dt className="font-mono text-sm text-foreground">{name}</dt>
              <dd className="text-sm text-muted-foreground">{desc}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Alert variant="brand" className="mt-8">
        <AlertDescription>
          The <strong className="font-medium text-foreground">Brand</strong> switcher in the top-right
          of every docs page applies a full Brand (Flagon, Material, Cobalt, Nocturne, Pop) live -
          that&rsquo;s this same system.
        </AlertDescription>
      </Alert>
    </div>
  );
}
