import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { appPath } from '@/lib/site';

/**
 * Auth pages (sign in / up, password reset). If you're already signed in there's
 * nothing to do here — bounce straight to the app. Wraps the (auth) route group;
 * the parentheses keep URLs unchanged (/app/signin, …).
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect(appPath('/'));
  return children;
}
