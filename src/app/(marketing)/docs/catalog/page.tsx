import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Catalog",
  description: `Organizations, projects, teams, ownership, and access on ${brand.name}: the foundation every product plugs into.`,
};

const h2 = "mt-12 text-xl font-semibold tracking-tight text-zinc-100";
const h3 = "mt-8 text-base font-semibold text-zinc-100";
const p = "mt-3 text-sm leading-6 text-zinc-400";
const a = "text-teal-400 transition hover:text-teal-300 hover:underline";
const code = "rounded bg-white/5 px-1 py-0.5 text-[13px] text-zinc-200";
const th =
  "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500";
const td =
  "border-t border-white/5 px-4 py-2.5 align-top text-sm text-zinc-400";

/**
 * The catalog: the substrate every product sits on.
 *
 * Written before Feature Flags in the reading order on purpose. Flags are the
 * first product, but organizations, projects, and access are what a flag
 * BELONGS to, and people who skip this end up modelling one organization per
 * application and then wondering why billing looks strange.
 */
export default function CatalogDocsPage() {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        Products
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
        Catalog
      </h1>
      <p className={p}>
        The catalog is the part of Flagon that answers &ldquo;what do we have,
        and who is responsible for it&rdquo;. Every other product attaches to
        it, so getting the shape right once means nothing downstream has to
        reinvent projects, permissions, or ownership.
      </p>

      <h2 className={h2}>Organizations</h2>
      <p className={p}>
        An organization is the top-level container and{" "}
        <strong className="text-zinc-200">the billing entity</strong>. It owns
        projects, members, teams, credentials, and the invoice. Usage is metered
        per organization, and the billing period follows that
        organization&apos;s own subscription cycle rather than the calendar.
      </p>
      <p className={p}>
        Model one organization per company, not one per application. Separate
        applications are separate <em>projects</em> inside it. Splitting them
        into separate organizations gives you several bills, several credentials
        to rotate, and no shared usage credit.
      </p>
      <p className={p}>
        Every organization has exactly one{" "}
        <strong className="text-zinc-200">owner</strong>. Ownership transfers
        deliberately: the current owner hands it to another member and drops to
        admin in the same move. It is never assigned as a role or handed out in
        an invitation.
      </p>

      <h3 className={h3}>Deleting an organization</h3>
      <p className={p}>
        Deletion is a soft delete with a retention window, so an accident is
        recoverable. After the window the data is purged for real.
      </p>

      <h2 className={h2}>Projects</h2>
      <p className={p}>
        Projects are the unit of work: one per application, service, or surface.
        A project carries a <span className={code}>slug</span>, a one-line
        description, a website, topics, a Markdown overview, its owners, and its
        own access roles.
      </p>
      <p className={p}>
        The slug is the project&apos;s identity in console URLs, in SDK
        configuration, and in every <span className={code}>/v1</span> path. It
        can be changed by a project admin, but nothing is left behind at the old
        one: Flagon keeps no redirect, so a stale integration gets a 404 rather
        than being handed to whichever project claims the name next. Everything
        else about the project, including access and ownership, follows the
        rename.
      </p>
      <p className={p}>
        Usage is attributed to a project wherever a product can tell which one
        produced it, which is what makes the per-project breakdown on the usage
        page meaningful. Historical usage outlives the project that produced it:
        deleting a project never rewrites a bill you already paid.
      </p>

      <h3 className={h3}>The overview</h3>
      <p className={p}>
        Each project has a Markdown overview, the equivalent of a README: what
        this is, who it serves, how to run it, where the runbook lives. It is
        the highest-leverage thing in the catalog and the most commonly skipped.
      </p>

      <h2 className={h2}>Ownership is not access</h2>
      <p className={p}>
        This distinction is the one thing worth reading twice.
      </p>
      <div className="mt-4 overflow-x-auto border border-white/10">
        <table className="w-full border-collapse">
          <thead className="bg-white/2">
            <tr>
              <th className={th}></th>
              <th className={th}>Ownership</th>
              <th className={th}>Access</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={td}>Answers</td>
              <td className={td}>Who is responsible for this?</td>
              <td className={td}>Who may change this?</td>
            </tr>
            <tr>
              <td className={td}>Grants permission</td>
              <td className={td}>
                <span className="text-zinc-300">No, never</span>
              </td>
              <td className={td}>Yes</td>
            </tr>
            <tr>
              <td className={td}>Can be</td>
              <td className={td}>A team or a person</td>
              <td className={td}>A team or a person</td>
            </tr>
            <tr>
              <td className={td}>Where</td>
              <td className={td}>Project overview</td>
              <td className={td}>Project Access tab</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={p}>
        Naming the Platform team as an owner of a project documents
        accountability. It does not give that team a single additional
        permission. Making ownership imply access is a tempting shortcut that
        turns a directory into an access-control system nobody audits, so{" "}
        {brand.name} keeps them strictly separate.
      </p>

      <h2 className={h2}>Members and teams</h2>
      <p className={p}>
        Members are the people in an organization. There is{" "}
        <strong className="text-zinc-200">no seat pricing</strong>: adding
        people never changes the bill, on any plan. Assignable organization
        roles are <span className={code}>admin</span> and{" "}
        <span className={code}>member</span>; owner is separate, and there is
        exactly one.
      </p>
      <p className={p}>
        Teams group members so access and ownership can be granted to a durable
        group rather than to a list of individuals who change jobs. Granting a
        team write access on a project gives it to everyone on that team,
        including people who join it later.
      </p>

      <h2 className={h2}>Project access roles</h2>
      <div className="mt-4 overflow-x-auto border border-white/10">
        <table className="w-full border-collapse">
          <thead className="bg-white/2">
            <tr>
              <th className={th}>Role</th>
              <th className={th}>Can</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={td}>
                <span className={code}>read</span>
              </td>
              <td className={td}>See the project and everything in it.</td>
            </tr>
            <tr>
              <td className={td}>
                <span className={code}>write</span>
              </td>
              <td className={td}>
                Everything read can, plus change the project&apos;s contents,
                including its overview.
              </td>
            </tr>
            <tr>
              <td className={td}>
                <span className={code}>admin</span>
              </td>
              <td className={td}>
                Everything write can, plus manage access, assign ownership,
                rename, and delete the project.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={p}>
        A person&apos;s effective role is the strongest of their direct grant,
        any grant held by a team they belong to, and their organization role.
        Organization owners and admins have admin on every project.
      </p>

      <h2 className={h2}>Everything is in the API</h2>
      <p className={p}>
        Organizations, projects, teams, members, ownership, and access grants
        are all managed over REST as well as in the console; the two call the
        same implementation, so neither can drift from the other. See the{" "}
        <Link href="/docs/api" className={a}>
          API reference
        </Link>
        .
      </p>
    </div>
  );
}
