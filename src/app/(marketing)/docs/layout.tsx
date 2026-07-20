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
  // Ordering: concepts and product docs first, the API
  // reference last. "Documentation" itself is the home link.
  const navModel: DocsNavModel = {
    groups: [
      {
        label: "Get started",
        items: [{ label: "Getting started", href: null }],
      },
      {
        label: "Concepts",
        items: [{ label: "Authentication", href: "/docs/authentication" }],
      },
      {
        label: "Products",
        items: [
          { label: "Catalog", href: null },
          { label: "Feature Flags", href: null },
        ],
      },
      {
        label: "Platform",
        items: [{ label: "Self-hosting", href: null }],
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
