import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

// AI crawlers we explicitly welcome — we *want* our docs read and cited so
// assistants can explain how Flagon works and drive adoption.
const AI_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'cohere-ai',
];

export default function robots(): MetadataRoute.Robots {
  // Product surfaces (these live on subdomains in prod, but disallow defensively).
  const disallow = ['/app/', '/sudo/', '/api/'];
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: '/', disallow })),
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
