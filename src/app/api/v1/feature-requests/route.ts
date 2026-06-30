/**
 * POST /api/v1/feature-requests — developer-submitted "what should we build next"
 * platform building-block requests from the marketing site. Public intake (no
 * auth), stored for the team to triage. Best-effort notifies FLAGON_ADMIN_EMAIL.
 * Excluded from the OpenAPI spec (internal, like the waitlist).
 */

import { z } from 'zod';
import { db } from '@/server/db';
import { featureRequests } from '@/server/db/schema/app';
import { json, validationError } from '@/server/api/http';
import { sendEmail } from '@/server/email';

export const dynamic = 'force-dynamic';

const schema = z.object({
  body: z.string().trim().min(5, 'Tell us a bit more.').max(2000),
  email: z.union([z.string().email().max(200), z.literal('')]).optional(),
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);

  const email = parsed.data.email?.trim() || null;
  await db.insert(featureRequests).values({ body: parsed.data.body, email });

  const adminTo = process.env.FLAGON_ADMIN_EMAIL;
  if (adminTo) {
    await sendEmail({
      to: adminTo,
      subject: 'New building-block request',
      html: `<p>${escapeHtml(parsed.data.body)}</p><p style="color:#6b7280">From: ${email ? escapeHtml(email) : 'anonymous'}</p>`,
    });
  }

  return json({ ok: true }, { status: 201 });
}
