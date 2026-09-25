"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Check, ListFilter, Loader2, MapPin, MoreHorizontal, Search } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@flagon-io/ui";
import type { AuditConfig, AuditEvent, AuditPage } from "@/lib/api/types";
import { errorMessage, fetchJson, messageOf } from "@/lib/client-fetch";
import { ListError, TableShell } from "@/components/shared/list-states";
import { timeAgo } from "@/lib/notifications";

// The filterable action vocabulary, mirroring internal/audit Actions.
const ACTIONS: { value: string; label: string }[] = [
  { value: "project.created", label: "Project created" },
  { value: "project.updated", label: "Project updated" },
  { value: "project.deleted", label: "Project deleted" },
  { value: "project.restored", label: "Project restored" },
  { value: "member.added", label: "Member added" },
  { value: "member.role_changed", label: "Member role changed" },
  { value: "member.removed", label: "Member removed" },
  { value: "invitation.sent", label: "Invitation sent" },
  { value: "invitation.revoked", label: "Invitation revoked" },
  { value: "invitation.accepted", label: "Invitation accepted" },
  { value: "organization.updated", label: "Organization updated" },
  { value: "organization.audit_config_changed", label: "Audit settings changed" },
];

const PER_PAGE = 30;
type Tab = "events" | "settings";

export function AuditLog({
  orgSlug,
  initial,
  initialConfig,
}: {
  orgSlug: string;
  initial: AuditPage;
  initialConfig: AuditConfig;
}) {
  const [tab, setTab] = useState<Tab>("events");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <TabsList className="w-full gap-5" aria-label="Audit log">
        <TabsTrigger value="events" className="py-3 capitalize">
          events
        </TabsTrigger>
        <TabsTrigger value="settings" className="py-3 capitalize">
          settings
        </TabsTrigger>
      </TabsList>

      <TabsContent value="events" className="mt-4">
        <Events orgSlug={orgSlug} initial={initial} />
      </TabsContent>
      <TabsContent value="settings" className="mt-4">
        <AuditSettings orgSlug={orgSlug} initial={initialConfig} />
      </TabsContent>
    </Tabs>
  );
}

