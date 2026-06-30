/**
 * BetterAuth's catch-all handler. Serves sign-in/up, session, organization, and
 * invitation endpoints under /api/auth/*.
 */

import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/server/auth';

export const { GET, POST } = toNextJsHandler(auth);
