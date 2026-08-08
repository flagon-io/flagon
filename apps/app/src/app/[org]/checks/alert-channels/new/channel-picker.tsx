"use client";

import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Hash,
  Mail,
  MessageCircle,
  MessagesSquare,
  Phone,
  Plug,
  Send,
  Siren,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";

/**
 * The channel-type picker. Each card reflects the backing integration's real state:
 * native (Email — go configure it), integration-connected, connect-it-first (a link into
 * Integrations), or on the roadmap. Picking a live type opens its config page.
 */
type ProviderState = { key: string; label: string; status: "available" | "planned"; connected: boolean };
type Capabilities = { sms: boolean; voice: boolean };
type Backing =
  | { kind: "native" }
  | { kind: "provider"; provider: string; capability?: "sms" | "voice" }
  | { kind: "roadmap" };
type CatalogChannel = { key: string; label: string; icon: LucideIcon; blurb: string; backing: Backing; group: string };

const CATALOG: CatalogChannel[] = [
  { key: "email", group: "Messaging", label: "Email", icon: Mail, blurb: "Alerts in your inbox when a check fails or recovers.", backing: { kind: "native" } },
  { key: "sms", group: "Messaging", label: "SMS", icon: MessageCircle, blurb: "A text on failure and recovery, through your Twilio.", backing: { kind: "provider", provider: "twilio", capability: "sms" } },
  { key: "phone", group: "Messaging", label: "Phone call", icon: Phone, blurb: "A phone call on failure, through your Twilio.", backing: { kind: "provider", provider: "twilio", capability: "voice" } },
  { key: "webhook", group: "Messaging", label: "Webhook", icon: Webhook, blurb: "A signed JSON payload to any endpoint you want.", backing: { kind: "native" } },
  { key: "slack", group: "Chat", label: "Slack", icon: Hash, blurb: "Detailed alerts in any Slack channel.", backing: { kind: "provider", provider: "slack" } },
  { key: "discord", group: "Chat", label: "Discord", icon: MessagesSquare, blurb: "Alerts in any Discord channel.", backing: { kind: "provider", provider: "discord" } },
  { key: "msteams", group: "Chat", label: "Microsoft Teams", icon: Users, blurb: "Alerts in any Teams channel.", backing: { kind: "provider", provider: "microsoft-teams" } },
  { key: "telegram", group: "Chat", label: "Telegram", icon: Send, blurb: "Alerts in any Telegram chat.", backing: { kind: "roadmap" } },
  { key: "opsgenie", group: "On-call", label: "Opsgenie", icon: Siren, blurb: "Create and close alerts in Opsgenie.", backing: { kind: "roadmap" } },
  { key: "pagerduty", group: "On-call", label: "PagerDuty", icon: BellRing, blurb: "Trigger and resolve PagerDuty incidents.", backing: { kind: "roadmap" } },
];

type State = { tone: "ok" | "action" | "soon"; label: string; note?: string; href?: string };

function resolve(slug: string, ch: CatalogChannel, byKey: Map<string, ProviderState>, caps: Capabilities): State {
  const configHref = `/${slug}/checks/alert-channels/new/${ch.key}`;
  if (ch.backing.kind === "native") return { tone: "ok", label: "Available", href: configHref };
  if (ch.backing.kind === "roadmap") return { tone: "soon", label: "Soon" };
  const p = byKey.get(ch.backing.provider);
  if (!p || p.status === "planned") return { tone: "soon", label: "Integration coming", note: `Needs the ${p?.label ?? ch.label} integration.` };
  const settings = `/${slug}/settings/integrations/${p.key}`;
  if (!p.connected) return { tone: "action", label: `Connect ${p.label}`, note: `Connect ${p.label} to enable ${ch.label}.`, href: settings };
  const cap = ch.backing.capability;
  if (cap && !caps[cap]) return { tone: "action", label: `Enable in ${p.label}`, note: `Turn on ${cap === "sms" ? "SMS" : "voice"} for your ${p.label} integration.`, href: settings };
  return { tone: "ok", label: `${p.label} connected`, href: configHref };
}

function Pill({ state }: { state: State }) {
  if (state.tone === "ok")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-teal-400/20 bg-teal-400/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-teal-300 uppercase">
        <CheckCircle2 className="size-3" /> {state.label}
      </span>
    );
  if (state.tone === "action")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-amber-300 uppercase">
        <Plug className="size-3" /> Connect
      </span>
    );
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
      {state.label}
    </span>
  );
}

function Card({ ch, state }: { ch: CatalogChannel; state: State }) {
  const Icon = ch.icon;
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-zinc-300" />
        <span className="text-sm font-medium text-zinc-100">{ch.label}</span>
        <span className="ml-auto">
          <Pill state={state} />
        </span>
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">{ch.blurb}</p>
      {state.note ? (
        <p className={`mt-1 text-xs ${state.tone === "action" ? "text-amber-300/90" : "text-zinc-500"}`}>
          {state.tone === "action" ? (
            <span className="inline-flex items-center gap-1">
              {state.note} <ArrowRight className="size-3" />
            </span>
          ) : (
            state.note
          )}
        </p>
      ) : null}
    </>
  );
  const cls = `block rounded-xl border p-4 transition-colors ${
    state.href
      ? state.tone === "action"
        ? "border-amber-400/20 bg-amber-400/5 hover:border-amber-400/40"
        : "border-white/10 bg-white/2 hover:border-teal-400/40 hover:bg-white/4"
      : "cursor-not-allowed border-white/8 bg-white/1 opacity-70"
  }`;
  return state.href ? (
    <Link href={state.href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function ChannelPicker({
  slug,
  providers,
  capabilities,
}: {
  slug: string;
  providers: ProviderState[];
  capabilities: Capabilities;
}) {
  const byKey = new Map(providers.map((p) => [p.key, p]));
  const groups = ["Messaging", "Chat", "On-call"];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">New alert channel</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Choose a channel type. Channels are powered by your{" "}
          <Link href={`/${slug}/settings/integrations`} className="text-teal-400 hover:text-teal-300">
            Integrations
          </Link>
          ; Email works out of the box.
        </p>
      </div>
      {groups.map((g) => (
        <section key={g}>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">{g}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CATALOG.filter((c) => c.group === g).map((c) => (
              <Card key={c.key} ch={c} state={resolve(slug, c, byKey, capabilities)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
