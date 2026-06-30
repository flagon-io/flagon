import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import NextTopLoader from 'nextjs-toploader';
import { siteUrl } from '@/lib/site';
import './globals.css';

const geistSans = Geist({ variable: '--font-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Flagon: the open-source developer platform',
    template: '%s · Flagon',
  },
  description:
    'Build products, not platforms. Flagon is every primitive your product needs in one open-source platform: feature flags, experiments, configuration, eventing, audit, and more. Starting with feature flags: OpenFeature-native, edge-fast, self-hostable, usage-based.',
  keywords: [
    'developer platform',
    'feature flags',
    'OpenFeature',
    'OFREP',
    'feature management',
    'eventing',
    'webhooks',
    'audit log',
    'build vs buy',
  ],
  openGraph: {
    type: 'website',
    title: 'Flagon: build products, not platforms',
    description:
      'Every primitive your product needs (flags, experiments, configuration, eventing, audit), on one open-source foundation. Edge-fast, self-hostable, usage-based.',
    url: siteUrl,
    siteName: 'Flagon',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Flagon: build products, not platforms',
    description:
      'Every primitive your product needs, on one open-source foundation. Feature flags first: OpenFeature-native and edge-fast.',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // No theme class here: globals.css follows the OS via prefers-color-scheme at
  // first paint (no flash for system users), and the ThemeToggle adds an explicit
  // .dark/.light only when the visitor picks one. No cookie/headers read, so every
  // page stays statically renderable — keep it that way.
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col antialiased">
        <NextTopLoader color="#ff6a14" height={2} showSpinner={false} shadow="0 0 8px #ff6a14" />
        {children}
      </body>
    </html>
  );
}
