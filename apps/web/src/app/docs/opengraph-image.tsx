import { renderOgImage } from "@/lib/og";

export const alt = "Flagon: Documentation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Covers every /docs/* page with a consistent documentation card. */
export default function Image() {
  return renderOgImage({
    eyebrow: "Documentation",
    title: "Flagon Docs",
    subtitle:
      "Guides, quickstarts, and the full API reference for the developer platform.",
  });
}
