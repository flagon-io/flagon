import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Media",
  description:
    "Logos, the mark, and the plain facts, for anyone writing about Flagon, Inc. Grab the brand assets or reach us directly.",
};

export default function MediaPage() {
  return (
    <StubPage
      title="For anyone writing about us"
      lead="Logos, the mark, and the plain facts about Flagon, free to use. The brand assets live in the handbook, and each of our products keeps its own on its own site. For a quote, a detail, or anything else, reach us directly."
      actions={[
        { label: "Brand assets", href: "/handbook/brand-assets", variant: "primary" },
        { label: "Email us", href: `mailto:${site.links.email}`, external: true },
      ]}
    />
  );
}
