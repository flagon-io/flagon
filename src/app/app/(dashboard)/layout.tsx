import { redirect } from 'next/navigation';
import { getOrgContext } from '@/server/api/org-context';
import { appPath } from '@/lib/site';

/**
 * Auth gate for the whole dashboard. The header lives in [org]/layout (org
 * context) and on the standalone /new and /invitations pages.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getOrgContext();
  if (!ctx) redirect(appPath('/signin'));
  return <div className="flex min-h-full flex-col">{children}</div>;
}
