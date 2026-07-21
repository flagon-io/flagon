import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { CodeBlock } from "@/components/code-block";
import { appHref } from "@/lib/urls";

export const metadata: Metadata = {
  title: "Getting started",
  description: `Create an organization, add a project, ship your first feature flag, and evaluate it from your application on ${brand.name}.`,
};

const h2 = "mt-12 text-xl font-semibold tracking-tight text-zinc-100";
const p = "mt-3 text-sm leading-6 text-zinc-400";
const li = "text-sm leading-6 text-zinc-400";
const a = "text-teal-400 transition hover:text-teal-300 hover:underline";
const code = "rounded bg-white/5 px-1 py-0.5 text-[13px] text-zinc-200";

/**
 * The five-minute path from signing up to a flag decision in an application.
 *
 * Deliberately ends at a real evaluation rather than at "you created a flag":
 * a flag nobody has read is not proof that anything works, and the credential
 * step is where people actually get stuck.
 */
export default function GettingStartedPage() {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        Get started
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
        Getting started
      </h1>
      <p className={p}>
        This walks from an empty account to a feature flag being evaluated by
        your application. It takes about five minutes and needs no billing
        details.
      </p>

      <h2 className={h2}>1. Create an organization</h2>
      <p className={p}>
        <Link href={appHref("/signup")} className={a}>
          Sign up
        </Link>{" "}
        with an email address, a password, and a username, then create an
        organization. The organization is the unit that owns everything else:
        projects, flags, members, and the bill. Most people want one per
        company, not one per app.
      </p>
      <p className={p}>
        Every account gets one free Hobby organization. It is capped rather
        than billed, so it can never produce an invoice.
      </p>

      <h2 className={h2}>2. Add a project</h2>
      <p className={p}>
        Projects are where work lives. They carry an overview, ownership
        (which teams and people are responsible), and per-project access
        roles. Products attach to projects, so creating one first gives
        everything after it somewhere to live.
      </p>
      <p className={p}>
        Ownership is documentation, not permission: naming a team as an owner
        records responsibility and grants no access. Access is granted
        separately, per project, on the Access tab.
      </p>

      <h2 className={h2}>3. Create a feature flag</h2>
      <p className={p}>
        On the Feature Flags page, create a flag. A flag has a stable{" "}
        <span className={code}>key</span> your code uses forever, a type
        (boolean, string, integer, float, or JSON), and one or more{" "}
        <em>variants</em>: the possible values it can serve. One variant is
        the fallback, served when no targeting rule matches.
      </p>
      <p className={p}>
        A boolean flag is on or off. Every other type takes a variant table, so
        a string flag can serve <span className={code}>control</span> and{" "}
        <span className={code}>treatment</span> from the moment it exists.
      </p>

      <h2 className={h2}>4. Create a credential</h2>
      <p className={p}>
        Applications authenticate with a token. Which kind depends on where
        your code runs, and the difference matters:
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li className={li}>
          <strong className="font-medium text-zinc-200">Client tokens</strong>{" "}
          are publishable. They are meant to ship inside browser, mobile, and
          desktop applications. They can evaluate flags, in bulk or one at a
          time, and never receive your rules or segment definitions.
        </li>
        <li className={li}>
          <strong className="font-medium text-zinc-200">
            Organization access tokens
          </strong>{" "}
          are secret. They are for server-side code and CI, and are the only
          credential that can reach the management API.
        </li>
      </ul>
      <p className={p}>
        Client tokens are created on the Feature Flags page; organization
        tokens under Organization &rarr; API tokens. Treat an organization
        token like a password, and rotate it if it leaks: rotation keeps the
        token&apos;s name and scopes and replaces only the secret.
      </p>
      <p className={p}>
        There is a third kind, a{" "}
        <strong className="text-zinc-200">personal access token</strong>, in
        your account settings. It acts as you across every organization you
        belong to, which makes it right for your own scripts and wrong for a
        shared service.
      </p>

      <h2 className={h2}>5. Evaluate it</h2>
      <p className={p}>
        {brand.name} implements{" "}
        <a
          href="https://openfeature.dev/specification/appendix-c/"
          className={a}
          target="_blank"
          rel="noreferrer noopener"
        >
          OFREP
        </a>
        , the OpenFeature Remote Evaluation Protocol, so you use standard
        OpenFeature SDKs rather than a vendor client. The fastest possible
        check is a single request:
      </p>
      <CodeBlock lang="bash" code={`curl -X POST ${brand.apiUrl}/ofrep/v1/evaluate/flags \\
  -H "Authorization: Bearer <your token>" \\
  -H "Content-Type: application/json" \\
  -d '{"context":{"targetingKey":"user-123"}}'`} />
      <p className={p}>
        That returns every flag in the organization, evaluated for that
        context. See{" "}
        <Link href="/docs/feature-flags" className={a}>
          Feature Flags
        </Link>{" "}
        for SDK setup in your language, targeting rules, segments, and caching.
      </p>

      <h2 className={h2}>What to read next</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li className={li}>
          <Link href="/docs/feature-flags" className={a}>
            Feature Flags
          </Link>{" "}
          &mdash; SDK setup, targeting, segments, and caching.
        </li>
        <li className={li}>
          <Link href="/docs/authentication" className={a}>
            Authentication
          </Link>{" "}
          &mdash; accounts, emails, sessions, and API authentication.
        </li>
        <li className={li}>
          <Link href="/docs/api" className={a}>
            API reference
          </Link>{" "}
          &mdash; every REST endpoint, with an interactive console.
        </li>
      </ul>
    </div>
  );
}
