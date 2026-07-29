import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";
import {
  entityAttributeNames,
  getSegment,
  listEntities,
  listSegments,
} from "@/lib/flags-api";
import { SegmentRules } from "./segment-rules";

/**
 * Segment detail: define the criteria that determine which users belong to the
 * segment (the rules live here, not in the create modal — matching Vercel), with
 * an info panel alongside.
 */
export default async function SegmentDetail({
  params,
}: {
  params: Promise<{ org: string; key: string }>;
}) {
  const { org: slug, key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const [segment, allSegments, entities] = await Promise.all([
    getSegment(slug, key),
    listSegments(slug),
    listEntities(slug),
  ]);
  if (!segment) notFound();
  // Segments can reference other segments (the engine guards against cycles).
  const otherSegments = allSegments.filter((s) => s.key !== key);
  const attributeSuggestions = entityAttributeNames(entities);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/${slug}/flags/segments`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" /> All Segments
        </Link>
        <div className="mt-2 flex items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">{segment.name}</h1>
          <span className="font-mono text-xs text-zinc-600">{segment.key}</span>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
        <section>
          <h2 className="text-sm font-medium text-zinc-300">Rules</h2>
          <p className="mb-3 mt-0.5 text-sm text-zinc-500">
            Define the criteria that determine which users belong to this segment.
          </p>
          <SegmentRules
            slug={slug}
            segment={segment}
            segments={otherSegments}
            attributeSuggestions={attributeSuggestions}
          />
        </section>

        <aside className="flex flex-col gap-5 lg:border-l lg:border-white/8 lg:pl-6">
          <div>
            <p className="text-xs font-medium text-zinc-400">Created</p>
            <p className="mt-1 text-sm text-zinc-300">
              {new Date(segment.createdAt).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400">Description</p>
            <p className="mt-1 text-sm text-zinc-500">
              {segment.description || "No description"}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
