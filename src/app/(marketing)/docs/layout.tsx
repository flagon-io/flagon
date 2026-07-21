import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { DocsNav, type DocsNavModel } from "./docs-nav";

export const metadata: Metadata = {
  title: {
    default: `Documentation · ${brand.name}`,
    template: `%s · ${brand.name} Docs`,
  },
};

/**
 * Documentation shell: left sidebar + content pane. Live
 * sections link through; future sections sit disabled so the map of what's
 * coming is visible. The API reference entry expands into its operations.
 */
export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Ordering: how you RUN it, then what it does, then the reference.
  //
  // Self-hosting sits in "Get started" rather than in a "Platform" section
  // near the bottom, because where a capability appears in a sidebar is a
  // claim about how important it is. Running the whole platform yourself,
  // unmetered, is one of the main reasons to choose this product at all;
  // listing it after the product guides files it as an appendix for people
  // with unusual requirements, which is the opposite of true. Reading it as
  // the second thing on the page is the point.
  const navModel: DocsNavModel = {
    groups: [
      {
        label: "Get started",
        items: [
          { label: "Getting started", href: "/docs/getting-started" },
          { label: "Self-hosting", href: "/docs/self-hosting" },
        ],
      },
      {
        label: "Concepts",
        items: [{ label: "Authentication", href: "/docs/authentication" }],
      },
      {
        label: "Products",
        items: [
          { label: "Catalog", href: "/docs/catalog" },
          { label: "Feature Flags", href: "/docs/feature-flags" },
        ],
      },
      {
        label: "Reference",
        items: [{ label: "API reference", href: "/docs/api" }],
      },
    ],
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DocsNav model={navModel} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
