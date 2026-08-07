"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, BookText, Boxes, Check, CircleDot, ListChecks, Link2, Plus, Square, SquareCheckBig, X } from "lucide-react";
import { Button, Select, Textarea } from "@flagon/design";
import { STATUSES, labelFor, type SeverityLevel } from "@/lib/incidents";
import type { IncidentDetail as Detail } from "@/lib/incidents-api";
import { SeverityBadge, StatusPill } from "../incidents-view";
import {
  acknowledgeIncidentAction,
  addServiceAction,
  attachRunbookAction,
  postUpdateAction,
  removeServiceAction,
  resolveIncidentAction,
  toggleChecklistAction,
} from "../actions";
import { RccaSection } from "./rcca-section";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function IncidentDetail({
  slug,
  detail,
  levels,
  responderName,
  responderVia,
  orgMembers,
  projects,
  runbooks,
  policies,
  canManage,
}: {
  slug: string;
  detail: Detail;
  levels: SeverityLevel[];
  responderName: string | null;
  responderVia: string | null;
  orgMembers: { userId: string; name: string }[];
  projects: { key: string; name: string }[];
  runbooks: { key: string; name: string }[];
  policies: { key: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { incident, services, updates } = detail;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState(incident.status);
  const [pickService, setPickService] = useState("");
  const [pickRunbook, setPickRunbook] = useState("");
  const acked = Boolean(incident.acknowledgedAt);
  const resolved = incident.status === "resolved";
  const policyName = incident.escalationPolicyKey
    ? (policies.find((p) => p.key === incident.escalationPolicyKey)?.name ?? incident.escalationPolicyKey)
    : null;
  const attachedKeys = new Set(services.map((s) => s.key));
  const addableProjects = projects.filter((p) => !attachedKeys.has(p.key));

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }
  function postUpdate() {
    if (!body.trim()) return;
    run(async () => {
      const res = await postUpdateAction(slug, incident.number, { body: body.trim(), status: status !== incident.status ? status : undefined });
      if (!res.error) setBody("");
      return res;
    });
  }
  function addService() {
    if (!pickService) return;
    run(async () => {
      const res = await addServiceAction(slug, incident.number, pickService);
      if (!res.error) setPickService("");
      return res;
    });
  }
  function removeService(projectKey: string) {
    run(() => removeServiceAction(slug, incident.number, projectKey));
  }
  function attachRunbook() {
    if (!pickRunbook) return;
    run(async () => {
      const res = await attachRunbookAction(slug, incident.number, pickRunbook);
      if (!res.error) setPickRunbook("");
      return res;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <SeverityBadge severity={incident.severity} levels={levels} />
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs text-zinc-500">INC-{incident.number}</span>
              <StatusPill status={incident.status} />
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-100">{incident.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!acked ? (
            <Button variant="secondary" onClick={() => run(() => acknowledgeIncidentAction(slug, incident.number))} disabled={pending}>
              <Check className="size-4" /> Acknowledge
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-teal-400"><Check className="size-3.5" /> Acknowledged</span>
          )}
          {!resolved ? (
            <Button variant="primary" onClick={() => run(() => resolveIncidentAction(slug, incident.number))} disabled={pending}>
              Resolve
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Timeline + runbook checklist */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          {detail.checklist.length > 0 ? (
            <ChecklistCard slug={slug} number={incident.number} items={detail.checklist} onError={setError} />
          ) : null}
          {!resolved ? (
            <div className="rounded-xl border border-white/10 bg-white/2 p-4">
              <p className="mb-2 text-xs font-medium text-zinc-500">Post an update</p>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="What changed?" />
              <div className="mt-2 flex items-center justify-between gap-2">
                <Select ariaLabel="Status" value={status} onValueChange={setStatus} options={STATUSES} fullWidth={false} />
                <Button variant="secondary" onClick={postUpdate} disabled={pending || !body.trim()}>Post update</Button>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-white/2 p-4">
            <p className="mb-3 text-xs font-medium text-zinc-500">Timeline</p>
            {updates.length === 0 ? (
              <p className="text-sm text-zinc-500">No updates yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {updates.map((u) => (
                  <li key={u.id} className="flex gap-3">
                    <CircleDot className="mt-0.5 size-4 shrink-0 text-zinc-600" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        {u.status ? <StatusPill status={u.status} /> : null}
                        <span>{when(u.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-zinc-300">{u.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* RCCA (root cause & corrective actions) */}
          <RccaSection
            slug={slug}
            number={incident.number}
            fields={detail.rccaTemplate.fields}
            values={detail.rcca.values}
            actionItems={detail.actionItems}
            orgMembers={orgMembers}
            required={detail.rccaRequired}
          />
        </div>

        {/* Rail */}
        <aside className="flex flex-col gap-4">
          <Panel title="Responder">
            <p className="inline-flex items-center gap-2 text-sm text-zinc-200">
              <BellRing className="size-4 text-zinc-500" />
              {responderName ?? (detail.responderUserId ? "On-call assigned" : "Nobody assigned")}
            </p>
            {responderVia ? <p className="mt-0.5 pl-6 text-xs text-zinc-500">{responderVia}</p> : null}
          </Panel>
          <Panel title="Owner">
            {incident.ownerTeam ? (
              <Link href={`/${slug}/teams/${incident.ownerTeam.key}`} className="text-sm text-zinc-200 hover:text-zinc-100">{incident.ownerTeam.name}</Link>
            ) : (
              <p className="text-sm text-zinc-500">Unowned</p>
            )}
            {incident.escalationPolicyKey ? (
              <p className="mt-1 text-xs text-zinc-500">Escalation: {policyName}</p>
            ) : null}
            {incident.escalatedLevel > 0 ? (
              <span className="mt-1.5 inline-flex items-center rounded-md border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">
                Escalated to level {incident.escalatedLevel + 1}
              </span>
            ) : null}
          </Panel>
          <Panel title="Affected services">
            {services.length === 0 ? (
              <p className="text-sm text-zinc-500">None attached.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {services.map((s) => (
                  <li key={s.key} className="flex items-center justify-between gap-2">
                    <Link href={`/${slug}/projects/${s.key}`} className="inline-flex min-w-0 items-center gap-2 text-sm text-zinc-300 hover:text-zinc-100">
                      <Boxes className="size-3.5 shrink-0 text-zinc-500" /> <span className="truncate">{s.name}</span>
                    </Link>
                    {canManage ? (
                      <button type="button" onClick={() => removeService(s.key)} disabled={pending} className="shrink-0 text-zinc-500 hover:text-red-400 disabled:opacity-50" aria-label={`Remove ${s.name}`}>
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canManage && addableProjects.length > 0 ? (
              <div className="mt-3 flex items-center gap-2">
                <Select
                  ariaLabel="Add service"
                  value={pickService}
                  onValueChange={setPickService}
                  placeholder="Add a service…"
                  className="flex-1"
                  options={addableProjects.map((p) => ({ value: p.key, label: p.name }))}
                />
                <Button variant="secondary" size="sm" onClick={addService} disabled={pending || !pickService} aria-label="Add service">
                  <Plus className="size-4" />
                </Button>
              </div>
            ) : null}
          </Panel>
          {canManage && runbooks.length > 0 ? (
            <Panel title="Attach runbook">
              <p className="mb-2 text-xs text-zinc-500">Pull a runbook&apos;s steps onto this incident as a checklist.</p>
              <div className="flex items-center gap-2">
                <Select
                  ariaLabel="Runbook"
                  value={pickRunbook}
                  onValueChange={setPickRunbook}
                  placeholder="Choose a runbook…"
                  className="flex-1"
                  options={runbooks.map((r) => ({ value: r.key, label: r.name }))}
                />
                <Button variant="secondary" size="sm" onClick={attachRunbook} disabled={pending || !pickRunbook}>
                  <BookText className="size-4" /> Attach
                </Button>
              </div>
            </Panel>
          ) : null}
          <Panel title="Details">
            <dl className="flex flex-col gap-1.5 text-sm">
              <Row label="Status" value={labelFor(STATUSES, incident.status)} />
              <Row label="Declared" value={when(incident.startedAt)} />
              {incident.resolvedAt ? <Row label="Resolved" value={when(incident.resolvedAt)} /> : null}
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function ChecklistCard({
  slug,
  number,
  items,
  onError,
}: {
  slug: string;
  number: number;
  items: Detail["checklist"];
  onError: (e: string | null) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const done = items.filter((i) => i.done).length;
  const groups: { name: string | null; items: Detail["checklist"] }[] = [];
  for (const it of items) {
    let g = groups.find((x) => x.name === it.runbookName);
    if (!g) {
      g = { name: it.runbookName, items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  function toggle(id: string) {
    setBusy(id);
    onError(null);
    toggleChecklistAction(slug, number, id).then((res) => {
      setBusy(null);
      if (res.error) onError(res.error);
      else router.refresh();
    });
  }
  return (
    <div className="rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500"><ListChecks className="size-3.5" /> Runbook checklist</p>
        <span className="text-xs text-zinc-500 tabular-nums">{done}/{items.length} done</span>
      </div>
      <div className="flex flex-col gap-3">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.name ? <p className="mb-1 text-[11px] font-medium tracking-wide text-zinc-600 uppercase">{g.name}</p> : null}
            <ul className="flex flex-col gap-1.5">
              {g.items.map((it) => (
                <li key={it.id} className="flex items-start gap-2">
                  <button type="button" onClick={() => toggle(it.id)} disabled={busy === it.id} className="mt-0.5 shrink-0 text-zinc-500 hover:text-teal-400 disabled:opacity-50" aria-label={it.done ? "Mark not done" : "Mark done"}>
                    {it.done ? <SquareCheckBig className="size-4 text-teal-400" /> : <Square className="size-4" />}
                  </button>
                  <div className="min-w-0">
                    {it.kind === "link" && it.url ? (
                      <a href={it.url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 text-sm hover:text-teal-300 ${it.done ? "text-zinc-500 line-through" : "text-teal-400"}`}><Link2 className="size-3.5" /> {it.title}</a>
                    ) : (
                      <span className={`text-sm ${it.done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{it.title}</span>
                    )}
                    {it.body && it.kind !== "link" ? <p className="mt-0.5 text-xs whitespace-pre-wrap text-zinc-500">{it.body}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/2 p-4">
      <p className="mb-2 text-xs font-medium text-zinc-500">{title}</p>
      {children}
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-300">{value}</dd>
    </div>
  );
}
