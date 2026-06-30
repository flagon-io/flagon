import Link from 'next/link';
import { count, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { users } from '@/server/db/schema/auth';
import { featureRequests, waitlist } from '@/server/db/schema/app';

export default async function SudoHome() {
  const [{ value: pending }] = await db
    .select({ value: count() })
    .from(waitlist)
    .where(eq(waitlist.status, 'pending'));
  const [{ value: newRequests }] = await db
    .select({ value: count() })
    .from(featureRequests)
    .where(eq(featureRequests.status, 'new'));
  const [{ value: userCount }] = await db.select({ value: count() }).from(users);

  const tools = [
    {
      title: 'Waitlist',
      href: '/sudo/waitlist',
      desc: 'Approve or reject early-access requests.',
      badge: pending > 0 ? `${pending} pending` : undefined,
    },
    {
      title: 'Requests',
      href: '/sudo/requests',
      desc: 'Triage building-block requests from the marketing site.',
      badge: newRequests > 0 ? `${newRequests} new` : undefined,
    },
  ];

  return (
    <div>
      <p className="eyebrow">Platform admin</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sudo</h1>
      <p className="mt-1 text-sm text-muted">
        Internal tooling for running Flagon, separate from the product. {userCount} user
        {userCount === 1 ? '' : 's'} total.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => (
          <Link
            key={t.title}
            href={t.href}
            className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand-500/40"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{t.title}</h2>
              {t.badge && (
                <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[11px] text-brand-500">
                  {t.badge}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
