import { categories, components, stableCount, totalCount } from "@/components/docs/registry";

// Generates the /llms.txt and /llms-full.txt content for ui.flagon.io: a concise,
// LLM-oriented map of the component library - what it is, how to install/use it,
// how the Brand token system works, and every component with its links. `full`
// adds per-component registry URLs and dependencies. Links are absolute to the
// requesting origin so they resolve on localhost or in production.
export function llmsText(origin: string, full: boolean): string {
  const L: string[] = [];
  const push = (...s: string[]) => L.push(...s);

  push("# Flagon UI (@flagon-io/ui)");
  push("");
  push(
    "> Accessible, Radix-based React components with a token-driven **Brand** system. " +
      "Every component is styled against CSS variables, so one Brand (colors, radius, " +
      "typography, chart palette, density) re-skins the whole library.",
  );
  push("");
  push(`Docs: ${origin}/ui  ·  Components: ${stableCount} shipping of ${totalCount} planned (shadcn parity).`);
  push("");

  push("## Install & use");
  push("");
  push("Two ways to consume - install the package, or copy components in with the shadcn CLI.");
  push("");
  push("```bash");
  push("# Package (recommended)");
  push("npm install @flagon-io/ui");
  push("```");
  push("```tsx");
  push('import "@flagon-io/ui/styles.css";           // theme tokens');
  push('import { Button, Input, Select } from "@flagon-io/ui";');
  push("```");
  push("```bash");
  push("# Or copy a single component into your project (shadcn registry):");
  push(`npx shadcn@latest add ${origin}/r/<component>.json`);
  push("```");
  push("");

  push("## Theming (Brands)");
  push("");
  push(
    "A **Brand** is a whole visual identity as data. Apply one with `<BrandProvider brand={...}>` " +
      "(from `@flagon-io/ui`); it compiles to scoped CSS variables - no build step, no API. Light and " +
      "dark are two modes within a Brand.",
  );
  push("");
  push("```tsx");
  push('import { BrandProvider, nocturneBrand } from "@flagon-io/ui";');
  push("<BrandProvider brand={nocturneBrand}>{children}</BrandProvider>");
  push("");
  push("// A Brand is plain data:");
  push("const myBrand = {");
  push('  name: "Acme",');
  push('  radius: "0.75rem",');
  push('  fonts: { body: "Inter", heading: "Space Grotesk" },');
  push('  light: { primary: "#7c3aed", chart: ["#7c3aed", "#06b6d4", "#f59e0b"] },');
  push('  dark:  { primary: "#a78bfa" },');
  push("};");
  push("```");
  push("");
  push(
    "Key tokens: `--background/--foreground`, `--card`, `--primary/--primary-foreground`, " +
      "`--muted/--muted-foreground`, `--accent`, `--destructive`, `--border/--input/--ring`, " +
      "`--chart-1..6`, `--font-body/--font-display/--font-code`, `--control-sm/md/lg` (density), `--radius`. " +
      "Style with token utilities (`bg-primary`, `text-muted-foreground`, `bg-chart-1`), never raw hex.",
  );
  push("");

  push("## Components");
  push("");
  for (const cat of categories) {
    const items = components.filter((c) => c.category === cat.id);
    if (!items.length) continue;
    push(`### ${cat.label}`);
    push("");
    for (const c of items) {
      const url = `${origin}/ui/components/${c.slug}`;
      const status = c.status === "planned" ? " (planned)" : "";
      let line = `- [${c.name}](${url})${status}: ${c.description}`;
      if (full && c.status === "stable") {
        const extra: string[] = [`registry: ${origin}/r/${c.slug}.json`];
        if (c.dependencies?.length) extra.push(`deps: ${c.dependencies.join(", ")}`);
        line += ` — ${extra.join("; ")}`;
      }
      push(line);
    }
    push("");
  }

  push("## Conventions");
  push("");
  push("- Controls share one size scale (`size=\"sm|md|lg\"`); pass matching sizes so rows align.");
  push("- `Select` is adaptive: native on touch, Radix on desktop, or force with `mode`.");
  push("- Prefer components over raw `<input>`/`<select>` so tokens and theming apply.");
  push("");

  return L.join("\n") + "\n";
}
