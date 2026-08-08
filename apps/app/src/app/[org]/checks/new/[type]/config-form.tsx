"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check as CheckIcon, Plus, X } from "lucide-react";
import {
  Button,
  Field,
  Input,
  SegmentedControl,
  Select,
  Slider,
  Switch,
  Textarea,
  type SelectOption,
  type SliderStep,
} from "@flagon/design";
import type { Assertion, Check, MonitorType } from "@/lib/checks-api";
import { createCheckAction, updateCheckAction } from "../../actions";

/**
 * The Checkly-style check config form, per monitor type. Supported fields are live; the
 * capabilities we haven't built (extra locations, retries, scheduling strategy, incident
 * automation) show as "Soon". HTTP checks get a real ASSERTION BUILDER (source / property
 * / comparison / target), and alerting SELECTS existing alert channels rather than raw
 * addresses. Only the supported subset is persisted.
 */

type ChannelRef = { id: string; name: string; type: string };

const METHODS: SelectOption[] = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }));
const RECORD_TYPES: SelectOption[] = ["A", "AAAA", "CNAME", "MX", "NS", "TXT"].map((r) => ({ value: r, label: r }));

const ALL_SOURCES: SelectOption[] = [
  { value: "status", label: "Status code" },
  { value: "responseTime", label: "Response time (ms)" },
  { value: "body", label: "Response body" },
  { value: "jsonBody", label: "JSON body" },
  { value: "header", label: "Header" },
];
const URL_SOURCES: SelectOption[] = ALL_SOURCES.filter((s) => s.value === "status" || s.value === "responseTime");
const COMPARISONS: SelectOption[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "not contains" },
  { value: "is_empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
];
const NO_TARGET = new Set(["is_empty", "not_empty"]);
const NEEDS_PROPERTY = new Set(["header", "jsonBody"]);

// The Checkly frequency ladder. Sub-minute rungs are disabled and badged "Soon" — for us
// they're gated by our runner tech (the 1-minute cron floor), not a plan.
const FREQUENCY_STEPS: SliderStep[] = [
  { value: "10", label: "10s", badge: "Soon", disabled: true },
  { value: "20", label: "20s", badge: "Soon", disabled: true },
  { value: "30", label: "30s", badge: "Soon", disabled: true },
  { value: "60", label: "1 min" },
  { value: "120", label: "2 min" },
  { value: "300", label: "5 min" },
  { value: "600", label: "10 min" },
  { value: "900", label: "15 min" },
  { value: "1800", label: "30 min" },
  { value: "3600", label: "1 h" },
  { value: "7200", label: "2 h" },
  { value: "10800", label: "3 h" },
  { value: "21600", label: "6 h" },
  { value: "43200", label: "12 h" },
  { value: "86400", label: "24 h" },
];

const RETRY_STRATEGIES = ["None", "Single", "Fixed", "Linear", "Exponential"];

const FAILED_RUN_OPTS: SelectOption[] = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
const FAILING_MIN_OPTS: SelectOption[] = [5, 10, 15, 30].map((n) => ({ value: String(n), label: `${n} minutes` }));
const REMINDER_OPTS: SelectOption[] = [
  { value: "0", label: "No reminders" },
  ...[5, 10, 15, 30].map((n) => ({ value: String(n), label: `every ${n} min` })),
];
const TRIGGER_OPTS = [
  { value: "run_count", label: "After N failures" },
  { value: "time_based", label: "After N minutes" },
];

// Generic global-edge locations (not tied to any cloud's region codes). Today checks run
// from the nearest edge automatically; pinning to a specific region is on the way.
const LOCATIONS: { name: string; current?: boolean }[] = [
  { name: "Global edge (automatic)", current: true },
  { name: "North America" },
  { name: "Europe" },
  { name: "Asia Pacific" },
  { name: "South America" },
  { name: "Oceania" },
];

function SoonTag() {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
      Soon
    </span>
  );
}

function Section({ title, children, soon, description }: { title: string; children: ReactNode; soon?: boolean; description?: string }) {
  return (
    <section className={`rounded-xl border border-white/10 bg-white/2 p-5 ${soon ? "opacity-70" : ""}`}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        {soon ? <SoonTag /> : null}
      </div>
      {description ? <p className="-mt-1 mb-3 text-xs text-zinc-500">{description}</p> : null}
      {children}
    </section>
  );
}

