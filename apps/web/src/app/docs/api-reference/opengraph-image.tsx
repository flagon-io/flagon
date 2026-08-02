import { renderOgImage } from "@/lib/og";

export const alt = "Flagon: API Reference";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    eyebrow: "Documentation",
    title: "API Reference",
    subtitle: "The full REST API for the developer platform.",
  });
}
