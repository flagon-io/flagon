/**
 * GET /api/v1 - the v1 index. A flat map of endpoint URL templates (GitHub
 * style), so the API documents itself. `{org}`, `{environment_id}`, and
 * `{flag_key}` are placeholders you substitute.
 */

import { apiBaseUrl, json } from '@/server/api/http';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const base = apiBaseUrl(req);
  // Product API only - internal platform endpoints (waitlist, admin) are
  // intentionally not advertised here.
  return json({
    health_url: `${base}/v1/health`,
    current_user_url: `${base}/v1/me`,
    token_exchange_url: `${base}/v1/token`,
    organization_projects_url: `${base}/v1/orgs/{org}/projects`,
    organization_environment_publish_url: `${base}/v1/orgs/{org}/environments/{environment_id}/publish`,
    ofrep_evaluate_flag_url: `${base}/ofrep/v1/evaluate/flags/{flag_key}`,
    ofrep_evaluate_bulk_url: `${base}/ofrep/v1/evaluate/flags`,
    openapi_url: `${base}/openapi.json`,
    documentation_url: 'https://flagon.io/docs/api',
  });
}
