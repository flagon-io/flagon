import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Zap } from 'lucide-react';
import { AccessButton } from '@/components/access-button';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarketingHero } from '@/components/marketing-hero';
import { cn } from '@/lib/cn';
import { GITHUB_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Usage-based pricing: pay for the throughput you use across capabilities, not seats. Projects, environments, teams, and members are always free. Self-host the whole platform free, forever.',
};

type Tier = {
  name: string;
  price: string;
  cadence: string;
  priceNote?: string;
  blurb: string;
  highlight: boolean;
  cta: { kind: 'signup'; label: string } | { kind: 'contact'; label: string; href: string };
  features: string[];
};

const tiers: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    blurb: 'Solo devs and side projects. The whole platform, with usage that just works.',
    highlight: false,
    cta: { kind: 'signup', label: 'Start free' },
    features: [
      'No credit card, no trial clock',
      'Solo (1 member)',
      'Unlimited projects & environments',
      'Every capability at side-project scale',
      'Sane monthly usage included',
      'Community support',
    ],
  },
  {
    name: 'Team',
    price: '$29',
    cadence: '/ month',
    priceNote: 'base includes usage; more is metered per capability, never per seat',
    blurb: 'Growing teams in production. Real included usage, then pay for what you use.',
    highlight: true,
    cta: { kind: 'signup', label: 'Get started' },
    features: [
      'Everything in Free, plus',
      'Unlimited members & teams',
      'Generous usage included across every capability',
      'Usage-based beyond the included allowance',
      'Role-based access control',
      'Audit log',
      'Per-org SSO add-on',
      'Email support',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'tailored',
    blurb: 'Scale, compliance, and isolation. We tailor pricing to how you use it.',
    highlight: false,
    cta: { kind: 'contact', label: 'Contact sales', href: 'mailto:sales@flagon.io' },
    features: [
      'Everything in Team, plus',
      'Volume usage pricing',
      'SAML SSO + SCIM provisioning',
      'Dedicated / isolated infrastructure',
      '99.9% uptime SLA',
      'Security review & priority support',
    ],
  },
];

export default function PricingPage() {
  return (
    <>
      <MarketingHero
        align="center"
        eyebrow="Pricing"
        title="Usage-based, not seat-based."
        subtitle="Free for solo developers, and it means free: the whole platform with sane usage built in, no card required. Teams get real included usage across every capability, then pay only for what they use beyond it. Never per seat. Self-host the whole platform for free, forever."
      >
        <p className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-500">
          <Zap className="size-3.5" />
          Early access: paid plans are free while we&apos;re in beta. Pricing shown is at GA.
        </p>
      </MarketingHero>

      <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="grid items-start gap-6 lg:grid-cols-3">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={cn(
              'relative flex flex-col rounded-2xl border bg-card p-7',
              tier.highlight
                ? 'border-brand-500/60 shadow-lg shadow-brand-500/5 ring-1 ring-brand-500/20 lg:-mt-3 lg:pb-10'
                : 'border-border',
            )}
          >
            {tier.highlight && (
              <Badge variant="brand" className="absolute -top-3 left-1/2 -translate-x-1/2 bg-background">
                Most popular
              </Badge>
            )}
            <h2 className="text-lg font-semibold">{tier.name}</h2>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-5xl font-semibold tracking-tight">{tier.price}</span>
              <span className="text-sm text-muted">{tier.cadence}</span>
            </div>
            <p className="mt-2 h-8 text-xs leading-relaxed text-brand-500">{tier.priceNote ?? ''}</p>
            <p className="mt-1 text-sm text-muted">{tier.blurb}</p>

            {tier.cta.kind === 'signup' ? (
              <AccessButton
                variant={tier.highlight ? 'primary' : 'secondary'}
                size="lg"
                className="mt-6 w-full"
                registerLabel={tier.cta.label}
              />
            ) : (
              <a
                href={tier.cta.href}
                className={cn('mt-6 w-full', buttonVariants({ variant: 'secondary', size: 'lg' }))}
              >
                {tier.cta.label}
              </a>
            )}

            <ul className="mt-7 space-y-3 text-sm">
              {tier.features.map((f, i) => (
                <li key={f} className="flex gap-2.5">
                  {i === 0 && f.endsWith('plus') ? (
                    <span className="font-medium text-foreground">{f}</span>
                  ) : (
                    <>
                      <Check className="mt-0.5 size-4 shrink-0 text-brand-500" strokeWidth={2.5} />
                      <span className="text-muted">{f}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold">How usage works</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Usage is metered per capability. Every plan includes a monthly allowance for each meter,
            starting with flag evaluations and growing as capabilities land, like config reads and
            events. Past the allowance, Team is metered and Enterprise gets volume pricing. Projects,
            environments, teams, and members never cost extra. We charge for the work the platform
            does, not your team size.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold">Rather run it yourself?</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Flagon is fully open source. Self-host the whole platform free under FSL, or buy so we own
            the upkeep and operations and you don&apos;t have to, at a price that beats building it.
          </p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex w-fit items-center gap-1.5 text-sm text-brand-500 hover:text-brand-400"
          >
            Get it on GitHub →
          </a>
        </div>
      </div>

      <p className="mt-10 text-center text-sm text-muted">
        Questions about pricing?{' '}
        <Link href="/docs" className="text-brand-500 hover:text-brand-400">
          Read the docs
        </Link>{' '}
        or email{' '}
        <a href="mailto:sales@flagon.io" className="text-brand-500 hover:text-brand-400">
          sales@flagon.io
        </a>
        .
      </p>
      </div>
    </>
  );
}
