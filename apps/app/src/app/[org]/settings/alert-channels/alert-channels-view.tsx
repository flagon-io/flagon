"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Send, MessageSquare, Trash2, Webhook, Mail } from "lucide-react";
import { Button, Field, Input, Modal, ModalBody, ModalFooter, ModalHeader, Select } from "@flagon/design";
import type { AlertChannel } from "@/lib/alert-channels-api";
import { WipNotice } from "@/components/wip-notice";
import { createAlertChannelAction, deleteAlertChannelAction, testAlertChannelAction } from "./actions";
import { useRouter } from "next/navigation";

const TYPE_OPTIONS = [
  { value: "slack_webhook", label: "Slack (incoming webhook)" },
  { value: "webhook", label: "Webhook (HTTP POST)" },
  { value: "email", label: "Email" },
];
/** Integrations on the roadmap — shown as "Soon" so the shape of the surface reads
 *  complete. Slack works today via incoming webhook; these are the richer/native ones. */
const SOON_INTEGRATIONS = [
  { name: "Slack (interactive)", note: "Channel picker plus acknowledge and resolve buttons" },
  { name: "Discord", note: "Post alerts to a channel" },
  { name: "Microsoft Teams", note: "Post to a Teams channel" },
  { name: "PagerDuty", note: "Trigger and resolve incidents" },
  { name: "Opsgenie", note: "Route alerts to schedules" },
  { name: "Telegram", note: "Message a chat or group" },
];

const HEALTH: Record<string, { label: string; cls: string }> = {
  ok: { label: "Healthy", cls: "text-emerald-400" },
  failing: { label: "Failing", cls: "text-red-400" },
  disabled: { label: "Disabled", cls: "text-zinc-500" },
  unknown: { label: "Untested", cls: "text-zinc-500" },
};

function typeIcon(type: string) {
  if (type === "slack_webhook") return <MessageSquare className="size-4" />;
  if (type === "email") return <Mail className="size-4" />;
  return <Webhook className="size-4" />;
}
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

export function AlertChannelsView({ slug, channels, canManage }: { slug: string; channels: AlertChannel[]; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  function test(key: string) {
    startTransition(async () => {
      const res = await testAlertChannelAction(slug, key);
      setTestResult((prev) => ({ ...prev, [key]: res.error ? res.error : res.ok ? "Delivered" : "Failed" }));
      router.refresh();
    });
  }
  function remove(key: string, name: string) {
    if (!confirm(`Delete channel "${name}"?`)) return;
    startTransition(async () => {
      await deleteAlertChannelAction(slug, key);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <WipNotice feature="Alert channels" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Alert channels</h1>
          <p className="mt-1 text-sm text-zinc-500">Reusable destinations for check and incident alerts. Configure once, reference from many checks.</p>
        </div>
        <span title={canManage ? undefined : "Only organization owners and admins can manage channels"}>
          <Button variant="primary" disabled={!canManage} onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Add channel
          </Button>
        </span>
      </div>

      {channels.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-16 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-zinc-300"><Webhook className="size-5" /></span>
          <p className="text-base font-medium text-zinc-100">No channels yet</p>
          <p className="max-w-sm text-sm text-zinc-500">Add a Slack incoming webhook, a generic webhook, or an email destination. Then point checks at it.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {channels.map((c, i) => {
            const health = HEALTH[c.health] ?? HEALTH.unknown;
            return (
              <div key={c.key} className={`flex items-center gap-4 px-4 py-3 ${i > 0 ? "border-t border-white/8" : ""}`}>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-300">{typeIcon(c.type)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-zinc-100">{c.name}</span>
                    <span className={`text-xs ${health.cls}`}>{health.label}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {c.type === "email" ? c.addresses.join(", ") : c.channelLabel ?? (c.configured ? "Configured" : "Not configured")}
                    {testResult[c.key] ? ` · ${testResult[c.key]}` : c.lastError ? ` · ${c.lastError}` : ""}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => test(c.key)} disabled={pending}><Send className="size-3.5" /> Test</Button>
                    <Button variant="secondary" size="sm" onClick={() => remove(c.key, c.name)} disabled={pending}><Trash2 className="size-3.5" /></Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div>
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Coming soon</p>
        <p className="mt-1 text-xs text-zinc-500">Slack works today via incoming webhook. Richer, native integrations are on the way.</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SOON_INTEGRATIONS.map((s) => (
            <div key={s.name} className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/2 px-3 py-2.5 opacity-70">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-400">
                <MessageSquare className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-zinc-300">{s.name}</span>
                  <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">Soon</span>
                </div>
                <p className="truncate text-xs text-zinc-500">{s.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {open ? <CreateChannelModal slug={slug} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function CreateChannelModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("slack_webhook");
  const [url, setUrl] = useState("");
  const [channelLabel, setChannelLabel] = useState("");
  const [addresses, setAddresses] = useState("");
  const key = useMemo(() => slugify(name), [name]);

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Give the channel a name.");
    if (type === "email") {
      const list = addresses.split(/[,\s]+/).map((a) => a.trim()).filter(Boolean);
      if (list.length === 0) return setError("Enter at least one email address.");
      startTransition(async () => {
        const res = await createAlertChannelAction(slug, { key, name: name.trim(), type, addresses: list });
        if (res.error) setError(res.error);
        else { onClose(); router.refresh(); }
      });
      return;
    }
    if (!url.trim()) return setError("Enter the destination URL.");
    startTransition(async () => {
      const res = await createAlertChannelAction(slug, { key, name: name.trim(), type, url: url.trim(), ...(channelLabel ? { channelLabel } : {}) });
      if (res.error) setError(res.error);
      else { onClose(); router.refresh(); }
    });
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Add an alert channel" description="A destination checks and incidents can post to." onClose={onClose} />
      <ModalBody className="flex flex-col gap-4">
        {error ? <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p> : null}
        <Field label="Name" hint={key ? `Key: ${key}` : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="#ops" autoFocus />
        </Field>
        <Field label="Type">
          <Select value={type} onValueChange={setType} options={TYPE_OPTIONS} />
        </Field>
        {type === "slack_webhook" ? (
          <>
            <Field label="Slack incoming webhook URL" hint="Create one in Slack → Apps → Incoming Webhooks. Stored encrypted.">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" />
            </Field>
            <Field label="Channel label" hint="Optional, for display only.">
              <Input value={channelLabel} onChange={(e) => setChannelLabel(e.target.value)} placeholder="#ops" />
            </Field>
          </>
        ) : null}
        {type === "webhook" ? (
          <Field label="Webhook URL" hint="Flagon POSTs a JSON payload here. Stored encrypted.">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourapp.com/hooks/flagon" />
          </Field>
        ) : null}
        {type === "email" ? (
          <Field label="Addresses" hint="Comma or space separated.">
            <Input value={addresses} onChange={(e) => setAddresses(e.target.value)} placeholder="oncall@yourcompany.com, team@yourcompany.com" />
          </Field>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={pending}>{pending ? "Adding…" : "Add channel"}</Button>
      </ModalFooter>
    </Modal>
  );
}
