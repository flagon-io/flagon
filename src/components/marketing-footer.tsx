import Link from 'next/link';
import { SiGithub } from '@icons-pack/react-simple-icons';
import { Logo } from '@/components/logo';
import { appBase, GITHUB_URL } from '@/lib/site';

const columns: { heading: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    heading: 'Platform',
    links: [
      { label: 'Capabilities', href: '/capabilities' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Docs', href: '/docs' },
    ],
  },
  {
    heading: 'Developers',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'API reference', href: '/docs/api' },
      { label: 'OpenAPI spec', href: '/api/openapi.json' },
      { label: 'GitHub', href: GITHUB_URL, external: true },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Sign in', href: `${appBase}/app/signin` },
      { label: 'Sign up', href: `${appBase}/app/signup` },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'License (FSL)', href: `${GITHUB_URL}/blob/main/LICENSE.md`, external: true },
    ],
  },
];

function Social({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="text-muted transition-colors hover:text-foreground"
    >
      {children}
    </a>
  );
}

export function MarketingFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-border">
      <div
        className="bg-grid pointer-events-none absolute inset-0"
        style={{
          maskImage: 'radial-gradient(90% 80% at 50% 0%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(90% 80% at 50% 0%, black, transparent)',
        }}
      />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <Logo size={22} />
          <p className="mt-4 max-w-xs text-sm text-muted">
            The open-source developer platform: one hub for your projects, environments, and teams,
            with capabilities like feature flags, config, and events built in.
          </p>
          <div className="mt-5 flex items-center gap-4">
            <Social href={GITHUB_URL} label="GitHub">
              <SiGithub size={18} color="currentColor" />
            </Social>
          </div>
        </div>

        {columns.map((col) => (
          <div key={col.heading}>
            <h3 className="eyebrow">{col.heading}</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-muted transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="relative border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Flagon, LLC. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <span>Source-available under FSL-1.1-Apache-2.0</span>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
