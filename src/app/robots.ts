import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The app + API subdomains are not marketing surfaces.
      disallow: ["/app", "/api"],
    },
    sitemap: `${brand.url}/sitemap.xml`,
    host: brand.url,
  };
}
