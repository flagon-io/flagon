import { notFound } from "next/navigation";
import type { CriteriaGroup } from "@/lib/flags";
import { getSegment } from "@/lib/segments.server";
import { resolveOrg } from "../../resolve-org";
import { saveSegmentAction } from "../actions";
import { SegmentEditor } from "../segment-editor";
export default async function SegmentPage({ params }: { params: Promise<{ org: string; key: string }> }) { const { org: slug, key } = await params; const org = await resolveOrg(slug); if (!org) notFound(); const segment = await getSegment(org.id, key); if (!segment) notFound(); return <div><p className="text-xs uppercase tracking-[0.2em] text-teal-400/80">Segment</p><h1 className="mt-3 text-2xl font-semibold text-zinc-100">{segment.name}</h1><code className="mt-1 block text-sm text-zinc-500">{segment.key}</code><SegmentEditor action={saveSegmentAction.bind(null, slug, key)} segment={{ ...segment, criteria: segment.criteria as CriteriaGroup }} /></div>; }
