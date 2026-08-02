import { renderOgImage } from "@/lib/og";

export const alt = "Flagon: Catalog docs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    eyebrow: "Documentation",
    title: "Catalog",
    subtitle:
      "A live map of your projects, environments, and the products attached to them.",
  });
}
