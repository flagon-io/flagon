// Single source of truth for the marketing product lineup.
// Both the homepage (featured front-three) and /products read from this list,
// so order and copy only ever change in one place.
import { Flag, FlaskConical, SlidersHorizontal, Webhook, ScrollText, type LucideIcon } from 'lucide-react';

export type ProductStatus = 'Available' | 'Coming soon' | 'Planned';

export type Product = {
  name: string;
  status: ProductStatus;
  /** true once the product has shipped — drives the brand badge + docs link */
  live: boolean;
  /** surfaced in the homepage front-three (keep exactly three featured) */
  featured?: boolean;
  icon: LucideIcon;
  body: string;
};

export const products: Product[] = [
  {
    name: 'Feature Flags',
    status: 'Available',
    live: true,
    featured: true,
    icon: Flag,
    body: 'OpenFeature-native flags with targeting, segments, and fractional rollouts. Edge-fast evaluation via OFREP, so any OpenFeature SDK points at Flagon. No proprietary client, no lock-in.',
  },
  {
    name: 'Experiments',
    status: 'Coming soon',
    live: false,
    featured: true,
    icon: FlaskConical,
    body: 'A/B tests and metrics built directly on the flags you already ship. Measure impact without bolting on a separate analytics tool or rebuilding assignment.',
  },
  {
    name: 'Configuration',
    status: 'Coming soon',
    live: false,
    featured: true,
    icon: SlidersHorizontal,
    body: 'Typed, versioned application configuration and secrets, delivered on the same edge-fast pipeline as flags. Change config without a deploy.',
  },
  {
    name: 'Eventing & Webhooks',
    status: 'Coming soon',
    live: false,
    icon: Webhook,
    body: 'Configurable event pipelines: wire sources to destinations with filtering, transforms, retries, signing, and replay. The reliable webhook layer every product reinvents, built once.',
  },
  {
    name: 'Audit Log',
    status: 'Planned',
    live: false,
    icon: ScrollText,
    body: 'An immutable, queryable trail of every change across the platform, kept separate from the configuration it records. Exportable and compliance-ready.',
  },
];

/** The homepage front-three. */
export const featuredProducts = products.filter((p) => p.featured);
