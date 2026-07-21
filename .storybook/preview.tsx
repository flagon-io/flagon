import type { Preview } from "@storybook/nextjs-vite";
import { Geist, Geist_Mono } from "next/font/google";
import "../src/app/globals.css";

/**
 * The same two fonts and the same dark surface the real layout applies.
 *
 * Without this every story renders in a browser default on white, which is not
 * a neutral starting point: it is a DIFFERENT design, and judging spacing or
 * contrast against it teaches you the wrong thing. The variables have to be on
 * the wrapper because that is where `src/app/layout.tsx` puts them.
 */
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i } },
  },
  decorators: [
    (Story) => (
      <div
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-[#09090b] font-sans text-zinc-100 antialiased`}
      >
        <Story />
      </div>
    ),
  ],
};

export default preview;
