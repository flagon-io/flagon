/**
 * The runbook step catalog.
 *
 * A runbook step is either a NATIVE action (Flagon owns it: a task, a link, or a
 * built-in like "assign a role") or an INTEGRATION action a provider performs on an
 * incident ("notify a channel", "start a video bridge"). The native steps are listed
 * here; the integration steps are DERIVED from the API integrations catalog by
 * capability (see `stepProvidersFromCatalog`), so adding a provider — or a capability
 * to one — in the canonical catalog automatically surfaces its runbook steps. Nothing
 * here talks to a third party: execution arrives with the integrations themselves.
 * Kept free of JSX so a server component can read it too; icons resolve to components
 * in the UI via each provider's `icon` key.
 */

/**
 * A step execution CONDITION, mirrored from the API (db/schema.ts `StepCondition`).
 * A step runs only when ALL of its conditions hold against the live incident.
 *  - `severity`  — incident severity key is one of `values`
 *  - `milestone` — incident status/milestone is one of `values`
 *  - `previous_step` — the step above it has run (done or skipped)
 */
export type StepCondition =
  | { type: "severity"; values: string[] }
  | { type: "milestone"; values: string[] }
  | { type: "previous_step" };

/**
 * A runbook ATTACH condition (mirrors the API `AttachCondition`): which incidents the
 * runbook auto-attaches to. ALL must hold, so an empty list = every incident.
 */
export type AttachCondition = { type: "severity"; values: string[] };

/** Whether a provider's steps can be used right now, and if not, why. */
export type RunbookProviderStatus =
  | "available" // usable now (native, or a connected integration)
  | "configure" // a real integration that just isn't connected yet
  | "soon"; // a planned integration with no connect path yet

export type RunbookStepType = {
  key: string;
  label: string;
  description: string;
  /** Native steps persist today as a task or link; the title is prefilled. */
  persistAs?: "task" | "link";
  defaultTitle?: string;
  /** Conditions pre-filled when this step is added (e.g. start-retro on resolve). */
  defaultConditions?: StepCondition[];
};

export type RunbookStepProvider = {
  key: string;
  label: string;
  /** Icon identifier resolved to a component in the UI (see ADD-step modal). */
  icon: string;
  category: string;
  kind: "core" | "integration";
  /** From the catalog: the org has connected this provider. */
  connected?: boolean;
  /** From the catalog: still on the roadmap, no connect path yet ("Soon"). */
  planned?: boolean;
  blurb: string;
  steps: RunbookStepType[];
};

/**
 * The slice of the API integrations catalog the step builder needs. Products bind to
 * CAPABILITIES, so the runbook step list is DERIVED from each provider's capabilities
 * rather than hand-listed.
 */
export type CatalogProvider = {
  key: string;
  label: string;
  category: string;
  connection: "byo" | "oauth";
  status: "available" | "planned";
  capabilities: string[];
  integration?: { connected: boolean } | null;
};

/**
 * The runbook action each capability unlocks. A provider offering `chat` gets a
 * "Notify a channel" step, one offering `video` gets "Start a video bridge", and so
 * on. Capabilities with no incident action (e.g. `source`) simply produce no step.
 */
const CAPABILITY_ACTIONS: Record<string, { key: string; label: string; description: string }> = {
  chat: { key: "chat-notify", label: "Notify a channel", description: "Post a message to a channel." },
  video: { key: "video-bridge", label: "Start a video bridge", description: "Open a meeting link for responders." },
  calendar: { key: "calendar-event", label: "Create a calendar event", description: "Put an incident call or review on the calendar." },
  docs: { key: "docs-export", label: "Export a document", description: "Write the write-up out to a document." },
  sms: { key: "sms-page", label: "Send an SMS page", description: "Text responders a message." },
  voice: { key: "voice-page", label: "Call responders", description: "Place a voice call to responders." },
};

/** The native, always-available steps (no integration required). */
const CORE_PROVIDER: RunbookStepProvider = {
  key: "core",
  label: "Flagon",
  icon: "flagon",
  category: "Core",
  kind: "core",
  blurb: "Built-in steps that run without any integration.",
  steps: [
    {
      key: "task",
      label: "Task",
      description: "A checklist item responders tick off by hand.",
      persistAs: "task",
      defaultTitle: "",
    },
    {
      key: "link",
      label: "Link",
      description: "A shortcut to a dashboard, doc, or tool.",
      persistAs: "link",
      defaultTitle: "",
    },
    {
      key: "assign-role",
      label: "Assign a role",
      description: "Prompt to name a commander or other responder role.",
      persistAs: "task",
      defaultTitle: "Assign an incident commander",
    },
    {
      key: "task-list",
      label: "Add a task list",
      description: "Drop in a batch of follow-up tasks at once.",
      persistAs: "task",
      defaultTitle: "Work the response checklist",
    },
    {
      key: "set-milestone",
      label: "Set a milestone",
      description: "Remind responders to move the incident's milestone.",
      persistAs: "task",
      defaultTitle: "Update the incident milestone",
    },
    {
      key: "status-page",
      label: "Publish to status page",
      description: "Post or update the public status page.",
      persistAs: "task",
      defaultTitle: "Update the status page",
    },
    {
      key: "start-retro",
      label: "Start the retrospective",
      description: "Kick off the postmortem once the incident resolves.",
      persistAs: "task",
      defaultTitle: "Start the postmortem",
      // Fires when the incident resolves — marks the retro underway.
      defaultConditions: [{ type: "milestone", values: ["resolved"] }],
    },
  ],
};

/**
 * Build the runbook step provider list: the native Core steps, then one entry per
 * integration whose capabilities map to a runbook action (derived from the catalog).
 * A provider with only non-actionable capabilities (e.g. a source provider) is
 * omitted. Connection/planned flags come straight from the catalog so `providerStatus`
 * can gate each one on a real connection.
 */
export function stepProvidersFromCatalog(catalog: CatalogProvider[]): RunbookStepProvider[] {
  const integrations = catalog
    .map((entry): RunbookStepProvider | null => {
      const steps = entry.capabilities
        .map((c) => CAPABILITY_ACTIONS[c])
        .filter((a): a is (typeof CAPABILITY_ACTIONS)[string] => Boolean(a))
        .map((a) => ({ key: a.key, label: a.label, description: a.description }));
      if (steps.length === 0) return null;
      return {
        key: entry.key,
        label: entry.label,
        icon: entry.key,
        category: entry.category,
        kind: "integration",
        connected: entry.integration?.connected ?? false,
        planned: entry.status === "planned",
        blurb: "",
        steps,
      };
    })
    .filter((p): p is RunbookStepProvider => p !== null);
  return [CORE_PROVIDER, ...integrations];
}

/** Whether a provider's steps are usable now, and if not, why. */
export function providerStatus(provider: RunbookStepProvider): RunbookProviderStatus {
  if (provider.kind === "core") return "available";
  if (provider.connected) return "available";
  // A real integration we can connect today (just isn't yet) vs. one still on the
  // roadmap with nowhere to connect it.
  return provider.planned ? "soon" : "configure";
}
