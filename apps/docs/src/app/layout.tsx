import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { brand } from "@flagon/design";
import { DocsShell } from "@/components/docs-shell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = `${brand.name} Docs`;
const description =
  "Guides and reference for Flagon feature flags: create flags, target with rules and segments, and evaluate them from your app with OpenFeature.";

export const metadata: Metadata = {
  title: {
    default: title,
    template: `%s · ${brand.name} Docs`,
  },
  description,
  openGraph: {
    type: "website",
    siteName: `${brand.name} Docs`,
    title,
    description,
  },
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
      <body className="min-h-full">
        <DocsShell>{children}</DocsShell>
      </body>
    </html>
  );
}
