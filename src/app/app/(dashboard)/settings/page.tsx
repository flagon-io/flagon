import { redirect } from 'next/navigation';
import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { getOrgContext } from '@/server/api/org-context';
import { API_SCOPES } from '@/server/api/scopes';
import { db } from '@/server/db';
import { apiTokens } from '@/server/db/schema/app';
import { AppTopbar } from '@/components/app/app-topbar';
import { Logo } from '@/components/logo';
import type { SessionUser } from '@/components/app/user-menu';
import { appPath } from '@/lib/site';
import { PasswordForm, ProfileForm } from './forms';
import { PersonalAccessTokens } from './pats';

export default async function AccountPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect(appPath('/signin'));

  const patRows = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt,
      revokedAt: apiTokens.revokedAt,
      scopes: apiTokens.scopes,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, ctx.user.id), eq(apiTokens.kind, 'user')))
    .orderBy(desc(apiTokens.createdAt));
  const pats = patRows.map((t) => ({
    ...t,
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    expiresAt: t.expiresAt?.toISOString() ?? null,
    revokedAt: t.revokedAt?.toISOString() ?? null,
  }));

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
          <PersonalAccessTokens
            tokens={pats}
            scopeOptions={API_SCOPES.map((s) => ({ value: s.value, label: s.label }))}
          />
        </div>
      </main>
    </div>
  );
}
