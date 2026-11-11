import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Frame } from "@/components/frame";
import { HexField } from "@/components/hex-field";
import { Schematic, SchematicGrid } from "@/components/schematic";
import { Section, SectionHeader, GUTTER } from "@/components/section";
import { Cta } from "@/components/cta";
import { SlantSplit } from "@/components/slant";
import { CaseStudyCard, NextProjectCard } from "@/components/work-cards";
import { Capabilities } from "@/components/capabilities";
import { EmployerLogo, EmployerLogos } from "@/components/employer-logos";
import { site } from "@/lib/site";
import { contactHref } from "@/lib/contact";
import { CASE_STUDIES, EMPLOYERS, OFFERS, PROCESS, TRACK_RECORD } from "@/lib/work";

export const metadata: Metadata = {
  title: "Work with us",
  description:
    "Flagon is a full-service software studio: strategy, UX, design, and engineering for products, apps, platforms, and websites, built by people who've done it at scale, with rates published up front.",
};

export default function WorkPage() {
  return (
    <Frame>
      <main>
        {/* Hero */}
        <SlantSplit art="craft" artId="work-hero" backdrop={<HexField />} divider={false}>
          <h1 className="max-w-xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            From the first sketch to the thing running in production.
          </h1>
          <p className="mt-6 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Flagon is a full-service studio: strategy, UX, design, and
            engineering under one roof, for products, apps, platforms, and
            websites. One small senior team from the first call to launch and
            beyond, no handoffs between agencies, and the price is right here on
            the page.
          </p>
          <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row">
            <Cta href={contactHref("project")}>Start a project</Cta>
            <Cta href="#rates" variant="secondary">
              See rates
            </Cta>
          </div>
        </SlantSplit>

        {/* Track record */}
        <Section divider bleed="end">
          <SectionHeader
            title="Before Flagon, Chase built software at"
            lead="Twenty years shipping across gaming, social, fintech, proptech, and field service, from the first commit to the 3am incident. That's the experience your project gets."
          />
          <EmployerLogos className={`mt-12 ${GUTTER}`} />
          <Schematic bleed className="mt-14">
            <SchematicGrid cols={4} rules="straight">
              {TRACK_RECORD.map((s) => {
                const name = EMPLOYERS.find((e) => e.id === s.employer)?.name ?? s.employer;
                return (
                  <div key={s.label} className="flex flex-col p-6 sm:p-8">
                    <div className="flex h-8 items-center justify-between gap-4">
                      <EmployerLogo
                        id={s.employer}
                        name={name}
                        area={1000}
                        align="left"
                        className="text-foreground/80"
                      />
                      <span className="font-mono text-[11px] tracking-widest text-subtle">
                        {s.year}
                      </span>
                    </div>
                    <p className="mt-8 bg-linear-to-br from-brand-bright to-brand bg-clip-text text-5xl font-semibold tracking-tighter text-transparent tabular-nums sm:text-6xl">
                      {s.value}
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">{s.label}</p>
                  </div>
                );
              })}
            </SchematicGrid>
          </Schematic>
        </Section>

        {/* Capabilities */}
        <Section divider bleed="end">
          <div id="capabilities" className="scroll-mt-24" />
          <SectionHeader
            title="What we do"
            lead="All of it, end to end. Bring us an idea, a half-built product, or a system that needs rescuing, and we'll take it from wherever it is to wherever it needs to be."
          />
          <Capabilities className="mt-10" />
        </Section>

        {/* Offers and rates */}
        <Section divider bleed="end">
          <div id="rates" className="scroll-mt-24" />
          <SectionHeader
            title="How you hire us"
            lead={
              <>
                One published rate for everyone. No quote that depends on how
                much we think you can afford, and no &ldquo;contact us for
                pricing.&rdquo; Here&rsquo;s{" "}
                <Link href="/handbook/client-work" className="text-link underline underline-offset-2">
                  how we think about client work
                </Link>
                .
              </>
            }
          />
          <Schematic bleed className="mt-10">
            <SchematicGrid cols={2} rules="straight">
              {OFFERS.map((o) => (
                <div key={o.id} className="flex flex-col p-6 sm:p-8">
                  <h3 className="text-lg font-semibold tracking-tight">{o.title}</h3>
                  <p className="mt-4 text-3xl font-semibold tracking-tight">{o.price}</p>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-subtle">
                    {o.terms}
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{o.body}</p>
                  <ul className="mt-5 grid gap-2">
                    {o.includes.map((i) => (
                      <li key={i} className="flex gap-2.5 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
                        <span>{i}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </SchematicGrid>
          </Schematic>
        </Section>

        {/* Work */}
        <Section divider>
          <SectionHeader
            title="Recent work"
            lead="We're new as a studio, so this list is short, and the next spot is open. Everything here is live, so go click around."
          />
          <div className={`mt-10 grid gap-x-10 gap-y-14 ${GUTTER} md:grid-cols-2`}>
            <NextProjectCard href={contactHref("project")} />
            {CASE_STUDIES.map((c) => (
              <CaseStudyCard key={c.id} study={c} />
            ))}
          </div>
        </Section>

        {/* How it goes */}
        <Section divider bleed="end">
          <SectionHeader
            title="How a project goes"
            lead="No discovery phase that bills for a month before anything happens. You talk to the person doing the work from the first email."
          />
          <Schematic bleed className="mt-10">
            <SchematicGrid cols={4} rules="straight">
              {PROCESS.map((s, i) => (
                <div key={s.title} className="p-6 sm:p-8">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
                    Step {i + 1}
                  </p>
                  <h3 className="mt-3 text-base font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </SchematicGrid>
          </Schematic>
        </Section>

        {/* Fit */}
        <Section divider>
          <div className={`grid gap-10 ${GUTTER} lg:grid-cols-2`}>
            <Fit title="A good fit if you">
              <li>Want it built well, and are willing to pay for that</li>
              <li>Care how it works on the inside, not just the demo</li>
              <li>Want a straight answer, even when it&rsquo;s &ldquo;don&rsquo;t build that&rdquo;</li>
              <li>Are fine with us writing about the work (we&rsquo;ll ask first)</li>
            </Fit>
            <Fit title="Probably not a fit if you">
              <li>Need the cheapest bid, or want a team of twenty by Monday</li>
              <li>Want hours logged more than software shipped</li>
              <li>Are building something we wouldn&rsquo;t put our name on</li>
              <li>
                Need a big agency&rsquo;s process. That&rsquo;s fine,{" "}
                <Link href="/not-for-everyone" className="text-link underline underline-offset-2">
                  we&rsquo;re not for everyone
                </Link>
              </li>
            </Fit>
          </div>
        </Section>

        {/* CTA */}
        <SlantSplit art="panels" artId="work-cta">
          <h2 className="max-w-md text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Got something worth building?
          </h2>
          <p className="mt-4 max-w-md text-pretty text-muted-foreground">
            Tell us what you have in mind. You&rsquo;ll hear back from the person
            who&rsquo;d do the work, within two business days, even if the answer
            is no.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
            <Cta href={contactHref("project")}>Start a project</Cta>
            <Cta href={`mailto:${site.links.email}`} variant="secondary" arrow={false}>
              {site.links.email}
            </Cta>
          </div>
        </SlantSplit>
      </main>
    </Frame>
  );
}

function Fit({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-balance text-2xl font-semibold tracking-tight">{title}</h2>
      <ul className="mt-5 grid list-disc gap-2.5 pl-5 text-muted-foreground marker:text-subtle">
        {children}
      </ul>
    </div>
  );
}
