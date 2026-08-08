"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle, Phone, Send, Webhook, type LucideIcon } from "lucide-react";
import { Button, Field, Input, Switch } from "@flagon/design";
import type { AlertChannel } from "@/lib/checks-api";
import {
  createAlertChannelAction,
  deleteAlertChannelAction,
  testAlertChannelAction,
  updateAlertChannelAction,
} from "../actions";

/**
 * The alert-channel config page (create + edit), Checkly-style: type-aware channel
 * configuration (the destination), notification events, and — in edit mode — test and
 * delete. The `type` drives the fields; SMS / Phone deliver through the org's connected
 * Twilio, Webhook POSTs a signed payload, Email is native. Action buttons are
 * right-aligned per house convention.
 */

type FieldDef = { key: string; label: string; placeholder: string; help?: string; optional?: boolean };
type TypeMeta = { label: string; icon: LucideIcon; blurb: string; cta: string; fields: FieldDef[] };

const TYPE_META: Record<string, TypeMeta> = {
  email: {
    label: "Email",
    icon: Mail,
    blurb: "We email this address whenever a subscribed check fails, degrades, or recovers.",
    cta: "email channel",
    fields: [{ key: "address", label: "Email address", placeholder: "oncall@yourco.com" }],
  },
  sms: {
    label: "SMS",
    icon: MessageCircle,
    blurb: "We text this number through your connected Twilio when a subscribed check changes state.",
    cta: "SMS channel",
    fields: [
      { key: "phone", label: "Phone number", placeholder: "+15551234567", help: "In E.164 format, including the country code." },
    ],
  },
  phone: {
    label: "Phone call",
    icon: Phone,
    blurb: "We place a phone call through your connected Twilio when a subscribed check fails.",
    cta: "phone channel",
    fields: [
      { key: "phone", label: "Phone number", placeholder: "+15551234567", help: "In E.164 format, including the country code." },
    ],
  },
  webhook: {
    label: "Webhook",
    icon: Webhook,
    blurb: "We POST a JSON payload to this endpoint. Add a secret to receive an x-flagon-signature HMAC header.",
    cta: "webhook channel",
    fields: [
      { key: "url", label: "URL", placeholder: "https://example.com/hooks/flagon" },
      { key: "secret", label: "Signing secret", placeholder: "Optional", help: "Used to sign each payload (x-flagon-signature).", optional: true },
    ],
  },
};

function validate(type: string, config: Record<string, string>): boolean {
  if (type === "email") return (config.address ?? "").includes("@");
  if (type === "sms" || type === "phone") return (config.phone ?? "").trim().length >= 3;
  if (type === "webhook") return /^https?:\/\//i.test(config.url ?? "");
  return false;
}

export function AlertChannelForm({
  slug,
  mode,
  type,
  channel,
}: {
  slug: string;
  mode: "create" | "edit";
  type?: string;
  channel?: AlertChannel;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const channelType = channel?.type ?? type ?? "email";
  const meta = TYPE_META[channelType] ?? TYPE_META.email;

  const [name, setName] = useState(channel?.name ?? "");
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of meta.fields) {
      const v = channel?.config?.[f.key];
      init[f.key] = typeof v === "string" ? v : "";
    }
    return init;
  });
  const [onFailure, setOnFailure] = useState(channel?.sendOnFailure ?? true);
  const [onDegraded, setOnDegraded] = useState(channel?.sendOnDegraded ?? false);
  const [onRecovery, setOnRecovery] = useState(channel?.sendOnRecovery ?? true);
  const [enabled, setEnabled] = useState(channel?.enabled ?? true);

  const editing = mode === "edit";
  const Icon = meta.icon;

  const configPayload = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of meta.fields) {
      const v = (config[f.key] ?? "").trim();
      if (v || !f.optional) out[f.key] = v;
    }
    return out;
  }, [config, meta.fields]);

  const disabled = pending || !name || !validate(channelType, config);

  function save() {
    setError(null);
    start(async () => {
      if (editing && channel) {
        const res = await updateAlertChannelAction(slug, channel.id, {
          name,
          config: configPayload,
          sendOnFailure: onFailure,
          sendOnDegraded: onDegraded,
          sendOnRecovery: onRecovery,
          enabled,
        });
        if (res.error) return setError(res.error);
        router.refresh();
        setFlash("Saved");
        setTimeout(() => setFlash(null), 2000);
        return;
      }
      const res = await createAlertChannelAction(slug, {
        type: channelType,
        name,
        config: configPayload,
        sendOnFailure: onFailure,
        sendOnDegraded: onDegraded,
        sendOnRecovery: onRecovery,
      });
      if (res.error) return setError(res.error);
      router.push(`/${slug}/checks/alert-channels/${res.id}`);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className="size-5 text-zinc-300" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-100">{meta.label}</h1>
              <p className="mt-0.5 text-sm text-zinc-500">{meta.blurb}</p>
            </div>
          </div>
          <Button variant="primary" onClick={save} disabled={disabled}>
            {editing ? "Save changes" : `Create ${meta.cta}`}
          </Button>
        </div>
      </div>

      {/* Channel configuration */}
      <section className="rounded-xl border border-white/10 bg-white/2 p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">Channel configuration</h2>
          {editing && channel ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await testAlertChannelAction(slug, channel.id);
                  setFlash(res.error ? `Test failed: ${res.error}` : "Test sent ✓");
                  setTimeout(() => setFlash(null), 4000);
                })
              }
            >
              <Send className="size-3.5" /> Test alert channel
            </Button>
          ) : null}
        </div>
        <div className="grid gap-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="On-call inbox" />
          </Field>
          {meta.fields.map((f) => (
            <Field key={f.key} label={f.optional ? `${f.label} (optional)` : f.label} hint={f.help}>
              <Input
                value={config[f.key] ?? ""}
                onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
              />
            </Field>
          ))}
        </div>
      </section>

      {/* Notification events */}
      <section className="rounded-xl border border-white/10 bg-white/2 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-100">Notification events</h2>
        <p className="mb-3 text-xs text-zinc-500">Send a notification when a check…</p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between text-sm text-zinc-300">
            fails <Switch checked={onFailure} onCheckedChange={setOnFailure} ariaLabel="On failure" />
          </label>
          <label className="flex items-center justify-between text-sm text-zinc-300">
            degrades <Switch checked={onDegraded} onCheckedChange={setOnDegraded} ariaLabel="On degraded" />
          </label>
          <label className="flex items-center justify-between text-sm text-zinc-300">
            recovers <Switch checked={onRecovery} onCheckedChange={setOnRecovery} ariaLabel="On recovery" />
          </label>
          {editing ? (
            <label className="mt-2 flex items-center justify-between border-t border-white/10 pt-3 text-sm text-zinc-300">
              Channel enabled <Switch checked={enabled} onCheckedChange={setEnabled} ariaLabel="Enabled" />
            </label>
          ) : null}
        </div>
      </section>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {flash ? <p className="text-sm text-teal-300">{flash}</p> : null}

      <div className="flex items-center justify-end gap-2 pb-8">
        {editing && channel ? (
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete the "${channel.name}" channel?`)) return;
              start(async () => {
                const res = await deleteAlertChannelAction(slug, channel.id);
                if (res.error) return setError(res.error);
                router.push(`/${slug}/checks/alert-channels`);
                router.refresh();
              });
            }}
          >
            Delete channel
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => router.push(`/${slug}/checks/alert-channels`)} disabled={pending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={disabled}>
          {editing ? "Save changes" : `Create ${meta.cta}`}
        </Button>
      </div>
    </div>
  );
}
