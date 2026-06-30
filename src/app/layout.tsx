import type { Metadata } from 'next';
import { cookies } from 'next/headers';
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
    'Build products, not platforms. Flagon is the open-source platform primitives every team rebuilds (feature flags, experiments, eventing, configuration, audit), built once. Starting with feature flags: OpenFeature-native, edge-fast, self-hostable, usage-based.',
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
      'The platform primitives every team rebuilds (flags, eventing, configuration, audit), built once and open source. Stop reinventing infrastructure.',
    url: siteUrl,
    siteName: 'Flagon',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Flagon: build products, not platforms',
    description:
      'Open-source platform primitives every team rebuilds, built once. Feature flags first: OpenFeature-native and edge-fast.',
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // No-FOUC theme without any inline/script element (React 19 warns on those):
  // the ThemeToggle persists the *resolved* appearance to a cookie, and we put
  // the `dark` class straight into the server-rendered <html>. Defaults to dark
  // (brand default) on first visit before a preference exists.
  const appearance = (await cookies()).get('flagon-appearance')?.value;
  const dark = appearance !== 'light';

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full${dark ? ' dark' : ''}`}
    >
      <body className="min-h-full flex flex-col antialiased">
        <NextTopLoader color="#ff6a14" height={2} showSpinner={false} shadow="0 0 8px #ff6a14" />
        {children}
      </body>
    </html>
  );
}
