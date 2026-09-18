import { Alert, AlertDescription } from "@flagon-io/ui";
import { CodeBlock } from "@/components/docs/code-block";

export const metadata = {
  title: "Theming - Flagon UI",
  description: "How Flagon UI's tokens, ThemeProvider, and design themes work.",
};

const tokens = [
  ["--background / --foreground", "Page surface and text"],
  ["--card / --popover", "Raised surfaces (cards, menus)"],
  ["--primary", "Primary action color"],
  ["--secondary / --muted / --accent", "Subtle surfaces"],
  ["--destructive", "Errors and destructive actions"],
  ["--border / --input / --ring", "Hairlines, field borders, focus rings"],
  ["--brand / --brand-bright / --link", "Flagon brand accents"],
  ["--radius", "Base corner radius"],
];

export default function ThemingPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-bold tracking-tight text-foreground">Theming</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Every component is styled against CSS variables - never hard-coded colors. That means two
        independent axes: the <strong className="font-semibold text-foreground">mode</strong> (light
        / dark) and the <strong className="font-semibold text-foreground">design theme</strong> (the
        palette and radius). Change the variables, and every component follows.
      </p>

      <Alert variant="brand" className="mt-6">
        <AlertDescription>
          Try it now: use the <strong className="font-medium text-foreground">palette</strong> and{" "}
          <strong className="font-medium text-foreground">mode</strong> switchers in the top-right of
          this page. Everything re-skins live - that&rsquo;s the token system at work.
        </AlertDescription>
      </Alert>

      <section className="mt-14">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Light, dark & system</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Mode is the <code className="font-mono text-foreground">dark</code> class on{" "}
          <code className="font-mono text-foreground">&lt;html&gt;</code>. The{" "}
          <code className="font-mono text-foreground">ThemeProvider</code> manages it - light, dark,
          or following the OS - and a tiny inline script sets it before paint, so there&rsquo;s no
          flash.
        </p>
        <div className="mt-4">
          <CodeBlock
            code={`import { ThemeProvider } from "@/components/theme/theme-provider";

<ThemeProvider>{children}</ThemeProvider>

// Components read tokens that flip under .dark automatically:
// :root { --background: #fbfbfc }  .dark { --background: #000 }`}
          />
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Design themes</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Flagon ships a default theme plus a few alternates - <strong className="font-semibold text-foreground">Flagon</strong>,{" "}
          <strong className="font-semibold text-foreground">Indigo</strong>,{" "}
          <strong className="font-semibold text-foreground">Rose</strong>, and{" "}
          <strong className="font-semibold text-foreground">Mono</strong>. A theme is just a set of
          token overrides applied with a <code className="font-mono text-foreground">data-theme</code>{" "}
          attribute; it composes with light/dark.
        </p>
        <div className="mt-4">
          <CodeBlock
            lang="tsx"
            code={`// Scope a theme to any subtree - the default (Flagon) needs no attribute.
<div data-theme="indigo">
  <Button>Now indigo</Button>
</div>`}
          />
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Tokens</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The vocabulary follows shadcn&rsquo;s naming, so it&rsquo;s portable, with a few brand
          extras.
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

      <section className="mt-14">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Create your own theme</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Override the tokens under a selector - your own brand, a per-tenant theme, whatever. Give
          light values on the base selector and dark values under{" "}
          <code className="font-mono text-foreground">.dark</code>.
        </p>
        <div className="mt-4">
          <CodeBlock
            lang="css"
            code={`[data-theme="acme"] {
  --primary: #7c3aed;
  --ring: #7c3aed;
  --brand: #7c3aed;
  --brand-bright: #6d28d9;
  --radius: 0.75rem;
}
.dark [data-theme="acme"] {
  --primary: #a78bfa;
  --brand-bright: #c4b5fd;
}`}
          />
        </div>
      </section>
    </div>
  );
}
