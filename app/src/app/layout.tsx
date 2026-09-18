import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/theme/theme-script";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { FLAGON_FAVICON_URL } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// JetBrains Mono is Flagon's brand mono (labels, code, data).
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

// Display face for headlines, matching flagon.io - Geist stays the body font.
const displayFont = Hanken_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Flagon",
  description: "Flagon",
  icons: {
    icon: [{ url: FLAGON_FAVICON_URL, type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${jetbrainsMono.variable} ${displayFont.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
