import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { brand } from "@/lib/brand";
import { SiteBottomBar } from "@/components/site-bottom-bar";
import "./globals.css";

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
      <body className="min-h-full flex flex-col">
        {children}
        <SiteBottomBar />
      </body>
    </html>
  );
}
