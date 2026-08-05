import { AccountMenu } from "./account-menu";

type UserInfo = { name: string; email: string; username: string | null };

/**
 * The workspace header bar, over the content area (the sidebar is full-height to
 * its left). It shares the sidebar's top strip height and border so the two read
 * as one connected navbar. An early-access marker sits on the left; account/user
 * actions on the right.
 */
export function WorkspaceTopbar({ user }: { user: UserInfo }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/8 bg-black px-4">
      <span
        title="Flagon is in early-access alpha. Expect rough edges and rapid changes."
        className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/25 bg-teal-400/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-teal-300 uppercase"
      >
        <span className="size-1.5 rounded-full bg-teal-400" />
        Alpha
      </span>
      <AccountMenu user={user} />
    </header>
  );
}
