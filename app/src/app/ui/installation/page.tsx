import Link from "next/link";
import { Alert, AlertTitle, AlertDescription } from "@flagon-io/ui";
import { CodeBlock } from "@/components/docs/code-block";

export const metadata = {
  title: "Installation - Flagon UI",
  description: "Install Flagon UI - use the package directly, or copy components in.",
};

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative border-l border-hairline pb-8 pl-8 last:border-l-transparent last:pb-0">
      <span className="absolute -left-3.5 flex size-7 items-center justify-center rounded-full border border-hairline bg-card font-mono text-xs text-muted-foreground">
        {n}
      </span>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <div className="mt-2 space-y-3 text-sm text-muted-foreground">{children}</div>
    </li>
  );
}

export default function InstallationPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-bold tracking-tight text-foreground">Installation</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        The recommended way to use Flagon UI is to install the{" "}
        <code className="font-mono text-foreground">@flagon-io/ui</code> package and import components
        directly - you get fixes and new components by bumping the version. If you&rsquo;d rather own
        the source, you can copy components in with the shadcn CLI instead.
      </p>

      <Alert variant="info" className="mt-6">
        <AlertTitle>Prerequisites</AlertTitle>
        <AlertDescription>
          A React 19 app with Tailwind CSS v4. Components are styled with Tailwind utilities against
          Flagon&rsquo;s design tokens.
        </AlertDescription>
      </Alert>

      <section className="mt-14">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Install the package</h2>
          <span className="rounded-full border border-brand/30 bg-brand/8 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-bright">
            Recommended
          </span>
        </div>
        <ol className="mt-6 list-none">
          <Step n={1} title="Install">
            <CodeBlock code={`npm install @flagon-io/ui`} lang="bash" />
          </Step>
          <Step n={2} title="Load the theme tokens">
            <p>
              Import the token stylesheet once, and tell Tailwind to scan the package so its classes
              are generated.
            </p>
            <CodeBlock
              lang="css"
              code={`/* globals.css */
@import "tailwindcss";
@import "@flagon-io/ui/styles.css";
@source "../node_modules/@flagon-io/ui/src";`}
            />
          </Step>
          <Step n={3} title="Wrap your app in a ThemeProvider">
            <CodeBlock
              code={`// app/layout.tsx
import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}`}
            />
            <p>
              See <Link href="/ui/theming" className="text-link underline">Theming</Link> for how the
              provider works and which themes ship.
            </p>
          </Step>
          <Step n={4} title="Use a component">
            <CodeBlock
              code={`import { Button, Alert } from "@flagon-io/ui";
// or a single component:
import { Button } from "@flagon-io/ui/button";

export function Example() {
  return <Button>Deploy</Button>;
}`}
            />
          </Step>
        </ol>
      </section>

      <section className="mt-16 border-t border-hairline pt-12">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Alternative: copy components in
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Prefer to own and edit the source? Every component is published to a shadcn-compatible
          registry. Initialize shadcn once, then add components on demand - dependencies install
          automatically and <code className="font-mono text-foreground">cn</code> resolves from your{" "}
          <code className="font-mono text-foreground">@/lib/utils</code>.
        </p>
        <div className="mt-4 space-y-3">
          <CodeBlock code={`npx shadcn@latest init`} lang="bash" />
          <CodeBlock code={`npx shadcn@latest add https://ui.flagon.io/r/button.json`} lang="bash" />
        </div>
      </section>
    </div>
  );
}
