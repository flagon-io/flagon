import type { Metadata } from "next";
import { GridBackdrop } from "@flagon/design";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DocsChrome } from "@/components/docs/docs-shell";
import { LangProvider } from "@/components/docs/lang";

/**
 * The /docs area. It wears the same global chrome as the rest of the marketing
 * site, the SiteHeader (with its login-aware nav) and SiteFooter, with the docs
 * sidebar and content column in between. One site, one header, docs included.
 */
export const metadata: Metadata = {
  title: {
    default: "Documentation",
    template: "%s · Flagon Docs",
  },
  description:
    "Documentation for Flagon, the self-hostable developer platform: platform fundamentals, Feature Flags, the API, and self-hosting.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <GridBackdrop />
      <SiteHeader />
      <LangProvider>
        <DocsChrome>{children}</DocsChrome>
      </LangProvider>
      <SiteFooter />
    </>
  );
}
