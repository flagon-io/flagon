import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { brand } from "@/lib/brand";
import "./globals.css";
import { NavigationProgress } from "@/components/navigation-progress";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
  title: {
    default: `${brand.name} - ${brand.eyebrow}`,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  applicationName: brand.name,
  authors: [{ name: brand.name, url: brand.url }],
  creator: brand.name,
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: brand.colors.bg,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* No global footer here: the console owns its viewport (no document
          footer), so content surfaces render SiteBottomBar themselves. */}
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
        {/* Root layout, so both cover marketing AND the console: the two
            surfaces are one deployment, and page views on app.flagon.io are
            the ones that say whether the product is being used. Both no-op
            outside Vercel, which keeps self-hosted deployments clean. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
