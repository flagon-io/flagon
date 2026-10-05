import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Frame } from "@/components/frame";
import { FlagonPour } from "@/components/flagon-pour";
import { Schematic, SchematicGrid } from "@/components/schematic";
import { Section, SectionHeader, GUTTER } from "@/components/section";
import { Cta } from "@/components/cta";
import { AuthorCard } from "@/components/author-card";
import { site } from "@/lib/site";
import { getFounder } from "@/lib/people";

export const metadata: Metadata = {
  title: "About",
  description:
    "Flagon makes software and builds the company in the open. The long version: who we are, how we got here, why we're different, and what we're playing for.",
};

export default function AboutPage() {
  const founder = getFounder();
  return (
    <Frame>
      <main>
        {/* Hero */}
        <Section divider={false}>
          <div className={`grid gap-10 ${GUTTER} lg:grid-cols-[1.5fr_1fr] lg:items-center`}>
            <div className="max-w-2xl">
              <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
                We make software. And we&rsquo;re building the company we always
                wanted to work for.
              </h1>
              <p className="mt-6 text-pretty text-lg leading-relaxed text-muted-foreground">
                {site.legalName} makes good software and runs the whole company in
                the open. This is the long version of who we are, how we got here,
                and why we do it this way. It&rsquo;s also, honestly, a pitch: for
                the software we make, for working here, and for the kind of company
                we think ought to exist.
              </p>
            </div>
            <div className="flex justify-center lg:justify-end">
              <FlagonPour className="relative h-40 w-40 sm:h-48 sm:w-48" />
            </div>
          </div>
        </Section>

        {/* How we got here */}
        <Section divider>
          <Narrative heading="How we got here">
            <p>
              Flagon started with a frustration. Most software companies operate
              behind a curtain: the handbook is internal, the roadmap is a sales
              tool, and the real reasoning for anything lives in a few
              people&rsquo;s heads. Then they spend a fortune convincing you to
              trust them anyway.
            </p>
            <p>
              I&rsquo;d worked at places like that, and it made the work worse. So I
              started Flagon to do it the other way around: build the company out
              loud, from the first day, and let people read exactly how it runs
              before deciding to trust it. A few months in, I&rsquo;m more sure of
              that call than almost any other. The whole story lives in the{" "}
              <Link href="/handbook/how-we-got-here">handbook</Link>.
            </p>
          </Narrative>
        </Section>

        {/* Why we're different */}
        <Section divider>
          <Narrative heading="Why we're different">
            <p>
              Fair warning: if you like the way most companies treat you, you might
              not like us. We&rsquo;re building the company we&rsquo;ve always wanted
              to work for, which means quietly rejecting a pile of things that
              somehow became normal. No spin, no fog, no growth tricks that only
              work because you weren&rsquo;t paying attention.
            </p>
            <p>
              The whole thing comes down to one rule: we try to treat you the way
              we&rsquo;d want to be treated. If a tactic gives us the ick, it gives
              you the ick too, so we don&rsquo;t use it. We&rsquo;re also not for
              everyone, and we&rsquo;d rather say so plainly than pretend otherwise.
              Here&rsquo;s{" "}
              <Link href="/not-for-everyone">who Flagon is for, and who it isn&rsquo;t</Link>.
            </p>
          </Narrative>
        </Section>

        {/* We just do the right thing */}
        <Section divider>
          <SectionHeader
            title="We just try to do the right thing"
            lead="Not as a slogan. As a list of specific things we will and won't do, that you can hold us to."
          />
          <Schematic bleed className="mt-10">
            <SchematicGrid cols={3}>
              <Right title="No dark patterns">
                No auto-renewal traps, no manufactured urgency, no unsubscribe
                mazes. If it only works because you weren&rsquo;t looking, it&rsquo;s
                out.
              </Right>
              <Right title="No bill shock">
                Our products are priced close to what they cost us, with the markup
                stated plainly. You will never open an invoice and gasp. If pricing
                surprises you, we got it wrong.
              </Right>
              <Right title="Try it without us">
                No &ldquo;book a demo&rdquo; wall in front of the thing. Use it,
                self-serve, and decide for yourself before you ever talk to a human.
              </Right>
              <Right title="Support from builders">
                The people who make it help support it. No offshored script-readers,
                no ticket that dies in a queue.
              </Right>
              <Right title="Here for the long haul">
                No quick exit, no flip. Flagon is the work, not a lottery ticket. We
                intend to still be here, and still be good, years from now.
              </Right>
              <Right title="Words that mean something">
                No marketing fog. We write like people, admit what we don&rsquo;t
                know, and tell you plainly when we&rsquo;re wrong.
              </Right>
            </SchematicGrid>
          </Schematic>
        </Section>

        {/* Transparency */}
        <Section divider>
          <Narrative heading={<>Transparency isn&rsquo;t a feature. It&rsquo;s the whole thing.</>}>
            <p>
              You can see how the entire company operates. How we work, what we
              value, how we make decisions, and{" "}
              <Link href="/handbook/compensation">exactly how we pay people</Link>,
              down to the formula. This whole site, handbook and all, is{" "}
              <a href={site.links.github} target="_blank" rel="noreferrer">
                open source
              </a>{" "}
              and versioned in git, so you can watch it change.
            </p>
            <p>
              If you&rsquo;re thinking about using what we make, or joining us, you
              should be able to make an informed decision, not just about what
              exists today, but about the kind of company this is and intends to
              stay.
            </p>
          </Narrative>
          <Schematic bleed className="mt-12">
            <SchematicGrid cols={3}>
              <Stat value="100%" label="Handbook, public" />
              <Stat value="Open" label="Source, in git" />
              <Stat value="Public" label="Comp, decisions, reasoning" />
            </SchematicGrid>
          </Schematic>
        </Section>

        {/* The long game */}
        <Section divider>
          <Narrative heading="We're playing the long game">
            <p>
              This isn&rsquo;t a bait-and-switch or a plan to exit in a few years.
              Flagon is meant to be a durable company, run default-alive, making
              useful software in public for as long as it&rsquo;s worth doing.
              It&rsquo;s the work I want to be doing, at the company I&rsquo;d want
              to buy software from and want to work at.
            </p>
            <p>
              We&rsquo;re small and early, and we&rsquo;re not going to pretend
              otherwise. But the direction is fixed, and it won&rsquo;t change with
              the fundraising weather: build good things, in the open, for the long
              haul. Read <Link href="/handbook/values#the-long-game">the long game</Link>{" "}
              for the full version.
            </p>
          </Narrative>
        </Section>

        {/* Founder note */}
        <Section divider>
          <div
            className={`grid gap-6 ${GUTTER} md:grid-cols-[1fr_2fr] md:gap-12 lg:gap-16`}
          >
            <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
              A note from the founder
            </p>
            <div className="max-w-2xl rounded-xl border border-hairline bg-panel p-6 sm:p-8">
              {founder ? (
                <AuthorCard name={founder.name} role={founder.role} photo={founder.photo} />
              ) : null}
              <div className="prose mt-6">
                <p>
                  I spent years inside companies that said one thing to the world
                  and did another behind the login. It made me tired, and it made
                  the work worse. Flagon is my attempt at the opposite: everything
                  about how we operate is public, because I&rsquo;d rather be held
                  to a standard I wrote down than ask you to trust a logo.
                </p>
                <p>
                  If we ever fall short of what&rsquo;s on these pages, that&rsquo;s
                  a bug, and you&rsquo;re welcome to file it.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* tl;dr */}
        <Section divider>
          <div
            className={`grid gap-6 ${GUTTER} md:grid-cols-[1fr_2fr] md:gap-12 lg:gap-16`}
          >
            <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
              tl;dr
            </p>
            <p className="max-w-2xl text-pretty text-xl font-medium leading-relaxed tracking-tight sm:text-2xl">
              We make software, and we&rsquo;re building the company we always
              wanted to work for: open, honest, priced without games, and here for
              the long haul. If we haven&rsquo;t convinced you yet, read the handbook,
              follow the blog, and come try what we make.
            </p>
          </div>
        </Section>

        {/* CTA */}
        <Section divider className="text-center">
          <div className={GUTTER}>
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Want the full picture?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-pretty text-muted-foreground">
              The handbook is the real answer to almost any question about how
              Flagon works. If you&rsquo;d want to work somewhere like this, the{" "}
              <Link href="/careers" className="text-link underline underline-offset-2">
                careers page
              </Link>{" "}
              is the next stop.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Cta href="/handbook">Read the handbook</Cta>
              <Cta href={site.links.discord} external variant="secondary">
                Join the Discord
              </Cta>
            </div>
          </div>
        </Section>
      </main>
    </Frame>
  );
}

/** A two-column narrative block: heading in a left rail, prose on the right. */
function Narrative({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  return (
    <div className={`grid gap-6 ${GUTTER} md:grid-cols-[1fr_2fr] md:gap-12 lg:gap-16`}>
      <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
        {heading}
      </h2>
      <div className="prose max-w-2xl">{children}</div>
    </div>
  );
}

function Right({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="p-6 sm:p-8">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="p-8 text-center sm:p-10">
      <p className="text-5xl font-semibold tracking-tight text-brand">{value}</p>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-subtle">{label}</p>
    </div>
  );
}
