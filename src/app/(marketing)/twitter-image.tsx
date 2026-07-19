import { ImageResponse } from "next/og";
import { OgImage, ogSize } from "@/lib/og";
import { brand } from "@/lib/brand";

export const alt = `${brand.name} - ${brand.taglineLead} ${brand.taglineFollow}`;
export const size = ogSize;
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(<OgImage />, { ...size });
}
