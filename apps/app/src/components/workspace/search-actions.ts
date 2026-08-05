"use server";

import { listFlags, listSegments } from "@/lib/flags-api";
import { listExperiments } from "@/lib/experiments-api";
import { listProjects } from "@/lib/projects-api";

/** A searchable workspace record for the ⌘K palette. */
export type SearchRecord = {
  group: "Flags" | "Experiments" | "Segments" | "Projects";
  label: string;
  sublabel: string;
  href: string;
};

/**
 * Build the ⌘K search index for an org: real records (flags, experiments,
 * segments, projects) the palette can jump to, not just static destinations.
 * Loaded once when the palette first opens; cmdk fuzzy-filters client-side. Each
 * list is best-effort (a failing surface just contributes nothing).
 */
export async function getWorkspaceSearchIndex(slug: string): Promise<SearchRecord[]> {
  const base = `/${slug}`;
  const [flags, experiments, segments, projects] = await Promise.all([
    listFlags(slug).catch(() => []),
    listExperiments(slug).catch(() => []),
    listSegments(slug).catch(() => []),
    listProjects(slug).catch(() => []),
  ]);

  const records: SearchRecord[] = [];
  for (const f of flags)
    records.push({ group: "Flags", label: f.name || f.key, sublabel: f.key, href: `${base}/flags/${f.key}` });
  for (const e of experiments)
    records.push({ group: "Experiments", label: e.name || e.key, sublabel: e.key, href: `${base}/experiments/${e.key}` });
  for (const s of segments)
    records.push({ group: "Segments", label: s.name || s.key, sublabel: s.key, href: `${base}/flags/segments/${s.key}` });
  for (const p of projects)
    records.push({ group: "Projects", label: p.name || p.key, sublabel: p.key, href: `${base}/projects/${p.key}` });
  return records;
}
