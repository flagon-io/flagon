import type { MetadataRoute } from "next";
import { brand } from "@flagon/design/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", brand.url).toString(),
  };
}
