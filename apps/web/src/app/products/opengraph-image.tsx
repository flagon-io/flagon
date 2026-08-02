import { renderOgImage } from "@/lib/og";

export const alt = "Flagon: Products";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    eyebrow: "Products",
    title: "The products you'd buy or build, on one foundation",
    subtitle:
      "Feature Flags is available today, with the Catalog at the center and more shipping shortly.",
  });
}
