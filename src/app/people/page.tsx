import type { Metadata } from "next";
import { Frame } from "@/components/frame";
import { Section, SectionHeader, GUTTER } from "@/components/section";
import { Cta } from "@/components/cta";
import { Avatar } from "@/components/author-card";
import { getPeople, type Person } from "@/lib/people";

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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {people.map((person) => (
                <PersonCard key={person.name} person={person} />
              ))}
            </div>
          </div>
        </Section>

        <Section divider className="text-center">
          <div className={GUTTER}>
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Want to be on this page?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-pretty text-muted-foreground">
              We hire in the open, for the company these pages describe. If that
              sounds like you, come find us.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Cta href="/careers">See careers</Cta>
              <Cta href="/not-for-everyone" variant="secondary">
                Who Flagon is for
              </Cta>
            </div>
          </div>
        </Section>
      </main>
    </Frame>
  );
}

function PersonCard({ person }: { person: Person }) {
  return (
    <div className="flex flex-col rounded-xl border border-hairline bg-card p-5">
      <div className="flex items-center gap-3">
        <Avatar name={person.name} photo={person.photo} size={44} />
        <div className="min-w-0">
          <h3 className="truncate font-semibold tracking-tight">{person.name}</h3>
          <p className="truncate text-sm text-muted-foreground">{person.role}</p>
        </div>
        {person.founder ? (
          <span className="ml-auto shrink-0 self-start rounded-full bg-brand/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-brand">
            Founder
          </span>
        ) : null}
      </div>

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
    </div>
  );
}
