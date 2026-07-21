import { notFound } from "next/navigation";
import { getFlag } from "@/lib/flags.server";
import { listSegments } from "@/lib/segments.server";
import type { TargetingRule, Variant } from "@/lib/flags";
import { resolveOrg } from "../../resolve-org";
import { deleteFlagAction, saveFlagDefinitionAction } from "../actions";
import { FlagDefinitionEditor } from "../flag-definition-editor";
import { DeleteFlagModal } from "../delete-flag-modal";

export default async function FlagPage({ params }: { params: Promise<{ org: string; key: string }> }) {
  const { org: slug, key } = await params;
  const org = await resolveOrg(slug); if (!org) notFound();
  const [flag, segments] = await Promise.all([getFlag(org.id, key), listSegments(org.id)]); if (!flag) notFound();
  return <div><p className="text-xs uppercase tracking-[0.2em] text-teal-400/80">Feature flag</p><h1 className="mt-3 text-2xl font-semibold text-zinc-100">{flag.name}</h1><div className="mt-2 flex items-center gap-2"><code className="text-sm text-zinc-500">{flag.key}</code><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">{flag.type === "object" ? "JSON" : flag.type}</span></div>
    <FlagDefinitionEditor action={saveFlagDefinitionAction.bind(null, slug, key)} flag={{ ...flag, variants: flag.variants as Variant[], rules: flag.rules as TargetingRule[] }} segments={segments.map(({ key: segmentKey, name }) => ({ key: segmentKey, name }))} />
    <section className="mt-12 border border-red-500/20 bg-red-500/[0.025] p-5"><div className="flex items-center justify-between gap-6"><div><h2 className="text-sm font-semibold text-red-300">Danger zone</h2><p className="mt-1 text-sm text-zinc-500">Permanently delete this flag, all of its rules, and its rollout configuration.</p></div><DeleteFlagModal flagKey={key} action={deleteFlagAction.bind(null, slug, key)} /></div></section>
  </div>;
}
