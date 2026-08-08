"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle, Phone, Plus, Webhook, type LucideIcon } from "lucide-react";
import { Button, Switch } from "@flagon/design";
import type { AlertChannel } from "@/lib/checks-api";
import { testAlertChannelAction, updateAlertChannelAction } from "../actions";

const TYPE_ICON: Record<string, LucideIcon> = { email: Mail, sms: MessageCircle, phone: Phone, webhook: Webhook };

/** A short, human-readable destination for the row (address / phone / url). */
function destination(c: AlertChannel): string {
  const cfg = c.config as Record<string, unknown>;
  const v = cfg.address ?? cfg.phone ?? cfg.url;
  return typeof v === "string" ? v : "";
}

/**
 * The Alert channels list (Checkly's Alerts page): global settings, then the org's
 * channels. Each row toggles enabled / tests / routes to its config page; a "New alert
 * channel" button (also in the empty state) starts the type-picker flow.
 */
function FakeSelect({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm text-zinc-300">{children}</span>;
}

function eventsSummary(c: AlertChannel): string {
  const on: string[] = [];
  if (c.sendOnFailure) on.push("fails");
  if (c.sendOnDegraded) on.push("degrades");
  if (c.sendOnRecovery) on.push("recovers");
  return on.length ? `Alerts when a check ${on.join(", ")}` : "No events selected";
}

function ChannelRow({ slug, channel }: { slug: string; channel: AlertChannel }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const Icon = TYPE_ICON[channel.type] ?? Mail;
  const dest = destination(channel);

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/2 px-4 py-3">
      <Link href={`/${slug}/checks/alert-channels/${channel.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Icon className="size-4 shrink-0 text-zinc-300" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-100">{channel.name}</span>
            {!channel.enabled ? <span className="text-xs text-zinc-500">· disabled</span> : null}
          </div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">
            {dest} · {eventsSummary(channel)}
          </div>
        </div>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        {flash ? <span className="text-xs text-teal-300">{flash}</span> : null}
        <Switch
          checked={channel.enabled}
          ariaLabel="Enabled"
          onCheckedChange={(v) =>
            start(async () => {
              await updateAlertChannelAction(slug, channel.id, { enabled: v });
              router.refresh();
            })
          }
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await testAlertChannelAction(slug, channel.id);
              setFlash(res.error ? "Failed" : "Sent ✓");
              setTimeout(() => setFlash(null), 2500);
            })
          }
        >
          Test
        </Button>
        <Button size="sm" variant="secondary" onClick={() => router.push(`/${slug}/checks/alert-channels/${channel.id}`)}>
          Edit
        </Button>
      </div>
    </div>
  );
}

export function AlertChannelsList({ slug, channels, canManage }: { slug: string; channels: AlertChannel[]; canManage: boolean }) {
  const router = useRouter();
  const newChannel = () => router.push(`/${slug}/checks/alert-channels/new`);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Alert channels</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          How Checks reaches you when something breaks. Create a channel, then select it on your checks. Channels are
          powered by your{" "}
          <Link href={`/${slug}/settings/integrations`} className="text-teal-400 hover:text-teal-300">
            Integrations
          </Link>
          ; Email works out of the box.
        </p>
      </div>

      {/* Global alert settings (soon) */}
      <section className="rounded-xl border border-white/10 bg-white/2 p-5 opacity-80">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">Global alert settings</h2>
          <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">Soon</span>
        </div>
        <div className="flex flex-col gap-3 text-sm text-zinc-400">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-zinc-500">Escalation:</span>
            alert when a check has failed <FakeSelect>1</FakeSelect> time(s), or is failing for more than <FakeSelect>5 minutes</FakeSelect>.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-zinc-500">Reminders:</span>
            send up to <FakeSelect>0</FakeSelect> reminders, <FakeSelect>10 minutes</FakeSelect> apart.
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">Set per check today (run/time-based threshold, reminders, alert-on-degraded). Account-wide defaults are coming.</p>
      </section>

      {/* Channels */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Your channels</h2>
          {canManage && channels.length > 0 ? (
            <Button size="sm" variant="secondary" onClick={newChannel}>
              <Plus className="size-3.5" /> New alert channel
            </Button>
          ) : null}
        </div>
        {channels.length > 0 ? (
          <div className="flex flex-col gap-2">
            {channels.map((c) => (
              <ChannelRow key={c.id} slug={slug} channel={c} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-14 text-center">
            <p className="text-base font-medium text-zinc-100">No alert channels yet</p>
            <p className="max-w-sm text-sm text-zinc-500">Alert channels deliver notifications when your checks fail, degrade, or recover.</p>
            {canManage ? (
              <Button variant="primary" onClick={newChannel}>
                <Plus className="size-4" /> New alert channel
              </Button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
