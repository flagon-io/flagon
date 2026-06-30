import { redirect } from 'next/navigation';
import { getOrgContext } from '@/server/api/org-context';
import { appPath } from '@/lib/site';

/** /app — send the user to their active organization (or onboarding). */
export default async function AppIndex() {
  const ctx = await getOrgContext();
  if (!ctx) redirect(appPath('/signin'));
  if (!ctx.active) redirect(appPath('/new'));
  redirect(appPath(`/${ctx.active.slug}`));
}
