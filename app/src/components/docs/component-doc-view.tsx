"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@flagon-io/ui";
import { CodeBlock } from "./code-block";
import { ComponentPreview } from "./component-preview";
import { docs } from "./examples";
import type { ComponentMeta } from "./registry";

export function ComponentDocView({ meta }: { meta: ComponentMeta }) {
  const entry = docs[meta.slug];
  // Registry links follow the current host - localhost:3000 in dev, the real
  // domain in production - so the copyable command works wherever you're reading.
  const [origin, setOrigin] = useState("https://ui.flagon.io");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the host once on mount
    setOrigin(window.location.origin);
  }, []);
  const registryUrl = `${origin}/r/${meta.slug}.json`;
  const cliCmd = `npx shadcn@latest add ${registryUrl}`;
  const deps = meta.dependencies ?? [];
  const installDeps = deps.length
    ? `npm install ${deps.join(" ")}`
    : "# No extra dependencies beyond the component file.";

  const hero = entry?.examples[0];
  const moreExamples = entry ? entry.examples.slice(1) : [];
  const planned = meta.status === "planned";

  if (planned) {
    return (
      <article className="mx-auto max-w-4xl">
        <header>
          <p className="text-sm font-medium text-brand-bright">Components</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{meta.name}</h1>
            <span className="rounded-full border border-hairline bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              Planned
            </span>
          </div>
          <p className="mt-2 text-lg text-muted-foreground">{meta.description}</p>
        </header>

        <div className="mt-8 rounded-xl border border-dashed border-hairline bg-panel/30 p-6">
          <p className="text-sm text-foreground">
            This component is on the roadmap to complete Flagon UI&rsquo;s parity with the shadcn/ui
            catalog. It isn&rsquo;t shipped in <code className="font-mono">@flagon-io/ui</code> yet.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Until it lands, build on the primitives we already ship, or copy the reference
            implementation and adapt it to our tokens.
          </p>
          {meta.shadcn && (
            <a
              href={meta.shadcn}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center rounded-md border border-hairline px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              shadcn/ui reference &#8599;
            </a>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className="mx-auto max-w-4xl">
      <header>
        <p className="text-sm font-medium text-brand-bright">Components</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">{meta.name}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{meta.description}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {meta.radix && (
            <a
              href={meta.radix}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-hairline px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              Radix primitive ↗
            </a>
          )}
          {!meta.block && (
            <a
              href={registryUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-hairline px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              Registry item ↗
            </a>
          )}
          {meta.block && meta.shadcn && (
            <a
              href={meta.shadcn}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-hairline px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              shadcn reference ↗
            </a>
          )}
        </div>
      </header>

      {hero && (
        <div className="mt-8">
          <ComponentPreview preview={hero.render} code={hero.code} />
        </div>
      )}

      {/* Usage is the primary path: install @flagon-io/ui once, import components. */}
      {entry?.usage && (
        <section className="mt-14">
          <h2 id="usage" className="scroll-mt-20 text-xl font-semibold tracking-tight text-foreground">
            Usage
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            With <code className="font-mono text-foreground">@flagon-io/ui</code> installed (see{" "}
            <Link href="/ui/installation" className="text-link underline">
              Installation
            </Link>
            ), import it directly.
          </p>
          <div className="mt-3">
            <CodeBlock code={entry.usage} lang="tsx" />
          </div>
        </section>
      )}

      {moreExamples.length > 0 && (
        <section className="mt-14">
          <h2 id="examples" className="scroll-mt-20 text-xl font-semibold tracking-tight text-foreground">
            Examples
          </h2>
          <div className="mt-5 space-y-12">
            {moreExamples.map((ex, i) => (
              <div key={i}>
                {ex.title && (
                  <h3 className="text-base font-semibold text-foreground">{ex.title}</h3>
                )}
                {ex.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{ex.description}</p>
                )}
                <div className="mt-3">
                  <ComponentPreview preview={ex.render} code={ex.code} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Charts and other composition blocks aren't installable registry items -
          their code above is the whole recipe, so skip the shadcn CLI section. */}
      {!meta.block && (
      <>
      {/* Copy-in is the alternative for teams that want to own the source. */}
      <section className="mt-14 border-t border-hairline pt-10">
        <h2 id="copy-in" className="scroll-mt-20 text-xl font-semibold tracking-tight text-foreground">
          Prefer to own the code?
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          You don&rsquo;t have to install the package - you can copy this component into your project
          with the shadcn CLI and edit it freely.
        </p>
        <Tabs defaultValue="cli" className="mt-3">
          <TabsList>
            <TabsTrigger value="cli">CLI</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
          </TabsList>
          <TabsContent value="cli" className="mt-3">
            <CodeBlock code={cliCmd} lang="bash" />
          </TabsContent>
          <TabsContent value="manual" className="mt-3 space-y-3">
            <p className="text-sm text-muted-foreground">Install dependencies:</p>
            <CodeBlock code={installDeps} lang="bash" />
            <p className="text-sm text-muted-foreground">
              Then copy <code className="font-mono text-foreground">{meta.slug}.tsx</code> into your{" "}
              <code className="font-mono text-foreground">components/ui</code> folder from the{" "}
              <a href={registryUrl} className="text-link underline">
                registry item
              </a>{" "}
              (it imports <code className="font-mono text-foreground">cn</code> from{" "}
              <code className="font-mono text-foreground">@/lib/utils</code>).
            </p>
          </TabsContent>
        </Tabs>
      </section>
      </>
      )}
    </article>
  );
}
