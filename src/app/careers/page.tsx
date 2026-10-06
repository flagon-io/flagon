import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Frame } from "@/components/frame";
import { HexField } from "@/components/hex-field";
import { Schematic, SchematicGrid } from "@/components/schematic";
import { Section, SectionHeader, GUTTER } from "@/components/section";
import { Cta } from "@/components/cta";
import { SlantSplit } from "@/components/slant";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Work at Flagon. A small crew of misfits, fully remote, paid by a public formula, building software in the open. Here's what it's like and how we hire.",
};

export default function CareersPage() {
  return (
    <Frame>
      <main>
        {/* Hero */}
        <SlantSplit art="teams" artId="careers-hero" backdrop={<HexField />} divider={false}>
          <h1 className="max-w-xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Come build with us.
          </h1>
          <p className="mt-6 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Flagon is a small crew of misfits making software worth using, in the
            open. We hire rarely and carefully. If the way we work sounds like the
            place you&rsquo;ve been looking for, we&rsquo;d love to hear from you.
          </p>
          <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row">
            <Cta href={`mailto:${site.links.email}`} external={false}>
              Introduce yourself
            </Cta>
            <Cta href="/handbook" variant="secondary">
              Read the handbook
            </Cta>
          </div>
        </SlantSplit>

        {/* Why Flagon */}
        <Section divider bleed="end">
          <SectionHeader
            title="A place built for people who care about the work"
            lead="No games, no busywork, nothing hidden. Here's what you'd actually be signing up for."
          />
          <Schematic bleed className="mt-10">
            <SchematicGrid cols={3}>
              <Perk title="Real ownership">
                Small autonomous teams and high trust. You own what you ship, end
                to end, and you have the room to do it right.
              </Perk>
              <Perk title="Craft is the job">
                We&rsquo;d rather make one genuinely good thing than ten that are
                fine. Taste and quality aren&rsquo;t a luxury here, they&rsquo;re
                the point.
              </Perk>
              <Perk title="Everything in the open">
                The handbook, the reasoning, the decisions. You always know where
                you stand and why, because it&rsquo;s written down.
              </Perk>
              <Perk title="Fully remote, no offices">
                There&rsquo;s no HQ to be near. Async by default so timezones
                don&rsquo;t trap anyone. We optimize
                for outcomes, not hours or a webcam grid.
              </Perk>
              <Perk title="Paid by a formula">
                Same transparent framework for everyone, no negotiation games.
                You can{" "}
                <Link href="/handbook/compensation" className="text-link underline underline-offset-2">
                  calculate the offer
                </Link>{" "}
                before you ever talk to us.
              </Perk>
              <Perk title="The long game">
                No quick exit, no burnout-as-a-badge. We&rsquo;re building
                somewhere worth staying for years.
              </Perk>
            </SchematicGrid>
          </Schematic>
        </Section>

        {/* Benefits + comp */}
        <Section divider>
          <div className={`grid gap-10 ${GUTTER} lg:grid-cols-[1fr_1fr]`}>
            <div>
              <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                Fair, transparent, no haggling
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                Every role is paid by the same published formula, and everyone
                gets equity. Beyond salary: fully remote, real time off that
                people actually take, an equipment and learning budget, and a
                bias toward removing friction over gimmick perks.
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                <Link
                  href="/handbook/compensation"
                  className="text-sm font-medium text-link underline underline-offset-2"
                >
                  See how we pay people
                </Link>
                <Link
                  href="/handbook/benefits"
                  className="text-sm font-medium text-link underline underline-offset-2"
                >
                  Benefits and perks
                </Link>
              </div>
            </div>
            <div>
              <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                A process that respects your time
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                No whiteboard trivia and no take-it-or-leave-it games. We look at
                real work, we pay you for a work sample, we&rsquo;re clear about
                where you stand, and when we say no we tell you why. It&rsquo;s all
                written down before you apply.
              </p>
              <div className="mt-6">
                <Link
                  href="/handbook/how-we-hire"
                  className="text-sm font-medium text-link underline underline-offset-2"
                >
                  Read how we hire
                </Link>
              </div>
            </div>
          </div>
        </Section>

        {/* Open roles */}
        <SlantSplit art="open" artId="careers-roles">
          <h2 className="max-w-md text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            No listings up right now
          </h2>
          <p className="mt-4 max-w-md text-pretty text-muted-foreground">
            We hire in small, deliberate bursts, so most of the time this page is
            quiet. That doesn&rsquo;t mean don&rsquo;t reach out.
          </p>
          <p className="mt-4 max-w-md text-pretty text-muted-foreground">
            If this is the kind of place you&rsquo;ve been looking for, tell us
            who you are, what you&rsquo;ve made, and what you&rsquo;d want to
            work on. We read every note.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
            <Cta href={`mailto:${site.links.email}`}>Email us</Cta>
            <Cta href={site.links.discord} external variant="secondary">
              Say hi in Discord
            </Cta>
          </div>
        </SlantSplit>
      </main>
    </Frame>
  );
}

function Perk({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="p-6 sm:p-8">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
