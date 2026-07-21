import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Feature Flags",
  description: `Evaluate feature flags on ${brand.name} through standard OpenFeature SDKs over OFREP: setup, targeting, segments, caching, and metering.`,
};

const h2 = "mt-12 text-xl font-semibold tracking-tight text-zinc-100";
const h3 = "mt-8 text-base font-semibold text-zinc-100";
const p = "mt-3 text-sm leading-6 text-zinc-400";
const li = "text-sm leading-6 text-zinc-400";
const a = "text-teal-400 transition hover:text-teal-300 hover:underline";
const code = "rounded bg-white/5 px-1 py-0.5 text-[13px] text-zinc-200";
const th = "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500";
const td = "border-t border-white/5 px-4 py-2.5 align-top text-sm text-zinc-400";

/**
 * The Feature Flags product guide.
 *
 * Written around OpenFeature rather than around a Flagon client, because there
 * is no Flagon client: the whole point of implementing OFREP is that the SDK
 * you integrate is the standard one, and swapping providers later is a config
 * change rather than a rewrite. Update this page in the same change as the
 * behavior it documents.
 */
export default function FeatureFlagsDocsPage() {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        Products
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
        Feature Flags
      </h1>
      <p className={p}>
        Typed, organization-wide flags evaluated through{" "}
        <a
          href="https://openfeature.dev"
          className={a}
          target="_blank"
          rel="noreferrer noopener"
        >
          OpenFeature
        </a>
        . {brand.name} implements OFREP 0.3, the OpenFeature Remote Evaluation
        Protocol, so your application talks to a standard SDK and never to a{" "}
        {brand.name}-specific client library.
      </p>
      <CodeBlock lang="text" code={`${brand.apiUrl}/ofrep/v1`} />
      <p className={p}>
        That means there is nothing proprietary to learn, and nothing
        proprietary to unpick if you leave: any OFREP-compatible provider works
        against this base URL.
      </p>

      <h2 className={h2}>Concepts</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li className={li}>
          <strong className="font-medium text-zinc-200">Flag</strong> &mdash; a
          stable <span className={code}>key</span>, a type (boolean, string,
          integer, float, or JSON), and the variants it can serve. The key is
          what your code references and never changes.
        </li>
        <li className={li}>
          <strong className="font-medium text-zinc-200">Variant</strong> &mdash;
          one named possible value. Every flag has at least one, and exactly
          one is the fallback served when no rule matches.
        </li>
        <li className={li}>
          <strong className="font-medium text-zinc-200">Targeting rule</strong>{" "}
          &mdash; ordered criteria that serve a specific variant, or split
          traffic across variants by weight. The first matching rule wins.
        </li>
        <li className={li}>
          <strong className="font-medium text-zinc-200">Segment</strong> &mdash;
          a reusable named audience that rules can reference, so &ldquo;beta
          customers&rdquo; is defined once and shared by every flag.
        </li>
        <li className={li}>
          <strong className="font-medium text-zinc-200">
            Evaluation context
          </strong>{" "}
          &mdash; what you know about the caller. It must carry a non-empty{" "}
          <span className={code}>targetingKey</span>, which is also what
          percentage rollouts bucket on, so the same user stays on the same
          side of a split.
        </li>
      </ul>

      <h2 className={h2}>Credentials</h2>
      <p className={p}>
        Which token you use is a security decision, not a preference.
      </p>
      <div className="mt-4 overflow-x-auto border border-white/10">
        <table className="w-full border-collapse">
          <thead className="bg-white/2">
            <tr>
              <th className={th}>Token</th>
              <th className={th}>Ships in</th>
              <th className={th}>Can do</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={td}>
                <span className="font-medium text-zinc-200">Client token</span>
                <div className="mt-0.5 text-xs text-zinc-600">Publishable</div>
              </td>
              <td className={td}>Browser, mobile, desktop</td>
              <td className={td}>
                Evaluation only, bulk or single flag, plus the invalidation
                stream. Receives evaluated values, never rules or segment
                definitions.
              </td>
            </tr>
            <tr>
              <td className={td}>
                <span className="font-medium text-zinc-200">
                  Organization access token
                </span>
                <div className="mt-0.5 text-xs text-zinc-600">Secret</div>
              </td>
              <td className={td}>Servers, jobs, CI</td>
              <td className={td}>
                Everything a client token can do, plus the management API.
                Evaluation scope:{" "}
                <span className={code}>flags:evaluate</span>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={p}>
        Client tokens are created and rotated on the Feature Flags page.
        Organization tokens live under{" "}
        <strong className="text-zinc-200">Organization &rarr; API tokens</strong>,
        because they are a platform credential rather than a flags-specific
        one: the same token can reach projects, members, and usage, according
        to its scopes.
      </p>
      <p className={p}>
        A <strong className="text-zinc-200">personal access token</strong>{" "}
        works here too. It acts as you, carrying your organization roles, so it can
        never do more than you can by hand and it stops working when your
        membership does. Tell it which organization to evaluate against by
        sending that organization&apos;s id in{" "}
        <span className={code}>X-Flagon-Organization</span>. For a shared
        production service prefer an organization token, which outlives whoever
        set it up.
      </p>

      <h3 className={h3}>Scopes</h3>
      <p className={p}>
        Organization and personal tokens carry scopes; client tokens do not,
        because evaluation is the only thing they can do. Evaluating flags
        needs just <span className={code}>flags:evaluate</span>, which is all
        most integrations ever grant.
      </p>
      <div className="mt-4 overflow-x-auto border border-white/10">
        <table className="w-full border-collapse">
          <thead className="bg-white/2">
            <tr>
              <th className={th}>Scope</th>
              <th className={th}>Grants</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={td}>
                <span className={code}>flags:evaluate</span>
              </td>
              <td className={td}>Evaluate flags over OFREP. Nothing else.</td>
            </tr>
            <tr>
              <td className={td}>
                <span className={code}>flags:read</span>
              </td>
              <td className={td}>
                Read flag and segment DEFINITIONS, including targeting rules.
                Never give this to a client.
              </td>
            </tr>
            <tr>
              <td className={td}>
                <span className={code}>flags:write</span>
              </td>
              <td className={td}>
                Create and change flags and segments. Includes{" "}
                <span className={code}>flags:read</span>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={p}>
        A <span className={code}>:write</span> scope always includes its
        matching <span className={code}>:read</span>, so there is no need to
        grant both. Scopes never cross resources: a token with{" "}
        <span className={code}>flags:write</span> cannot read your projects.
        The full set also covers <span className={code}>projects</span>,{" "}
        <span className={code}>members</span>,{" "}
        <span className={code}>usage</span>, and{" "}
        <span className={code}>org</span>; see the{" "}
        <Link href="/docs/api" className={a}>
          API reference
        </Link>
        .
      </p>
      <p className={p}>
        No scope grants token management. Creating, rotating, and revoking
        credentials requires a signed-in human, so a leaked token can always be
        contained by someone who still has a password.
      </p>

      <h2 className={h2}>Browser and React applications</h2>
      <p className={p}>
        Install the OpenFeature web SDK and an OFREP web provider, then point
        it at {brand.name} with a client token and a static context:
      </p>
      <CodeBlock lang="bash" code={`npm install @openfeature/web-sdk @openfeature/ofrep-web-provider`} />
      <CodeBlock lang="ts" code={`import { OpenFeature } from "@openfeature/web-sdk";
import { OFREPWebProvider } from "@openfeature/ofrep-web-provider";

await OpenFeature.setProviderAndWait(
  new OFREPWebProvider({
    baseUrl: "${brand.apiUrl}/ofrep/v1",
    headers: [["Authorization", \`Bearer \${CLIENT_TOKEN}\`]],
    pollInterval: 15000,
  }),
);

// The context is STATIC on the client: set it once, update it on sign-in.
await OpenFeature.setContext({ targetingKey: userId, plan: "pro" });

const client = OpenFeature.getClient();
const enabled = client.getBooleanValue("new-checkout", false);`} />
      <p className={p}>
        Always pass a default (<span className={code}>false</span> above). It
        is what your application serves before the first response arrives and
        if {brand.name} is unreachable, which is what keeps a flag service from
        becoming a hard dependency of your page loading.
      </p>

      <h3 className={h3}>React</h3>
      <CodeBlock lang="bash" code={`npm install @openfeature/react-sdk @openfeature/ofrep-web-provider`} />
      <CodeBlock lang="tsx" code={`import { OpenFeatureProvider, useFlag } from "@openfeature/react-sdk";

function Checkout() {
  const { value } = useFlag("new-checkout", false);
  return value ? <NewCheckout /> : <LegacyCheckout />;
}

// Wrap the tree once, above anything that reads a flag.
<OpenFeatureProvider>
  <App />
</OpenFeatureProvider>;`} />
      <p className={p}>
        Hooks re-render on their own when configuration changes, because the
        provider emits{" "}
        <span className={code}>PROVIDER_CONFIGURATION_CHANGED</span> after
        effective values move.
      </p>

      <h2 className={h2}>Server applications</h2>
      <p className={p}>
        Server SDKs evaluate against a <em>per-request</em> context, so the
        context is passed at the call site rather than set globally.
      </p>
      <CodeBlock lang="bash" code={`npm install @openfeature/server-sdk @openfeature/ofrep-provider`} />
      <CodeBlock lang="ts" code={`import { OpenFeature } from "@openfeature/server-sdk";
import { OFREPProvider } from "@openfeature/ofrep-provider";

await OpenFeature.setProviderAndWait(
  new OFREPProvider({
    baseUrl: "${brand.apiUrl}/ofrep/v1",
    headers: [["Authorization", \`Bearer \${SERVER_TOKEN}\`]],
  }),
);

const client = OpenFeature.getClient();
const enabled = await client.getBooleanValue("new-checkout", false, {
  targetingKey: request.userId,
  plan: account.plan,
});`} />

      <h2 className={h2}>Other languages</h2>
      <p className={p}>
        The examples above are JavaScript because they have to be written in
        something. Nothing about them is JavaScript-specific: OFREP is an HTTP
        contract, so any language with an OpenFeature SDK and an OFREP provider
        reaches {brand.name} the same way, with the same two settings. The base
        URL above, and an <span className={code}>Authorization</span> header.
      </p>
      <p className={p}>
        OpenFeature maintains SDKs well beyond these examples: Go, Java, Python,
        .NET, PHP, Ruby, Rust, C++, Dart and NestJS on the server, and Web,
        React, Angular, Kotlin and Swift on the client. We do not restate their
        documentation here, because they are the SDKs and we are just a
        conformant endpoint behind them.
      </p>
      {/* Deliberately NOT a per-language table of OFREP support. An SDK
          existing for a language does not mean an OFREP provider does, the two
          lists move independently, and OpenFeature itself declines to
          enumerate them for exactly that reason - it points at the ecosystem
          directory instead. A list copied here would be wrong within a
          release and wrong in the direction that wastes someone's afternoon. */}
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li className={li}>
          <a
            href="https://openfeature.dev/"
            className={a}
            target="_blank"
            rel="noreferrer noopener"
          >
            OpenFeature SDKs
          </a>{" "}
          &mdash; every supported language, client and server.
        </li>
        <li className={li}>
          <a
            href="https://openfeature.dev/ecosystem"
            className={a}
            target="_blank"
            rel="noreferrer noopener"
          >
            Ecosystem directory
          </a>{" "}
          &mdash; the current list of OFREP providers. Check yours here first;
          it is the list that decides whether you write any integration code.
        </li>
        <li className={li}>
          <a
            href="https://openfeature.dev/docs/reference/other-technologies/ofrep/"
            className={a}
            target="_blank"
            rel="noreferrer noopener"
          >
            About OFREP
          </a>{" "}
          &mdash; the protocol itself, if you would rather implement it
          directly than take a dependency.
        </li>
      </ul>
      <p className={p}>
        If no provider exists for your language yet, the endpoints are plain
        HTTP and documented in the{" "}
        <Link href="/docs/api" className={a}>
          API reference
        </Link>
        . A working integration is two requests.
      </p>

      <h2 className={h2}>Caching and freshness</h2>
      <p className={p}>
        Bulk responses carry an <span className={code}>ETag</span>. Send it back
        as <span className={code}>If-None-Match</span> and an unchanged
        configuration returns <span className={code}>304 Not Modified</span>{" "}
        with no body.
      </p>
      <p className={p}>
        This is worth doing even though it is optional. A 304 transfers almost
        nothing, and it is <strong className="text-zinc-200">not metered</strong>{" "}
        &mdash; it served no decision, so it is not counted as one, and it does
        not consume your configuration-sync allowance either.
      </p>
      <p className={p}>
        The validator covers both the organization&apos;s configuration and the
        evaluation context, so a validator from one context can never produce a
        304 for a different one. Changing any flag or segment invalidates it.
      </p>
      <p className={p}>
        Clients can also subscribe to{" "}
        <span className={code}>GET /ofrep/v1/events</span> and refresh on{" "}
        <span className={code}>configuration_changed</span> instead of polling
        on a timer. Recommended behaviour when streaming is unavailable: poll
        every 15 seconds while the document is visible, back off to 60 seconds
        while hidden, refresh immediately on visibility or reconnect, and keep
        the last good values through transient failures.
      </p>

      <h2 className={h2}>What gets metered</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li className={li}>
          A single-flag evaluation records <strong className="text-zinc-200">one</strong>{" "}
          evaluation.
        </li>
        <li className={li}>
          A bulk evaluation records{" "}
          <strong className="text-zinc-200">one per flag decision</strong>{" "}
          returned, plus one configuration sync.
        </li>
        <li className={li}>
          A <span className={code}>304</span> records{" "}
          <strong className="text-zinc-200">nothing at all</strong>.
        </li>
      </ul>
      <p className={p}>
        Live counters are on the organization&apos;s Usage page and at{" "}
        <Link href="/docs/api" className={a}>
          <span className={code}>GET /v1/orgs/&#123;slug&#125;/usage/evaluations</span>
        </Link>
        . Hobby organizations are capped and refuse requests with{" "}
        <span className={code}>429</span> past the cap; paid plans are billed
        rather than cut off.
      </p>

      <h2 className={h2}>Reference</h2>
      <div className="mt-4 overflow-x-auto border border-white/10">
        <table className="w-full border-collapse">
          <thead className="bg-white/2">
            <tr>
              <th className={th}>Endpoint</th>
              <th className={th}>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={td}>
                <span className={code}>POST /ofrep/v1/evaluate/flags</span>
              </td>
              <td className={td}>
                Evaluate every flag for one context. Supports ETag.
              </td>
            </tr>
            <tr>
              <td className={td}>
                <span className={code}>
                  POST /ofrep/v1/evaluate/flags/&#123;key&#125;
                </span>
              </td>
              <td className={td}>
                Evaluate one flag. Supports ETag.
              </td>
            </tr>
            <tr>
              <td className={td}>
                <span className={code}>GET /ofrep/v1/events</span>
              </td>
              <td className={td}>
                Authenticated stream emitting{" "}
                <span className={code}>configuration_changed</span>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={p}>
        Flags are also fully manageable over REST; see the{" "}
        <Link href="/docs/api" className={a}>
          API reference
        </Link>
        .
      </p>
    </div>
  );
}
