import { AccountMenu } from "./account-menu";
import { QuickCreate } from "./quick-create";
import { Breadcrumb } from "./breadcrumb";

type UserInfo = { name: string; email: string; username: string | null };

/**
 * The workspace header bar, over the content area (the sidebar is full-height to
 * its left). It shares the sidebar's top strip height and border so the two read
 * as one connected navbar. The persistent breadcrumb sits on the left; the global
 * quick-create menu and account/user actions on the right.
 */
export function WorkspaceTopbar({ user, slug }: { user: UserInfo; slug: string }) {
  return (
    <header className="flex h-14 shrink-0 items-stretch justify-between border-b border-white/8 bg-black pl-4">
      <div className="flex min-w-0 items-center pr-4">
        <Breadcrumb />
      </div>
      <div className="flex shrink-0 items-stretch">
        <div className="flex items-center pr-4">
          <QuickCreate slug={slug} />
        </div>
        <span aria-hidden className="w-px self-stretch bg-white/10" />
        <div className="flex items-center px-4">
          <AccountMenu user={user} />
        </div>
      </div>
    </header>
  );
}
