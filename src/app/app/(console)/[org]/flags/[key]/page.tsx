import { notFound } from "next/navigation";
import { getFlag } from "@/lib/flags.server";
import { listSegments } from "@/lib/segments.server";
import type { TargetingRule, Variant } from "@/lib/flags";
import { resolveOrg } from "../../resolve-org";
import { deleteFlagAction, saveFlagDefinitionAction } from "../actions";
import { FlagDefinitionEditor } from "../flag-definition-editor";
import { DeleteFlagModal } from "../delete-flag-modal";

export default async function FlagPage({
  params,
}: {
  params: Promise<{ org: string; key: string }>;
}) {
  const { org: slug, key } = await params;
  const org = await resolveOrg(slug);
  if (!org) notFound();
  const [flag, segments] = await Promise.all([
    getFlag(org.id, key),
    listSegments(org.id),
  ]);
  if (!flag) notFound();
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-teal-400/80">
        Feature flag
      </p>
      {/* The key is the heading: it is the identity, it cannot change, and it
        is what the code that reads this flag says. A name is shown underneath
        only once someone has given the flag one that differs. */}
      <h1 className="mt-3 font-mono text-2xl font-semibold text-zinc-100">
        {flag.key}
      </h1>
      <div className="mt-2 flex items-center gap-2">
        {flag.name !== flag.key ? (
          <span className="text-sm text-zinc-400">{flag.name}</span>
        ) : null}
        <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
          {flag.type === "object" ? "JSON" : flag.type}
        </span>
      </div>
      {/* Keyed on updatedAt so a successful save re-seeds the editor from what
        was actually stored. The editor holds a draft in local state, and React
        resets a form once its action resolves - which put the DOM and React's
        state out of step without re-rendering to reconcile them, so the
        default-outcome select showed the pre-save value until a manual
        refresh. `updateFlag` stamps updatedAt on every write, so the key
        changes exactly when the server data does: saves remount with fresh
        values, and a rejected save leaves the draft untouched. */}
      <FlagDefinitionEditor
        key={flag.updatedAt.toISOString()}
        action={saveFlagDefinitionAction.bind(null, slug, key)}
        flag={{
          ...flag,
          variants: flag.variants as Variant[],
          rules: flag.rules as TargetingRule[],
        }}
        segments={segments.map(({ key: segmentKey, name }) => ({
          key: segmentKey,
          name,
        }))}
      />
      <section className="mt-12 border border-red-500/20 bg-red-500/2.5 p-5">
        <div className="flex items-center justify-between gap-6">
          <div>
            <h2 className="text-sm font-semibold text-red-300">Danger zone</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Permanently delete this flag, all of its rules, and its rollout
              configuration.
            </p>
          </div>
          <DeleteFlagModal
            flagKey={key}
            action={deleteFlagAction.bind(null, slug, key)}
          />
        </div>
      </section>
    </div>
  );
}
