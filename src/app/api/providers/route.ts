/**
 * GET /api/providers — public. Which social login providers are configured, so
 * the auth UI can enable the matching "Continue with…" buttons. Booleans only;
 * never exposes secrets. Internal config endpoint (not part of the product spec).
 */

import { json } from '@/server/api/http';
import { socialProviderStatus } from '@/server/config';

export const dynamic = 'force-dynamic';

export function GET() {
  return json(socialProviderStatus());
}
