import { renderOgImage } from "@/lib/og";

export const alt = "Flagon: Enterprise";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    eyebrow: "Enterprise",
    title: "Flagon for teams at scale",
    subtitle:
      "Usage-based pricing that never taxes headcount, source-available so you can self-host, and a team you can talk to directly.",
  });
}
