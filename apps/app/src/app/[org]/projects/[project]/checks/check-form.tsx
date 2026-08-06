"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { Button, Field, Input, Select, Slider, Switch } from "@flagon/design";
import type { CheckAssertions, CheckTarget } from "@/lib/checks-api";
import { WipNotice } from "@/components/wip-notice";
import { createCheckAction } from "./actions";
import { intervalLabel } from "./checks-ui";

type Opt = { key: string; name: string };
type ChannelOpt = { key: string; name: string; type: string };

const TYPE_OPTIONS = [
  { value: "http", label: "HTTP — status / latency" },
  { value: "keyword", label: "Keyword — body contains text" },
  { value: "tls_expiry", label: "TLS expiry — certificate age" },
  { value: "tcp", label: "TCP — port open" },
  { value: "heartbeat", label: "Heartbeat — a job pings us" },
];
// The interval slider steps. Sub-minute (15s/30s) are shown but NOT yet selectable —
// the cron runner is 1-minute granularity, so anything under a minute is "coming soon"
// (needs the high-frequency probe worker). Dragging into that zone snaps back to 1m.
const INTERVAL_STEPS = [15, 30, 60, 300, 900, 1800, 3600, 21600, 43200, 86400];
const MIN_INTERVAL = 60;
const DEFAULT_INTERVAL_IDX = 3; // 300s / 5m
const SEVERITY_OPTIONS = [
  { value: "sev1", label: "SEV1 — critical" },
  { value: "sev2", label: "SEV2 — major" },
  { value: "sev3", label: "SEV3 — minor" },
  { value: "sev4", label: "SEV4 — low" },
];
const FAILURE_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
const MODES = [
  { value: "incident" as const, label: "Declare an incident", desc: "Pages the owning team's on-call (or your policy) through their notification channels, posts to your channels, runs the timeline, and auto-resolves on recovery." },
  { value: "notify" as const, label: "Notify", desc: "Post the state change to channels (Slack, webhook, email). No incident, no paging." },
  { value: "track" as const, label: "Track only", desc: "Record status on the dashboard. No alerts." },
];
const METHOD_OPTIONS = ["GET", "HEAD", "POST", "PUT"].map((m) => ({ value: m, label: m }));
const TIMEOUT_OPTIONS = [
  { value: "5000", label: "5 seconds" },
  { value: "10000", label: "10 seconds" },
  { value: "30000", label: "30 seconds" },
  { value: "60000", label: "60 seconds" },
];

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 p-5">
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      {description ? <p className="mt-0.5 text-xs text-zinc-500">{description}</p> : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/**
 * The create-check form as a FULL PAGE (roomy, sectioned) — used by both a project's
 * Checks tab (fixed project) and the org-level Reliability board (project picker). A
 * page beats a modal here: the config runs deep (target, interval, advanced, alerting).
 */
export function CheckForm({
  slug,
  projectKey,
  projects,
  channels,
  policies,
  runbooks,
  backHref,
}: {
  slug: string;
  projectKey?: string;
  projects?: Opt[];
  channels: ChannelOpt[];
  policies: Opt[];
  runbooks: Opt[];
  backHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selectedProject, setSelectedProject] = useState(projectKey ?? "");
  const [name, setName] = useState("");
  const [type, setType] = useState("http");
  const [url, setUrl] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [keyword, setKeyword] = useState("");
  const [intervalIdx, setIntervalIdx] = useState(DEFAULT_INTERVAL_IDX);
  const [subMinuteNote, setSubMinuteNote] = useState(false);
  const [failureThreshold, setFailureThreshold] = useState("3");
  const [notifyChannels, setNotifyChannels] = useState<string[]>([]);
  // The single response mode. Default "incident" so a fresh check meaningfully pages the
  // owning team's on-call out of the box (downgrade to notify/track for lighter).
  const [mode, setMode] = useState<"track" | "notify" | "incident">("incident");
  const [severity, setSeverity] = useState("sev3");
  const [policyKey, setPolicyKey] = useState("");
  const [runbookKey, setRunbookKey] = useState("");
  const [method, setMethod] = useState("GET");
  const [followRedirects, setFollowRedirects] = useState(true);
  const [timeoutMs, setTimeoutMs] = useState("10000");
  const [statusMin, setStatusMin] = useState("200");
  const [statusMax, setStatusMax] = useState("399");
  const [maxLatency, setMaxLatency] = useState("");
  const [keywordAbsent, setKeywordAbsent] = useState(false);
  const [tlsMinDays, setTlsMinDays] = useState("14");
  const [heartbeatGrace, setHeartbeatGrace] = useState("60");

  const key = useMemo(() => slugify(name), [name]);
  const needsUrl = type === "http" || type === "keyword" || type === "tls_expiry";
  const needsHostPort = type === "tcp";
  const isHeartbeat = type === "heartbeat";
  const intervalSeconds = INTERVAL_STEPS[intervalIdx];

  function onInterval(idx: number) {
    // Clamp sub-minute back to 1 minute (coming soon) and surface a note.
    if (INTERVAL_STEPS[idx] < MIN_INTERVAL) {
      setIntervalIdx(INTERVAL_STEPS.indexOf(MIN_INTERVAL));
      setSubMinuteNote(true);
    } else {
      setIntervalIdx(idx);
      setSubMinuteNote(false);
    }
  }

  function toggleChannel(k: string) {
    setNotifyChannels((prev) => (prev.includes(k) ? prev.filter((c) => c !== k) : [...prev, k]));
  }

  function submit() {
    setError(null);
    const targetProject = projectKey ?? selectedProject;
    if (!targetProject) return setError("Choose the project this check monitors.");
    if (!name.trim()) return setError("Give the check a name.");
    if (needsUrl && !url.trim()) return setError("Enter a URL to monitor.");
    if (needsHostPort && (!host.trim() || !port.trim())) return setError("Enter a host and port.");
    if ((type === "http" || type === "keyword") && Number(statusMin) > Number(statusMax)) {
      return setError("Acceptable status range is backwards (from must be <= to).");
    }

    const target: CheckTarget = {};
    const assertions: CheckAssertions = {};
    if (type === "http" || type === "keyword") {
      target.url = url.trim();
      target.method = method;
      target.followRedirects = followRedirects;
      assertions.expectedStatusMin = Number(statusMin);
      assertions.expectedStatusMax = Number(statusMax);
      if (maxLatency.trim()) assertions.maxLatencyMs = Number(maxLatency);
      if (type === "keyword" && keyword.trim()) {
        assertions.keyword = keyword.trim();
        assertions.keywordAbsent = keywordAbsent;
      }
    } else if (type === "tcp") {
      target.host = host.trim();
      target.port = Number(port);
    } else if (type === "tls_expiry") {
      target.url = url.trim();
      assertions.tlsMinDaysRemaining = Number(tlsMinDays);
    } else if (type === "heartbeat") {
      assertions.heartbeatGraceSeconds = Number(heartbeatGrace);
    }
    const action: Record<string, unknown> = { mode };
    if ((mode === "notify" || mode === "incident") && notifyChannels.length > 0) action.channelKeys = notifyChannels;
    if (mode === "incident") action.incident = { severity, ...(policyKey ? { escalationPolicyKey: policyKey } : {}), ...(runbookKey ? { runbookKey } : {}), autoResolve: true };

    startTransition(async () => {
      const res = await createCheckAction(slug, targetProject, {
        key,
        name: name.trim(),
        type,
        target,
        assertions,
        intervalSeconds,
        timeoutMs: Number(timeoutMs),
        failureThreshold: Number(failureThreshold),
        action,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.key) router.push(`/${slug}/projects/${targetProject}/checks/${res.key}`);
      else router.push(backHref);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-24">
      <WipNotice feature="Checks" />
      <div>
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="size-4" /> Checks
        </Link>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-zinc-100">Add a check</h1>
        <p className="mt-1 text-sm text-zinc-500">Probe an endpoint on a schedule and alert when it fails.</p>
      </div>

      {error ? <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p> : null}

      <Section title="Monitor" description="What to watch and how.">
        {projects ? (
          <Field label="Project" hint="The service this check monitors.">
            <Select value={selectedProject} onValueChange={setSelectedProject} placeholder="Select a project" options={projects.map((p) => ({ value: p.key, label: p.name }))} />
          </Field>
        ) : null}
        <Field label="Name" hint={key ? `Key: ${key}` : "A friendly name for the monitor."}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Homepage" autoFocus />
        </Field>
        <Field label="Type">
          <Select value={type} onValueChange={setType} options={TYPE_OPTIONS} />
        </Field>
        {needsUrl ? (
          <Field label="URL" hint={type === "tls_expiry" ? "The https URL whose certificate to watch." : undefined}>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourapp.com/" />
          </Field>
        ) : null}
        {needsHostPort ? (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Host" className="col-span-2">
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="db.internal" />
            </Field>
            <Field label="Port">
              <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="5432" inputMode="numeric" />
            </Field>
          </div>
        ) : null}
        {type === "keyword" ? (
          <Field label="Keyword" hint="Fail if the response body does not contain this text.">
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Welcome" />
          </Field>
        ) : null}
        {isHeartbeat ? (
          <p className="rounded-md bg-white/5 px-3 py-2 text-xs text-zinc-400">
            You&apos;ll get a unique ping URL after creating. Have your job POST to it every interval; the check fails if a ping is late.
          </p>
        ) : null}
      </Section>

      <Section title="Interval" description={`This check runs ${isHeartbeat ? "an expected ping" : "a probe"} every ${intervalLabel(intervalSeconds)}.`}>
        <Slider
          value={intervalIdx}
          onValueChange={onInterval}
          min={0}
          max={INTERVAL_STEPS.length - 1}
          step={1}
          ariaLabel="Check interval"
          marks={INTERVAL_STEPS.map((s, i) => ({
            value: i,
            label: (
              <span
                title={s < MIN_INTERVAL ? "Coming soon" : undefined}
                className={s < MIN_INTERVAL ? "inline-flex items-center gap-0.5 text-zinc-700" : i === intervalIdx ? "font-medium text-emerald-400" : "text-zinc-500"}
              >
                {s < MIN_INTERVAL ? <Lock className="size-2.5" /> : null}
                {intervalLabel(s)}
              </span>
            ),
          }))}
        />
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Lock className="size-3 shrink-0 text-zinc-600" />
          <span>
            {subMinuteNote ? <span className="text-amber-400/80">Sub-minute intervals are coming soon. </span> : null}
            15s and 30s checks are coming soon.
          </span>
        </p>
      </Section>

      {!isHeartbeat ? (
        <Section title="Advanced" description="Fine-tune how the probe runs.">
          {type === "http" || type === "keyword" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="HTTP method">
                  <Select value={method} onValueChange={setMethod} options={METHOD_OPTIONS} />
                </Field>
                <Field label="Request timeout">
                  <Select value={timeoutMs} onValueChange={setTimeoutMs} options={TIMEOUT_OPTIONS} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="OK status from">
                  <Input value={statusMin} onChange={(e) => setStatusMin(e.target.value)} inputMode="numeric" />
                </Field>
                <Field label="OK status to">
                  <Input value={statusMax} onChange={(e) => setStatusMax(e.target.value)} inputMode="numeric" />
                </Field>
              </div>
              <Field label="Slow-response alert (ms)" hint="Optional. Fail if the response is slower than this.">
                <Input value={maxLatency} onChange={(e) => setMaxLatency(e.target.value)} inputMode="numeric" placeholder="e.g. 2000" />
              </Field>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">Follow redirects</span>
                <Switch checked={followRedirects} onCheckedChange={setFollowRedirects} ariaLabel="Follow redirects" />
              </div>
              {type === "keyword" ? (
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={keywordAbsent} onChange={(e) => setKeywordAbsent(e.target.checked)} className="accent-emerald-500" />
                  Invert: fail if the keyword IS present
                </label>
              ) : null}
            </>
          ) : null}
          {type === "tcp" ? (
            <Field label="Request timeout">
              <Select value={timeoutMs} onValueChange={setTimeoutMs} options={TIMEOUT_OPTIONS} />
            </Field>
          ) : null}
          {type === "tls_expiry" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Warn under N days">
                <Input value={tlsMinDays} onChange={(e) => setTlsMinDays(e.target.value)} inputMode="numeric" />
              </Field>
              <Field label="Request timeout">
                <Select value={timeoutMs} onValueChange={setTimeoutMs} options={TIMEOUT_OPTIONS} />
              </Field>
            </div>
          ) : null}
        </Section>
      ) : (
        <Section title="Advanced">
          <Field label="Grace (seconds late tolerated)" hint="Extra time past the interval before a missed ping fails the check.">
            <Input value={heartbeatGrace} onChange={(e) => setHeartbeatGrace(e.target.value)} inputMode="numeric" />
          </Field>
        </Section>
      )}

      <Section title="Alerting" description="Confirm a real failure, then respond one way.">
        <div className="rounded-lg bg-white/3 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
            <span>Confirm a failure after</span>
            <Select fullWidth={false} value={failureThreshold} onValueChange={setFailureThreshold} options={FAILURE_OPTIONS} ariaLabel="Failures before alerting" />
            <span>failed {failureThreshold === "1" ? "check" : "checks"} in a row</span>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Confirmed in about <span className="text-zinc-300">{intervalLabel(Number(failureThreshold) * intervalSeconds)}</span>{" "}
            ({failureThreshold} × {intervalLabel(intervalSeconds)}).{" "}
            {failureThreshold === "1" ? "A single failed probe confirms immediately." : "Lower the threshold, or use a shorter interval when sub-minute lands, to react faster."}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">When confirmed</p>
          <div className="mt-2 flex flex-col gap-2">
            {MODES.map((m) => (
              <button
                type="button"
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`rounded-lg border p-3 text-left transition-colors ${mode === m.value ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10 hover:bg-white/3"}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`grid size-4 shrink-0 place-items-center rounded-full border ${mode === m.value ? "border-emerald-400" : "border-white/25"}`}>
                    {mode === m.value ? <span className="size-2 rounded-full bg-emerald-400" /> : null}
                  </span>
                  <span className="text-sm font-medium text-zinc-100">{m.label}</span>
                </div>
                <p className="mt-1 pl-6 text-xs text-zinc-500">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {mode !== "track" ? (
          channels.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-zinc-300">{mode === "incident" ? "Also post incident events to" : "Post to channels"}</span>
              {channels.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm text-zinc-400">
                  <input type="checkbox" checked={notifyChannels.includes(c.key)} onChange={() => toggleChannel(c.key)} className="accent-emerald-500" />
                  {c.name} <span className="text-xs text-zinc-500">({c.type})</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">No alert channels yet. Add one in Settings → Alert channels to post to Slack, a webhook, or email.</p>
          )
        ) : null}

        {mode === "incident" ? (
          <div className="flex flex-col gap-3 rounded-lg border border-white/8 p-3">
            <p className="text-xs text-zinc-500">Pages the owning team&apos;s on-call (or the policy below) through each responder&apos;s notification channels.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Severity">
                <Select value={severity} onValueChange={setSeverity} options={SEVERITY_OPTIONS} />
              </Field>
              <Field label="Escalation policy">
                <Select value={policyKey} onValueChange={setPolicyKey} placeholder="Owner team on-call" options={[{ value: "", label: "Owner team on-call" }, ...policies.map((p) => ({ value: p.key, label: p.name }))]} />
              </Field>
            </div>
            <Field label="Run a runbook" hint={runbooks.length ? "Its steps become the incident checklist. Matching runbooks also auto-attach." : "No runbooks yet. Create one under Incidents → Runbooks."}>
              <Select
                value={runbookKey}
                onValueChange={setRunbookKey}
                placeholder={runbooks.length ? "Auto-attach matching" : "No runbooks yet"}
                disabled={runbooks.length === 0}
                options={[{ value: "", label: "Auto-attach matching" }, ...runbooks.map((r) => ({ value: r.key, label: r.name }))]}
              />
            </Field>
          </div>
        ) : null}
      </Section>

      <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-2 border-t border-white/10 bg-zinc-950/90 px-1 py-3 backdrop-blur">
        <Button variant="secondary" onClick={() => router.push(backHref)} disabled={pending}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={pending}>{pending ? "Creating…" : "Create check"}</Button>
      </div>
    </div>
  );
}
