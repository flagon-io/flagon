// Single source of truth for the marketing capability lineup.
// Both the homepage (featured front-three) and /capabilities read from this list,
// so order and copy only ever change in one place.
//
// The Catalog is capability #1 (the hub itself: projects, environments, teams,
// ownership, and growing). Every other capability is built ON TOP of it; Feature
// Flags is #2. Both are "Coming soon" while the platform is rebuilt on the new
// substrate model, so nothing is falsely marked shipped.
import {
  Activity,
  Archive,
  BarChart3,
  Bell,
  BellRing,
  Boxes,
  Database,
  Fingerprint,
  Flag,
  FlaskConical,
  Gauge,
  ListChecks,
  Network,
  Receipt,
  Rocket,
  ScrollText,
  Siren,
  SlidersHorizontal,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

// Tiers beyond the committed roadmap:
//  - 'Under consideration': the tools teams buy from separate vendors ON TOP of
//    their cloud (deploys, on-call, analytics, access, ...). We aim to unify and
//    augment what you already run, and build native where it helps. Realistic to
//    start on because we can lean on an existing cloud before running our own.
//  - 'Moonshot': reinventing cloud primitives themselves (observability, databases,
//    object storage, caching). A direction we build toward, not a near-term promise,
//    and we would integrate or leverage a provider long before rebuilding one.
export type CapabilityStatus =
  | 'Available'
  | 'Coming soon'
  | 'Planned'
  | 'Under consideration'
  | 'Moonshot';

export type Capability = {
  name: string;
  status: CapabilityStatus;
  /** true once the capability has shipped: drives the brand badge + docs link */
  live: boolean;
  /** surfaced in the homepage front-three (keep exactly three featured) */
  featured?: boolean;
  icon: LucideIcon;
  body: string;
};

export const capabilities: Capability[] = [
  {
    name: 'Catalog',
    status: 'Coming soon',
    live: false,
    featured: true,
    icon: Boxes,
    body: 'The hub for everything you run: projects, environments, teams, and ownership, with linked repositories and services on the way. It is the map every other capability builds on, and where you start.',
  },
  {
    name: 'Feature Flags',
    status: 'Coming soon',
    live: false,
    featured: true,
    icon: Flag,
    body: 'OpenFeature-native flags, segments, and fractional rollouts on your real projects and environments. Edge-fast evaluation via OFREP means any OpenFeature SDK points straight at Flagon. No proprietary client, no lock-in.',
  },
  {
    name: 'Configuration & Secrets',
    status: 'Planned',
    live: false,
    featured: true,
    icon: SlidersHorizontal,
    body: 'Typed, versioned configuration and secrets for every project and environment, on the same edge-fast pipeline as flags. Change config without a deploy. One of the next capabilities up.',
  },
  {
    name: 'Experiments',
    status: 'Planned',
    live: false,
    icon: FlaskConical,
    body: 'A/B tests and metrics built directly on the flags you already ship. Measure impact without bolting on a separate analytics tool or rebuilding assignment. One of the next capabilities up.',
  },
  {
    name: 'Event Bus',
    status: 'Planned',
    live: false,
    icon: Network,
    body: 'A cloud-agnostic event bus. Publish from any source and route to any destination: webhooks, cloud buses, queues, and streams like SQS, Kafka, or RabbitMQ, with filtering, transforms, retries, signing, and replay. One bus instead of per-provider glue.',
  },
  {
    name: 'Audit Log',
    status: 'Planned',
    live: false,
    icon: ScrollText,
    body: 'An immutable, queryable trail of every change across the platform, kept separate from the configuration it records. Exportable and compliance-ready.',
  },

  // --- Under consideration: the vendor tools you buy on top of your cloud ------
  {
    name: 'Deployments',
    status: 'Under consideration',
    live: false,
    icon: Rocket,
    body: 'Push a container and we run it, wired to your projects and environments. Roll out, promote between environments, and roll back, all native to your catalog. We can run this on a cloud you already have before ever operating our own.',
  },
  {
    name: 'Automations',
    status: 'Under consideration',
    live: false,
    icon: Workflow,
    body: 'Automate the operational work you script by hand: run pipelines on a schedule or in response to events, with steps, approvals, retries, and full run history. Ops runbooks and CI-style workflows, native to your projects.',
  },
  {
    name: 'Background Jobs',
    status: 'Under consideration',
    live: false,
    icon: ListChecks,
    body: 'Run and orchestrate background work per project: enqueue tasks, fan them out to workers, retry and dead-letter the failures, and watch throughput. The hosted job runner you would otherwise buy or bolt on.',
  },
  {
    name: 'Status & Incidents',
    status: 'Under consideration',
    live: false,
    icon: Siren,
    body: 'A hosted status page and incident timeline wired to your catalog, so declaring, updating, and resolving an incident is one flow instead of five tools.',
  },
  {
    name: 'On-call & Alerting',
    status: 'Under consideration',
    live: false,
    icon: BellRing,
    body: 'Rotations, escalation policies, and alert routing tied to who owns what in the catalog. Page the right person without a separate on-call product.',
  },
  {
    name: 'Notifications',
    status: 'Under consideration',
    live: false,
    icon: Bell,
    body: 'One place to send email, Slack, and in-app messages, with templates and delivery tracking, so every capability can reach humans the same way.',
  },
  {
    name: 'Analytics',
    status: 'Under consideration',
    live: false,
    icon: BarChart3,
    body: 'Product and usage analytics tied to your projects and flags, so you can see what shipped, who used it, and what it cost, without another pipeline to run.',
  },
  {
    name: 'Access & SSO',
    status: 'Under consideration',
    live: false,
    icon: Fingerprint,
    body: 'Identity and access across everything you run: SAML and SCIM, fine-grained roles, and one trail of who did what, answered in a single place.',
  },
  {
    name: 'Cost & FinOps',
    status: 'Under consideration',
    live: false,
    icon: Receipt,
    body: 'Usage and cost broken down by project, environment, and capability, so the bill is never a surprise and every team sees exactly what it spends.',
  },

  // --- Moonshots: reinventing the cloud primitives themselves ------------------
  {
    name: 'Observability',
    status: 'Moonshot',
    live: false,
    icon: Activity,
    body: 'Logs, traces, and metrics from an OTel agent, surfaced per project and environment next to the flags and config that shaped the behavior you are debugging.',
  },
  {
    name: 'Databases & Data',
    status: 'Moonshot',
    live: false,
    icon: Database,
    body: 'Managed Postgres and Redis provisioned per project and environment, wired into your catalog with connection strings that appear right where your apps expect them.',
  },
  {
    name: 'Object Storage',
    status: 'Moonshot',
    live: false,
    icon: Archive,
    body: 'S3-compatible buckets per project, with lifecycle rules and signed URLs, so file storage is one less cloud service to wire up yourself.',
  },
  {
    name: 'Caching',
    status: 'Moonshot',
    live: false,
    icon: Gauge,
    body: 'A managed cache in front of your services, provisioned per environment, so speeding things up is a setting rather than infrastructure you run. A cache, not a CDN.',
  },
];

/** The homepage front-three. */
export const featuredCapabilities = capabilities.filter((c) => c.featured);

/** On the roadmap or shipped: the main lineup. */
export const committedCapabilities = capabilities.filter(
  (c) => c.status !== 'Under consideration' && c.status !== 'Moonshot',
);

/** Near-ish: vendor tools we would unify/augment on top of your cloud. Own section. */
export const exploringCapabilities = capabilities.filter((c) => c.status === 'Under consideration');

/** Furthest out: reinventing cloud primitives. Its own, clearly-labeled section. */
export const moonshotCapabilities = capabilities.filter((c) => c.status === 'Moonshot');
