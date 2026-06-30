/** Absolute URLs for emails — correct for localhost or the deployed env. */
export function appUrl(path = ''): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}${path}`;
}
