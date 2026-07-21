import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { GridBackdrop } from "@/components/grid-backdrop";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteBottomBar } from "@/components/site-bottom-bar";

const title = `${brand.name} - ${brand.eyebrow}`;

export const metadata: Metadata = {
  keywords: [
    "developer platform",
    "feature flags",
    "OpenFeature",
    "experiments",
    "config",
    "catalog",
    "self-hostable",
    "source-available",
  ],
  openGraph: {
    type: "website",
    siteName: brand.name,
    url: brand.url,
    title,
    description: brand.description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: brand.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* The grid the whole marketing site sits on. Fixed and behind
          everything, so the verticals stay continuous while the page scrolls
          past them. */}
      <GridBackdrop />
      <SiteHeader />
      {/* flex-1 pins the footer to the viewport bottom on short pages. */}
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
      <SiteFooter />
      <SiteBottomBar />
    </>
  );
}
