"use client";

import { useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Calendar,
  ListChecks,
  MessagesSquare,
  Phone,
  Plug,
  Search,
  Video,
} from "lucide-react";
import {
  Button,
  cn,
  IconDiscord,
  IconSlack,
  Modal,
  ModalBody,
  ModalHeader,
} from "@flagon/design";
import {
  providerStatus,
  stepProvidersFromCatalog,
  type CatalogProvider,
  type RunbookProviderStatus,
  type RunbookStepProvider,
  type RunbookStepType,
} from "@/lib/runbook-steps";

type IconCmp = ComponentType<{ className?: string }>;

/** Resolve a provider's icon key (its catalog key) to a component. */
const ICONS: Record<string, IconCmp> = {
  flagon: ListChecks,
  twilio: Phone,
  slack: IconSlack,
  discord: IconDiscord,
  "microsoft-teams": MessagesSquare,
  google: Calendar,
  zoom: Video,
};

/**
 * The Add-step catalog: pick a provider on the left, then one of its steps on the
 * right. Native (Flagon) steps add straight into the runbook; integration steps
 * are shown for every provider the org COULD connect, but a provider that isn't
 * connected is gated behind a "Configure" link to Integrations and its steps read
 * as unavailable. This is the shape runbooks take once integrations run their own
 * actions; today only the native steps are live.
 */
