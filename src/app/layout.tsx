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
    'Stop building your platform. Flagon is the hub for everything you run: projects, environments, and teams, with the capabilities you would otherwise build yourself, like feature flags, configuration, secrets, and events. Open source, self-hostable, usage-based.',
  keywords: [
    'developer platform',
    'internal developer platform',
    'developer portal',
    'software catalog',
    'feature flags',
    'OpenFeature',
    'OFREP',
    'configuration',
    'secrets',
    'event bus',
    'build vs buy',
  ],
  openGraph: {
    type: 'website',
    title: 'Flagon: stop building your platform',
    description:
      'The hub for everything you run: projects, environments, and teams, with the capabilities built in like feature flags, config, secrets, and events. Open source, usage-based.',
    url: siteUrl,
    siteName: 'Flagon',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Flagon: stop building your platform',
    description:
      'One hub for everything you run, with the platform capabilities built in. Start with the catalog; feature flags is the first capability on top.',
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
