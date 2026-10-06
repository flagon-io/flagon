import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Partnerships",
  description:
    "Building something that fits with what we make, or want to work together? We're open to it. Tell us what you have in mind.",
};

export default function PartnershipsPage() {
  return (
    <StubPage
      art="panels"
      title="Let's build something together"
      lead="If you're making something that fits alongside one of our products, or you think there's a way we could work together, we're open to it. Tell us what you have in mind, plainly."
      actions={[
        { label: "Email us", href: `mailto:${site.links.email}`, external: true, variant: "primary" },
        { label: "Read the handbook", href: "/handbook" },
      ]}
    />
  );
}
