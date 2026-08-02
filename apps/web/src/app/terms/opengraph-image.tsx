import { renderOgImage } from "@/lib/og";

export const alt = "Flagon: Terms of Service";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    eyebrow: "Terms",
    title: "Terms of Service",
    subtitle: "The terms that govern your use of Flagon.",
  });
}
