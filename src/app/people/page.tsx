import type { Metadata } from "next";
import { Frame } from "@/components/frame";
import { Section, SectionHeader, GUTTER } from "@/components/section";
import Image from "next/image";
import { Cta } from "@/components/cta";
import { SlantBox, SlantSplit, Tag } from "@/components/slant";
import { DOTS } from "@/components/schematic";
import { getPeople, type Person } from "@/lib/people";
import { runForAspect } from "@/lib/slant";

/** Portraits are square panels leaning at the site's tilt. */
const PORTRAIT_RUN = runForAspect(1);

export const metadata: Metadata = {
  title: "People",
  description:
    "The crew building Flagon. A small group of people who wanted to work somewhere open and honest, so they're building it, hiring in the open as they grow.",
};

export default function PeoplePage() {
  const people = getPeople();
  const count =
    people.length === 1 ? "Right now that's a team of one, hiring in the open" : `A team of ${people.length}, growing in the open`;

  return (
    <Frame>
      <main>
        <Section divider={false}>
          <SectionHeader
            title="The crew"
            lead={`Flagon is a small group of people who wanted to work somewhere open and honest, so they set out to build it. ${count}. We care about whether you can learn, ship, and treat people well, not where you went to school or how big your last logo was.`}
          />
        </Section>

        <Section divider>
          <div className={GUTTER}>
            <div className="grid gap-x-4 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {people.map((person) => (
                <PersonCard key={person.name} person={person} />
              ))}
            </div>
          </div>
        </Section>

        <SlantSplit art="open" artId="people-cta">
          <h2 className="max-w-md text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Want to be on this page?
          </h2>
          <p className="mt-4 max-w-md text-pretty text-muted-foreground">
            We hire in the open, for the company these pages describe. If that
            sounds like you, come find us.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
            <Cta href="/careers">See careers</Cta>
            <Cta href="/not-for-everyone" variant="secondary">
              Who Flagon is for
            </Cta>
          </div>
        </SlantSplit>
      </main>
    </Frame>
  );
}

function PersonCard({ person }: { person: Person }) {
  return (
    <article className="flex flex-col">
      <SlantBox
        run={PORTRAIT_RUN}
        className="aspect-square"
        frameClassName="rounded-sm border border-hairline bg-(--art-card)"
      >
        {person.photo ? (
          <Image
            src={person.photo}
            alt={person.name}
            fill
            sizes="(min-width: 64rem) 26rem, (min-width: 40rem) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div
            className="grid h-full place-items-center font-mono text-5xl font-semibold text-brand"
            style={DOTS}
            aria-hidden
          >
            {initials(person.name)}
          </div>
        )}
        {person.founder ? (
          <Tag
            className="absolute bottom-4 left-4 text-primary-foreground before:bg-primary"
          >
            Founder
          </Tag>
        ) : null}
      </SlantBox>
      <h3 className="mt-5 text-lg font-semibold tracking-tight">{person.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{person.role}</p>

      {person.bio ? (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{person.bio}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-widest text-subtle">
        <span>{person.team}</span>
        {person.location ? (
          <>
            <span aria-hidden>·</span>
            <span>{person.location}</span>
          </>
        ) : null}
      </div>

      {person.links?.length ? (
        <div className="mt-3 flex flex-wrap gap-3">
          {person.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-link underline underline-offset-2"
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}
