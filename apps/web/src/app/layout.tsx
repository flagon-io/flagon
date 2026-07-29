import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { brand } from "@flagon/design/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = `${brand.name}: ${brand.taglineLead} ${brand.taglineFollow}`;

export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
  title,
  description: brand.description,
  keywords: [
    "developer platform",
    "feature flags",
    "OpenFeature",
    "catalog",
    "self-hostable",
    "source-available",
  ],
  openGraph: {
    type: "website",
    siteName: brand.name,
    url: brand.url,
    title,
    description: brand.description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: brand.description,
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
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