function DisabledRadioRow({ options, selected }: { options: string[]; selected: string }) {
  return (
    <div className="flex flex-wrap gap-4">
      {options.map((o) => (
        <span key={o} className="flex items-center gap-1.5 text-sm text-zinc-500">
          <span className={`grid size-4 place-items-center rounded-full border ${o === selected ? "border-teal-400" : "border-white/15"}`}>
            {o === selected ? <span className="size-2 rounded-full bg-teal-400" /> : null}
          </span>
          {o}
        </span>
      ))}
    </div>
  );
}

let rid = 0;
type AssertionRow = Assertion & { _id: number };
const newRow = (a: Assertion): AssertionRow => ({ ...a, _id: rid++ });

export function ConfigForm({
  slug,
  monitor,
  channels,
  projects,
  defaultProjectKey,
  mode = "create",
  initial,
}: {
  slug: string;
  monitor: MonitorType;
  channels: ChannelRef[];
  projects: { id: string; key: string; name: string }[];
  /** Pre-select (and hint) a project when creating a check from a project's Checks tab. */
  defaultProjectKey?: string;
  mode?: "create" | "edit";
  initial?: Check;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const t = monitor.key;
  const isUrl = t === "url";
  const isApi = t === "api";
  const isTcp = t === "tcp";
  const isDns = t === "dns";
  const isSsl = t === "ssl";
  const isHttp = isUrl || isApi;

  // Prefill from an existing check when editing.
  const cfg = (initial?.config ?? {}) as Record<string, unknown>;
  const cs = (k: string, d = "") => (typeof cfg[k] === "string" ? (cfg[k] as string) : d);
  const cn = (k: string, d: string) => (cfg[k] != null ? String(cfg[k]) : d);

  const [name, setName] = useState(initial?.name ?? "");
  const [activated, setActivated] = useState(initial?.activated ?? true);
  const [muted, setMuted] = useState(initial?.muted ?? false);

  const [frequency, setFrequency] = useState(initial ? String(initial.frequencySeconds) : "300");
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set(initial?.alertChannelIds ?? []));
  const [alertOnDegraded, setAlertOnDegraded] = useState(initial?.alertOnDegraded ?? false);

  // Optional Project this check relates to (shows up on the project's Checks tab).
  const [linkedProjectKey, setLinkedProjectKey] = useState(
    () => projects.find((p) => p.id === initial?.linkedProjectId)?.key ?? defaultProjectKey ?? "",
  );

  // Alert trigger (run-based vs time-based threshold + reminder cadence).
  const it = (initial?.alertTrigger ?? {}) as Record<string, unknown>;
  const [triggerType, setTriggerType] = useState(it.type === "time_based" ? "time_based" : "run_count");
  const [failedRuns, setFailedRuns] = useState(it.runs != null ? String(it.runs) : "1");
  const [failingMinutes, setFailingMinutes] = useState(it.minutes != null ? String(it.minutes) : "5");
  const [reminderMinutes, setReminderMinutes] = useState(it.reminderMinutes != null ? String(it.reminderMinutes) : "0");

  function buildTrigger(): Record<string, unknown> {
    const base =
      triggerType === "run_count"
        ? { type: "run_count", runs: Number(failedRuns) }
        : { type: "time_based", minutes: Number(failingMinutes) };
    const rm = Number(reminderMinutes);
    return rm > 0 ? { ...base, reminderMinutes: rm } : base;
  }

  // HTTP (url + api)
  const [url, setUrl] = useState(cs("url"));
  const [method, setMethod] = useState(cs("method", "GET"));
  const [followRedirects, setFollowRedirects] = useState(cfg.followRedirects !== false);
  const [body, setBody] = useState(cs("body"));
  const [assertions, setAssertions] = useState<AssertionRow[]>(() => {
    const a = Array.isArray(cfg.assertions) ? (cfg.assertions as Assertion[]) : null;
    return a && a.length ? a.map(newRow) : [newRow({ source: "status", comparison: "less_than", target: "400" })];
  });

  // TCP + SSL
  const [host, setHost] = useState(cs("host"));
  const [port, setPort] = useState(cn("port", isSsl ? "443" : ""));
  const [expiryDays, setExpiryDays] = useState(cn("expiryThresholdDays", "14"));

  // DNS
  const [hostname, setHostname] = useState(cs("hostname"));
  const [recordType, setRecordType] = useState(cs("recordType", "A"));
  const [dnsExpected, setDnsExpected] = useState(cs("expected"));

  const [degradedMs, setDegradedMs] = useState(cn("degradedThresholdMs", "3000"));
  const [failedMs, setFailedMs] = useState(cn("timeoutMs", isSsl ? "5000" : "5000"));

  const latencyDegraded = monitor.supportsDegraded && !isSsl;

  function timing(cfg: Record<string, unknown>): Record<string, unknown> {
    if (latencyDegraded && degradedMs.trim()) cfg.degradedThresholdMs = Number(degradedMs);
    if (failedMs.trim()) cfg.timeoutMs = Number(failedMs);
    return cfg;
  }

  function cleanAssertions(): Assertion[] {
    return assertions.map((a) => {
      const out: Assertion = { source: a.source, comparison: a.comparison };
      if (NEEDS_PROPERTY.has(a.source) && a.property?.trim()) out.property = a.property.trim();
      if (!NO_TARGET.has(a.comparison)) out.target = a.target ?? "";
      return out;
    });
  }

  function buildConfig(): Record<string, unknown> {
    if (isHttp) {
      const cfg: Record<string, unknown> = { url, method, followRedirects, assertions: cleanAssertions() };
      if (isApi && body.trim() && method !== "GET" && method !== "HEAD") cfg.body = body;
      return timing(cfg);
    }
    if (isTcp) return timing({ host, port: Number(port) });
    if (isDns) {
      const cfg: Record<string, unknown> = { hostname, recordType };
      if (dnsExpected.trim()) cfg.expected = dnsExpected;
      return timing(cfg);
    }
    if (isSsl) {
      const cfg: Record<string, unknown> = { host, port: Number(port || 443), expiryThresholdDays: Number(expiryDays) };
      if (failedMs.trim()) cfg.timeoutMs = Number(failedMs);
      return cfg;
    }
    return {};
  }

  const missingPrimary =
    (isHttp && !url) || (isTcp && (!host || !port)) || (isDns && !hostname) || (isSsl && !host);
  const disabled = pending || !name || missingPrimary;

  // The Project relation (optional). Sent on both create and edit.
  const projectPayload = { linkedProjectKey: linkedProjectKey || null };

  function submit() {
    setError(null);
    start(async () => {
      if (mode === "edit" && initial) {
        const res = await updateCheckAction(slug, initial.key, {
          name,
          config: buildConfig(),
          frequencySeconds: Number(frequency),
          activated,
          muted,
          alertChannelIds: [...selectedChannels],
          alertTrigger: buildTrigger(),
          alertOnDegraded: monitor.supportsDegraded ? alertOnDegraded : undefined,
          ...projectPayload,
        });
        if (res.error) {
          setError(res.error);
          return;
        }
        router.push(`/${slug}/checks/${initial.key}`);
        router.refresh();
        return;
      }
      const res = await createCheckAction(slug, {
        name,
        type: monitor.key,
        config: buildConfig(),
        frequencySeconds: Number(frequency),
        activated,
        muted,
        alertChannelIds: [...selectedChannels],
        alertTrigger: buildTrigger(),
        alertOnDegraded: monitor.supportsDegraded ? alertOnDegraded : undefined,
        ...projectPayload,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push(`/${slug}/checks/${res.key}`);
      router.refresh();
    });
  }

  const sources = isApi ? ALL_SOURCES : URL_SOURCES;
  const setRow = (id: number, patch: Partial<Assertion>) =>
    setAssertions((rows) => rows.map((r) => (r._id === id ? { ...r, ...patch } : r)));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {/* Identity */}
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${monitor.label} #1`} />
      </Field>

      <Field label="Project" hint="Relate this check to a project; it shows on that project's Checks tab.">
        <Select
          value={linkedProjectKey}
          onValueChange={setLinkedProjectKey}
          placeholder="No project"
          options={[{ value: "", label: "No project" }, ...projects.map((p) => ({ value: p.key, label: p.name }))]}
          disabled={projects.length === 0}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <Switch checked={activated} onCheckedChange={setActivated} ariaLabel="Activated" /> Activated
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <Switch checked={muted} onCheckedChange={setMuted} ariaLabel="Muted" /> Muted
        </label>
      </div>

      {/* Primary config, per type */}
      {isHttp ? (
        <Section title={isApi ? "API request" : "Monitor a URL"} description={monitor.summary}>
          <Field label="URL">
            <div className="flex">
              <Select
                value={method}
                onValueChange={setMethod}
                options={METHODS}
                fullWidth={false}
                className="w-28 shrink-0 rounded-r-none"
              />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="-ml-px flex-1 rounded-l-none"
              />
            </div>
          </Field>
          {isApi && method !== "GET" && method !== "HEAD" ? (
            <div className="mt-4">
              <Field label="Request body" hint="Sent as-is.">
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="font-mono text-xs" />
              </Field>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <Switch checked={followRedirects} onCheckedChange={setFollowRedirects} ariaLabel="Follow redirects" />
              Follow redirects
            </label>
            <span className="flex items-center gap-2 text-sm text-zinc-500">
              <Switch checked={false} onCheckedChange={() => {}} ariaLabel="Skip SSL" /> Skip SSL <SoonTag />
            </span>
          </div>
        </Section>
      ) : null}

      {isTcp ? (
        <Section title="TCP endpoint" description={monitor.summary}>
          <div className="grid grid-cols-[1fr_10rem] gap-4">
            <Field label="Host">
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="db.example.com" />
            </Field>
            <Field label="Port">
              <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="5432" inputMode="numeric" />
            </Field>
          </div>
        </Section>
      ) : null}

      {isDns ? (
        <Section title="DNS query" description={monitor.summary}>
          <div className="grid grid-cols-[1fr_10rem] gap-4">
            <Field label="Hostname">
              <Input value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="example.com" />
            </Field>
            <Field label="Record type">
              <Select value={recordType} onValueChange={setRecordType} options={RECORD_TYPES} />
            </Field>
          </div>
          <Field label="Expected answer" hint="Optional. The resolved answer must contain this (an IP, hostname, …).">
            <Input value={dnsExpected} onChange={(e) => setDnsExpected(e.target.value)} placeholder="93.184.216.34" />
          </Field>
        </Section>
      ) : null}

      {isSsl ? (
        <Section title="TLS certificate" description={monitor.summary}>
          <div className="grid grid-cols-[1fr_10rem] gap-4">
            <Field label="Host">
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="example.com" />
            </Field>
            <Field label="Port">
              <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="443" inputMode="numeric" />
            </Field>
          </div>
          <Field label="Warn before expiry" hint="Days. The check degrades when the cert expires within this window.">
            <Input value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} inputMode="numeric" />
          </Field>
        </Section>
      ) : null}

      {/* Assertions builder (HTTP only) */}
      {isHttp ? (
        <Section title="Assertions" description="Validate the response. When one or more assertions fail, the check fails.">
          <div className="flex flex-col gap-2">
            {assertions.map((a) => {
              const needsProp = NEEDS_PROPERTY.has(a.source);
              const needsTarget = !NO_TARGET.has(a.comparison);
              return (
                <div key={a._id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className={`grid gap-2 ${needsProp ? "grid-cols-[1fr_1fr_1fr_1fr]" : "grid-cols-[1fr_1fr_1.4fr]"}`}>
                    <Select value={a.source} onValueChange={(v) => setRow(a._id, { source: v as Assertion["source"] })} options={sources} />
                    {needsProp ? (
                      <Input
                        value={a.property ?? ""}
                        onChange={(e) => setRow(a._id, { property: e.target.value })}
                        placeholder={a.source === "header" ? "Header name" : "data.id"}
                      />
                    ) : null}
                    <Select
                      value={a.comparison}
                      onValueChange={(v) => setRow(a._id, { comparison: v as Assertion["comparison"] })}
                      options={COMPARISONS}
                    />
                    {needsTarget ? (
                      <Input value={a.target ?? ""} onChange={(e) => setRow(a._id, { target: e.target.value })} placeholder="Target" />
                    ) : (
                      <div />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAssertions((rows) => (rows.length > 1 ? rows.filter((r) => r._id !== a._id) : rows))}
                    disabled={assertions.length <= 1}
                    className="mt-1 grid size-9 place-items-center rounded-md border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 disabled:opacity-40"
                    aria-label="Remove assertion"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAssertions((rows) => [...rows, newRow({ source: "status", comparison: "equals", target: "200" })])}
            >
              <Plus className="size-3.5" /> Add assertion
            </Button>
          </div>
        </Section>
      ) : null}

      {/* Response time limits */}
      {!isSsl ? (
        <Section title="Response time limits">
          <div className="grid grid-cols-2 gap-4">
            {latencyDegraded ? (
              <Field label="Degraded after" hint="Milliseconds">
                <Input value={degradedMs} onChange={(e) => setDegradedMs(e.target.value)} inputMode="numeric" />
              </Field>
            ) : null}
            <Field label="Failed after" hint="Milliseconds. Hard-capped at 30s.">
              <Input value={failedMs} onChange={(e) => setFailedMs(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
        </Section>
      ) : null}

      {/* Frequency — the slider */}
      <Section title="Frequency" description="How often we run this check. Sub-minute frequencies arrive with our own runners.">
        <Slider steps={FREQUENCY_STEPS} value={frequency} onValueChange={setFrequency} ariaLabel="Check frequency" />
      </Section>

      {/* Scheduling strategy (soon) */}
      <Section title="Scheduling strategy" soon description="Round-robin and parallel runs across multiple locations arrive with our own runners.">
        <DisabledRadioRow options={["Round-robin", "Parallel runs"]} selected="Round-robin" />
      </Section>

      {/* Locations */}
      <Section title="Locations" description="Where we run this check from. Today checks run from the nearest edge automatically; pinning to a specific region and private locations (a Flagon agent in your own network) are on the way.">
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {LOCATIONS.map((r) => (
            <div
              key={r.name}
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${
                r.current ? "border-teal-400/30 bg-teal-400/5" : "border-white/8 bg-white/1 opacity-70"
              }`}
            >
              <div className={`truncate text-xs font-medium ${r.current ? "text-zinc-100" : "text-zinc-400"}`}>{r.name}</div>
              {r.current ? (
                <span className="shrink-0 rounded-full border border-teal-400/20 bg-teal-400/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-teal-300 uppercase">
                  Current
                </span>
              ) : (
                <SoonTag />
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Retries (soon) */}
      <Section title="Retries" soon description="Retry a failed run before alerting (single, fixed, linear, exponential backoff).">
        <DisabledRadioRow options={RETRY_STRATEGIES} selected="None" />
      </Section>

      {/* Alert settings — escalation + reminders */}
      <Section title="Alert settings" description="When to alert, and whether to keep reminding while a check stays down.">
        <div className="flex flex-col gap-3">
          <div className="max-w-xs">
            <SegmentedControl value={triggerType} onValueChange={setTriggerType} options={TRIGGER_OPTS} />
          </div>
          {triggerType === "run_count" ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
              Alert after
              <div className="w-20">
                <Select value={failedRuns} onValueChange={setFailedRuns} options={FAILED_RUN_OPTS} />
              </div>
              consecutive failed run(s).
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
              Alert after failing for
              <div className="w-36">
                <Select value={failingMinutes} onValueChange={setFailingMinutes} options={FAILING_MIN_OPTS} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
            Reminders:
            <div className="w-40">
              <Select value={reminderMinutes} onValueChange={setReminderMinutes} options={REMINDER_OPTS} />
            </div>
            while it stays down.
          </div>
        </div>
      </Section>

      {/* Alerting — SELECT channels */}
      <Section title="Where should we alert you?" description="Select the alert channels to notify when this check fails or recovers.">
        {channels.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/12 bg-white/2 px-4 py-6 text-center text-sm text-zinc-500">
            No alert channels yet.{" "}
            <Link href={`/${slug}/checks/alert-channels`} className="text-teal-400 hover:text-teal-300">
              Create one under Alert channels
            </Link>{" "}
            to be notified.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {channels.map((ch) => {
              const on = selectedChannels.has(ch.id);
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() =>
                    setSelectedChannels((prev) => {
                      const next = new Set(prev);
                      if (next.has(ch.id)) next.delete(ch.id);
                      else next.add(ch.id);
                      return next;
                    })
                  }
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                    on ? "border-teal-400/30 bg-teal-400/5" : "border-white/10 bg-white/2 hover:bg-white/4"
                  }`}
                >
                  <span className={`grid size-4 place-items-center rounded border ${on ? "border-teal-400 bg-teal-500" : "border-white/20"}`}>
                    {on ? <CheckIcon className="size-3 text-zinc-950" /> : null}
                  </span>
                  <span className="text-sm text-zinc-100">{ch.name}</span>
                  <span className="ml-auto text-xs text-zinc-500 uppercase">{ch.type}</span>
                </button>
              );
            })}
          </div>
        )}
        {monitor.supportsDegraded ? (
          <label className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-300">Alert on degraded runs, not just failures</span>
            <Switch checked={alertOnDegraded} onCheckedChange={setAlertOnDegraded} ariaLabel="Alert on degraded runs" />
          </label>
        ) : null}
      </Section>

      {/* Incident automation */}
      <Section
        title="Incident automation"
        soon
        description="Automatically open an incident on the related project when this check fails, and resolve it when it recovers."
      >
        <p className="text-sm text-zinc-500">Not developed yet. It will tie Checks into Incidents when it lands.</p>
      </Section>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex items-center justify-end gap-2 pb-8">
        <Button
          variant="secondary"
          onClick={() => router.push(mode === "edit" && initial ? `/${slug}/checks/${initial.key}` : `/${slug}/checks`)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={disabled}>
          {mode === "edit" ? "Save changes" : "Create check"}
        </Button>
      </div>
    </div>
  );
}
