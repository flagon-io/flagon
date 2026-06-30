import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getOrgContext } from '@/server/api/org-context';
import { AppTopbar } from '@/components/app/app-topbar';
import { Logo } from '@/components/logo';
import type { SessionUser } from '@/components/app/user-menu';
import { appPath } from '@/lib/site';
import { PasswordForm, ProfileForm } from './forms';

export default async function AccountPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect(appPath('/signin'));

  const homeHref = ctx.active ? appPath(`/${ctx.active.slug}`) : appPath('/');
  const u = ctx.user as { name: string; email: string; username?: string | null; image?: string | null };

  return (
    <div className="flex min-h-dvh flex-col">
      <AppTopbar
        user={ctx.user as SessionUser}
        homeHref={homeHref}
        signOutRedirect={appPath('/signin')}
        left={
          <Link href={homeHref} className="flex items-center">
            <Logo />
          </Link>
        }
      />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your profile and password.</p>

        <div className="mt-8 space-y-6">
          <ProfileForm
            user={{ name: u.name, email: u.email, username: u.username ?? null, image: u.image ?? null }}
          />
          <PasswordForm />
        </div>
      </main>
    </div>
  );
}
