import type { Metadata } from "next";
import { StubPage } from "@/components/stub-page";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Side projects",
  description:
    "The small, sometimes weird things we build for the fun of it and for the community, outside the main work.",
};

export default function SideProjectsPage() {
  return (
    <StubPage
      art="craft"
      title="Things we build for the fun of it"
      lead="The small, sometimes weird projects we make outside the main work, for ourselves and for the community. They show up here and out in the open on GitHub."
      actions={[
        { label: "See our GitHub", href: site.links.github, external: true, variant: "primary" },
        { label: "Join the Discord", href: site.links.discord, external: true },
      ]}
    />
  );
}
