import { renderOgImage } from "@/lib/og";

export const alt = "Flagon: Feature Flags docs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Covers every /docs/feature-flags/* page. */
export default function Image() {
  return renderOgImage({
    eyebrow: "Documentation",
    title: "Feature Flags",
    subtitle:
      "OpenFeature-native flags: evaluate, target, and measure with exposures.",
  });
}
