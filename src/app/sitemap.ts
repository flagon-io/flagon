import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; priority: number }[] = [
    { path: "", priority: 1 },
    { path: "/terms", priority: 0.5 },
    { path: "/privacy", priority: 0.5 },
    { path: "/security", priority: 0.5 },
  ];

  return routes.map(({ path, priority }) => ({
    url: `${brand.url}${path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority,
  }));
}