export function AddStepModal({
  slug,
  catalog,
  onAdd,
  onClose,
}: {
  slug: string;
  catalog: CatalogProvider[];
  onAdd: (step: RunbookStepType) => void;
  onClose: () => void;
}) {
  // The step providers are DERIVED from the integrations catalog by capability, so
  // this list stays in sync with what the org can connect — no hardcoded roster.
  const allProviders = useMemo(() => stepProvidersFromCatalog(catalog), [catalog]);
  const [selectedKey, setSelectedKey] = useState("core");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const providers = useMemo(() => {
    if (!q) return allProviders;
    return allProviders.map((p) => {
      const providerHit = p.label.toLowerCase().includes(q);
      const steps = providerHit
        ? p.steps
        : p.steps.filter(
            (s) =>
              s.label.toLowerCase().includes(q) ||
              s.description.toLowerCase().includes(q),
          );
      return { provider: p, steps };
    }).filter((x) => x.steps.length > 0);
  }, [q, allProviders]);

  // Group the (possibly filtered) providers by category for the left rail.
  const groups = useMemo(() => {
    const shown = q
      ? (providers as { provider: RunbookStepProvider; steps: RunbookStepType[] }[]).map(
          (x) => x.provider,
        )
      : allProviders;
    const byCategory = new Map<string, RunbookStepProvider[]>();
    for (const p of shown) {
      const list = byCategory.get(p.category) ?? [];
      list.push(p);
      byCategory.set(p.category, list);
    }
    return [...byCategory.entries()];
  }, [providers, q, allProviders]);

  const selected =
    allProviders.find((p) => p.key === selectedKey) ?? allProviders[0];
  const status = providerStatus(selected);
  // When searching, show only the steps that matched for the selected provider.
  const selectedSteps = q
    ? (providers as { provider: RunbookStepProvider; steps: RunbookStepType[] }[]).find(
        (x) => x.provider.key === selected.key,
      )?.steps ?? selected.steps
    : selected.steps;

  function pick(step: RunbookStepType) {
    if (selected.kind !== "core") return; // integration steps aren't live yet
    onAdd(step);
    onClose();
  }

  return (
    <Modal onClose={onClose} className="max-w-3xl">
      <ModalHeader
        title="Add a runbook step"
        description="Native steps add now. Integration steps show what each provider will automate once it's connected."
        onClose={onClose}
      />
      <ModalBody className="p-0">
        <div className="grid h-104 grid-cols-[15rem_1fr]">
          {/* Left rail: search + providers grouped by category */}
          <div className="flex flex-col overflow-hidden border-r border-white/8">
            <div className="border-b border-white/8 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="search"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search steps…"
                  className="h-8 w-full rounded-md border border-white/10 bg-white/5 pr-3 pl-8 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {groups.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-zinc-500">
                  No steps match “{query}”.
                </p>
              ) : (
                groups.map(([category, list]) => (
                  <div key={category} className="mb-2">
                    <p className="px-2 pt-2 pb-1 text-[10px] font-medium tracking-wide text-zinc-600 uppercase">
                      {category}
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {list.map((p) => (
                        <li key={p.key}>
                          <ProviderRow
                            provider={p}
                            active={p.key === selected.key}
                            status={providerStatus(p)}
                            onSelect={() => setSelectedKey(p.key)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right pane: the selected provider's steps (or a gate) */}
          <div className="flex flex-col overflow-y-auto p-4">
            <div className="mb-3 flex items-start gap-3">
              <ProviderIcon provider={selected} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-100">{selected.label}</h3>
                  <StatusPill status={status} />
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">{selected.blurb}</p>
              </div>
            </div>

            {status !== "available" ? (
              <GateNotice slug={slug} provider={selected} status={status} />
            ) : null}

            <ul className="flex flex-col gap-2">
              {selectedSteps.map((step) => (
                <li key={step.key}>
                  <StepRow
                    step={step}
                    provider={selected}
                    status={status}
                    onPick={() => pick(step)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}

function ProviderIcon({ provider }: { provider: RunbookStepProvider }) {
  const Icon = ICONS[provider.icon] ?? Plug;
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-300">
      <Icon className="size-4" />
    </span>
  );
}

function ProviderRow({
  provider,
  active,
  status,
  onSelect,
}: {
  provider: RunbookStepProvider;
  active: boolean;
  status: RunbookProviderStatus;
  onSelect: () => void;
}) {
  const Icon = ICONS[provider.icon] ?? Plug;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        active ? "bg-white/8 text-zinc-100" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
      )}
    >
      <Icon className="size-4 shrink-0 text-zinc-400" />
      <span className="min-w-0 flex-1 truncate">{provider.label}</span>
      {status === "available" && provider.kind === "integration" ? (
        <span className="size-1.5 shrink-0 rounded-full bg-teal-400" title="Connected" />
      ) : status === "soon" ? (
        <span className="shrink-0 rounded border border-white/10 px-1 py-0.5 text-[9px] font-medium tracking-wide text-zinc-600 uppercase">
          Soon
        </span>
      ) : null}
    </button>
  );
}

function StatusPill({ status }: { status: RunbookProviderStatus }) {
  if (status === "available") {
    return (
      <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-teal-300 uppercase">
        Available
      </span>
    );
  }
  if (status === "configure") {
    return (
      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-amber-300 uppercase">
        Not connected
      </span>
    );
  }
  return (
    <span className="rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
      Soon
    </span>
  );
}

/** The gate shown when the selected provider's steps aren't usable yet. */
function GateNotice({
  slug,
  provider,
  status,
}: {
  slug: string;
  provider: RunbookStepProvider;
  status: RunbookProviderStatus;
}) {
  return (
    <div className="mb-3 flex items-start gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-xs">
      <Plug className="mt-0.5 size-4 shrink-0 text-amber-300" />
      <div className="min-w-0 text-amber-100/90">
        {status === "configure" ? (
          <>
            <p>
              These steps need the <strong>{provider.label}</strong> integration.
              Connect it and they become available in every runbook.
            </p>
            <Link
              href={`/${slug}/settings/integrations`}
              className="mt-1 inline-flex items-center gap-1 font-medium text-amber-200 hover:text-amber-100"
            >
              Connect {provider.label}
              <ArrowUpRight className="size-3" />
            </Link>
          </>
        ) : (
          <>
            <p>
              <strong>{provider.label}</strong> is on the way. Once it lands, connect
              it in Integrations to automate these steps.
            </p>
            <Link
              href={`/${slug}/settings/integrations`}
              className="mt-1 inline-flex items-center gap-1 font-medium text-amber-200 hover:text-amber-100"
            >
              View integrations
              <ArrowUpRight className="size-3" />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function StepRow({
  step,
  provider,
  status,
  onPick,
}: {
  step: RunbookStepType;
  provider: RunbookStepProvider;
  status: RunbookProviderStatus;
  onPick: () => void;
}) {
  const addable = provider.kind === "core";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5",
        addable
          ? "border-white/10 bg-white/2"
          : "border-white/8 bg-white/2 opacity-70",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm text-zinc-100">{step.label}</p>
        <p className="truncate text-xs text-zinc-500">{step.description}</p>
      </div>
      {addable ? (
        <Button variant="secondary" size="sm" onClick={onPick}>
          Add
        </Button>
      ) : (
        <span className="shrink-0 text-[10px] font-medium tracking-wide text-zinc-600 uppercase">
          {status === "available" ? "Automations soon" : "Unavailable"}
        </span>
      )}
    </div>
  );
}
