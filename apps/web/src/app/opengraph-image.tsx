import { brand } from "@flagon/design/brand";
import { renderOgImage } from "@/lib/og";

export const alt = `${brand.name}: ${brand.eyebrow}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The site-wide default OG image (used by any page without its own). */
export default function Image() {
  return renderOgImage({
    eyebrow: brand.eyebrow,
    title: `${brand.taglineLead} ${brand.taglineFollow}`,
    subtitle:
      "One hub for your projects, environments, and teams, with the products you'd otherwise buy or build stitched right in.",
  });
}
