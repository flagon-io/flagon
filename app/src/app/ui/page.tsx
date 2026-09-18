import Link from "next/link";
import { ArrowRight, Accessibility, Palette, Package, Blocks } from "lucide-react";
import { buttonClasses } from "@flagon-io/ui";
import { components } from "@/components/docs/registry";

export const metadata = {
  title: "Flagon UI",
  description: "Accessible, Radix-based React components for Flagon.",
};

const features = [
  {
    icon: Accessibility,
    title: "Accessible by default",
    body: "Built on Radix primitives - focus management, keyboard nav, and ARIA handled for you.",
  },
  {
    icon: Palette,
    title: "Themed with tokens",
    body: "Styled against Flagon's design tokens, so light and dark just work out of the box.",
  },
  {
    icon: Package,
    title: "Two ways to install",
    body: "Copy components in with the shadcn CLI, or install the package and import them directly.",
  },
  {
    icon: Blocks,
    title: "Composable",
    body: "Small, unopinionated pieces you assemble - the same ones app.flagon.io is built from.",
  },
];

export default function UiIntroPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm font-medium text-brand-bright">@flagon-io/ui</p>
      <h1 className="mt-1 text-4xl font-bold tracking-tight text-foreground">Introduction</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Flagon UI is the accessible, Radix-based component library behind app.flagon.io. It&rsquo;s
        the same design system, packaged so you can build on it - {components.length} components and
        counting.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/ui/installation" className={buttonClasses()}>
          Get started
          <ArrowRight className="size-4" />
        </Link>
        <Link href="/ui/components" className={buttonClasses({ variant: "outline" })}>
          Browse components
        </Link>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="rounded-xl border border-hairline bg-card p-5">
              <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-brand/12 text-brand-bright">
                <Icon className="size-[18px]" />
              </div>
              <h2 className="font-semibold text-foreground">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-12 rounded-xl border border-hairline bg-panel p-5">
        <h2 className="font-semibold text-foreground">Next</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Head to{" "}
          <Link href="/ui/installation" className="text-link underline">
            Installation
          </Link>{" "}
          to set up your project, then pick a component to see live examples, code, and install
          commands.
        </p>
      </div>
    </div>
  );
}
