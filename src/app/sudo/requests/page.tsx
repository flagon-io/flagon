import { desc } from 'drizzle-orm';
import { db } from '@/server/db';
import { featureRequests } from '@/server/db/schema/app';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { RequestStatusSelect } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  new: 'warning',
  reviewing: 'neutral',
  planned: 'brand',
  shipped: 'success',
  declined: 'danger',
};

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default async function SudoRequestsPage() {
  const entries = await db
    .select({
      id: featureRequests.id,
      body: featureRequests.body,
      email: featureRequests.email,
      status: featureRequests.status,
      createdAt: featureRequests.createdAt,
    })
    .from(featureRequests)
    .orderBy(desc(featureRequests.createdAt));

  const fresh = entries.filter((e) => e.status === 'new').length;

  return (
    <div>
      <p className="eyebrow">Sudo</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Building-block requests</h1>
      <p className="mt-1 text-sm text-muted">
        What developers want us to build next, from the marketing site.{' '}
        {entries.length} total · {fresh} new
      </p>

      <div className="mt-8 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-152 text-sm">
          <thead>
            <tr className="border-b border-border bg-card text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Request</th>
              <th className="px-4 py-3 font-medium">From</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted">
                  No requests yet.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-b border-border align-top last:border-0">
                  <td className="max-w-md px-4 py-3 whitespace-pre-wrap">{e.body}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{e.email ?? 'anonymous'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{dateFmt.format(e.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={STATUS_VARIANT[e.status] ?? 'neutral'}>{e.status}</Badge>
                      <RequestStatusSelect id={e.id} status={e.status} />
                    </div>
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
