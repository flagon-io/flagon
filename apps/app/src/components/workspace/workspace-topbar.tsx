import { AccountMenu } from "./account-menu";

type UserInfo = { name: string; email: string; username: string | null };

/**
 * The workspace header bar, over the content area (the sidebar is full-height to
 * its left). It shares the sidebar's top strip height and border so the two read
 * as one connected navbar. Account/user actions sit on the right.
 */
export function WorkspaceTopbar({ user }: { user: UserInfo }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end border-b border-white/8 bg-black px-4">
      <AccountMenu user={user} />
    </header>
  );
}
