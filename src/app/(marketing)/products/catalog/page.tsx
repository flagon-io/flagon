import type { Metadata } from "next";
import Link from "next/link";
import { Check, FileText, Users, Workflow } from "lucide-react";
import { brand } from "@/lib/brand";
import { appHref } from "@/lib/urls";
import { BleedBand } from "@/components/bleed-band";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: `Catalog · ${brand.name}`,
  description: `Projects, teams, ownership, and access on ${brand.name}: model your organization once and let every product inherit it.`,
};

/**
 * Catalog, as a marketing page.
 *
 * The hardest thing to sell about a substrate is that it is a substrate, so
 * this leads with the pain (re-describing your org in every tool) rather than
 * with the feature list.
 */
const pillars = [
  {
    icon: Workflow,
    title: "Model your organization once",
    body: "Projects, teams, and people live here, and every product attaches to them. Turning on the next capability does not mean re-creating the same structure in another tool and keeping the two in sync by hand.",
  },
  {
    icon: FileText,
    title: "A README for every project",
    body: "What this is, who it serves, how to run it, where the runbook lives. The highest-leverage documentation in any organization is the paragraph that stops somebody asking in chat, and it belongs next to the thing it describes.",
  },
  {
    icon: Users,
    title: "Ownership that is not permission",
    body: "Naming a team as owner records responsibility and grants nothing. Access is granted separately, per project. Conflating the two turns a directory into an access-control system nobody audits.",
  },
] as const;

const capabilities = [
  "Projects with a Markdown overview and stable identifier",
  "Ownership by team or by individual person",
  "Per-project read, write, and admin roles",
  "Teams that grant access to a durable group",
  "Exactly one organization owner, transferred deliberately",
  "Usage attributed per project",
  "Unlimited members, with no seat pricing",
  "Full REST API and OpenAPI spec",
] as const;

export default function CatalogProductPage() {
  return (
    <div className="relative">
      <PageHero
        eyebrow="Catalog"
        title={
          <>
            What you have.
            <br />
            <span className="text-zinc-500">Who owns it.</span>
          </>
        }
        lede={
          <>
            The foundation the whole platform sits on: projects, teams,
            ownership, and access. Describe your organization once, and every
            product you turn on already understands it.
          </>
        }
        actions={
          <>
            <Link
              href={appHref("/new?plan=free")}
              className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
            >
              Start for free
            </Link>
            <Link
              href="/docs/catalog"
              className="rounded-md border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
            >
              Read the docs
            </Link>
          </>
        }
        rule={false}
      />

      <BleedBand>
        <div className="grid grid-cols-1 divide-y divide-white/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {pillars.map(({ icon: Icon, title, body }) => (
            <div key={title} className="p-8">
              <Icon className="h-5 w-5 text-teal-400" aria-hidden />
              <h2 className="mt-4 text-base font-semibold text-zinc-100">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
            </div>
          ))}
        </div>
      </BleedBand>

      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-12 lg:px-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
              What you get
            </h2>
            <ul className="mt-6 space-y-3">
              {capabilities.map((capability) => (
                <li
                  key={capability}
                  className="flex items-start gap-2.5 text-sm leading-6 text-zinc-300"
                >
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-teal-400"
                    aria-hidden
                  />
                  {capability}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Ownership is not access
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              This is the distinction most tools blur, and blurring it is how a
              catalog quietly becomes the thing that decides who can deploy.
            </p>
            <div className="mt-6 overflow-x-auto border border-white/10">
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="w-1/2 border-b border-white/5 px-4 py-3 align-top text-sm text-zinc-400">
                      <span className="block text-zinc-200">Ownership</span>
                      Who is responsible for this?
                    </td>
                    <td className="border-b border-l border-white/5 px-4 py-3 align-top text-sm text-zinc-400">
                      <span className="block text-zinc-200">Access</span>
                      Who may change this?
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 align-top text-sm text-zinc-400">
                      Grants nothing. Documentation only.
                    </td>
                    <td className="border-l border-white/5 px-4 py-3 align-top text-sm text-zinc-400">
                      Read, write, or admin, per project.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-500">
              More in the{" "}
              <Link
                href="/docs/catalog"
                className="text-teal-400 transition hover:text-teal-300 hover:underline"
              >
                Catalog documentation
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
