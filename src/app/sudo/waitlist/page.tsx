import { desc } from 'drizzle-orm';
import { db } from '@/server/db';
import { waitlist } from '@/server/db/schema/app';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { WaitlistRowActions } from './actions';

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  pending: 'warning',
  approved: 'success',
  converted: 'neutral',
  rejected: 'danger',
};

export default async function SudoWaitlistPage() {
  const entries = await db
    .select({
      id: waitlist.id,
      email: waitlist.email,
      name: waitlist.name,
      status: waitlist.status,
      createdAt: waitlist.createdAt,
    })
    .from(waitlist)
    .orderBy(desc(waitlist.createdAt));

  const pending = entries.filter((e) => e.status === 'pending').length;

  return (
    <div>
      <p className="eyebrow">Sudo</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Waitlist</h1>
      <p className="mt-1 text-sm text-muted">
        {entries.length} total · {pending} pending approval
      </p>

      <div className="mt-8 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted">
                  No one on the waitlist yet.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{e.email}</td>
                  <td className="px-4 py-3 text-muted">{e.name ?? '-'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[e.status] ?? 'warning'}>{e.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <WaitlistRowActions id={e.id} status={e.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
