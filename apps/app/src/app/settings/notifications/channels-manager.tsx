"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Mail, MessageSquare, Phone, Plus, Smartphone, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, toast, useConfirm } from "@flagon/design";
import type { NotificationChannel } from "@/lib/notifications-api";
import { addChannelAction, removeChannelAction } from "./actions";

type ChannelDef = { value: string; label: string; soon: boolean; icon: typeof Mail; placeholder: string };
const CHANNELS: ChannelDef[] = [
  { value: "email", label: "Email", soon: false, icon: Mail, placeholder: "you@company.com" },
  { value: "sms", label: "SMS", soon: true, icon: MessageSquare, placeholder: "+1 555 000 0000" },
  { value: "voice", label: "Voice call", soon: true, icon: Phone, placeholder: "+1 555 000 0000" },
  { value: "push", label: "Mobile push", soon: true, icon: Smartphone, placeholder: "Flagon mobile app" },
];
const defFor = (t: string) => CHANNELS.find((c) => c.value === t) ?? CHANNELS[0];

export function ChannelsManager({
  channels,
  accountEmail,
}: {
  channels: NotificationChannel[];
  accountEmail: string;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, start] = useTransition();
  const [type, setType] = useState("email");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const def = defFor(type);

  function add() {
    setError(null);
    if (!value.trim()) return setError("Enter a value for the channel.");
    start(async () => {
      const res = await addChannelAction({ type, value: value.trim() });
      if (res.error) return setError(res.error);
      setValue("");
      router.refresh();
    });
  }
  async function remove(channel: NotificationChannel) {
    if (
      !(await confirm({
        title: "Remove channel?",
        message: (
          <>
            Incident pages will no longer reach{" "}
            <strong className="text-zinc-200">{channel.value}</strong>.
          </>
        ),
        confirmLabel: "Remove channel",
        tone: "danger",
      }))
    )
      return;
    start(async () => {
      const res = await removeChannelAction(channel.id);
      if (res.error) {
        toast.error("Couldn't remove channel", res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Notifications</h1>
        <p className="mt-1 text-sm text-zinc-500">How incident pages reach you. Email delivers today; the rest are coming.</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/2 px-4 py-3">
          <Mail className="size-4 shrink-0 text-teal-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-zinc-200">{accountEmail}</p>
            <p className="text-xs text-zinc-500">Account email · always paged</p>
          </div>
          <span className="shrink-0 rounded-full border border-teal-400/20 bg-teal-400/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-teal-300 uppercase">Live</span>
        </div>

        {channels.map((ch) => {
          const d = defFor(ch.type);
          const Icon = d.icon;
          return (
            <div key={ch.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/2 px-4 py-3">
              <Icon className={`size-4 shrink-0 ${ch.deliverable ? "text-teal-400" : "text-zinc-500"}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-200">{ch.value}</p>
                <p className="text-xs text-zinc-500">{d.label}</p>
              </div>
              {!ch.deliverable ? (
                <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">Soon</span>
              ) : null}
              <button type="button" onClick={() => remove(ch)} disabled={pending} className="shrink-0 text-zinc-500 hover:text-red-400 disabled:opacity-50" aria-label={`Remove ${d.label} channel ${ch.value}`}>
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/2 p-4">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200"><Bell className="size-4 text-zinc-500" /> Add a channel</p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Channel">
            <Select ariaLabel="Channel type" value={type} onValueChange={(v) => setType(v)} options={CHANNELS.map((c) => ({ value: c.value, label: c.soon ? `${c.label} (soon)` : c.label }))} />
          </Field>
          <Field label="Value" className="min-w-52 flex-1">
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={def.placeholder} />
          </Field>
          <Button variant="secondary" onClick={add} disabled={pending || !value.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
        {def.soon ? (
          <p className="text-xs text-zinc-500">
            {def.label} paging is scaffolded: we store it now and start delivering when the provider lands. Until then, pages arrive by email.
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </div>
      {confirmDialog}
    </div>
  );
}
