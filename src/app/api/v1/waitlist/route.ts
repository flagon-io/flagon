/**
 * POST /api/v1/waitlist - public. Join the early-access waitlist.
 * GET  /api/v1/waitlist - public. Whether direct signup is currently open
 *                         (i.e. no account exists yet - the founder slot).
 */

import { count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db';
import { isWaitlistEnabled } from '@/server/config';
import { users } from '@/server/db/schema/auth';
import { waitlist } from '@/server/db/schema/app';
import { json, validationError } from '@/server/api/http';
import { sendWaitlistJoined } from '@/server/email/send';

export const dynamic = 'force-dynamic';

const joinSchema = z.object({
  email: z.string().email(),
  name: z.string().max(80).optional(),
});

export async function GET() {
  const [{ value: userCount }] = await db.select({ value: count() }).from(users);
  return json({
    // Whether waitlist mode is on for this instance.
    enabled: isWaitlistEnabled(),
    // The founder slot: registration is always available while no account exists.
    signupOpen: userCount === 0,
  });
}

export async function POST(req: Request) {
  const parsed = joinSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const email = parsed.data.email.toLowerCase();

  // Idempotent: re-joining with the same email is a no-op.
  const inserted = await db
    .insert(waitlist)
    .values({ email, name: parsed.data.name })
    .onConflictDoNothing({ target: waitlist.email })
    .returning({ id: waitlist.id });

  // Only email on a genuinely new join, not a repeat submit.
  if (inserted.length > 0) await sendWaitlistJoined(email);

  const [entry] = await db
    .select({ status: waitlist.status })
    .from(waitlist)
    .where(eq(waitlist.email, email))
    .limit(1);

  return json(
    { ok: true, created: inserted.length > 0, status: entry?.status ?? 'pending' },
    { status: 201 },
  );
}
