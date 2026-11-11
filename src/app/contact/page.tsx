import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { SiDiscord, SiGithub } from "@icons-pack/react-simple-icons";
import { Frame } from "@/components/frame";
import { HexField } from "@/components/hex-field";
import { SlantBeams } from "@/components/slant";
import { GUTTER } from "@/components/section";
import { ContactForm } from "@/components/contact-form";
import { site } from "@/lib/site";
import { isTopicId } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with Flagon: start a project, ask a question, introduce yourself, or reach us for press. You'll hear back from a person.",
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { topic } = await searchParams;
  const initialTopic = isTopicId(topic) ? topic : "general";

  return (
    <Frame>
      <main>
        <section className="relative isolate py-14 sm:py-20">
          {/* Pinned: the form grows with the topic, and the backdrop shouldn't move. */}
          <HexField height={760} />
          <SlantBeams />
          <div className={`grid gap-12 ${GUTTER} lg:grid-cols-[1fr_1.6fr] lg:gap-16`}>
            <div>
              <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
                Get in touch.
              </h1>
              <p className="mt-6 max-w-md text-pretty text-base/relaxed text-muted-foreground sm:text-lg/relaxed">
                Whether you want to hire us, work here, or just say hello, it
                lands with a person, not a queue. We reply within two business
                days, even when the answer is no.
              </p>

              <ul className="mt-10 grid gap-5 text-sm">
                <Channel
                  icon={<Mail className="size-4" strokeWidth={2} />}
                  label="Email"
                  href={`mailto:${site.links.email}`}
                  value={site.links.email}
                />
                <Channel
                  icon={<SiDiscord className="size-4" />}
                  label="Discord"
                  href={site.links.discord}
                  value="Chat with us and the community"
                  external
                />
                <Channel
                  icon={<SiGithub className="size-4" />}
                  label="GitHub"
                  href={site.links.github}
                  value="Issues and pull requests welcome"
                  external
                />
              </ul>

              <p className="mt-10 max-w-sm text-sm/relaxed text-subtle">
                Hiring us? Our{" "}
                <Link href="/work#rates" className="text-link underline underline-offset-2">
                  rates are public
                </Link>
                , so you&rsquo;ll know roughly what it costs before you write.
              </p>
            </div>

            <div className="rounded-2xl border border-hairline bg-background/80 p-6 backdrop-blur-sm sm:p-8">
              {/* Keyed by topic so moving between /contact links resets the picker. */}
              <ContactForm key={initialTopic} email={site.links.email} initialTopic={initialTopic} />
            </div>
          </div>
        </section>
      </main>
    </Frame>
  );
}

function Channel({
  icon,
  label,
  href,
  value,
  external,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  value: string;
  external?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-panel text-muted-foreground">
        {icon}
      </span>
      <div>
        <p className="font-medium">{label}</p>
        <a
          href={href}
          {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          className="text-muted-foreground transition hover:text-foreground"
        >
          {value}
          {external && <span className="sr-only"> (opens in a new tab)</span>}
        </a>
      </div>
    </li>
  );
}
