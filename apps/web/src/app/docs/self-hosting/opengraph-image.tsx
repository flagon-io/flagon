import { renderOgImage } from "@/lib/og";

export const alt = "Flagon: Self-hosting docs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    eyebrow: "Documentation",
    title: "Run Flagon yourself",
    subtitle: "Self-host the whole platform. Source-available, with no user limit.",
  });
}
