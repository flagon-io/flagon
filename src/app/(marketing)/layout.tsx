import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const title = `${brand.name} - ${brand.eyebrow}`;

export const metadata: Metadata = {
  keywords: [
    "developer platform",
    "feature flags",
    "OpenFeature",
    "experiments",
    "config",
    "catalog",
    "open source",
    "self-hosted",
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
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
