import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Usage analytics",
  description: `How per-flag usage, pass rate, and stale-flag detection work on ${brand.name}, and how to report exposures from your app.`,
};

const h2 = "mt-12 text-xl font-semibold tracking-tight text-zinc-100";
const p = "mt-3 text-sm leading-6 text-zinc-400";
const li = "text-sm leading-6 text-zinc-400";
const code = "rounded bg-white/5 px-1 py-0.5 text-[13px] text-zinc-200";

/**
 * Concept + integration doc for per-flag usage analytics. Everything here is
 * live product behavior; update this page in the same change as the behavior.
 */
export default function UsageAnalyticsDocsPage() {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        Concepts
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
        Usage analytics
      </h1>
      <p className={p}>
        Every flag shows how much it is used: checks per hour, a daily trend,
        pass rate, and whether it looks like a stale flag nobody has cleaned up.
        This page explains where those numbers come from and how to feed them
        from your application.
      </p>

      <h2 className={h2}>Why exposures</h2>
      <p className={p}>
        {brand.name} evaluates flags where the OpenFeature standard puts the
        work: your SDK downloads the whole configuration once and evaluates
        locally, so a poll returns every flag at once. That is fast and private,
        but it means the server cannot see <em>which</em> flags your code
        actually reads. From its side, every flag is computed on every poll.
      </p>
      <p className={p}>
        So real per-flag usage comes from your app telling us which flags it
        evaluated. That report is an <strong>exposure</strong>. You send them in
        pre-aggregated batches, and {brand.name} turns them into the checks,
        pass rate, and trends on each flag.
      </p>

      <h2 className={h2}>Privacy</h2>
      <p className={p}>
        Exposures are counts by outcome, not identities. {brand.name} stores how
        many times a flag returned each variant, and why (a default, a targeting
        rule, or a rollout split). It never stores who was evaluated. Do not put
        a targeting key in an exposure batch: it is ignored.
      </p>

      <h2 className={h2}>The batch format</h2>
      <p className={p}>
        Pre-aggregate your exposures by flag, variant, reason, and hour, then
        POST them to the exposure endpoint with the same client evaluation
        credential your SDK already uses. A{" "}
        <code className={code}>batch_id</code> makes delivery idempotent:
        resending a batch never double-counts.
      </p>
      <CodeBlock
        lang="http"
        code={`POST ${brand.apiUrl}/ofrep/v1/exposures
Authorization: Bearer <client token>
Content-Type: application/json

{
  "batch_id": "4f0c1c2e-4b0a-4e2a-9c1a-0b6b7c8d9e0f",
  "entries": [
    { "flag_key": "new-checkout", "variant": "on",  "reason": "TARGETING_MATCH", "hour": "2026-07-21T14:00:00Z", "count": 128 },
    { "flag_key": "new-checkout", "variant": "off", "reason": "STATIC",          "hour": "2026-07-21T14:00:00Z", "count": 32 }
  ]
}`}
      />
      <p className={p}>
        Each entry is a count for one (flag, variant, reason, hour).
        Pre-aggregating on the client is what keeps this cheap: one batch
        carries a handful of rows no matter how many checks it represents.{" "}
        <code className={code}>reason</code> is the OFREP reason your SDK
        already receives: <code className={code}>STATIC</code>,{" "}
        <code className={code}>TARGETING_MATCH</code>, or{" "}
        <code className={code}>SPLIT</code>.
      </p>

      <h2 className={h2}>Reference: an OpenFeature hook</h2>
      <p className={p}>
        The natural place to collect exposures is an OpenFeature{" "}
        <code className={code}>after</code> hook: it fires with the flag key and
        the evaluation result on every check. This reference hook buffers,
        aggregates by the hour, and flushes on an interval. Drop it into any
        OpenFeature JS client.
      </p>
      <CodeBlock
        lang="ts"
        code={`import type { Hook, HookContext, EvaluationDetails, FlagValue } from "@openfeature/server-sdk";

/**
 * Reports flag exposures to Flagon. Buffers checks, aggregates them by
 * (flag, variant, reason, hour), and flushes every FLUSH_MS. Counts and
 * outcomes only - no targeting identity ever leaves your process.
 */
export class FlagonExposureHook implements Hook {
  private buffer = new Map<string, { flag_key: string; variant: string; reason: string; hour: string; count: number }>();

  constructor(
    private endpoint = "${brand.apiUrl}/ofrep/v1/exposures",
    private clientToken = process.env.FLAGON_CLIENT_TOKEN!,
    flushMs = 30_000,
  ) {
    setInterval(() => void this.flush(), flushMs).unref?.();
  }

  after(_ctx: HookContext, details: EvaluationDetails<FlagValue>) {
    const hour = new Date().toISOString().slice(0, 13) + ":00:00Z";
    const variant = details.variant ?? "unknown";
    const reason = details.reason ?? "STATIC";
    const key = \`\${details.flagKey}|\${variant}|\${reason}|\${hour}\`;
    const row = this.buffer.get(key);
    if (row) row.count += 1;
    else this.buffer.set(key, { flag_key: details.flagKey, variant, reason, hour, count: 1 });
  }

  async flush() {
    if (this.buffer.size === 0) return;
    const entries = [...this.buffer.values()];
    this.buffer.clear();
    // A random, unique id per batch makes the POST safe to retry.
    const batch_id = crypto.randomUUID();
    try {
      await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: \`Bearer \${this.clientToken}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ batch_id, entries }),
      });
    } catch {
      // Re-buffer on failure so a flush is never lost. The batch_id stays with
      // the retry, so a request that actually landed won't double-count.
      for (const entry of entries) {
        const key = \`\${entry.flag_key}|\${entry.variant}|\${entry.reason}|\${entry.hour}\`;
        const row = this.buffer.get(key);
        if (row) row.count += entry.count;
        else this.buffer.set(key, entry);
      }
    }
  }
}`}
      />
      <p className={p}>
        Register it once, and every evaluation on that client is reported:
      </p>
      <CodeBlock
        lang="ts"
        code={`import { OpenFeature } from "@openfeature/server-sdk";

OpenFeature.addHooks(new FlagonExposureHook());`}
      />

      <h2 className={h2}>What you get</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        {/* The space after the first bold label is a literal inside a string
            expression, not JSX whitespace: SWC drops the whitespace following
            the first inline child of a block, which otherwise fuses the label
            onto the next word ("Checks / hrand"). A string literal is immune to
            both that trim and prettier's whitespace normalisation. */}
        <li className={li}>
          <strong>Checks / hr</strong>
          {
            " and a daily trend on every flag, in the list and on the flag's own page."
          }
        </li>
        <li className={li}>
          <strong>Pass rate</strong> for boolean flags (the share returning{" "}
          <code className={code}>on</code>), and the full variant distribution
          for everything else.
        </li>
        <li className={li}>
          <strong>Stale flags.</strong> A flag that is old, untouched, and no
          longer checked is flagged as a cleanup candidate, with its reasons
          shown. It is a suggestion, never an automatic action.
        </li>
      </ul>
      <p className={p}>
        Until you send exposures, single-flag lookups through{" "}
        <code className={code}>/ofrep/v1/evaluate/flags/&#123;key&#125;</code>{" "}
        still record real checks on their own, so the analytics are never empty
        for flags you evaluate individually. The full read API is{" "}
        <code className={code}>
          GET /v1/orgs/&#123;slug&#125;/flags/&#123;key&#125;/usage
        </code>
        .
      </p>
    </div>
  );
}
