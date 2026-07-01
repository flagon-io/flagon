'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Docs sidebar. Every entry is a dedicated page (no #anchors) so each feature
 * gets its own URL as the platform grows. The current page is highlighted.
 */
const NAV: { group: string; items: { label: string; href: string }[] }[] = [
  {
    group: 'Get started',
    items: [
      { label: 'Overview', href: '/docs' },
      { label: 'Quickstart', href: '/docs/quickstart' },
      { label: 'Self-hosting', href: '/docs/self-hosting' },
    ],
  },
  {
    group: 'Reference',
    items: [
      { label: 'API authentication', href: '/docs/api-authentication' },
      { label: 'REST API', href: '/docs/api' },
    ],
  },
];

export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-7 lg:sticky lg:top-20">
      {NAV.map((section) => (
        <div key={section.group}>
          <h3 className="eyebrow">{section.group}</h3>
          <ul className="mt-3 space-y-0.5 text-sm">
            {section.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`-mx-2 block rounded-md px-2 py-1 transition-colors ${
                      active
                        ? 'bg-card-muted font-medium text-foreground'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
