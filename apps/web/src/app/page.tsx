import { Blocks, Users, Zap } from "lucide-react";
import {
  BleedBand,
  brand,
  Cta,
  GridBackdrop,
  HexField,
  IconArrowRight,
  IconDiscord,
} from "@flagon/design";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StatusBadge } from "@/components/marketing";
import { DISCORD_URL, SIGN_UP_URL } from "@/lib/urls";

export default function Home() {
  return (
    <>
      <GridBackdrop />
      <SiteHeader />

      <main className="relative z-10 flex flex-1 flex-col">
        {/* Hero. No closing border: the pillars band below draws its own top
            rule, and two hairlines with nothing between them read as one heavy
            line. */}
        <section className="relative overflow-hidden">
          <HexField variant="hero" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-150"
            style={{
              background:
                "radial-gradient(50% 40% at 50% 0%, rgba(20,184,166,0.12) 0%, rgba(20,184,166,0.04) 50%, transparent 100%)",
            }}
          />

          <div className="relative mx-auto w-full max-w-7xl px-6 py-24 sm:px-12 sm:pt-28 lg:px-20">
            <StatusBadge>Early-access alpha</StatusBadge>

            <p className="mt-8 font-mono text-xs tracking-[0.25em] text-teal-400/80 uppercase">
              {brand.eyebrow}
            </p>

            <h1 className="mt-6 max-w-3xl text-5xl leading-[1.05] font-semibold tracking-tight text-zinc-100 sm:text-6xl md:text-7xl">
              {brand.taglineLead}
              <br />
              <span className="text-zinc-500">{brand.taglineFollow}</span>
            </h1>

            <p className="mt-8 max-w-xl text-lg/8 text-zinc-400">
              {brand.description}
            </p>

            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Cta
                href={SIGN_UP_URL}
                variant="primary"
                size="lg"
                iconRight={<IconArrowRight className="size-4" />}
              >
                Get started
              </Cta>
              <Cta href="/docs" variant="secondary" size="lg">
                Read the docs
              </Cta>
            </div>
          </div>
        </section>

        {/* Early-access alpha: an honest "state of the platform" statement right
            under the hero. Deliberately NOT the Discord band's shape (that owns the
            two-column + numbered list) — this is a single-column note with a status
            row, so the two teal bands read as different beats. */}
        <BleedBand outerClassName="bg-teal-950/15">
          <div className="relative overflow-hidden px-8 py-20 sm:px-12 lg:py-28">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(20,184,166,0.10),transparent)]"
            />
            <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
              <h2 className="text-4xl/tight font-semibold tracking-tight text-balance text-zinc-100 sm:text-5xl">
                We&apos;re early, and upfront about it.
              </h2>
              <p className="mt-6 max-w-2xl text-lg/8 text-pretty text-zinc-300">
                Flagon is in alpha. The foundation is in and products are landing fast, but features
                move quickly and we won&apos;t promise stability yet. We build in the open, so getting
                in early means shaping the platform you&apos;ll standardize on.
              </p>
              <p className="mt-6 max-w-xl text-base/7 text-pretty text-zinc-500">
                Built to augment the stack you already run, not to force a rip-and-replace, and made
                for how software ships now, with AI in the loop.
              </p>
            </div>
          </div>
        </BleedBand>

        {/* Early-access expectations, in the full-bleed divided-column style (the
            one 3-column region on the page). */}
        <BleedBand>
          <div className="grid grid-cols-1 divide-y divide-white/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {[
              {
                icon: Blocks,
                title: "Still building the bones",
                body: "The foundation is in and products are landing on it fast. Rough edges come with the territory this early.",
              },
              {
                icon: Users,
                title: "Built with you, in the open",
                body: "The source is public and the roadmap follows real use. Tell us what your team actually needs.",
              },
              {
                icon: Zap,
                title: "Moving fast, on purpose",
                body: "We're moving quickly to get to the value we want, so expect the occasional bump in early access. A dependable platform is exactly where we're headed as things settle.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="p-8">
                <Icon className="size-5 text-teal-400" />
                <h2 className="mt-4 text-base font-semibold text-zinc-100">{title}</h2>
                <p className="mt-2 text-sm/6 text-zinc-400">{body}</p>
              </div>
            ))}
          </div>
        </BleedBand>

        {/* Built in the open */}
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-6 py-20 sm:px-12 lg:flex-row lg:items-center lg:justify-between lg:px-20">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Built in the open
            </h2>
            <p className="mt-3 text-sm/6 text-zinc-400">
              Flagon is source-available. Read every line, run the whole
              platform on your own infrastructure, and shape where it goes. No
              cut-down community edition, no bait and switch.
            </p>
          </div>
          <Cta
            href={brand.repo}
            target="_blank"
            rel="noreferrer noopener"
            variant="secondary"
            size="lg"
            iconRight={<IconArrowRight className="size-4" />}
          >
            View the source
          </Cta>
        </div>

        {/* Community support */}
        <BleedBand>
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            <div className="px-8 py-14 sm:px-12 lg:px-16 lg:py-20">
              <div className="flex items-center gap-2 text-zinc-400">
                <IconDiscord className="size-5" />
                <p className="font-mono text-xs tracking-[0.2em] uppercase">
                  Join the community
                </p>
              </div>
              <h2 className="mt-6 max-w-lg text-4xl/tight font-semibold tracking-tight text-zinc-100 sm:text-5xl">
                Follow Flagon from the start.
              </h2>
              <p className="mt-5 max-w-lg text-base/7 text-zinc-400">
                Join the Flagon Discord for community support, to follow
                development, and to help shape what we build next.
              </p>
              <Cta
                href={DISCORD_URL}
                target="_blank"
                rel="noreferrer noopener"
                variant="primary"
                size="lg"
                icon={<IconDiscord className="size-4" />}
                iconRight={<IconArrowRight className="size-4" />}
                className="mt-8"
              >
                Join the Discord
              </Cta>
            </div>

            <ol className="flex flex-col justify-center border-t border-white/10 p-8 sm:px-12 lg:border-t-0 lg:border-l lg:px-14 lg:py-12">
              {[
                {
                  title: "Community support",
                  body: "Get help, compare notes with other builders, and talk directly with the Flagon team.",
                },
                {
                  title: "Follow development",
                  body: "See product progress, release notes, and what the team is working on next.",
                },
                {
                  title: "Help shape Flagon",
                  body: "Share feedback, request capabilities, and influence the products we build.",
                },
              ].map((item, index) => (
                <li
                  key={item.title}
                  className="grid grid-cols-[2rem_1fr] gap-4 border-t border-white/10 py-6 first:border-t-0"
                >
                  <span className="font-mono text-xs text-zinc-600">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-semibold text-zinc-100">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-sm/6 text-zinc-400">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </BleedBand>
      </main>

      <SiteFooter />
    </>
  );
}
