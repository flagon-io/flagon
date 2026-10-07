import type { Metadata, Viewport } from "next";
import { Geist, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { site } from "@/lib/site";
import { ThemeScript } from "@/components/theme-script";
import { DepthScript } from "@/components/deep-dive";

// Three roles, kept clean: Geist is the neutral body/UI workhorse, Hanken
// Grotesk gives headlines a tighter, more distinct voice, and JetBrains Mono
// carries code and labels as its own separate thing.
const bodyFont = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const displayFont = Hanken_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});
const mono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name}: ${site.tagline}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  keywords: [
    "Flagon",
    "Flagon Inc",
    "software company",
    "company handbook",
    "building in public",
    "open source",
    "engineering blog",
  ],
  authors: [{ name: site.name, url: site.url }],
  openGraph: {
    type: "website",
    url: site.url,
    siteName: site.name,
    title: `${site.name}: ${site.tagline}`,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name}: ${site.tagline}`,
    description: site.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bodyFont.variable} ${displayFont.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
        <DepthScript />
      </head>
      <body className="flex min-h-dvh flex-col overflow-x-clip">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
