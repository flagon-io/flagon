import { renderOgImage } from "@/lib/og";

export const alt = "Flagon: Pricing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    eyebrow: "Pricing",
    title: "Pricing that scales with you",
    subtitle:
      "Free to start. Usage-based Pro with a monthly credit. Pay only for what you use, never per seat.",
  });
}