function Events({ orgSlug, initial }: { orgSlug: string; initial: AuditPage }) {
  const [q, setQ] = useState("");
  const [actions, setActions] = useState<string[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>(initial.events);
  const [next, setNext] = useState<string | null>(initial.next);
  const [loading, setLoading] = useState(false);
  // A failed page-1 load (search/filter change) replaces the list with an error;
  // a failed "load more" keeps what's shown and reports inline.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { before?: string; append?: boolean } = {}) => {
      setLoading(true);
      if (opts.append) setMoreError(null);
      else setLoadError(null);
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      for (const a of actions) qs.append("action", a);
      qs.set("limit", String(PER_PAGE));
      if (opts.before) qs.set("cursor", opts.before);
      try {
        const data = await fetchJson<AuditPage>(
          `/api/orgs/${encodeURIComponent(orgSlug)}/audit?${qs.toString()}`,
          undefined,
          "Couldn't load the audit log.",
        );
        setEvents((prev) => (opts.append ? [...prev, ...data.events] : data.events));
        setNext(data.next);
      } catch (e) {
        const msg = messageOf(e, "Couldn't load the audit log.");
        if (opts.append) setMoreError(msg);
        else setLoadError(msg);
      }
      setLoading(false);
    },
    [orgSlug, q, actions],
  );

  // Refetch page 1 when search/filters change (debounced). Skip the first mount
  // so the server-rendered page stays.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  function toggleAction(value: string) {
    setActions((prev) => (prev.includes(value) ? prev.filter((a) => a !== value) : [...prev, value]));
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Who did what, where, and when. Append-only and visible to owners and admins.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="md">
              <ListFilter className="size-4" />
              Filters
              {actions.length > 0 && (
                <Badge variant="brand" className="ml-1">
                  {actions.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Filter by action</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ACTIONS.map((a) => (
              <DropdownMenuItem
                key={a.value}
                onSelect={(e) => {
                  e.preventDefault();
                  toggleAction(a.value);
                }}
                className="justify-between"
              >
                {a.label}
                {actions.includes(a.value) && <Check className="size-4 text-brand-bright" />}
              </DropdownMenuItem>
            ))}
            {actions.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setActions([])}>Clear filters</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search audit logs..."
            className="pl-9"
          />
        </div>
      </div>

      {loadError ? (
        <ListError title="Couldn't load the audit log" message={loadError} onRetry={() => void load()} />
      ) : events.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">
            {q || actions.length ? "No matching events" : "No activity yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {q || actions.length
              ? "Try a different search or clear the filters."
              : "Changes to projects, members, and settings will appear here."}
          </p>
        </Card>
      ) : (
        <>
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Event</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="w-12 pr-4 text-right">
                    <span className="sr-only">Details</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <AuditRow key={e.id} event={e} />
                ))}
              </TableBody>
            </Table>
          </TableShell>

          <div className="flex flex-col items-center gap-2">
            {moreError && (
              <p className="text-sm text-destructive" role="alert">
                {moreError}
              </p>
            )}
            {next ? (
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void load({ before: next, append: true })}
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                {moreError ? "Try again" : "Load more"}
              </Button>
            ) : (
              <p className="py-1 text-xs text-muted-foreground">End of the log.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AuditRow({ event: e }: { event: AuditEvent }) {
  const [open, setOpen] = useState(false);
  const actor = e.actor_username || e.actor_name || e.actor_email || "system";
  const locLabel = e.actor_country || e.actor_ip;
  const locDetail = [e.actor_ip, e.actor_user_agent].filter(Boolean).join(" · ");

  const detail: { label: string; value: string; mono?: boolean }[] = [
    { label: "action", value: e.action, mono: true },
    { label: "actor", value: actor },
    { label: "actor_id", value: e.actor_id ?? "", mono: true },
    { label: "target", value: e.target_type ? `${e.target_type} ${e.target_id ?? ""}`.trim() : "", mono: true },
    { label: "ip_address", value: e.actor_ip ?? "", mono: true },
    { label: "country", value: e.actor_country ?? "" },
    { label: "client", value: e.actor_user_agent ?? "" },
    { label: "created_at", value: new Date(e.created_at).toLocaleString() },
    { label: "event_id", value: e.id, mono: true },
  ].filter((r) => r.value);

  return (
    <Fragment>
      <TableRow className={cn(open && "border-b-0")}>
        <TableCell className="pl-4 align-top">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/12 text-2xs font-semibold text-brand-bright uppercase">
              {actor.charAt(0)}
            </span>
            <div className="min-w-0">
              <p>
                <span className="font-semibold text-foreground">{actor}</span>{" "}
                <span className="font-semibold text-link">{e.action}</span>
              </p>
              <p className="mt-0.5 text-muted-foreground">{e.summary}</p>
            </div>
          </div>
        </TableCell>
        <TableCell className="align-top text-xs whitespace-nowrap text-muted-foreground">
          {locLabel ? (
            <span className="inline-flex items-center gap-1" title={locDetail || undefined}>
              <MapPin className="size-3" />
              {locLabel}
            </span>
          ) : (
            <span className="text-muted-foreground/40">-</span>
          )}
        </TableCell>
        <TableCell className="align-top text-xs whitespace-nowrap text-muted-foreground">
          <time dateTime={e.created_at} title={new Date(e.created_at).toLocaleString()}>
            {timeAgo(e.created_at)}
          </time>
        </TableCell>
        <TableCell className="pr-4 text-right align-top">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle event details"
            className="size-7"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={4} className="px-4 pt-0 pb-3">
            <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1.5 rounded-md border border-hairline bg-panel/40 px-3 py-3 text-xs">
              {detail.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="font-medium text-muted-foreground">{f.label}</dt>
                  <dd className={cn("min-w-0 wrap-break-word text-foreground", f.mono && "font-mono")}>
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

function AuditSettings({ orgSlug, initial }: { orgSlug: string; initial: AuditConfig }) {
  const [enabled, setEnabled] = useState(initial.ip_disclosure);
  const [baseline, setBaseline] = useState(initial.ip_disclosure);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = enabled !== baseline;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/audit/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip_disclosure: enabled }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(await errorMessage(res, "Couldn't save the setting."));
      return;
    }
    setBaseline(enabled); // new baseline so `dirty` resets
    setSaved(true);
  }

  return (
    <div className="mt-6 max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Disclose actor IP addresses
      </h1>

      <label className="mt-6 flex cursor-pointer items-start gap-3">
        <Checkbox
          checked={enabled}
          onCheckedChange={(v) => {
            setEnabled(v === true);
            setSaved(false);
          }}
          className="mt-0.5"
        />
        <span>
          <span className="block text-sm font-medium text-foreground">Enable source IP disclosure</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Reveal the IP address of members on organization audit log events. IPs are always
            recorded; this controls whether owners and admins can see them. Because it makes your
            members&rsquo; IP addresses visible, review it with your legal team to determine whether
            any notification is required.
          </span>
        </span>
      </label>

      {error && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        {saved && !dirty && <span className="text-sm text-muted-foreground">Saved.</span>}
      </div>
    </div>
  );
}
