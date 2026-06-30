import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

const paths = [
  '',
  '/products',
  '/pricing',
  '/docs',
  '/docs/quickstart',
  '/docs/self-hosting',
  '/docs/feature-flags',
  '/docs/feature-flags/evaluation',
  '/docs/feature-flags/targeting',
  '/docs/api',
  '/terms',
  '/privacy',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map((path) => ({
    url: `${siteUrl}${path}`,
    changeFrequency: path.startsWith('/docs') ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : path === '/docs' || path === '/pricing' ? 0.8 : 0.6,
  }));
}
