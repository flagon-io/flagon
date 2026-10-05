import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { Frame } from "@/components/frame";
import { Section, SectionHeader, GUTTER } from "@/components/section";
import { Schematic, SchematicGrid } from "@/components/schematic";
import { Cta } from "@/components/cta";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Who Flagon is for",
  description:
    "The honest version of who tends to love working with Flagon or for it, and who tends not to. We'd rather tell you the truth up front than win you over and let you down later.",
};

type Item = { lead: string; body: string };

const FOR: Item[] = [
  {
    lead: "You want to see how it works before you trust it.",
    body: "The handbook, the pricing, the reasoning, the mistakes. All of it, in the open.",
  },
  {
    lead: "You'd rather own something whole than a slice of it.",
    body: "High ownership, little process, and no waiting for permission to fix what bugs you.",
  },
  {
    lead: "You care about craft.",
    body: "“Fine” bothers you when the thing could be good, down to the empty states and error copy.",
  },
  {
    lead: "You're playing a long game too.",
    body: "You'd rather build something durable and honest than flip it for a quick win.",
  },
  {
    lead: "You want to be treated like an adult.",
    body: "And you treat the people around you the same way. That's most of the culture, honestly.",
  },
  {
    lead: "You'd take an honest no over a polished maybe.",
    body: "Plain talk, admitted mistakes, and no marketing fog. Even when it's awkward.",
  },
];

const NOT_FOR: Item[] = [
  {
    lead: "You need guaranteed dates.",
    body: "We build in public, but we won't promise exactly what ships when. Plans move as we learn.",
  },
  {
    lead: "You want a lot of structure.",
    body: "Small teams, high ownership, minimal process. If you want clear lanes and oversight, the autonomy will feel like chaos.",
  },
  {
    lead: "You want to negotiate your pay up.",
    body: "Compensation is a published formula, the same for everyone. There's no haggling to win.",
  },
  {
    lead: "You'd rather keep things private.",
    body: "Everything here is public, including the awkward parts. Working with the door open is the whole point.",
  },
  {
    lead: "You want to be courted by sales.",
    body: "You can use what we make without ever talking to us. There's no white-glove process to enjoy.",
  },
  {
    lead: "You want the safe, popular choice.",
    body: "We make opinionated calls and we're willing to be disliked for them. Beige isn't on the menu.",
  },
];

export default function NotForEveryonePage() {
  return (
    <Frame>
      <main>
        <Section divider={false}>
          <SectionHeader
            title="Who Flagon is for, and who it isn't"
            lead="We'd rather tell you the truth up front than win you over and let you down later. So here, plainly, is who tends to love working with Flagon or for it, and who tends not to. Both lists are honest."
          />
        </Section>

        <Section divider>
          <Schematic bleed>
            <SchematicGrid cols={2}>
              <Column
                heading="You'll fit right in if"
                items={FOR}
                icon={<Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={2.5} />}
              />
              <Column
                heading="You probably won't if"
                items={NOT_FOR}
                icon={<Minus className="mt-0.5 h-4 w-4 shrink-0 text-subtle" strokeWidth={2.5} />}
              />
            </SchematicGrid>
          </Schematic>
        </Section>

        <Section divider className="text-center">
          <div className={GUTTER}>
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Sound like your kind of place?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-pretty text-muted-foreground">
              If the left column reads like you, you&rsquo;re probably our kind of
              person. Read the handbook, or come say hi.
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

function Column({
  heading,
  items,
  icon,
}: {
  heading: string;
  items: Item[];
  icon: React.ReactNode;
}) {
  return (
    <div className="p-6 sm:p-8">
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-subtle">{heading}</h2>
      <ul className="mt-5 flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.lead} className="flex items-start gap-3">
            {icon}
            <span className="text-sm leading-relaxed">
              <span className="font-medium text-foreground">{item.lead}</span>{" "}
              <span className="text-muted-foreground">{item.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
