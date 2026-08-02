import { renderOgImage } from "@/lib/og";

export const alt = "Flagon: Privacy Policy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    eyebrow: "Privacy",
    title: "Privacy Policy",
    subtitle: "How Flagon collects, uses, and protects your data.",
  });
}
