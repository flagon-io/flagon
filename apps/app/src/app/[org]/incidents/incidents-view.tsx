"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Siren, Users } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  Textarea,
} from "@flagon/design";
import { SEVERITIES, SEVERITY_STYLE, STATUSES, labelFor, severityTone } from "@/lib/incidents";
import type { Incident } from "@/lib/incidents-api";
import { declareIncidentAction } from "./actions";

type Opt = { key: string; name: string };
const NONE = "__none__";

export function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY_STYLE[severityTone(severity)];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.border }}
    >
      {labelFor(SEVERITIES, severity)}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const resolved = status === "resolved";
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${
        resolved ? "border-teal-400/20 bg-teal-400/10 text-teal-300" : "border-white/10 bg-white/5 text-zinc-400"
      }`}
    >
      {labelFor(STATUSES, status)}
    </span>
  );
}

function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function IncidentsView({
  slug,
  incidents,
  canManage,
  teams,
  projects,
  policies,
  filterProject,
  autoDeclareService,
}: {
  slug: string;
  incidents: Incident[];
  canManage: boolean;
  teams: Opt[];
  projects: Opt[];
  policies: Opt[];
  filterProject?: string;
  autoDeclareService?: string;
}) {
  const [open, setOpen] = useState(Boolean(autoDeclareService));
  const openIncidents = incidents.filter((i) => i.status !== "resolved");
  const resolved = incidents.filter((i) => i.status === "resolved");
  const projectName = filterProject ? projects.find((p) => p.key === filterProject)?.name ?? filterProject : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Incidents</h1>
          {projectName ? (
            <p className="mt-1 text-sm text-zinc-500">
              Affecting <span className="text-zinc-300">{projectName}</span> ·{" "}
              <Link href={`/${slug}/incidents`} className="text-teal-400 hover:text-teal-300">all incidents</Link>
            </p>
          ) : (
            <p className="mt-1 text-sm text-zinc-500">
              Reliability events across your catalog, with responders and a timeline.
            </p>
          )}
        </div>
        {canManage ? (
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Siren className="size-4" /> Declare incident
          </Button>
        ) : null}
      </div>

      {incidents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-16 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-zinc-300">
            <Siren className="size-5" />
          </span>
          <p className="text-base font-medium text-zinc-100">No incidents</p>
          <p className="max-w-sm text-sm text-zinc-500">
            Declare one when something breaks. It routes to the owning team and pages
            the on-call responder.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Section title="Open" incidents={openIncidents} slug={slug} empty="Nothing on fire right now." />
          {resolved.length > 0 ? <Section title="Resolved" incidents={resolved} slug={slug} /> : null}
        </div>
      )}

      {open ? (
        <DeclareModal
          slug={slug}
          teams={teams}
          projects={projects}
          policies={policies}
          initialServices={autoDeclareService ? [autoDeclareService] : []}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function Section({ title, incidents, slug, empty }: { title: string; incidents: Incident[]; slug: string; empty?: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">{title}</p>
      {incidents.length === 0 ? (
        <p className="rounded-xl border border-white/8 bg-white/2 px-4 py-6 text-center text-sm text-zinc-500">{empty}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {incidents.map((i, idx) => (
            <Link
              key={i.number}
              href={`/${slug}/incidents/${i.number}`}
              className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/3 ${idx === 0 ? "" : "border-t border-white/8"}`}
            >
              <SeverityBadge severity={i.severity} />
              <span className="shrink-0 font-mono text-xs text-zinc-500">INC-{i.number}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{i.title}</span>
              <StatusPill status={i.status} />
              {i.ownerTeam ? (
                <span className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:inline-flex">
                  <Users className="size-3.5" /> {i.ownerTeam.name}
                </span>
              ) : null}
              <span className="shrink-0 text-xs text-zinc-600">{relativeTime(i.startedAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function withNone(opts: Opt[], label: string) {
  return [{ value: NONE, label }, ...opts.map((o) => ({ value: o.key, label: o.name }))];
}

export function DeclareModal({ slug, teams, projects, policies, initialServices, onClose }: { slug: string; teams: Opt[]; projects: Opt[]; policies: Opt[]; initialServices?: string[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("sev2");
  const [summary, setSummary] = useState("");
  const [ownerTeam, setOwnerTeam] = useState(NONE);
  const [policy, setPolicy] = useState(NONE);
  const [services, setServices] = useState<string[]>(initialServices ?? []);
  const [error, setError] = useState<string | null>(null);

  function toggleService(key: string) {
    setServices((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }
  function declare() {
    setError(null);
    if (!title.trim()) return setError("Give the incident a title.");
    start(async () => {
      const res = await declareIncidentAction(slug, {
        title: title.trim(),
        severity,
        summary: summary.trim() || undefined,
        affectedProjectKeys: services.length ? services : undefined,
        ownerTeamKey: ownerTeam === NONE ? undefined : ownerTeam,
        escalationPolicyKey: policy === NONE ? undefined : policy,
      });
      if (res.error) return setError(res.error);
      router.push(`/${slug}/incidents/${res.number}`);
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader title="Declare incident" description="Attach the affected services; the owner auto-fills from the first." onClose={onClose} />
      <ModalBody className="flex flex-col gap-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Checkout is failing" autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Severity">
            <Select ariaLabel="Severity" value={severity} onValueChange={setSeverity} className="w-full" options={SEVERITIES.map((s) => ({ value: s.value, label: s.label }))} />
          </Field>
          <Field label="Owning team" hint="Optional; else the first service's owner.">
            <Select ariaLabel="Owning team" value={ownerTeam} onValueChange={setOwnerTeam} className="w-full" options={withNone(teams, "Auto")} />
          </Field>
        </div>
        <Field label="Escalation policy" hint="Optional. Who to page as time passes.">
          <Select ariaLabel="Escalation policy" value={policy} onValueChange={setPolicy} className="w-full" options={withNone(policies, "None")} />
        </Field>
        <Field label="Affected services" hint="The catalog projects this impacts.">
          {projects.length === 0 ? (
            <p className="text-sm text-zinc-500">No projects yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {projects.map((p) => {
                const on = services.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleService(p.key)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-teal-400/30 bg-teal-400/10 text-teal-200" : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200"}`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
        </Field>
        <Field label="Summary" hint="Optional.">
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="What's happening." />
        </Field>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={declare} disabled={pending || !title.trim()}>
          {pending ? "Declaring…" : "Declare"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
