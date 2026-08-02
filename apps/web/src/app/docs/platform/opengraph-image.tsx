import { renderOgImage } from "@/lib/og";

export const alt = "Flagon: Platform docs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Covers every /docs/platform/* page. */
export default function Image() {
  return renderOgImage({
    eyebrow: "Documentation",
    title: "The Flagon Platform",
    subtitle:
      "Projects, environments, teams, and auth: the substrate every product runs on.",
  });
}
