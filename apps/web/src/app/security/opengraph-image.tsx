import { renderOgImage } from "@/lib/og";

export const alt = "Flagon: Security";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    eyebrow: "Security",
    title: "Security at Flagon",
    subtitle:
      "How we protect your account and data, and how to report a vulnerability.",
  });
}
