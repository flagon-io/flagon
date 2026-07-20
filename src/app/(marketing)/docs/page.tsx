import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Braces,
  Flag,
  Rocket,
  Server,
  ShieldCheck,
} from "lucide-react";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Documentation · ${brand.name}`,
  description: `Guides and reference documentation for ${brand.name}: the self-hostable developer platform.`,
};

// Ordering: getting started and concepts first, then the
// products, with the API reference as the final section.
const sections = [
  {
    title: "Getting started",
    description: `Create an account, set up your first organization, and ship on ${brand.name}.`,
    href: null,
    icon: Rocket,
  },
  {
    title: "Authentication",
    description:
      "Accounts, usernames, multiple email addresses, verification, sessions, and passwords.",
    href: "/docs/authentication",
    icon: ShieldCheck,
  },
  {
    title: "Catalog",
    description:
      "Projects, teams, ownership, and permissions - the foundation everything plugs into.",
    href: null,
    icon: BookOpen,
  },
  {
    title: "Feature Flags",
    description:
      "OpenFeature-based flags on top of the catalog. First product out of the gate.",
    href: null,
    icon: Flag,
  },
  {
    title: "Self-hosting",
    description:
      "Run the whole platform on your own infrastructure: Postgres, environment, deploy.",
    href: null,
    icon: Server,
  },
  {
    title: "API reference",
    description:
      "Every REST endpoint with schemas, examples, and an interactive console. OpenAPI-compatible.",
    href: "/docs/api",
    icon: Braces,
  },
] as const;

export default function DocsHomePage() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        Documentation
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
        {brand.name} Documentation
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
        Everything you need to build on {brand.name}: guides, concepts, and a
        complete API reference. Most sections land alongside their features;
        what&apos;s live is ready below.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map(({ title, description, href, icon: Icon }) =>
          href ? (
            <Link
              key={title}
              href={href}
              className="group rounded-xl border border-white/10 bg-white/2 p-5 transition hover:border-teal-500/40 hover:bg-white/3"
            >
              <div className="flex items-center gap-2.5">
                <Icon className="h-4.5 w-4.5 text-teal-400" aria-hidden />
                <h2 className="text-base font-semibold text-zinc-100">
                  {title}
                </h2>
                <ArrowRight
                  className="ml-auto h-4 w-4 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-teal-400"
                  aria-hidden
                />
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {description}
              </p>
            </Link>
          ) : (
            <div
              key={title}
              aria-disabled
              title="Coming soon"
              className="cursor-not-allowed rounded-xl border border-white/5 p-5 opacity-60"
            >
              <div className="flex items-center gap-2.5">
                <Icon className="h-4.5 w-4.5 text-zinc-600" aria-hidden />
                <h2 className="text-base font-semibold text-zinc-400">
                  {title}
                </h2>
                <span className="ml-auto rounded-full border border-white/10 px-1.5 text-[10px] uppercase tracking-wide text-zinc-600">
                  Soon
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                {description}
              </p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
