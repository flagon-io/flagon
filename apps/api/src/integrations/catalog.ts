/**
 * The CANONICAL integration catalog — the single source of truth for every provider
 * Flagon integrates with, across ALL products (not just Incidents).
 *
 * Each provider declares three things products care about:
 *   - `connection`: how it's wired up — `byo` (the org brings a third party's
 *     credentials, which Flagon uses on their behalf, e.g. Twilio) or `oauth`
 *     (a Flagon app the org installs, Flagon owns the credentials).
 *   - `status`: `available` (wired up now) or `planned` (declared, not yet buildable).
 *   - `capabilities`: WHAT it can do, from a product-agnostic taxonomy. Products bind
 *     to capabilities, not providers — a runbook "start a video bridge" step needs
 *     `video`, so Zoom / Meet / Teams can each satisfy it; a future "announce a deploy"
 *     step needs `chat`, so Slack / Discord / Teams satisfy it. Add a capability to a
 *     provider here and every product that consumes that capability lights it up.
 *
 * This is metadata only. The EXECUTABLE side of a `byo` provider (its credential
 * fields, live test, and delivery functions) lives in providers.ts, keyed by the same
 * `key`; the catalog endpoint merges the two. `oauth` providers have no executable
 * layer yet — they're declared here so products and the console can render them.
 */

/** What an integration can do — the taxonomy products bind against. */
export type IntegrationCapability =
  | "sms" // send SMS pages
  | "voice" // place voice-call pages
  | "chat" // post messages to a chat channel
  | "video" // open a video meeting bridge
  | "calendar" // create a calendar event
  | "docs" // export a document
  | "source"; // source-control provider (repositories)

/** Human labels for each capability (console + product surfaces). */
export const CAPABILITY_LABELS: Record<IntegrationCapability, string> = {
  sms: "SMS",
  voice: "Voice",
  chat: "Chat notifications",
  video: "Video bridges",
  calendar: "Calendar events",
  docs: "Document export",
  source: "Source control",
};

/** How a provider is wired up: the org's own credentials, or a Flagon app install. */
export type IntegrationConnectionModel = "byo" | "oauth";

/** Whether a provider is usable today or still on the roadmap. */
export type IntegrationStatus = "available" | "planned";

export type IntegrationDefinition = {
  key: string;
  label: string;
  /** Console grouping ("Notifications", "Chat", "Video", "Productivity", "Source"). */
  category: string;
  summary: string;
  connection: IntegrationConnectionModel;
  status: IntegrationStatus;
  capabilities: IntegrationCapability[];
  /** Docs deep-link under /docs, if any. */
  docsPath?: string;
};

/**
 * Every provider, in display order. BYO+available ones also have an executable entry
 * in providers.ts under the same key; the rest are declared here for products and the
 * console to render until their connect flow ships.
 */
export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  {
    key: "twilio",
    label: "Twilio",
    category: "Notifications",
    summary:
      "Bring your own Twilio account for SMS and voice delivery. Connect it now; the features that send through it are on the way.",
    connection: "byo",
    status: "available",
    capabilities: ["sms", "voice"],
    docsPath: "/docs/platform/integrations",
  },
  {
    key: "slack",
    label: "Slack",
    category: "Chat",
    summary: "Notify channels and open a dedicated incident channel in Slack.",
    connection: "oauth",
    status: "planned",
    capabilities: ["chat"],
  },
  {
    key: "discord",
    label: "Discord",
    category: "Chat",
    summary: "Post flag changes, experiment results, and incident pages to Discord.",
    connection: "oauth",
    status: "planned",
    capabilities: ["chat"],
  },
  {
    key: "microsoft-teams",
    label: "Microsoft Teams",
    category: "Chat",
    summary: "Notify channels and start a Teams meeting for responders.",
    connection: "oauth",
    status: "planned",
    capabilities: ["chat", "video"],
  },
  {
    key: "google",
    label: "Google Workspace",
    category: "Productivity",
    summary:
      "One Google connection for calendar events, Meet bridges, and exporting write-ups to Docs.",
    connection: "oauth",
    status: "planned",
    capabilities: ["calendar", "video", "docs"],
  },
  {
    key: "zoom",
    label: "Zoom",
    category: "Video",
    summary: "Spin up a Zoom meeting so responders can jump on a call.",
    connection: "oauth",
    status: "planned",
    capabilities: ["video"],
  },
  {
    key: "github",
    label: "GitHub",
    category: "Source",
    summary: "Connect repositories so your projects can build on them.",
    connection: "oauth",
    status: "planned",
    capabilities: ["source"],
  },
  {
    key: "gitlab",
    label: "GitLab",
    category: "Source",
    summary: "Connect repositories so your projects can build on them.",
    connection: "oauth",
    status: "planned",
    capabilities: ["source"],
  },
  {
    key: "bitbucket",
    label: "Bitbucket",
    category: "Source",
    summary: "Connect repositories so your projects can build on them.",
    connection: "oauth",
    status: "planned",
    capabilities: ["source"],
  },
];

const BY_KEY = new Map(INTEGRATION_CATALOG.map((d) => [d.key, d]));

/** Look up a provider definition by key, or undefined. */
export function getDefinition(key: string): IntegrationDefinition | undefined {
  return BY_KEY.get(key);
}

/** Provider keys that offer a given capability (product-facing lookups). */
export function providersWithCapability(cap: IntegrationCapability): string[] {
  return INTEGRATION_CATALOG.filter((d) => d.capabilities.includes(cap)).map((d) => d.key);
}
