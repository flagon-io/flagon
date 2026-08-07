"use client";

import { useState } from "react";
import { Siren } from "lucide-react";
import { Button } from "@flagon/design";
import type { Incident } from "@/lib/incidents-api";
import type { SeverityLevel } from "@/lib/incidents";
import { DeclareModal, Section } from "../../../incidents/incidents-view";

type Opt = { key: string; name: string };

/**
 * A project's incidents — the same open/resolved list as the reliability home,
 * scoped to this one service. Declaring from here preselects the project as an
 * affected service.
 */
export function ProjectIncidents({
  slug,
  projectKey,
  projectName,
  incidents,
  levels,
  canManage,
  teams,
  projects,
  autoDeclare,
}: {
  slug: string;
  projectKey: string;
  projectName: string;
  incidents: Incident[];
  levels: SeverityLevel[];
  canManage: boolean;
  teams: Opt[];
  projects: Opt[];
  autoDeclare?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(autoDeclare));
  const openIncidents = incidents.filter((i) => i.status !== "resolved");
  const resolved = incidents.filter((i) => i.status === "resolved");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Incidents</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Reliability events affecting <span className="text-zinc-300">{projectName}</span>.
          </p>
        </div>
        <span title={canManage ? undefined : "Only organization owners and admins can declare incidents"}>
          <Button variant="primary" disabled={!canManage} onClick={() => setOpen(true)}>
            <Siren className="size-4" /> Declare incident
          </Button>
        </span>
      </div>

      {incidents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-16 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-zinc-300">
            <Siren className="size-5" />
          </span>
          <p className="text-base font-medium text-zinc-100">No incidents for this service</p>
          <p className="max-w-sm text-sm text-zinc-500">
            When something breaks here, declare an incident. It routes to the owning
            team and its runbooks land on it as a checklist.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Section title="Open" incidents={openIncidents} slug={slug} levels={levels} empty="Nothing on fire right now." />
          {resolved.length > 0 ? <Section title="Resolved" incidents={resolved} slug={slug} levels={levels} /> : null}
        </div>
      )}

      {open ? (
        <DeclareModal
          slug={slug}
          levels={levels}
          teams={teams}
          projects={projects}
          initialServices={[projectKey]}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
