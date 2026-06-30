import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getOrgContext } from '@/server/api/org-context';
import { AppTopbar } from '@/components/app/app-topbar';
import { Logo } from '@/components/logo';
import type { SessionUser } from '@/components/app/user-menu';
import { appPath } from '@/lib/site';
import { NewOrgForm } from './form';

export default async function NewOrganizationPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect(appPath('/signin'));

  return (
    <div className="flex min-h-dvh flex-col">
      <AppTopbar
        user={ctx.user as SessionUser}
        homeHref={appPath('/')}
        signOutRedirect={appPath('/signin')}
        left={
          <Link href={appPath('/')} className="flex items-center">
            <Logo />
          </Link>
        }
      />
      <main className="flex flex-1 items-start justify-center px-6 py-12">
        <NewOrgForm />
      </main>
    </div>
  );
}
